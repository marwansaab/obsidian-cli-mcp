# Prepend Crash Boundary — Empirical Bisect

**Test environment:**
- Obsidian CLI version: `1.12.7 (installer 1.12.7)` (from `Obsidian.com version`)
- Obsidian CLI plugin version: unknown — no `.obsidian/plugins/obsidian-cli/manifest.json` in the test vault (the CLI is a first-party binary, not a vault-installed plugin)
- Active plugins in test vault: `smart-connections` only (noted because it may influence host-process load during IPC; not isolated as a variable here)
- OS / platform: Windows 10.0.26200.8457 (Windows 11 Pro 24H2 build)
- Test vault: `TestVault-Obsidian-CLI-MCP` at `C:\Marwan-Saab-ADO\Marwan at Metcash\Obsidian\TestVault-Obsidian-CLI-MCP`
- Date: 2026-05-27
- Probe pacing: 15 s `Start-Sleep` between probes (gated on user dialog-dismissal confirmation after each crash-suspect probe)
- Invocation shape: `spawn("C:\Program Files\Obsidian\Obsidian.com", ["vault=TestVault-Obsidian-CLI-MCP", "prepend", "path=Sandbox/BI-0016/cli-bisect/target.md", "content=<payload>"], { shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })`
- Fixture protocol: `target.md` reset via `fs.writeFile` to literal 4-byte `"base"` (no trailing newline) BEFORE each probe; pre-state size = 4 bytes confirmed by `fs.stat` per probe
- Timeout: 10_000 ms (matches the wrapper's `TYPED_TOOL_TIMEOUT_MS`), SIGTERM on expiry

**Bisect table:**

| Probe # | Content size (chars) | argv element size (bytes) | Wall-clock (s) | Exit code | Signal | stdout (first 200 chars) | stderr | Post-file size | Observable | Dialog? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4000 | 4008 | 0.092 | 0 | — | `Prepended to: Sandbox/BI-0016/cli-bisect/target.md\n` | (empty) | 4005 (delta=4001 = content+LF) | OK | no |
| 2 | 5000 | 5008 | 10.011 | null | SIGTERM | (empty) | (empty) | 4 (unchanged) | TIMEOUT | **yes** |
| 3 | 4500 | 4508 | 10.019 | null | SIGTERM | (empty) | (empty) | 4 (unchanged) | TIMEOUT | **yes** |
| 4 | 4250 | 4258 | 10.009 | null | SIGTERM | (empty) | (empty) | 4 (unchanged) | TIMEOUT | **yes** |
| 5 | 4125 | 4133 | 10.013 | null | SIGTERM | (empty) | (empty) | 4 (unchanged) | TIMEOUT | **yes** |
| 6 | 4062 | 4070 | 0.085 | 0 | — | `Prepended to: Sandbox/BI-0016/cli-bisect/target.md\n` | (empty) | 4067 (delta=4063 = content+LF) | OK | no |

**Boundary:**

- Highest content size observed PASS (OK): **4062 chars** (argv `content=` element = **4070 bytes**)
- Lowest content size observed FAIL (TIMEOUT + CRASH_DIALOG): **4125 chars** (argv `content=` element = **4133 bytes**)
- Confidence interval: boundary sits in `[4062, 4125]` chars, **midpoint 4093 ± 32 chars** — well inside the ±64 target precision
- Hypothesised mechanism (consistent with the forum thread 113867 "4 KB chunk boundary" framing): the upstream Obsidian.com → Obsidian.exe IPC envelope appears to fail when the JSON-serialised content payload crosses a ~4096-byte threshold. The "content=" prefix (8 bytes) plus the content payload at the 4070-byte argv element size (probe 6 PASS) leaves ~26 bytes of IPC framing overhead before the 4096 ceiling. At 4133 bytes (probe 5 FAIL) the IPC envelope overflows the upstream's chunk boundary and the IPC channel hangs the parent process

**Failure-mode breakdown:**

- All 4 FAIL probes (5000, 4500, 4250, 4125) produced the **TIMEOUT + CRASH_DIALOG** combination: wall-clock hit the 10 s SIGTERM cap with empty stdout/stderr, the child process had to be killed, and Obsidian's main GUI displayed the crash dialog the user dismissed manually before the next probe ran
- Zero `SILENT_NO_OP` observations in this bisect — every FAIL was a hang followed by a host-process crash dialog. Note this differs from the parent session's TC-00458 observation (which reported a first-call `SILENT_NO_OP` with `bytes_written: 0`); the discrepancy is likely state-dependent (TC-00458 ran through the cli-mcp wrapper's queue + DI'd `spawnFn` + post-stat byte-delta read; this bisect runs through raw `child_process.spawn`). The wrapper's post-stat byte-delta read can return delta=0 when SIGTERM races the post-stat call, producing the `bytes_written: 0` shape the wrapper used to emit — that surface is now structurally rejected by the BI-047 handler guard at [src/tools/prepend/handler.ts:306-326](../../src/tools/prepend/handler.ts) (FS_WRITE_FAILED.post-stat-byte-delta-zero) shipped in @marwansaab/obsidian-cli-mcp 0.7.6
- The failure mode was deterministic at every probed size in the FAIL range: 4 different sizes (5000, 4500, 4250, 4125) all crashed identically. No probabilistic flakiness — every size ≥ 4125 produced the same TIMEOUT + dialog shape
- No new observable behaviours beyond the documented buckets

**Recommended schema cap for the wrapper:**

- **Suggested `MAX_CONTENT_LENGTH` for prepend: 3584 chars** (the next 512-byte boundary below the validated 4062 PASS, leaving ~478 chars of safety margin for argv-overhead variation in real-world calls)
  - Real-world argv overhead beyond content varies: this probe used `vault=TestVault-Obsidian-CLI-MCP` (32 bytes) + `prepend` (7 bytes) + `path=Sandbox/BI-0016/cli-bisect/target.md` (41 bytes) = 80 bytes of non-content argv. A caller using `vault=Knowledge` (15 bytes) + deeper path `path=Daily/2026/05/27/some-deep-nested-note.md` (52 bytes) = 74 bytes — similar order
  - **Conservative alternative: 3072** (matches the cap shipped in @marwansaab/obsidian-cli-mcp 0.7.7, which used a wider safety margin pre-this-bisect). 3072 vs 3584 trades ~512 chars of caller surface for additional safety against future state-dependent flakiness or argv-overhead-heavy callers. 3584 is the empirically defensible max; 3072 is the conservatively defensible max
- The cap applies to **prepend only** in the current cohort. The other CLI-wrap content-carrying tools in the wrapper are:
  - `set_property` — value parameter, similar argv shape, would hit the same upstream IPC defect at similar sizes
  - `append` (if it migrates from fs-direct back to CLI-wrap) — would inherit the same constraint
  - `create` — the forum-bisect baseline; ~4076 PASS / 5128 CRASH per the forum thread (forum.obsidian.md/t/113867/5), consistent with this prepend bisect within argv-overhead noise
- **Cohort recommendation**: any CLI-wrap tool that takes a content-bearing argv element should adopt the same cap until upstream Obsidian repairs the IPC defect. The cap could live as a shared `UPSTREAM_ARGV_CONTENT_CAP` constant under `src/cli-adapter/` so future cohort additions inherit the limit automatically

**Crash recovery cost:**

- Average wall-clock from CRASH_DIALOG (user dismissal moment) to next clean call succeeding: not directly measured (the 15 s `Start-Sleep` between probes was a fixed pacing, not a measured recovery window). The fact that probe 6 succeeded at 85 ms after probe 5's crash + dismissal suggests recovery is fast once the user dismisses the dialog
- Side effects on subsequent probes: zero observed in this bisect — probe 6 returned 85 ms (within noise of probe 1's 92 ms baseline). No evidence of degraded post-crash performance at small payloads
- Caveat from prior probing session (recorded under [specs/047-fix-prepend-reliability/.scratch/t0-r1-bisect/FINDINGS.md](../047-fix-prepend-reliability/.scratch/t0-r1-bisect/FINDINGS.md)): driving `Obsidian.exe` (GUI binary, not the CLI) directly with CLI args ~16 times accumulates state corruption that breaks subsequent CLI calls at ANY size — eventually requires an Obsidian restart. Today's bisect against `Obsidian.com` did not exhibit that pattern (single-dialog dismissals fully recovered), which is consistent with the IPC channel hanging *the call* rather than corrupting Obsidian's persistent state

**Open questions / follow-ups:**

- **Did upstream emit any in-band signal on the SILENT_NO_OP / TIMEOUT probes that the wrapper could use to detect failure without timing out?**
  - All 4 FAIL probes in this bisect produced **empty stdout AND empty stderr** before the SIGTERM. No exit code (signal-only termination). No in-band signal the wrapper could read pre-timeout
  - Conclusion: the wrapper cannot shortcut the 10 s timeout — the only signal is the timeout itself. The post-timeout state surfaces as `CLI_TIMEOUT` (already correctly classified by the dispatch layer at `src/cli-adapter/_dispatch.ts:238`)
- **Does the boundary differ across vault states (empty vault, vault with many notes, vault with Smart Connections enabled, etc.)?**
  - This bisect tested **one configuration only**: `TestVault-Obsidian-CLI-MCP` with the `smart-connections` community plugin loaded. The Smart Connections plugin maintains an embedding index; its background work could plausibly affect IPC latency or chunk-boundary behaviour, but this bisect did not isolate that variable
  - **Recommended follow-up**: re-run the same bisect against a fresh empty vault with zero community plugins to confirm the boundary is upstream-fixed, not plugin-modulated. Expected result: boundary stays at ~4062-4125 if upstream-fixed; boundary shifts substantially if plugin-modulated
- **Does the argv overhead inflate the effective payload (e.g. if upstream wraps the JSON envelope with additional framing bytes the wrapper can't see)?**
  - The argv element sizes captured (4070 PASS / 4133 FAIL) are the **wire-level UTF-8 byte sizes** of the `content=` argv element as passed to `CreateProcess`. The upstream presumably wraps this in a JSON IPC envelope before forwarding to the running Obsidian.exe GUI — the IPC envelope adds framing bytes the wrapper cannot observe directly. The 26-byte gap between 4070-byte PASS and the hypothetical 4096-byte JSON ceiling is consistent with a small JSON envelope overhead (e.g. `{"cmd":"prepend","args":{...}}` framing)
  - **The wrapper's MAX_CONTENT_LENGTH constraint must apply against content length, not total argv bytes**, because the wrapper builds argv after the cap check. A future enhancement could measure the full argv envelope and lower the effective cap when `vault=` + `path=` overhead is unusually large (e.g. a 200-char path), but this bisect provides no evidence that overhead beyond ~80 bytes pushes the boundary materially below 4062 chars
- **Multi-byte content (non-ASCII):** the wrapper's schema enforces against UTF-16 code-unit count, but the IPC defect operates on UTF-8 byte count. A 3584-char CJK payload (1 UTF-16 code unit each, 3 UTF-8 bytes each) would expand to ~10752 UTF-8 bytes in the argv — well above the 4096 ceiling. This bisect tested ASCII only; non-ASCII content above ~1365 chars (4096/3) would hit the same IPC defect. **Recommended follow-up**: re-bisect with `"中"`-repeated content to find the multi-byte boundary, and consider whether the wrapper should enforce a UTF-8-byte-budget cap in addition to the UTF-16 code-unit cap

---

## Bisect summary in one line

**Upstream Obsidian CLI `prepend` on Windows 10.0.26200.8457 with Obsidian 1.12.7 crashes deterministically at content ≥ 4125 chars (argv `content=` element ≥ 4133 bytes). The largest empirically validated PASS is 4062 chars (4070 argv bytes). Recommended wrapper cap: 3584 chars (defensible max) or 3072 chars (conservative — matches @marwansaab/obsidian-cli-mcp 0.7.7).**
