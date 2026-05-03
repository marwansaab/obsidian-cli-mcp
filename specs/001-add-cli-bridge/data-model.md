# Phase 1 Data Model: Add CLI Bridge

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-03

The bridge holds no persistent state. Every entity below is in-memory and exists for at most the lifetime of a single MCP request (or the bridge process, for the queue/lifecycle entities). All field types are TypeScript-style; the canonical runtime types are produced by `z.infer<typeof schema>` on the zod schemas in [src/tools/obsidian_exec/schema.ts](../../src/tools/obsidian_exec/schema.ts).

## Entities

### `ObsidianExecInput`

The validated input to a single `obsidian_exec` call. Source of truth: [src/tools/obsidian_exec/schema.ts](../../src/tools/obsidian_exec/schema.ts) (zod). The MCP tool's published `inputSchema` is generated from the same zod object via `zod-to-json-schema`.

| Field | Type | Required | Validation | Notes |
|-------|------|----------|------------|-------|
| `command` | `string` | yes | non-empty (`.min(1)`); no whitespace check (lets the CLI decide what's a valid subcommand) | First positional after the binary in argv. FR-003. |
| `parameters` | `Record<string, string \| number \| boolean>` | no | object whose values are exactly one of the three primitive types | Each entry becomes `key=value` in argv; numbers/booleans stringified. FR-004. |
| `flags` | `string[]` | no | each element non-empty; each element MUST NOT start with `--` (zod `.refine`) | Bare-word flags appended verbatim. FR-005. |
| `vault` | `string` | no | non-empty when present (`.min(1)`) | When set, `vault=<value>` is prepended as the first positional after the binary, before `command`. FR-006. |
| `copy` | `boolean` | no | — | When `true`, `--copy` is appended as the final argv token. The only `--`-prefixed flag the bridge produces. FR-007. |
| `timeoutMs` | `number` | no | positive integer (`.int().positive()`); maximum `120000` (`.max(120000)`) | Overrides default 30 s timeout. Counted from spawn, not enqueue (FR-023). FR-008. |

**Validation failure behavior**: zod's `.parse()` throws; the handler dispatch catches and returns the validation error via the MCP SDK's structured error response with the offending field paths preserved. FR-009.

### `ObsidianExecOutput`

The success response from a single `obsidian_exec` call. Returned only when the spawned child exits with code 0 AND no error path triggered first.

| Field | Type | Notes |
|-------|------|-------|
| `stdout` | `string` (UTF-8) | Full captured stdout, decoded once at completion. FR-012. |
| `stderr` | `string` (UTF-8) | Full captured stderr. May be non-empty even on `exitCode: 0` (CLI warnings). |
| `exitCode` | literal `0` | The success path requires exit code 0. Any non-zero routes through `UpstreamError` instead. |
| `argv` | `string[]` | The exact array passed to `spawn(binary, argv, opts)` — does NOT include the binary itself (matches FR-010's argv shape: `[binary, vault=<v>?, command, ...params, ...flags, --copy?]` minus the leading binary). For diagnostic and reproducibility purposes. |

### `UpstreamError`

A project-wide structured error class (single definition: [src/errors.ts](../../src/errors.ts)). Reused across the whole project for any boundary failure — this feature introduces it; future tools throw it too. FR-018.

```text
class UpstreamError extends Error {
  readonly code: string;          // stable identifier; see codes table below
  readonly cause: unknown;        // the original thrown value, where one existed
  readonly details: Record<string, unknown>;  // structured per-code payload (see codes table)
  constructor(args: { code: string; cause: unknown; details: Record<string, unknown>; message?: string });
}
```

#### Error codes (the four `obsidian_exec` failure paths)

| `code` | Triggered by | `cause` shape | `details` shape |
|--------|--------------|---------------|-----------------|
| `CLI_NON_ZERO_EXIT` | Spawned child exited with a non-zero code. FR-014. | `{ exitCode: number, signal: string \| null }` | `{ argv: string[], stdout: string, stderr: string }` |
| `CLI_BINARY_NOT_FOUND` | `spawn` emitted ENOENT (binary not on PATH and `OBSIDIAN_BIN` did not point to a real file). FR-015. | The Node.js spawn error object (`Error & { code: "ENOENT", syscall: "spawn", ... }`) | `{ binaryAttempted: string, PATH: string \| undefined }` |
| `CLI_TIMEOUT` | Call exceeded its `timeoutMs` (or default 30 s). Bridge sent SIGTERM, then SIGKILL after 2 s grace. FR-016. | `null` | `{ argv: string[], timeoutMs: number, partialStdout: string, partialStderr: string }` |
| `CLI_OUTPUT_TOO_LARGE` | Either `stdout` or `stderr` capture crossed 10 MiB. Bridge sent SIGTERM, then SIGKILL after 2 s grace. FR-027. | `null` | `{ argv: string[], stream: "stdout" \| "stderr", limitBytes: 10485760, capturedBytes: number, partial: string }` |

**Invariants**:
- Plain `throw new Error(...)` is forbidden anywhere in [src/tools/obsidian_exec/handler.ts](../../src/tools/obsidian_exec/handler.ts) and [src/server.ts](../../src/server.ts). FR-017.
- The MCP SDK serializes `UpstreamError` instances thrown from a tool handler via its `CallToolResult` `isError: true` shape, with the `message`, `code`, and `details` reachable in the response payload.
- `UpstreamError` is thrown in production code; tests use `node:test`'s `assert.throws(..., UpstreamError)` and assert on `.code` and `.details`.

### `LogEvent`

Structured log lines written to **stderr** (one JSON object per line, terminated with `\n`). Stdout is reserved exclusively for MCP protocol traffic. FR-024, FR-025.

#### `call.start`

Emitted at the moment the child is spawned (after queue wait, before child output is observed).

| Field | Type | Notes |
|-------|------|-------|
| `event` | literal `"call.start"` | discriminator |
| `ts` | string (ISO-8601, `new Date().toISOString()`) | UTC |
| `callId` | string (UUID v4 from `crypto.randomUUID()`) | correlates with the matching `call.end` |
| `command` | string | from input |
| `vault` | `string \| null` | input value or `null` if omitted |
| `argv` | `string[]` | the exact spawned argv (excluding binary) |
| `queueDepth` | integer (>= 0) | number of pending calls behind this one at spawn time |

#### `call.end` (success)

| Field | Type | Notes |
|-------|------|-------|
| `event` | literal `"call.end"` | |
| `ts` | string (ISO-8601) | |
| `callId` | string | matches the `call.start` |
| `exitCode` | literal `0` | success-only |
| `durationMs` | integer (>= 0) | wall-clock between `call.start` and child exit |
| `stdoutBytes` | integer (>= 0) | captured stdout byte count |
| `stderrBytes` | integer (>= 0) | captured stderr byte count |

#### `call.end` (failure)

| Field | Type | Notes |
|-------|------|-------|
| `event` | literal `"call.end"` | |
| `ts` | string (ISO-8601) | |
| `callId` | string | matches the `call.start` |
| `errorCode` | `"CLI_NON_ZERO_EXIT" \| "CLI_BINARY_NOT_FOUND" \| "CLI_TIMEOUT" \| "CLI_OUTPUT_TOO_LARGE"` | mirrors `UpstreamError.code` |
| `durationMs` | integer (>= 0) | |
| `exitCode` | `number \| undefined` | when `errorCode = "CLI_NON_ZERO_EXIT"`, present |
| `signal` | `string \| null \| undefined` | when `errorCode = "CLI_NON_ZERO_EXIT"`, present |

#### `bridge.shutdown`

Emitted exactly once, immediately before `process.exit(0)`. FR-029.

| Field | Type | Notes |
|-------|------|-------|
| `event` | literal `"bridge.shutdown"` | |
| `ts` | string (ISO-8601) | |
| `reason` | `"transport_closed" \| "signal:SIGINT" \| "signal:SIGTERM"` | discriminator across the three clean-shutdown triggers |
| `inFlightKilled` | boolean | `true` if a child was running and got SIGTERM/SIGKILL during shutdown |
| `queuedDropped` | integer (>= 0) | number of queued (not-yet-spawned) calls that were dropped |

### `QueueItem` (internal)

Not part of any external contract — purely a [src/queue.ts](../../src/queue.ts) internal record. Documented here so the implementer's mental model is shared.

| Field | Type | Notes |
|-------|------|-------|
| `task` | `() => Promise<unknown>` | The work to run when this item reaches the head of the queue |
| `resolve` | `(value: unknown) => void` | Settles the public-facing promise returned by `queue.run()` |
| `reject` | `(reason: unknown) => void` | Settles the public-facing promise on failure |

### `BridgeState` (process-global, conceptual)

Conceptual grouping of the bridge process's globals — implemented as a small set of module-level variables in [src/server.ts](../../src/server.ts) and [src/queue.ts](../../src/queue.ts), not as a single object.

| Field | Type | Where it lives | Notes |
|-------|------|----------------|-------|
| `shuttingDown` | boolean | [src/server.ts](../../src/server.ts) | Idempotency guard for the `shutdown(reason)` function — prevents double-cleanup if transport-close and SIGINT race. |
| `currentRunPromise` | `Promise<unknown> \| null` | [src/queue.ts](../../src/queue.ts) | Tail of the FIFO chain; new tasks `.then()` off this. |
| `pendingCount` | integer | [src/queue.ts](../../src/queue.ts) | Number of items enqueued but not yet completed (drives `queueDepth` in `call.start`). |
| `activeChild` | `ChildProcess \| null` | [src/tools/obsidian_exec/handler.ts](../../src/tools/obsidian_exec/handler.ts) | Reference to the in-flight `obsidian` process so the shutdown path can kill it. Cleared on each child exit. |

## State Transitions

### Per-call lifecycle

```
client → MCP request → schema.parse → queue.run(spawn-and-collect)
                ↓ validation fail
            MCP structured error response (FR-009)
                ↓ pass
            queued (queueDepth = N)
                ↓ head of queue
            spawn child + start timer + start log line (call.start)
                ↓ first failure or completion
            ┌─ exit 0      → ObsidianExecOutput → call.end (success)
            ├─ non-zero    → UpstreamError(CLI_NON_ZERO_EXIT) → call.end (failure)
            ├─ ENOENT      → UpstreamError(CLI_BINARY_NOT_FOUND) → call.end (failure)
            ├─ timeout     → kill (SIGTERM, +2s SIGKILL) → UpstreamError(CLI_TIMEOUT) → call.end (failure)
            └─ cap exceed  → kill (SIGTERM, +2s SIGKILL) → UpstreamError(CLI_OUTPUT_TOO_LARGE) → call.end (failure)
```

### Bridge process lifecycle

```
boot → server.connect(transport)  → ready (queue idle)
                ↓
            handle requests indefinitely
                ↓ any of:
                ├─ transport close (stdin EOF, client disconnect, transport error)
                ├─ SIGINT
                └─ SIGTERM
                ↓ shutdown(reason) — idempotent via shuttingDown flag
            kill activeChild if non-null (SIGTERM, +2s SIGKILL)
                ↓
            drop all queued tasks (do not spawn)
                ↓
            emit bridge.shutdown log line
                ↓
            process.exit(0)
```

Hard kills (`taskkill /F`, `kill -9`) bypass this entire path. The bridge cannot self-clean from those; orphaned `obsidian` children in that case are an OS-level limitation, not a defect.
