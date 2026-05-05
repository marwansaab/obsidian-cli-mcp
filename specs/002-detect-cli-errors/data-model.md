# Data Model: Detect CLI Errors

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-05

This feature introduces no new persistent entities (the bridge is stateless per 001). It adds one new in-memory entity to the existing `UpstreamError.code` enumeration, tightens the contract for one already-live code (`CLI_NON_ZERO_EXIT`), and documents two more codes that were live in source but absent from the canonical contract (`VALIDATION_ERROR`, `TOOL_NOT_FOUND`).

## New: `CLI_REPORTED_ERROR`

A new member of the project-wide `UpstreamError.code` string enumeration. Triggered by [src/tools/obsidian_exec/handler.ts](../../src/tools/obsidian_exec/handler.ts)'s `if (code === 0)` branch when, after the spawned child has exited with code `0` and no `killReason` has been set (i.e., neither `CLI_TIMEOUT` nor `CLI_OUTPUT_TOO_LARGE` short-circuited), the captured `stdout` — when its leading whitespace is trimmed via `String.prototype.trimStart` — begins with the literal six-character ASCII string `Error:` (case-sensitive).

### Field shape

| Field | Type | Value |
|-------|------|-------|
| `code` | `string` (literal) | `"CLI_REPORTED_ERROR"` |
| `cause` | `null` | Always `null` — no thrown value exists; the bridge is re-routing an exit-zero response, not catching a throw (FR-002). |
| `message` (Error.message) | `string` | Synthesized by `UpstreamError`'s constructor as `"CLI bridge upstream error: CLI_REPORTED_ERROR"` (default behavior, [errors.ts:16](../../src/errors.ts#L16)) — same pattern as the other CLI_* codes. |
| `details.argv` | `string[]` | Fully reproducible spawn vector `[binary, ...spawnArgs]` (binary INCLUDED as `argv[0]`) — same shape as `details.argv` for `CLI_NON_ZERO_EXIT`. |
| `details.stdout` | `string` | Full captured stdout (UTF-8). Byte-identical to what would have been returned in the success shape. |
| `details.stderr` | `string` | Full captured stderr (UTF-8). Byte-identical to what would have been returned in the success shape (typically empty for the three observed failure modes). |
| `details.exitCode` | `0` (literal) | The truthful exit code the child process exited with. Per Q1 clarification: discoverable from the error alone for callers distinguishing process-level vs CLI-reported failures (FR-004; mirrors the FR-014 symmetry on `CLI_NON_ZERO_EXIT`). |
| `details.message` | `string` | One-line summary computed as `stdout.split('\n', 1)[0].trim()` — LF-only split, full whitespace trim. Trailing `\r` from Windows CRLF is absorbed by `.trim()` (Q2 clarification, FR-003, Edge Cases CRLF row). |

### Lifecycle

`CLI_REPORTED_ERROR` is constructed once per affected call (i.e., once per exit-zero spawn whose stdout leads with `Error:`), inside the `child.on("exit", ...)` callback in `runOnce`, immediately before `reject(...)`. There is no retry, no backoff, and no caller-visible state besides the single thrown error. Bridge logging emits one `call.end` JSON-lines event with `errorCode: "CLI_REPORTED_ERROR"` (FR-013) before the rejection propagates.

### Invariants

- `details.exitCode === 0` always — non-zero exits short-circuit to `CLI_NON_ZERO_EXIT` (FR-007, exit-code precedence).
- `details.stdout.trimStart().startsWith("Error:") === true` always — the leading-whitespace trim and exact-prefix match are the trigger.
- `details.message.length >= 6` is *not* guaranteed — the bare prefix `Error:` can itself be the entire trimmed first line (Edge Cases). The minimum is whatever `"Error:".trim()` returns (`"Error:"`, six chars).
- `details.message.startsWith("Error:") === true` always (the trim preserves the prefix).
- `cause === null` always (FR-002).

## Modified: `CLI_NON_ZERO_EXIT` (contract reconciliation only)

The runtime shape of `CLI_NON_ZERO_EXIT` is **unchanged** by this feature. [handler.ts:222-229](../../src/tools/obsidian_exec/handler.ts#L222-L229) already constructs `UpstreamError` with `cause: { exitCode, signal }` and `details: { argv, stdout, stderr }`. The contract document at [specs/001-add-cli-bridge/contracts/errors.contract.md](../../001-add-cli-bridge/contracts/errors.contract.md) has prose at line 106 stating `details.exitCode` mirrors `cause.exitCode`, but the table at lines 30-40 omits both `details.exitCode` and `details.signal`.

FR-014 reconciles the table to match the prose. The implementation is unchanged; only the documentation of the existing implementation is added. (See [contracts/errors.contract-patch.md](./contracts/errors.contract-patch.md) for the exact rows to add.)

> **Implementation note**: The handler in [handler.ts:222](../../src/tools/obsidian_exec/handler.ts#L222) currently passes `{ exitCode, signal }` only into `cause`, not into `details`. The MCP serializer at [001 contract:106](../../001-add-cli-bridge/contracts/errors.contract.md) drops `cause`, so MCP clients cannot observe `exitCode` today. To make the contract truthful, the handler MUST be patched to additionally include `exitCode` and `signal` in `details` — a one-line edit. The runtime shape *visible to MCP clients* therefore changes (from `details: { argv, stdout, stderr }` to `details: { argv, stdout, stderr, exitCode, signal }`); existing v0.1 callers that consumed only the previous fields are forward-compatible (additive). This implementation tweak is part of FR-014's "reconcile" mandate — without it, the contract would still be lying.

## Newly-registered: `VALIDATION_ERROR` and `TOOL_NOT_FOUND`

Both codes are emitted live by [src/tools/obsidian_exec/tool.ts:50,61](../../src/tools/obsidian_exec/tool.ts#L50-L61) (via `asToolError(...)`) and documented in the [README error-codes table at lines 113-114](../../README.md#L113-L114), but were never added to the canonical contract document. FR-015 adds them with the shapes the implementation already emits.

### `VALIDATION_ERROR` field shape (mirrors implementation)

| Field | Type | Value |
|-------|------|-------|
| `code` | `string` (literal) | `"VALIDATION_ERROR"` |
| `cause` | `ZodError` (from `zod`) | The thrown `ZodError` instance from the failed `obsidianExecSchema.parse()` call. |
| `details.issues` | `Array<{ path: (string \| number)[], message: string, code: string }>` | The `ZodError.issues[]` projected to a JSON-serializable subset (matches [tool.ts:64](../../src/tools/obsidian_exec/tool.ts#L64)). `path` retains zod's mixed string/number indexing (string keys for objects, numbers for array indices). |

### `TOOL_NOT_FOUND` field shape (mirrors implementation)

| Field | Type | Value |
|-------|------|-------|
| `code` | `string` (literal) | `"TOOL_NOT_FOUND"` |
| `cause` | `null` | No upstream throw; the dispatch table simply lacked the requested name. |
| `details.requestedName` | `string` | The `req.params.name` value the MCP client supplied. |
| `details.knownTools` | `string[]` | The list of tool names the bridge currently registers. In v0.1/v0.2 this is `["obsidian_exec"]`. |

## Logger.ErrorCode union (extended)

The existing `ErrorCode` type union in [src/logger.ts:4](../../src/logger.ts#L4) is currently:

```ts
export type ErrorCode = "CLI_NON_ZERO_EXIT" | "CLI_BINARY_NOT_FOUND" | "CLI_TIMEOUT" | "CLI_OUTPUT_TOO_LARGE";
```

Per FR-013, this union MUST be extended to add `"CLI_REPORTED_ERROR"`:

```ts
export type ErrorCode =
  | "CLI_NON_ZERO_EXIT"
  | "CLI_BINARY_NOT_FOUND"
  | "CLI_TIMEOUT"
  | "CLI_OUTPUT_TOO_LARGE"
  | "CLI_REPORTED_ERROR";
```

This is a typecheck-only change — the existing `callEndFailure` implementation passes `errorCode` through to the JSON-lines emitter without inspecting it, so no logic change is required.

`VALIDATION_ERROR` and `TOOL_NOT_FOUND` are NOT added to this union because they are emitted at the MCP-tool dispatch layer ([tool.ts](../../src/tools/obsidian_exec/tool.ts)) and never flow through the bridge's `Logger.callEndFailure` path — they short-circuit before `runOnce` is called. The union represents codes the bridge logs as call-end events in the per-spawn lifecycle; codes that bypass the call lifecycle stay outside it.

## State transitions

None new. The `runOnce` exit-classification machine gains one branch (the `Error:`-prefix check) but no new states. The full set of terminal states for an exit-zero spawn becomes:

```text
spawn → collect stdout/stderr → child.exit(code=0)
                                    │
                                    ├─ killReason === "timeout"  → reject(CLI_TIMEOUT)         [unchanged]
                                    ├─ killReason === "cap"      → reject(CLI_OUTPUT_TOO_LARGE) [unchanged]
                                    ├─ stdout.trimStart()
                                    │  .startsWith("Error:")     → reject(CLI_REPORTED_ERROR)  [NEW — FR-001]
                                    └─ otherwise                 → resolve(success shape)       [unchanged]
```

For exit-nonzero spawns the path is unchanged: always `reject(CLI_NON_ZERO_EXIT)` (FR-007, exit-code precedence). The new sub-branch sits strictly inside the `code === 0 && !killReason` region of the state machine.

## Surface enumeration (post-feature)

After this feature lands, the `obsidian_exec` MCP tool surface reaches the following codes:

| Code | Layer | Triggered by |
|------|-------|--------------|
| `TOOL_NOT_FOUND` | Dispatch ([tool.ts:50](../../src/tools/obsidian_exec/tool.ts#L50)) | MCP client called a tool other than `obsidian_exec`. |
| `VALIDATION_ERROR` | Dispatch ([tool.ts:61](../../src/tools/obsidian_exec/tool.ts#L61)) | `params.arguments` failed `obsidianExecSchema.parse()`. |
| `CLI_BINARY_NOT_FOUND` | Handler ([handler.ts:83-87](../../src/tools/obsidian_exec/handler.ts#L83-L87) / [156-160](../../src/tools/obsidian_exec/handler.ts#L156-L160)) | `spawn` ENOENT — `obsidian` not on PATH and `OBSIDIAN_BIN` unset/wrong. |
| `CLI_TIMEOUT` | Handler ([handler.ts:178-191](../../src/tools/obsidian_exec/handler.ts#L178-L191)) | Child exceeded `timeoutMs` (default 30 s). |
| `CLI_OUTPUT_TOO_LARGE` | Handler ([handler.ts:195-213](../../src/tools/obsidian_exec/handler.ts#L195-L213)) | Either captured stream crossed the 10 MiB cap. |
| `CLI_NON_ZERO_EXIT` | Handler ([handler.ts:222-229](../../src/tools/obsidian_exec/handler.ts#L222-L229)) | Child exited with non-zero code; details now include `exitCode`/`signal` per FR-014. |
| `CLI_REPORTED_ERROR` | Handler (NEW; FR-001) | Child exited `0` and stdout's trimmed leading prefix is `Error:`. |

Seven total. The data-model + contract additions in this feature make all seven discoverable from the canonical contract document for the first time.
