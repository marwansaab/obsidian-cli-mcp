# Data Model — 008-refactor

**Status**: complete
**Date**: 2026-05-07

This feature is a structural deepening rather than a domain-model change — no new persistent entities are introduced. The data model below documents the type-level shapes that constitute the new public surfaces (`registerTool`, `dispatchCli`, `invokeCli`, `invokeBoundedCli`, `killInFlightChildren`) plus the modified Logger interface.

All shapes shown are TypeScript-equivalent. Source-of-truth signatures live in the contract files under [contracts/](contracts/); this document presents the same shapes in tabular form for navigability and cross-references their enforcement points.

---

## 1. `ToolSpec<TSchema, TDeps>` — input to `registerTool`

The declarative record a tool author passes to the registration entry point.

| Field | Type | Required | Notes |
|---|---|:-:|---|
| `name` | `string` | ✓ | Stable tool name visible to MCP clients. Single source of truth — referenced in error messages, `docs/tools/{name}.md` lookups, and the `tools/list` descriptor. |
| `description` | `string` | ✓ | Human-readable description published in the descriptor. Survives `stripSchemaDescriptions` because the strip utility preserves the root-level description per [src/help/strip-schema.ts:30](../../src/help/strip-schema.ts#L30). |
| `schema` | `TSchema extends ZodTypeAny` | ✓ | The zod schema. Single source of truth (Principle III). The published JSON Schema is mechanically derived via `toMcpInputSchema(schema)` — no parallel hand-written shape. |
| `deps` | `TDeps` | optional | Per-tool dependencies the handler closes over (e.g., `{ logger, queue }` for tools that hit the CLI). Type-parameterized so each tool's deps shape is its own. |
| `responseFormat` | `"json" \| "raw"` | optional, default `"json"` | Controls how the handler's return value is wrapped into the MCP `CallToolResult`. `"json"` wraps in `{ content: [{ type: "text", text: JSON.stringify(result) }] }`. `"raw"` passes the handler's return value through unchanged (it must already be a valid `ToolCallResult`). |
| `handler` | `(input: z.infer<TSchema>, deps: TDeps) => Promise<unknown \| ToolCallResult>` | ✓ | The tool's actual logic. Receives parsed (zod-validated) input and the deps bag; returns either a raw value (for `responseFormat: "json"`) or a pre-built `ToolCallResult` (for `responseFormat: "raw"`). |

**Validation rules**:
- `name` MUST be a non-empty string. Empty / undefined is a developer-time bug; the registration call throws synchronously.
- `schema` MUST be a `ZodTypeAny`. The publication pipeline calls `.parse(...)` on it inside the handler wrapper.
- `responseFormat: "raw"` is intended for the help tool only today; future tools may opt in but must return a valid `ToolCallResult` shape.

---

## 2. `RegisteredTool` — output of `registerTool` (unchanged from existing `_shared.ts`)

Re-stated for completeness; lives at [src/tools/_shared.ts:40-43](../../src/tools/_shared.ts#L40-L43).

| Field | Type | Notes |
|---|---|---|
| `descriptor` | `ToolDescriptor` | The shape returned to MCP clients via `tools/list`: `{ name, description, inputSchema }`. |
| `handler` | `ToolCallHandler` | `(args: unknown) => Promise<ToolCallResult>` — the function `server.ts` invokes from its `CallToolRequest` dispatcher. |

**Behavior of the wrapped handler** (publication pipeline inside `registerTool`):
1. Receive `args: unknown` from the MCP SDK.
2. Run `schema.parse(args)`.
3. On `ZodError`: return `asToolError({ code: "VALIDATION_ERROR", message: "<tool name> input failed schema validation", details: { issues: [...] } })`.
4. On parse success: invoke `handler(parsed, deps)`.
5. On `UpstreamError` from the handler: return `asToolError({ code, message, details })`.
6. On any other thrown value: re-throw (will surface as a generic SDK error — should not happen if handlers obey Principle IV).
7. On success and `responseFormat: "json"`: return `{ content: [{ type: "text", text: JSON.stringify(result) }] }`.
8. On success and `responseFormat: "raw"`: return `result` unchanged (TypeScript narrows it to `ToolCallResult`).

---

## 3. `assertToolDocsExist` aggregator — the FR-005 doc-file check

Function signature:

```ts
function assertToolDocsExist(
  tools: RegisteredTool[],
  docsDir: string,
): void;  // throws on miss; returns void on success
```

**Algorithm**:
1. For each `tool` in `tools`, compute `docPath = path.resolve(docsDir, ${tool.descriptor.name}.md)`.
2. Test `existsSync(docPath)`. If false, push the path into a `missing: string[]` accumulator. Continue iterating (do NOT throw mid-walk per Clarifications Q4).
3. After the walk, if `missing.length === 0` return; otherwise throw a single `Error` whose message lists every missing path:

```
Missing tool documentation files:
  - docs/tools/help.md
  - docs/tools/obsidian_exec.md
  - docs/tools/read_note.md

Server boot failed because these registered tools have no documentation. Create the missing files and try again.
```

**Where it's called**: `src/server.ts`, immediately after the `tools` array is constructed and before `setRequestHandler(ListToolsRequestSchema, ...)` is registered. A miss aborts boot loudly — exactly what FR-005 + Clarifications Q4 require.

---

## 4. `DispatchInput` — input to `dispatchCli`

The unified spawn-input bag the dispatch primitive accepts.

| Field | Type | Required | Notes |
|---|---|:-:|---|
| `command` | `string` | ✓ | The Obsidian CLI subcommand (e.g., `"read"`, `"eval"`). Goes into argv after `vault=...`. |
| `vault` | `string \| undefined` | optional | If present, prepended as `vault=<value>` per the documented argv order. |
| `parameters` | `Record<string, string \| number \| boolean \| undefined>` | optional | Key=value pairs serialized as `k=String(v)` and appended after `command`. Undefined values are dropped. |
| `flags` | `string[]` | optional | Bare-word flags (no `--` prefix). Validated upstream by tool schemas; `dispatchCli` passes through verbatim. |
| `copy` | `boolean` | optional | If true, `--copy` is appended at the tail of argv. |
| `timeoutMs` | `number` | ✓ | Wall-clock timeout. SIGTERM at `timeoutMs`; SIGKILL after a 2 s grace if the child has not exited. |
| `outputCapBytes` | `number` | ✓ | Stdout/stderr byte cap. Exceeding triggers SIGTERM/SIGKILL with `CLI_OUTPUT_TOO_LARGE` classification. |

**argv assembly** (per FR-012):

```
[binary, ...(vault ? [`vault=${vault}`] : []), command, ...kvs, ...flags, ...(copy ? ["--copy"] : [])]
```

`kvs` is the result of mapping `parameters` entries (where the value is not `undefined`) to `${k}=${String(v)}`.

---

## 5. `DispatchOutput` — success envelope from `dispatchCli`

| Field | Type | Notes |
|---|---|---|
| `stdout` | `string` | UTF-8 decoded. |
| `stderr` | `string` | UTF-8 decoded. |
| `exitCode` | `0` | Always 0 on the success path; a non-zero exit is `CLI_NON_ZERO_EXIT` (rejection). |
| `argv` | `string[]` | The full argv assembled by `dispatchCli`, including the binary at index 0. Useful for callers that want to echo the invocation back to the user (e.g., `obsidian_exec`'s response includes argv). |

**Failure path**: every classification verdict raises an `UpstreamError` (existing class at [src/errors.ts:10](../../src/errors.ts#L10)) whose `code` is one of the six codes in the existing roster. No new codes are introduced.

---

## 6. `InvokeCliInput` — typed-tool facade input

Mirrors today's [src/cli-adapter/cli-adapter.ts:8-13](../../src/cli-adapter/cli-adapter.ts#L8-L13) shape, with the `target_mode` field retained for the locator-strip semantics.

| Field | Type | Required | Notes |
|---|---|:-:|---|
| `command` | `string` | ✓ | Same as `DispatchInput.command`. |
| `parameters` | `Record<string, string \| number \| boolean \| undefined>` | ✓ | Same as `DispatchInput.parameters`. Subject to locator-strip when `target_mode === "active"`. |
| `flags` | `string[]` | ✓ | Same as `DispatchInput.flags`. |
| `target_mode` | `"specific" \| "active"` | ✓ | Drives locator-strip inside `invokeCli` (BEFORE `dispatchCli`). The strip removes `vault`, `file`, `path` from `parameters` when `target_mode === "active"`. |
| `copy` | `boolean` | optional | Same as `DispatchInput.copy`. (Today's typed tools don't use it; available for future tools.) |

Bounds are FIXED inside `invokeCli` — `TYPED_TOOL_TIMEOUT_MS = 10_000`, `TYPED_TOOL_OUTPUT_CAP_BYTES = 10 * 1024 * 1024`. NOT part of the public interface.

**Output**: `{ stdout: string; stderr: string }` (the `exitCode` and `argv` fields from `DispatchOutput` are dropped at this layer — typed tools don't surface them).

---

## 7. `InvokeBoundedCliInput` + `InvokeBoundedCliOverrides` — escape-hatch facade

Input mirrors today's [src/tools/obsidian_exec/schema.ts:5-14](../../src/tools/obsidian_exec/schema.ts#L5-L14) parsed shape (`ObsidianExecInput`):

| Field | Type | Required | Notes |
|---|---|:-:|---|
| `command` | `string` | ✓ | |
| `parameters` | `Record<...>` | optional | NOT subject to locator-strip — escape-hatch surface trusts caller-supplied params. |
| `vault` | `string` | optional | |
| `flags` | `string[]` | optional | |
| `copy` | `boolean` | optional | |

Overrides bag:

| Field | Type | Notes |
|---|---|---|
| `timeoutMs` | `number` | Defaults to `OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS` (30 s) when omitted. **Silently clamped to `OBSIDIAN_EXEC_MAX_TIMEOUT_MS` (120 s) when the value exceeds the ceiling**, per Clarifications Q1 / FR-011. No `VALIDATION_ERROR` is raised; no warning is emitted. |

Bounds defaults: `OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS = 30_000`, `OBSIDIAN_EXEC_OUTPUT_CAP_BYTES = 10 * 1024 * 1024`, `OBSIDIAN_EXEC_MAX_TIMEOUT_MS = 120_000`. Output-cap is NOT overridable today (matches current behavior, FR-011).

**Output**: `{ stdout: string; stderr: string; exitCode: 0; argv: string[] }` (matches today's `ObsidianExecOutput` from [src/tools/obsidian_exec/handler.ts:15-20](../../src/tools/obsidian_exec/handler.ts#L15-L20)).

---

## 8. In-flight child registry — `_dispatch.ts` module-level state

```ts
// src/cli-adapter/_dispatch.ts (module-private)
let inFlightChild: ChildProcess | null = null;
```

**Lifecycle**:
- **Insertion**: synchronous, immediately after `child = spawn(...)` returns. NO `await` or microtask boundary may intervene before `inFlightChild = child;` (per Clarifications Q5 / FR-015a).
- **Removal**: at `child.on("exit", ...)` and `child.on("error", ...)` handlers — asynchronous removal is permitted per FR-015a.

**Public surface**:

```ts
export function killInFlightChildren(): boolean;  // true if a child was killed; false if none in flight
```

Behavior: if `inFlightChild === null`, return `false`. Otherwise call `child.kill("SIGTERM")` (catch errors — child may already be dead), schedule `child.kill("SIGKILL")` after `SIGKILL_GRACE_MS = 2000`, return `true`. Emit one stderr log line via `logger.dispatchKill({ ... })` with the killed child's PID and command.

**Concurrency invariant**: at most one cell is set at any moment. Guaranteed by the FIFO single-flight queue (`src/queue.ts`) which serializes both facades' dispatch calls. If the queue invariant ever changes, the cell upgrades to a `Set<ChildProcess>` and the function name does not need a rename (it's already plural).

---

## 9. `Logger` interface — modified

Removed methods (per research R3): `callStart`, `callEndSuccess`, `callEndFailure`. The corresponding events `call.start` and `call.end` (success/failure variants) are no longer emitted from anywhere in the codebase.

Retained: `shutdown(event: ShutdownEvent)` — emits `bridge.shutdown` lines from `server.ts`.

Added — three failure-lifecycle methods (or one polymorphic — implementation choice):

```ts
interface Logger {
  shutdown(event: ShutdownEvent): void;
  dispatchTimeout(event: DispatchTimeoutEvent): void;
  dispatchCap(event: DispatchCapEvent): void;
  dispatchKill(event: DispatchKillEvent): void;
}

interface DispatchTimeoutEvent {
  callId: string;       // randomUUID per dispatch
  command: string;      // input.command
  pid: number;          // child PID
  timeoutMs: number;    // the timeout that fired
  durationMs: number;   // wall-clock from spawn to timeout-fire
}

interface DispatchCapEvent {
  callId: string;
  command: string;
  pid: number;
  stream: "stdout" | "stderr";
  capturedBytes: number;
  limitBytes: number;   // OUTPUT_CAP_BYTES
}

interface DispatchKillEvent {
  callId: string;
  command: string;
  pid: number;
  durationMs: number;   // wall-clock from spawn to kill
}
```

JSON line shape (per `event` field):
- `{ event: "dispatch.timeout", ts, callId, command, pid, timeoutMs, durationMs }`
- `{ event: "dispatch.cap", ts, callId, command, pid, stream, capturedBytes, limitBytes }`
- `{ event: "dispatch.kill", ts, callId, command, pid, durationMs }`

`ts` is the ISO-8601 timestamp of emission.

---

## Test-coverage map (Principle II)

| Surface | Test home | Happy path | Failure / boundary |
|---|---|---|---|
| `registerTool` | [src/tools/_register.test.ts](../../src/tools/_register.test.ts) (NEW) | descriptor envelope shape; description-stripped at every depth; `responseFormat: "json"` wraps result; `responseFormat: "raw"` passes through; deps closure captured | ZodError → `VALIDATION_ERROR` envelope; UpstreamError → `asToolError`; non-Error throw re-thrown unchanged |
| `assertToolDocsExist` | [src/tools/_register.test.ts](../../src/tools/_register.test.ts) (NEW) | empty input returns; all docs present returns | one missing → message names that file; multiple missing → message names ALL files (Clarifications Q4 / FR-005) |
| `dispatchCli` | [src/cli-adapter/_dispatch.test.ts](../../src/cli-adapter/_dispatch.test.ts) (NEW) | exit 0 success; argv order matches FR-012; registry insertion atomic with spawn | classification table — non-zero exit → `CLI_NON_ZERO_EXIT`; `Error: no active file` → `ERR_NO_ACTIVE_FILE`; `Error:` prefix → `CLI_REPORTED_ERROR`; ENOENT → `CLI_BINARY_NOT_FOUND`; timeout → `CLI_TIMEOUT` + dispatch.timeout log; cap → `CLI_OUTPUT_TOO_LARGE` + dispatch.cap log; SIGINT mid-flight → SIGTERM → SIGKILL grace + dispatch.kill log |
| `invokeCli` | [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) (MODIFIED) | typed-tool happy path against synthetic spawn; locator-strip when `target_mode: "active"`; queue-wrapped (does not overlap with `invokeBoundedCli`) | timeout fires at 10 s; cap fires at 10 MiB; bounds NOT overridable from caller |
| `invokeBoundedCli` | [src/cli-adapter/invoke-bounded-cli.test.ts](../../src/cli-adapter/invoke-bounded-cli.test.ts) (NEW) | default 30 s timeout; override `timeoutMs: 90_000` honored; argv carries `--copy` when input.copy === true; queue-wrapped | override `timeoutMs: 200_000` clamped silently to 120 s (Clarifications Q1); no `VALIDATION_ERROR` raised by clamp; no warning emitted |
| `killInFlightChildren` | [src/cli-adapter/_dispatch.test.ts](../../src/cli-adapter/_dispatch.test.ts) (NEW) | no child in flight returns false; child in flight returns true and SIGTERM is sent; SIGKILL grace fires after 2 s if child still alive | dispatch.kill log emitted with PID + command + duration |
| Logger (modified) | [src/logger.test.ts](../../src/logger.test.ts) (MODIFIED) | shutdown emits `bridge.shutdown`; dispatchTimeout / Cap / Kill emit single JSON lines with correct shape | call.start / call.end* are NO LONGER tested (methods removed) |
| `server.ts` (boot path) | [src/server.test.ts](../../src/server.test.ts) (MODIFIED) | three tools registered; registry-consistency invariants (a)/(b)/(c) pass | rename `docs/tools/help.md` away → boot fails with aggregated message naming the missing file (FR-005 / Clarifications Q4) |

This map shows every modified or new public surface has at least one happy-path test AND at least one failure / boundary test in the same change-set, satisfying Constitution Principle II (NON-NEGOTIABLE) for this feature's diff.
