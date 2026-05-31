# Research: Open Cross-Vault Files

Phase 0 decisions. **Updated 2026-06-01 after a live T0 probe** (user-requested, against `Obsidian.com` on Windows) that fundamentally simplified the design: the Obsidian CLI has **native `open` and `tab:open` commands that honour `vault=` and switch focus cross-vault** — so `open_file` is reimplemented as a thin **native-CLI wrapper** routed through `dispatchCli`, not the eval-composed focus-switch design originally drafted. The earlier eval-based plan (eval guard demotion + `obsidian://` URI focus-switch + verify-poll) is **superseded** and recorded under "Superseded approach" for traceability.

---

## T0 FINDINGS (live probe, 2026-06-01, `Obsidian.com`, Windows)

Probed directly per `.memory/test-execution-instructions.md` (authorised `TestVault-Obsidian-CLI-MCP`, drive `Obsidian.com`). Evidence captured below; pins OQ-1…OQ-5 at plan-time (rare — usually deferred to implement-T0; the user pulled the probe forward).

1. **Native `open` and `tab:open` commands exist** (BI-057's "no native `open` subcommand" assumption is **stale** — the CLI exposes them now):
   - `open` — `file=<name>` / `path=<path>` / `newtab` flag — "Open a file".
   - `tab:open` — `group=<id>` / `file=<path>` / `view=<type>` — "Open a new tab".
   - Global option `vault=<name>` — "Target a specific vault by name".
2. **Both honour `vault=` and switch focus CROSS-VAULT** — **B1 does NOT apply to these native commands** (unlike `eval`). Evidence: focused vault was `The Setup`; `vault=TestVault-Obsidian-CLI-MCP tab:open file=Sandbox/BI-0008/target-path.md` → `Opened: …`, and an immediate active-mode `eval` showed `basePath` had switched to `…\TestVault-Obsidian-CLI-MCP` with that file active. `vault="The Setup" open path=…` switched it back. **This is the whole feature, native.**
3. **Placement is NOT reported by the native command** — stdout is always `Opened: <resolved path>` (exit 0). It must be derived (D2). Observed via `tabs`:
   - `open` (no `newtab`) on a **not-open** file → opens (active/new); on an **already-open** file → **reuses** the tab (tab count unchanged, no duplicate).
   - `open newtab` → **new tab created** (tab count +1, duplicate of an already-open file).
   - `tab:open` → always a new tab.
4. **Error shapes flow through existing dispatch/adapter classification** (no eval envelope needed):
   - File not found: `Error: File "<x>" not found.` (exit 0) → dispatch priority (c) → `CLI_REPORTED_ERROR`. Disjoint from the cold-start signature (`Error: Command "…" not found.` — `File` ≠ `Command`), so it is **not** mis-retried as cold-start.
   - Unknown vault: `Vault not found.` (exit 0) → the existing `invokeCli` `UNKNOWN_VAULT_PREFIX` re-classification → `CLI_REPORTED_ERROR`.
5. **`tabs ids` format**: `[<viewtype>] <basename>\t<hex-leaf-id>` per tab (e.g. `[markdown] target-path\t0279a8946da7464f`). Shows basename + stable leaf id, no full path and no active marker — relevant to the placement-detection design (D2).
6. **Spaced vault names** are passed verbatim as one `vault=<name>` argv token — production-safe (`dispatchCli` uses a spawn argv array via `assembleArgv`, which preserves the space). The probe-harness `Start-Process` mangling of `vault=The Setup` was a PowerShell quoting artefact, not a CLI/production issue.

**Note**: the user's own backlog note is titled *"BI-0131 - Reimplement Open File Via Native Tab Open"* — confirming the intended direction is exactly this native reimplementation.

---

## D1 — Mechanism: reimplement `open_file` as a native-CLI wrapper over `open` / `tab:open`

**Decision**: `open_file` issues the native `open` command through the existing `invokeCli → dispatchCli` path in `target_mode:"specific"` with `vault=<requested>`, the caller's locator (`path=` or `file=`), and the `newtab` flag when `new_tab` is true. The native command performs the cross-vault focus switch and the open atomically. The eval template, the in-eval focused-vault guard, the eval envelope, and the focus-switch/verify-poll are **all removed**.

**Rationale** (grounded in the T0 findings):
- Native `open`/`tab:open` honour `vault=` and switch focus cross-vault (finding 2) — overcomes B1 **natively**, with no eval, no `obsidian://` URI step, no verify-poll.
- Routing through `dispatchCli` means cross-vault recovery is **inherited with zero per-tool code** (D3): app-down launch (ADR-030) and cold-start retry (ADR-029) both apply, and — crucially — there is **no eval envelope** for BI-059 FR-013 to carve out, so the cold-start (`Error: Command "…" not found.`) is retried normally.
- The locator resolves **atomically inside the target vault** (the native command owns resolution after switching) — no wrong-vault bare-name risk (FR-006a satisfied by construction).
- Error shapes are classified by existing dispatch/adapter logic (finding 4) — no new classification code.
- `open` is one command covering both placement intents: `new_tab=false` → `open`; `new_tab=true` → `open … newtab`. (`tab:open` is the always-new-tab sibling; `open newtab` is equivalent and keeps a single command — confirmed finding 3.)

**Tool cohort shift**: `open_file` moves from the **eval-composed cohort** to the **native-CLI-wrapper cohort** (alongside `read`, `files`, `move`, `rename`). This makes **ADR-010** (typed tool names mirror the upstream subcommand) **relevant** where it was N/A — see D8.

---

## D2 — Placement detection (the one non-trivial remaining mechanism)

**Decision**: derive the `placement` value from the `new_tab` flag plus a target-vault "already open?" observation, since the native command does not report placement (finding 3):

| `new_tab` | file already open in target vault | placement |
|-----------|-----------------------------------|-----------|
| `true`    | (any)                             | `new_tab_created` (deterministic — `newtab` always creates a tab, finding 3) |
| `false`   | yes                               | `existing_tab_reused` (`open` reuses, no duplicate, finding 3) |
| `false`   | no                                | `active_tab_used` |

`new_tab_created` needs **no** probe. The reuse-vs-active distinction (only for `new_tab=false`) needs to know whether the target was already open **in the requested vault**. Primary approach: a `tabs ids` snapshot of the requested vault before vs after the open (or a single "is target open" pre-check), comparing leaf-id sets / the target leaf's presence.

**Open detail → implement-T0 (OQ-A)**: confirm `tabs`/`tabs ids` honours `vault=<requested>` cross-vault (lists the target vault's tabs when it is not the focused vault, and is empty/clean for a closed vault → `alreadyOpen=false`), and pin how to identify the target leaf despite the basename-only / no-active-marker output (finding 5) — e.g. `tabs ids` + matching the resolved path's basename, or the `workspace` command (`ids`), or a single post-switch `eval` reading `app.workspace` leaf file paths (the switch having landed, an eval now runs in the target vault — but it only sees *after*-state, so the pre-check is the load-bearing call). **Default if `tabs vault=` is cross-vault-capable**: before/after `tabs ids` diff. **Fallback** if the substrate cannot distinguish reuse from active for a non-focused vault: open with a single pre-switch + post-open observation in the now-focused vault, accepting that the reuse/active split may require the open to run after a focus settle — pinned at T0. The spec contract (exactly one of three values) is held; the detection mechanism is the bounded T0 item.

---

## D3 — Recovery: fully inherited at the dispatch chokepoint (now truly zero per-tool code)

**Decision**: no per-tool recovery, no `launchObsidian` import, no focus-switch poll. Because `open_file` now routes a **native command** (not an eval) through `dispatchCli`:
- **App-down** (`CLI_NON_ZERO_EXIT`, stderr `/unable to find Obsidian/i`) → ADR-030 launch (`obsidian://open?vault=<requested>` — the dispatch input now carries `vault=requested` in specific mode, so the launch targets the right vault) + bounded readiness poll; `OBSIDIAN_AUTO_LAUNCH` honoured; `obsidian-not-running` on opt-out/exhaustion.
- **Cold-start** (warming vault → `Error: Command "open" not found.` matching `COLD_START_PATTERN`) → ADR-029 single retry. The native open's cold-start is a genuine command-not-found, retried normally — the BI-059 FR-013 eval-envelope carve-out **no longer applies** (there is no eval envelope).

This realises the clarification's "inherits recovery with zero per-tool code" **completely** (the earlier eval design had an unavoidable per-tool focus-switch; the native route removes it). Single-flight via the existing `queue.run` in `invokeCli`.

---

## D4 — Error vocabulary: reuse only (no new code, no new reason) — via native shapes

| Condition | Native CLI surface (T0) | Mapped `UpstreamError` |
|-----------|--------------------------|------------------------|
| Unknown/unregistered vault | `Vault not found.` (exit 0) | `CLI_REPORTED_ERROR` + `details.code:"VAULT_NOT_FOUND"` + `reason:"unknown"` — **sole hard vault error** (kept pre-resolved via `resolveVaultRootOrRemap` for a clean typed shape; the native `Vault not found.` is the backstop, re-classified by `invokeCli`) |
| File absent in requested vault | `Error: File "<x>" not found.` (exit 0) | `CLI_REPORTED_ERROR` + `details.code:"FILE_NOT_FOUND"` |
| Unrecoverable focus/launch (app-down + opt-out / launch never ready) | inherited | `CLI_NON_ZERO_EXIT` + `reason:"obsidian-not-running"` (reused) |
| Input validation | n/a (Zod boundary) | `VALIDATION_ERROR` (retained) |

`VAULT_NOT_FOCUSED` (the old eval discriminator) and `INTERNAL_ERROR` (malformed eval envelope) are **gone** — there is no eval. `UNSUPPORTED_FILE_TYPE`: the native `open` may simply open any recognised type and error/no-op on an unrenderable one — **OQ-B** (implement-T0) probes whether `open` surfaces an unsupported-type signal distinct from `FILE_NOT_FOUND`; default: if the native command opens all recognised types and gives no distinct unsupported signal, the BI-057 `UNSUPPORTED_FILE_TYPE` case is dropped (it was a capability caveat anyway) and FR-020's "every type already supported stays supported" holds via the native viewer. **No new top-level code; no new `details.reason`.** `reason:"not-open"` stops being emitted (ADR-015 additive-only — not renamed).

---

## D5 — Locator: native resolution in the target vault (FR-006a satisfied by construction)

**Decision**: keep BI-057's input schema unchanged (exactly-one-of `path`/`file`; static per ADR-003 / Principle III). Pass `path=` or `file=` straight to the native `open`. The native command resolves the locator **in the vault named by `vault=`** (after switching to it), so a bare `file` name can never resolve against the pre-switch vault — the wrong-vault risk the clarification flagged is structurally absent (no separate eval-side resolution exists). The `opened` field is parsed from the native `Opened: <resolved path>` stdout.

**OQ-C** (implement-T0): confirm the native `Opened:` line returns the resolved vault-relative path for both `path=` and bare `file=` (incl. attachments), so `opened` is the canonical path regardless of locator shape (FR-003 parity).

---

## D6 — Module boundary & DI

**Decision**: changes confined to `src/tools/open_file/**`. The eval template (`_template.ts`) and its test are **deleted**. No `launchObsidian` import, no `launchFn` seam (recovery is inherited in `dispatchCli`, which already owns the launcher). `ExecuteDeps` keeps `logger`/`queue`/`vaultRegistry`/`spawnFn`/`env` (the standard native-wrapper deps). **No** new import edge; `open_file` moves into the native-CLI-wrapper cohort. Still no kernel-node touch (`createLogger`/`createQueue`/`UpstreamError`/`createServer` untouched).

---

## D7 — Bound

**Decision**: no new bound — recovery bounds are entirely the inherited `dispatchCli` ones (ADR-029 retry; ADR-030 `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS`). The placement pre-check (D2) adds at most one or two extra bounded CLI round-trips on the open path, only for the `new_tab=false` case.

---

## D8 — Tool naming (ADR-010 now in scope)

**Decision**: keep the tool name **`open_file`** (do not rename to `open`). A rename is a breaking public-surface change, and `open_file` wraps a *pair* of native affordances (`open` / `open newtab`, sibling `tab:open`), so a 1:1 subcommand mirror is not clean. The plan documents this as a **deliberate ADR-010 deviation** (a Complexity Tracking entry): the wrapper mirrors native *behaviour* and routes the native `open` subcommand, but retains the established descriptive `open_file` name for backward compatibility. ADR-031 records the reimplementation and the naming rationale.

---

## Remaining implement-T0 probes (defaults stated)

- **OQ-A** — placement detection: does `tabs`/`tabs ids` honour `vault=` cross-vault; how to identify the target leaf (basename + id) / use `workspace`; reuse-vs-active reliability. *Default*: before/after `tabs ids` diff in the requested vault.
- **OQ-B** — unsupported file type: does native `open` surface a distinct unrenderable-type signal vs `FILE_NOT_FOUND`? *Default*: drop the distinct `UNSUPPORTED_FILE_TYPE` case; rely on native viewer (FR-020 holds).
- **OQ-C** — `Opened:` path fidelity for `path=` and bare `file=` (incl. attachments); canonical `opened` parity (FR-003).
- **OQ-D** — cross-window focus (open-but-unfocused vault in a separate OS window) — re-confirm the native switch works (the probe used same-window vault switching). *Default*: works; document any platform divergence (quickstart).
- **OQ-E** — app-down with the native open lands on the **requested** vault (specific-mode `vault=` threads into the ADR-030 launch URI); opt-out → `obsidian-not-running`. *Default*: yes (specific mode sets `dispatchInput.vault`).

---

## Superseded approach (for traceability)

The originally-drafted design — keep `open_file` eval-composed, demote the in-eval focused-vault guard to a `VAULT_NOT_FOCUSED` switch-signal, fire `launchObsidian({vault})` (`obsidian://open?vault=`) as a reactive focus-switch, and bounded verify-poll until focus lands — is **superseded** by D1. It was correct but strictly more complex: it required a per-tool focus-switch + poll, a `launchObsidian` import, and an eval round-trip per open. The T0 probe showed the native `open`/`tab:open` already switch focus cross-vault, making the eval scaffolding unnecessary. ADR-031 is updated to record the native-wrapper decision; the eval design is preserved here only as the rejected alternative.

---

## Cross-references

- **Supersedes**: BI-057 FR-010/FR-011 → ADR-031 (updated to the native-wrapper mechanism).
- **Composes with**: ADR-029/BI-059 (cold-start retry — now applies natively), ADR-030/BI-060 (app-launch, `obsidian-not-running`, `OBSIDIAN_AUTO_LAUNCH`), ADR-015 (sub-discriminators), ADR-010 (native subcommand naming — deviation documented), ADR-003 (static locator schema).
- **Upstream**: B1 (`.architecture/Obsidian CLI - Upstream Issues and Limitations.md`) — **does not apply** to native `open`/`tab:open` (only to `eval`); this is the key T0 finding.
