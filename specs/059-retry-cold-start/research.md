# Research: Retry Cold Start

Phase 0 output. Records the design decisions (validated against the real dispatch code and an 8-agent adversarial workflow on 2026-05-30) and the implement-phase T0 probe protocol that closes the remaining empirical unknowns. Format per decision: **Decision / Rationale / Alternatives considered**.

## D1 — Retry placement: inside `dispatchCli`, wrapping an extracted `dispatchOnce`

**Decision**: Extract the current spawn-and-classify body of `dispatchCli` (the `return new Promise<DispatchOutput>(...)` block, [`_dispatch.ts:101-336`](../../src/cli-adapter/_dispatch.ts#L101)) into an inner `async function dispatchOnce(input, deps): Promise<DispatchOutput>`. `dispatchCli` becomes the retry orchestrator that calls `dispatchOnce`, inspects the outcome, and on a cold-start trigger calls `dispatchOnce` exactly once more.

**Rationale**: Verified that in production `dispatchCli` is called by **only** the two facades (`invokeCli` at `cli-adapter.ts:77`, `invokeBoundedCli` at `invoke-bounded-cli.ts:64`), and every one of the ~37 tool handlers reaches the CLI exclusively through those facades (the eval-composed cohort included — `open_file`, `backlinks`, `query_base` all call `invokeCli({command:"eval"...})`). The injected `deps.spawnFn` is resolved **inside** `dispatchCli` (`_dispatch.ts:97`), so an injected stub rides *inside* the retry rather than around it. Therefore the in-primitive position is inherited by every current and future tool with zero adaptation, and is the only position that also sees the **classified** `UpstreamError` (the cold-start form-(a) signal is produced by the four-priority classifier, which lives above the raw spawn).

**Alternatives considered**:
- *Facade-level wrapper* (retry in both `invokeCli` and `invokeBoundedCli`): rejected — duplicates the policy across two callers, the exact per-caller drift ADR-004/ADR-029 centralization exists to kill; strictly more places, no simplicity win.
- *`spawnFn` decorator at the composition root*: rejected — a spawn decorator sees only the child process, never the classified `UpstreamError`, so it physically cannot recognize the form-(a) cold-start signature. Dead end.
- *Per-tool retry*: rejected by ADR-029 (duplication/drift).

## D2 — Trigger predicate `isColdStart`: two forms, type-guarded

**Decision**: A predicate `isColdStart(value: unknown): boolean` that recognizes:
- **Form (a)** — `value instanceof UpstreamError && value.code === "CLI_REPORTED_ERROR" && typeof value.details?.stdout === "string" && COLD_START_PATTERN.test(value.details.stdout)` where **`COLD_START_PATTERN = /^\s*Error: Command "[^"]*" not found\./`** (the command-not-found prefix; command- and suffix-independent, per Q4). **Correction (T0, 2026-05-30, `Obsidian.com`):** the original working value `COLD_START_INVARIANT = "not found. It may require a plugin to be enabled."` was a suffix substring; the live `.com` probe found the suffix varies (`read` cold-starts as `… not found. Did you mean: sync:read, daily:read, template:read?`), so the suffix-only match silently missed valid-command cold-starts. The invariant is the prefix.
- **Form (b)** — `Stream closed`, recognized only after the T0 probe pins its surface form, and only if OQ-005 clears it (see D5). The predicate must type-guard before reading `.message`/`.code` (the transport variant may arrive as a **raw** `Error`, not an `UpstreamError` — see D4).

**Rationale**: Form (a) is exactly the shape `dispatchCli` priority (c) already produces ([`_dispatch.ts:314-324`](../../src/cli-adapter/_dispatch.ts#L314)). Reusing it adds no code. The substring match mirrors the existing R5 "Vault not found." stdout-signature precedent (`cli-adapter.ts:88-97`) and keeps the trigger command-agnostic (FR-002). A naive `value.code === ...` would throw on a non-object throw value — hence `instanceof` guards first.

**Alternatives considered**: exact full-string equality (rejected — command name is interpolated, breaks FR-002); broad `Error:`-prefix match (rejected — would retry unrelated exit-0 `Error:` outputs like the existing `CLI_REPORTED_ERROR` cases that are *not* cold-start).

## D3 — Second attempt authoritative (Q1); no-masking

**Decision**: Once the retry fires, the second attempt's outcome is returned verbatim — `resolve` on success, `throw` on failure — with **no reference to attempt 1**. The wrapper's shape is essentially: run attempt 1; if `isColdStart(outcome1)` → `return dispatchOnce()` (attempt 2, whose resolve/throw is the final outcome); else return/throw outcome 1 unchanged.

**Rationale**: Q1 (Clarification 2026-05-30): attempt 1's cold-start signal is known-spurious; surfacing it over a genuine post-launch error (e.g. a real `FILE_NOT_FOUND` once the vault is up) would itself be a masking bug. The second attempt's `UpstreamError` is the real post-launch state. Preserves Constitution IV (no swallow/default; on persistent failure the real structured error propagates).

**Alternatives considered**: propagate attempt 1's error on any attempt-2 failure (rejected — masks real post-launch errors); hybrid (rejected — complex, no benefit).

## D4 — `Stream closed` (form b) manifestation map — the dangerous resolve path

**Decision**: Treat form (b) as having **three** possible surface forms through `dispatchCli`, all to be disambiguated by the T0 probe (OQ-002):
1. a **raw `Error`** rejected from `child.on("error")` non-ENOENT path ([`_dispatch.ts:213`](../../src/cli-adapter/_dispatch.ts#L213)) — not an `UpstreamError`;
2. a **`CLI_NON_ZERO_EXIT`** with `Stream closed` on `details.stderr`/`details.stdout` (non-zero or signal-only exit, `_dispatch.ts:279`);
3. **dangerous**: `exitCode: 0` with stdout `Stream closed` (no `Error:` prefix) → `dispatchCli` **resolves it as success** (`_dispatch.ts:327`), so a catch-only wrapper never sees it.

If the probe shows form (3) is real, `isColdStart` MUST also be consulted on the **resolved** `DispatchOutput.stdout`, not just the caught error — otherwise the retry silently never fires and the caller gets a phantom success.

**Rationale**: surfaced by the stream-closed investigation agent. The naive `try { dispatchOnce() } catch (e) { if isColdStart(e) ... }` sketch in ADR-029 covers forms (1) and (2) but not (3). The plan keeps the resolve-path inspection **conditional** on the probe (do not add it speculatively — keep the design minimal per the user's anti-complexity steer).

**Alternatives considered**: assume `Stream closed` is always a rejection (rejected — unverified; the resolve path is a real silent-success hole).

## D5 — Form (b) is probe-gated, all-or-nothing (Q5 / mutation safety)

**Decision**: Ship **form (a)** retry unconditionally (all commands). **Form (b)** retry is enabled **only if** the extended OQ-005 probe proves `Stream closed` always fires **pre-execution** (registry/transport not ready before the command body ran), in which case it is enabled **blanket for all commands**; otherwise form (b) is **dropped entirely**. Never gated per-command.

**Rationale**: the mutation-or-masking skeptic found (HIGH severity) that `rename`/`move`/`delete` are typed tools that dispatch the real upstream mutating subcommands through `dispatchCli`, and `obsidian_exec` accepts an arbitrary opaque command. A dropped pipe (`Stream closed`) carries no evidence of lifecycle position — it can fire after the mutation applied but before stdout flushed, so an unconditional form-(b) retry could double-apply (append twice) or mask a real success (`rename A→B` landed → retry sees A gone → reports failure). Form (a)'s registry-not-ready semantics provably preclude execution; form (b)'s do not. Per-command idempotency gating was rejected because it adds a classification surface a future mutating tool must remember to mark — the exact "forgetting to adapt" risk the user asked to avoid (user decision, AskUserQuestion 2026-05-30: "probe-gate, all-or-nothing").

**Alternatives considered**: unconditional form (b) for all (rejected — mutation double-apply/masking); idempotency-gated form (b) (rejected — per-tool adaptation surface); drop form (b) now (viable fallback — this is exactly what the gate selects if the probe shows post-execution firing).

## D6 — Orphan-child shutdown race

**Decision**: Guard the gap between attempt-1 settle and attempt-2 spawn. The module-level `inFlightChild`/`inFlightContext` registry (`_dispatch.ts:55-56`) is cleared by `clearRegistryIfMine` when attempt 1 settles and re-set when attempt 2 spawns; in that gap `killInFlightChildren()` (called from `server.ts` shutdown) would see `null`, return `false`, do nothing — then attempt 2 spawns *after* shutdown swept, orphaning it. Add a module-level `shuttingDown` flag (set by the shutdown path) that `dispatchCli` checks before issuing the retry: if shutdown began in the gap, skip the retry and propagate attempt 1's error. Pin with a test (shutdown-during-retry-gap → no orphaned attempt-2 child).

**Rationale**: the single-spawn design today guarantees `killInFlightChildren` catches the one mid-flight child per held queue slot; the retry breaks that guarantee. This is a genuine new risk introduced by the retry and is invisible in the catch-only sketch.

**Alternatives considered**: accept the orphan and document it (rejected — leaves a process leak on shutdown-during-cold-start); rely on `queue.shutdown()` dropping pending (rejected — the active retrying slot is not "pending", it is in-flight).

## D7 — Logs/metrics: fresh ids per attempt + a `dispatch.retry` line

**Decision**: Move `callId` and `startedAt` **inside** `dispatchOnce` so each attempt gets a fresh id/clock (today they are computed once at `_dispatch.ts:98-99`, above the Promise body). Emit one `dispatch.retry` log line (via the already-injected `logger`) carrying both attempt callIds when the retry fires.

**Rationale**: two attempts sharing one `callId` would collide in `dispatch.timeout`/`dispatch.cap`/`dispatch.kill` logs and double-count `durationMs`. The retry line preserves Principle IV chain-of-custody for the discarded attempt-1 error (logging is not "handling" — the real retry + real propagation remain). Requires a `logger.dispatchRetry(...)` method addition or reuse of an existing structured log channel — confirmed in Phase 1 against `src/logger.ts`.

**Alternatives considered**: keep shared ids (rejected — log ambiguity); no retry log (rejected — silent retry undercuts the audit trail).

## D8 — No-bypass structural guardrail (FR-012)

**Decision**: Add `src/cli-adapter/architecture.test.ts` that source-scans `src/**` and fails if: (i) a `node:child_process` **value** import of `spawn`/`spawnSync`/`exec`/`execFile` appears in any production file other than `src/cli-adapter/_dispatch.ts` (type-only imports excluded); (ii) `dispatchCli` is imported by any production file other than the two facades.

**Rationale**: the future-tool-bypass skeptic found the "no tool can forget the retry" claim holds for the handler→facade→`dispatchCli` pattern but NOT against a future author importing `spawn` directly (e.g. for a streaming command `dispatchCli`'s buffer-then-classify model can't serve). No test/lint enforces the single-spawn-site invariant today — only a file-header comment + Principle I, neither of which fails CI. This test converts the bypass from a silent regression into a failing build. It is the load-bearing enforcement of FR-009/SC-008.

**Alternatives considered**: a comment only (rejected — does not fail CI); an eslint `no-restricted-imports` rule (viable alternative; a test is chosen for parity with the existing FR-018 registry-stability baseline test pattern and because it can also assert the two-caller invariant, which a lint rule cannot).

## Scope boundary (FR-013) — eval-envelope cold-start is NOT covered

The eval-preflight investigation confirmed the cohort pre-flight (`resolveVaultRootOrRemap` → `vaultRegistry.resolveVaultPath`) does **not** short-circuit a registered-but-closed vault (a closed-but-registered name resolves from the cached `vaults verbose` map), so the eval **does** dispatch and the retry **does** get its chance. BUT: if a cold-launch focuses the wrong vault, an eval-composed tool can return a well-formed `exitCode: 0` envelope (`open_file`'s `VAULT_NOT_FOCUSED`, `query_base`'s empty-stdout → `detectIfClosed` → `VAULT_NOT_FOUND/reason:"not-open"`). `dispatchCli` sees **success**, so the retry does not fire. This focused-vault-mismatch manifestation is a distinct failure mode already handled by those tools' own guards (BI-057 / ADR-015) and is **out of ADR-029's dispatch-layer scope** (FR-013). The plan does not attempt to fix it; OQ-001 records which manifestation each command kind actually produces on cold-start.

## T0 probe protocol (implement-phase, gated by `.memory/test-execution-instructions.md`)

Run against the authorized vault `TestVault-Obsidian-CLI-MCP` in a **registered-but-closed** state, invoking the `obsidian` binary directly (not through `dist/index.js`) so raw stdout/stderr/exit are observed. Capture verbatim; feed answers back into ADR-029 (flip to Decided) and the architecture doc on ship.

| Probe | Resolves | What to capture |
|---|---|---|
| **P0-1** (OQ-001, OQ-007) | form-(a) signature uniformity | For a read, a list, a search, a write/mutating cmd, and a tab/open eval against the closed vault: the exact first-attempt `exitCode` + stdout. Confirm the invariant substring `not found. It may require a plugin to be enabled.` is identical across kinds; note any divergence. Pin the literal. |
| **P0-2** (OQ-002, D4) | form-(b) surface form | Force/observe a `Stream closed` first attempt. Record: did `dispatchCli` reject (raw `Error` vs which `UpstreamError.code`) or resolve? exit code (0 / non-zero / null-signal)? which stream carried the literal? the exact substring. Frequency (reliable vs intermittent). |
| **P0-3** (OQ-003) | pre-retry delay | Does an immediate second attempt succeed, or does it race the launch (still-cold on attempt 2)? Quantify typical launch ms. Default stays immediate; justify a single small fixed bounded delay only if the immediate retry races. |
| **P0-4** (OQ-005, D5 gate) | form-(b) mutation safety | Force a `Stream closed` against a mutating cmd (`rename`/`move`/`delete`) on the closed vault under `Sandbox/`; inspect vault state for partial application (did the mutation land? did an append double?). **Enables form (b) blanket only if proven pre-execution-only; else drops form (b).** Seed unique-per-run fixtures, capture pre-state, clean up per the destructive-probe protocol. |
| **P0-5** (OQ-004) | no-masking | A genuinely unknown command (typo / TUI-only `vault:open`) against the closed vault still fails after exactly one retry, original error preserved. |
| **P0-6** (OQ-006) | both facades | Confirm a typed-tool path and the `obsidian_exec` passthrough both exhibit the cold-start failure and both inherit the retry. |

**Default-safe posture if a probe is inconclusive**: ship form (a) only; drop form (b). This keeps the feature correct and uniform with no per-tool adaptation even if the transport variant cannot be characterized.
