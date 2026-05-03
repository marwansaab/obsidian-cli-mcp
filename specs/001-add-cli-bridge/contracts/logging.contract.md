# Logging Contract: JSON-lines on stderr

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-03

The bridge emits structured logs as JSON Lines (one JSON object per line, terminated with `\n`) to **stderr**. Stdout is reserved exclusively for MCP protocol traffic — any write to stdout that isn't from the MCP SDK transport is a protocol violation.

Source: FR-024, FR-025, FR-026, FR-029. Implementation: [src/logger.ts](../../../src/logger.ts).

## Invariants

1. **Stdout is sacred**. The logger MUST NOT write to stdout under any circumstance. Tests in [src/logger.test.ts](../../../src/logger.test.ts) MUST assert that the logger's output stream is `process.stderr` (or a stream injected for testing) and never `process.stdout`.
2. **One JSON object per line**, terminated with `\n`. The line MUST be valid JSON in isolation (no trailing commas, no comments, no NaN/Infinity).
3. **Timestamps**: ISO-8601 UTC produced via `new Date().toISOString()`.
4. **`callId` correlation**: every `call.start` MUST be matched by exactly one `call.end` with the same `callId` over the lifetime of the bridge process. UUIDs from `crypto.randomUUID()`.
5. **No verbosity knob in v0.1** (FR-026). The logger always emits the call-start/call-end pair. Future verbosity controls are deferred.

## Event types

### `call.start`

Emitted at the moment a queued call's child is actually spawned (after queue wait). Carries the queue depth observed at that instant — useful for spotting back-pressure under burst.

```jsonc
{
  "event": "call.start",
  "ts": "2026-05-03T14:22:11.041Z",
  "callId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "command": "search",
  "vault": "personal",        // null when the input omitted vault
  "argv": ["vault=personal", "search", "query=meeting", "limit=10"],
  "queueDepth": 0
}
```

Fields:

| Field | Type | Notes |
|-------|------|-------|
| `event` | literal `"call.start"` | discriminator |
| `ts` | string (ISO-8601 UTC) | spawn moment, not enqueue moment |
| `callId` | string (UUID v4) | correlates with the matching `call.end` |
| `command` | string | from `ObsidianExecInput.command` |
| `vault` | `string \| null` | from input; `null` if omitted |
| `argv` | `string[]` | exact argv passed to `spawn` (excluding the binary) |
| `queueDepth` | integer (>= 0) | number of *pending* (not-yet-spawned) calls behind this one at spawn time. `0` means the queue was empty when this call started. |

### `call.end` (success)

Emitted immediately after the child exits with code 0 and the success response is constructed.

```jsonc
{
  "event": "call.end",
  "ts": "2026-05-03T14:22:11.412Z",
  "callId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "exitCode": 0,
  "durationMs": 371,
  "stdoutBytes": 4218,
  "stderrBytes": 0
}
```

Fields:

| Field | Type | Notes |
|-------|------|-------|
| `event` | literal `"call.end"` | discriminator |
| `ts` | string (ISO-8601 UTC) | call end moment |
| `callId` | string | matches the `call.start` |
| `exitCode` | literal `0` | success-only |
| `durationMs` | integer (>= 0) | wall-clock between matching `call.start` and this event |
| `stdoutBytes` | integer (>= 0) | captured stdout byte count (not character count) |
| `stderrBytes` | integer (>= 0) | captured stderr byte count |

### `call.end` (failure)

Emitted immediately before the `UpstreamError` is thrown out of the tool handler. The `errorCode` mirrors `UpstreamError.code` exactly.

```jsonc
{
  "event": "call.end",
  "ts": "2026-05-03T14:22:11.412Z",
  "callId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "errorCode": "CLI_NON_ZERO_EXIT",
  "durationMs": 89,
  "exitCode": 2,                 // present when errorCode is CLI_NON_ZERO_EXIT
  "signal": null                 // present when errorCode is CLI_NON_ZERO_EXIT (string for terminated-by-signal cases)
}
```

Fields:

| Field | Type | Notes |
|-------|------|-------|
| `event` | literal `"call.end"` | |
| `ts` | string (ISO-8601 UTC) | |
| `callId` | string | matches the `call.start` |
| `errorCode` | one of the four codes | `"CLI_NON_ZERO_EXIT"` / `"CLI_BINARY_NOT_FOUND"` / `"CLI_TIMEOUT"` / `"CLI_OUTPUT_TOO_LARGE"` |
| `durationMs` | integer (>= 0) | |
| `exitCode` | integer or omitted | present only when `errorCode = "CLI_NON_ZERO_EXIT"` |
| `signal` | `string \| null` or omitted | present only when `errorCode = "CLI_NON_ZERO_EXIT"` |

The full `details` payload from the `UpstreamError` is **not** duplicated in the log line — it goes back to the caller via the MCP error response. The log line is for the operator, not for the client. Captured stdout/stderr (potentially MB of text) are intentionally excluded from logs to keep them readable.

### `bridge.shutdown`

Emitted exactly once, immediately before `process.exit(0)`. There is no matching "start" event — the bridge is considered "running" from the moment it accepts its first MCP request.

```jsonc
{
  "event": "bridge.shutdown",
  "ts": "2026-05-03T14:25:03.882Z",
  "reason": "transport_closed",  // or "signal:SIGINT" or "signal:SIGTERM"
  "inFlightKilled": true,
  "queuedDropped": 2
}
```

Fields:

| Field | Type | Notes |
|-------|------|-------|
| `event` | literal `"bridge.shutdown"` | |
| `ts` | string (ISO-8601 UTC) | |
| `reason` | `"transport_closed" \| "signal:SIGINT" \| "signal:SIGTERM"` | which clean-shutdown trigger fired |
| `inFlightKilled` | boolean | `true` if a child was running when shutdown started and got SIGTERM/SIGKILL |
| `queuedDropped` | integer (>= 0) | number of queued (not-yet-spawned) calls that were dropped without spawning |

## Test coverage requirements (Principle II)

- [src/logger.test.ts](../../../src/logger.test.ts) — assert each event shape (call.start / call.end-success / call.end-failure / bridge.shutdown), assert stderr-only invariant, assert `callId` correlation, assert UTC timestamp format.
- [src/tools/obsidian_exec/handler.test.ts](../../../src/tools/obsidian_exec/handler.test.ts) — assert that each spawn produces a matched `call.start` / `call.end` pair on the test logger, including failure paths emit `call.end` *before* the `UpstreamError` propagates.
- [src/server.test.ts](../../../src/server.test.ts) — assert `bridge.shutdown` is emitted on each of the three triggers (transport close, SIGINT, SIGTERM) and that `reason` discriminates correctly.
