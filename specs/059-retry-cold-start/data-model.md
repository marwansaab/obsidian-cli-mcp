# Data Model: Retry Cold Start

This feature is dispatch-layer control flow, not a data surface — it adds no schema, no persisted entity, and no tool input/output shape. The "entities" below are the internal types and constants the retry introduces inside `src/cli-adapter/_dispatch.ts`. All are internal; none cross a published boundary (so Principle III is N/A).

## Constants

- **`COLD_START_PATTERN: RegExp`** — the command- and suffix-independent signature that identifies the form-(a) cold-start stdout. **Shipped value (pinned by T0 probe P0-1 against `Obsidian.com`, 2026-05-30): `/^\s*Error: Command "[^"]*" not found\./`.** The suffix varies by edit-distance (`Did you mean: …` vs `It may require a plugin to be enabled.`), so the invariant is the command-not-found PREFIX, not a suffix substring. *(An earlier working value `"not found. It may require a plugin to be enabled."` was a suffix substring that missed the `read`-style "Did you mean" cold-start — corrected.)* Single source of truth; the production matcher and the test fixtures import it so they cannot drift.
- **`STREAM_CLOSED_SURFACE`** — the pinned surface form of form (b) (`Stream closed`). Shape is decided by T0 probe P0-2: one of `{ kind: "rawError"; messageIncludes: string }`, `{ kind: "nonZeroExit"; streamIncludes: string }`, or `{ kind: "exit0Stdout"; stdoutIncludes: string }` (the dangerous resolve-path form). **Only defined if probe P0-4 clears form (b)** (D5); otherwise form (b) is dropped and this constant does not exist.

## `ColdStartTriggerForm` (conceptual)

| Form | Surfaces through `dispatchCli` as | Retry policy |
|---|---|---|
| **(a) command-not-found** | `UpstreamError{ code: "CLI_REPORTED_ERROR", details.stdout matches COLD_START_PATTERN, exitCode: 0 }` (priority (c) classifier) | **Unconditional** — all commands, safe by registry-not-ready semantics (FR-011) |
| **(b) Stream closed** | raw `Error` (PATH 2) \| `CLI_NON_ZERO_EXIT` (PATH 3) \| exit-0 stdout success (PATH 4, dangerous) | **Probe-gated, all-or-nothing** — enabled blanket only if P0-4 proves pre-execution-only firing; else dropped (FR-001, D5) |

## `AttemptOutcome` (conceptual)

The result of one `dispatchOnce` call, as observed by the retry orchestrator:
- **resolved** → a `DispatchOutput { stdout, stderr, exitCode: 0, argv }`. Normally final; but if form (b) PATH-4 is in scope, the orchestrator inspects `stdout` for `STREAM_CLOSED_SURFACE` before treating it as final (D4).
- **rejected** → a thrown value (an `UpstreamError`, or a raw `Error` for the form-(b) transport case). The orchestrator runs `isColdStart` on it.

## `isColdStart(value: unknown): boolean`

Pure predicate. Input is the caught throw value **or** the resolved `DispatchOutput` (when PATH-4 is in scope). Output decides whether exactly one retry fires.

```
isColdStart(value):
  // form (a) only — form (b) Stream closed is NOT retried (mutation-safety, D5)
  if value instanceof UpstreamError
     && value.code === "CLI_REPORTED_ERROR"
     && typeof value.details?.stdout === "string"
     && COLD_START_PATTERN.test(value.details.stdout):   // /^\s*Error: Command "[^"]*" not found\./
        return true
  return false
```

Invariants:
- Type-guards before reading `.code`/`.message`/`.stdout` (the throw value is `unknown`; the transport form may be a raw `Error`, not an `UpstreamError`).
- Never matches `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT` (except the explicitly-pinned form-(b) PATH-3 case), `ERR_NO_ACTIVE_FILE`, `VALIDATION_ERROR`, or the facade-level `Vault not found.` re-classification — those keep single-shot behaviour (FR-008).
- Adds no new `UpstreamError.code` (Constitution IV).

## Retry orchestrator state (per call)

| State | Lifetime | Note |
|---|---|---|
| attempt count | per `dispatchCli` call | bounded to 2 (one retry); proven by the `calls()` assertion in tests |
| `callId`, `startedAt` | **per attempt** (moved inside `dispatchOnce`, D7) | fresh per attempt so logs/metrics don't collide |
| `shuttingDown` | module-level | set by the shutdown path; checked before the retry to avoid orphaning attempt 2 (D6) |
| `inFlightChild` / `inFlightContext` | module-level (existing) | cleared on attempt-1 settle, re-set on attempt-2 spawn; the gap is what `shuttingDown` guards |
