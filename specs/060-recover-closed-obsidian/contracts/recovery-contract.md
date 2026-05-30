# Recovery Contract — Recover Closed Obsidian

**Feature**: 060-recover-closed-obsidian
**Date**: 2026-05-30

This feature exposes no new MCP tool, so there is no new tool-input schema. The "contract" is the behavioural contract of the dispatch-layer recovery: the detection signature, the launcher interface, the recovery state machine, the error shape, and the environment opt-out. All literals are pinned in [research.md](../research.md) and evidenced in [t0-probe-findings.md](t0-probe-findings.md).

---

## 1. Detection contract

A first-attempt outcome is the **application-not-running** condition iff:

```
UpstreamError.code === "CLI_NON_ZERO_EXIT"
  && APP_NOT_RUNNING_PATTERN.test(details.stderr)        // /unable to find Obsidian/i
```

On classification (`dispatchOnce`, priority (a)), such an error carries `details.reason = "obsidian-not-running"`. The recovery predicate is:

```
isAppNotRunning(value) ===
  value instanceof UpstreamError
  && value.code === "CLI_NON_ZERO_EXIT"
  && value.details?.reason === "obsidian-not-running"
```

Invariants:
- Command-agnostic — no per-command table (FR-002).
- Disjoint from `isColdStart` — app-down is a non-zero exit with the stderr signature; cold-start is `exit 0` with the `Command "<cmd>" not found.` stdout signature (FR-001).
- Never matches `CLI_TIMEOUT` / `CLI_OUTPUT_TOO_LARGE` / `CLI_BINARY_NOT_FOUND` / `CLI_REPORTED_ERROR` / `ERR_NO_ACTIVE_FILE`, nor a generic non-zero exit whose stderr does not match the pattern (FR-009).

## 2. Launcher contract

```
launchObsidian(input: { vault?: string }, deps: { platform?: NodeJS.Platform; spawnFn?: SpawnLike; env?: NodeJS.ProcessEnv }): Promise<void>
```

- Builds `obsidian://open?vault=<URL-encoded input.vault>`; when `vault` is absent, a vault-less application start.
- Selects the opener by `deps.platform ?? process.platform`:
  - `win32` → shell `start` verb (`cmd /c start "" "<uri>"`)
  - `darwin` → `open "<uri>"`
  - `linux` (and other POSIX) → `xdg-open "<uri>"`
- Spawns **detached, stdio `ignore`, `unref`'d**; resolves once the opener is spawned. **Does not** wait for readiness and **does not** spawn the `obsidian` CLI binary.
- If the opener binary is missing (`ENOENT`), the rejection is surfaced to the orchestrator, which treats it as "could not launch" → the readiness bound governs the eventual distinct error.

## 3. Recovery state machine (in `dispatchCli`)

```
result := dispatchWithColdStartRetry(input)          // existing ADR-029 inner path
if result resolves:                                  → return result            (normal + cold-start cases)
if result throws e:
    if !isAppNotRunning(e):                          → throw e                  (FR-009 — never retried)
    if !autoLaunchEnabled(env) or shuttingDown:      → throw e                  (D5 opt-out / shutdown guard)
    launchObsidian({ vault: input.vault })           // exactly once (FR-003)
    deadline := now + OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS   // 30 000 ms
    loop while now < deadline:
        r := dispatchWithColdStartRetry(input)       // re-attempt original command
        if r resolves:                               → return r                 (authoritative success)
        if !isAppNotRunning(r-error):                → throw r-error            (authoritative real error)
        sleep(POLL_INTERVAL_MS)                       // ~750 ms
    throw enrich(e, reason="obsidian-not-running", message=<could-not-launch>)  (FR-004/FR-007/FR-010)
```

Guarantees:
- **At most one launch** per operation (FR-003/FR-004); no loop on the launch itself.
- **Bounded termination** — the loop is bounded by a fixed time budget; never hangs/loops indefinitely (FR-010).
- **Re-attempting the original command is side-effect-safe for all commands** — app-down means the CLI errored before connecting, so the command never executed (no double-apply, even for mutations).
- **Composition** — each re-attempt flows through the ADR-029 cold-start retry; 060 does not duplicate it (FR-005).
- **Single-flight** — `dispatchCli` runs inside `queue.run`; `createQueue` serializes, so concurrent app-down operations share one launch (FR-006).
- **Zero success-path overhead** — the loop is reached only after an app-not-running throw; an already-running call returns from the first `dispatchWithColdStartRetry` unchanged (FR-011).

## 4. Error contract (unrecoverable / opt-out)

```
UpstreamError {
  code: "CLI_NON_ZERO_EXIT",                 // reused — NO new top-level code (Principle IV)
  cause: { exitCode: 1, signal: null },
  details: {
    argv, command, stdout: "", stderr: "The CLI is unable to find Obsidian. …",
    exitCode: 1, signal: null,
    reason: "obsidian-not-running"           // ADR-015 sub-discriminator (closed enum: {"obsidian-not-running"})
  },
  message: <see below>
}
```

`message`:
- recovery exhausted: `"Obsidian is not running and could not be auto-launched within 30s — start Obsidian and try again."`
- opt-out set: `"Obsidian is not running and auto-launch is disabled (OBSIDIAN_AUTO_LAUNCH) — start Obsidian and try again."`

Distinguishable by callers via `(code === "CLI_NON_ZERO_EXIT" && details.reason === "obsidian-not-running")` — distinct from a normal success, from the cold-start case, and from a generic non-zero exit (FR-007).

## 5. Environment opt-out contract

```
OBSIDIAN_AUTO_LAUNCH:
  unset / any value not in the disable-set → auto-launch ON (default)
  trimmed.toLowerCase() ∈ { "0", "false", "no", "off" } → auto-launch OFF
```

When OFF: no launch is attempted; the §4 error (opt-out message) surfaces; success path and timing unchanged (FR-013, SC-006).

## 6. Observability contract

`logger.dispatchRecovery({ command, launched, outcome, attempts, readyMs? })` emits a `dispatch.recovery` JSON-line:
- `outcome: "recovered"` — re-attempt succeeded after launch (`readyMs` = ms to readiness).
- `outcome: "unrecoverable"` — bound exhausted; the §4 error was thrown.
- `outcome: "disabled"` — opt-out set; no launch attempted; the §4 error was thrown.
