# Errors Contract: `UpstreamError`

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-03

The `UpstreamError` class defined in [src/errors.ts](../../../src/errors.ts) is the single boundary-error type for the entire `obsidian-cli-mcp` project. Every failure that crosses an MCP tool boundary is one of these. Plain `throw new Error("…")` at any boundary surface is a constitution violation (Principle IV).

## Class shape

```ts
class UpstreamError extends Error {
  readonly code: string;
  readonly cause: unknown;
  readonly details: Record<string, unknown>;
  constructor(args: {
    code: string;
    cause: unknown;
    details: Record<string, unknown>;
    message?: string;
  });
}
```

- `code` — stable string identifier. The four codes registered by the CLI bridge feature are listed below; future features extend this set.
- `cause` — the original thrown value where one exists, otherwise `null`. Preserves the chain of custody for failures.
- `details` — structured payload whose shape is keyed off `code`. Always serializable to JSON.
- `message` — optional human-readable summary for the `Error.message` field. When omitted, the constructor synthesizes one from `code` (e.g., `"CLI bridge upstream error: CLI_NON_ZERO_EXIT"`).

## Codes registered by `obsidian_exec`

### `CLI_NON_ZERO_EXIT`

The spawned `obsidian` child exited with a non-zero code. Spec source: FR-014.

| Field | Value |
|-------|-------|
| `code` | `"CLI_NON_ZERO_EXIT"` |
| `cause` | `{ exitCode: number, signal: string \| null }` |
| `details.argv` | `string[]` — the fully reproducible argv vector `[binary, ...spawnArgs]` (binary INCLUDED as argv[0]). Matches the published `argv` shape in `ObsidianExecOutput`. |
| `details.stdout` | `string` — full captured stdout (UTF-8) |
| `details.stderr` | `string` — full captured stderr (UTF-8) |
| `details.exitCode` | `number` — mirrors `cause.exitCode`. The non-zero exit code the child reported, OR the sentinel `-1` when the child terminated via signal without producing an exit code (the bridge's `code ?? -1` normalization at [handler.ts:221](../../../src/tools/obsidian_exec/handler.ts#L221)). Mirrored into `details` because MCP serialization drops `cause` per the prose at line 106 — without this row, MCP clients cannot observe the exit code. |
| `details.signal` | `NodeJS.Signals \| null` (a string subtype — concretely `"SIGTERM"`, `"SIGKILL"`, etc.) — mirrors `cause.signal`. The terminating signal name when the child was signal-killed, or `null` when the child exited with a non-zero code rather than being signal-terminated. |

### `CLI_BINARY_NOT_FOUND`

`spawn` emitted ENOENT — the binary couldn't be resolved on PATH and the `OBSIDIAN_BIN` env var either was unset or pointed at nothing. Spec source: FR-015.

| Field | Value |
|-------|-------|
| `code` | `"CLI_BINARY_NOT_FOUND"` |
| `cause` | The Node.js spawn error object (`Error & { code: "ENOENT", syscall: "spawn", path: string }`) |
| `details.binaryAttempted` | `string` — the value the bridge tried to spawn (`OBSIDIAN_BIN` if set, else `"obsidian"`) |
| `details.PATH` | `string \| undefined` — the bridge's PATH env var at the time of spawn (helps the operator verify what the OS searched) |

### `CLI_TIMEOUT`

The call exceeded its timeout (`timeoutMs` from the input, or the default 30 s). Bridge sent SIGTERM; if the child hadn't exited 2 seconds later, SIGKILL. Spec source: FR-016.

| Field | Value |
|-------|-------|
| `code` | `"CLI_TIMEOUT"` |
| `cause` | `null` |
| `details.argv` | `string[]` — `[binary, ...spawnArgs]` (binary INCLUDED) |
| `details.timeoutMs` | `number` — the timeout that was enforced |
| `details.partialStdout` | `string` — whatever stdout was captured before the kill (UTF-8) |
| `details.partialStderr` | `string` — whatever stderr was captured before the kill (UTF-8) |

### `CLI_OUTPUT_TOO_LARGE`

Either `stdout` or `stderr` capture crossed the 10 MiB hard cap. Bridge sent SIGTERM, then SIGKILL after 2-second grace. Spec source: FR-027.

| Field | Value |
|-------|-------|
| `code` | `"CLI_OUTPUT_TOO_LARGE"` |
| `cause` | `null` |
| `details.argv` | `string[]` — `[binary, ...spawnArgs]` (binary INCLUDED) |
| `details.stream` | `"stdout" \| "stderr"` — which stream tripped the cap |
| `details.limitBytes` | `number` — always `10485760` in v0.1 (`10 * 1024 * 1024`) |
| `details.capturedBytes` | `number` — bytes counted up to and including the chunk that tripped the cap |
| `details.partial` | `string` — the captured prefix of the offending stream (UTF-8 decoded; truncated to `limitBytes` if needed) |

### `CLI_REPORTED_ERROR`

The spawned `obsidian` child exited cleanly with code `0`, but its `stdout` — after trimming leading whitespace — begins with the literal six-character ASCII prefix `Error:` (case-sensitive). The CLI uses this in-band format for application-level failures it does not reflect via the exit code (e.g., unknown subcommand, missing file, eval that throws). Spec source: 002-detect-cli-errors FR-001 through FR-007.

| Field | Value |
|-------|-------|
| `code` | `"CLI_REPORTED_ERROR"` |
| `cause` | `null` — no thrown value exists; the bridge is re-routing an exit-zero response, not catching a throw |
| `details.argv` | `string[]` — the fully reproducible argv vector `[binary, ...spawnArgs]` (binary INCLUDED as `argv[0]`). Matches the `argv` shape in `ObsidianExecOutput`. |
| `details.stdout` | `string` — full captured stdout (UTF-8). Byte-identical to what would have been returned in the success shape. |
| `details.stderr` | `string` — full captured stderr (UTF-8). Byte-identical to what would have been returned in the success shape. |
| `details.exitCode` | `0` (literal `number`) — the truthful exit code the child exited with. Discoverable from the error alone (no need to re-parse other fields) for callers distinguishing this code from `CLI_NON_ZERO_EXIT`. |
| `details.message` | `string` — convenience one-line summary, computed as `stdout.split('\n', 1)[0].trim()` (LF-only split, full whitespace trim — absorbs trailing `\r` from Windows CRLF). Always starts with `Error:`. |

### `VALIDATION_ERROR`

The MCP tool dispatch received a `CallToolRequest` whose `params.arguments` failed the `obsidian_exec` zod schema. Emitted by [src/tools/obsidian_exec/tool.ts:61](../../../src/tools/obsidian_exec/tool.ts#L61) before any handler-layer code runs. Spec source: Constitution Principle III (boundary input validation).

| Field | Value |
|-------|-------|
| `code` | `"VALIDATION_ERROR"` |
| `cause` | `ZodError` — the thrown `zod.ZodError` instance. |
| `details.issues` | `Array<{ path: (string \| number)[], message: string, code: string }>` — the `ZodError.issues[]` projected to a JSON-serializable subset (path retains zod's mixed string/number indexing for object keys vs. array indices). |

### `TOOL_NOT_FOUND`

The MCP tool dispatch received a `CallToolRequest` whose `params.name` is not the registered `obsidian_exec` tool name. Emitted by [src/tools/obsidian_exec/tool.ts:50](../../../src/tools/obsidian_exec/tool.ts#L50) before any handler-layer code runs.

| Field | Value |
|-------|-------|
| `code` | `"TOOL_NOT_FOUND"` |
| `cause` | `null` — no upstream throw; the dispatch table simply lacked the requested name. |
| `details.requestedName` | `string` — the `req.params.name` value the MCP client supplied. |
| `details.knownTools` | `string[]` — the list of tool names the bridge currently registers. In v0.1/v0.1.1 this is `["obsidian_exec"]`. |

### `ERR_NO_ACTIVE_FILE`

The spawned `obsidian` child exited cleanly with code `0`, but its `stdout` — after trimming leading whitespace — begins with the literal twenty-one-character ASCII prefix `Error: no active file` (case-sensitive). The CLI uses this in-band format for the focused-note-missing failure mode that arises when a tool call requests an "active" target but no note is open in the editor. Spec source: 003-cli-adapter FR-008(b). Triggered exclusively by the centralised CLI adapter at [src/cli-adapter/cli-adapter.ts](../../../src/cli-adapter/cli-adapter.ts); the legacy `obsidian_exec` handler continues to surface this case as `CLI_REPORTED_ERROR` because it does not implement the priority-(b)/priority-(c) split (Out-of-Scope per 003 spec).

| Field | Value |
|-------|-------|
| `code` | `"ERR_NO_ACTIVE_FILE"` |
| `cause` | `null` — no thrown value exists; the adapter is re-routing an exit-zero response, not catching a throw |
| `Error.message` | `"No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: \"specific\" and an explicit vault/file."` — the recovery-instruction string. Explicitly overrides the `UpstreamError` constructor's synthesized default. |
| `details.command` | `string` — the input `command` string verbatim (the adapter's first argument). Distinct from `obsidian_exec`'s `details.argv` shape: the adapter records only the command string because the calling typed-tool handler reconstructs argv from its own zod-validated input if needed. |
| `details.stdout` | `string` — full captured stdout (UTF-8). Byte-identical to what the resolve path would have returned. Always starts (after `.trimStart()`) with `Error: no active file`. |
| `details.stderr` | `string` — full captured stderr (UTF-8). Typically empty for the focused-note-missing case. |
| `details.exitCode` | `0` (literal `number`) — the truthful exit code the child exited with. Discoverable from the error alone for callers distinguishing this code from `CLI_NON_ZERO_EXIT`. |
| `details.message` | `string` — convenience one-line summary, computed as `stdout.split('\n', 1)[0].trim()` (LF-only split, full whitespace trim — same algorithm as `CLI_REPORTED_ERROR.details.message` per 003 FR-009). Always starts with `Error: no active file`. |

> **Priority discrimination**: `ERR_NO_ACTIVE_FILE` and `CLI_REPORTED_ERROR` share the `Error:` family of in-band detection prefixes. The adapter's classification machine evaluates `ERR_NO_ACTIVE_FILE` (priority b) before `CLI_REPORTED_ERROR` (priority c) so that stdout starting with the longer literal `Error: no active file. Open one.` always classifies as `ERR_NO_ACTIVE_FILE` — never as `CLI_REPORTED_ERROR`. The legacy `obsidian_exec` handler does not split these and surfaces both as `CLI_REPORTED_ERROR`.

## Serialization to MCP

When an `UpstreamError` is thrown from inside the MCP tool handler, the SDK serializes it via the `CallToolResult` `isError: true` shape:

```jsonc
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "<JSON-stringified payload below>"
    }
  ]
}
```

The text payload is the JSON serialization of:

```jsonc
{
  "code": "<UpstreamError.code>",
  "message": "<UpstreamError.message>",
  "details": <UpstreamError.details>
}
```

`cause` is omitted from the serialized payload because Node `Error` objects don't serialize cleanly to JSON; the relevant context from `cause` is duplicated into `details` for the codes above where applicable (e.g., `details.exitCode` and `details.signal` mirror `cause.exitCode`/`cause.signal` for `CLI_NON_ZERO_EXIT`). For `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`, `VALIDATION_ERROR`, and `TOOL_NOT_FOUND`, no cause-mirroring is needed: `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`, and `TOOL_NOT_FOUND` have `cause: null`, and `VALIDATION_ERROR`'s `details.issues` already projects the relevant `ZodError` content. MCP clients should match on `code` first and consult `details` per the table above.

## Test coverage requirements (Principle II)

- [src/errors.test.ts](../../../src/errors.test.ts) — class construction, `code/cause/details` preservation, `instanceof UpstreamError`, `message` synthesis when omitted.
- [src/tools/obsidian_exec/handler.test.ts](../../../src/tools/obsidian_exec/handler.test.ts) — each of the five legacy-handler `code` paths is asserted (`CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_REPORTED_ERROR`); each path corresponds to an FR.
- [src/tools/obsidian_exec/tool.test.ts](../../../src/tools/obsidian_exec/tool.test.ts) — the two dispatch-layer codes (`VALIDATION_ERROR`, `TOOL_NOT_FOUND`) are each asserted.
- [src/cli-adapter/cli-adapter.test.ts](../../../src/cli-adapter/cli-adapter.test.ts) — each of the four adapter-layer `code` paths is asserted (`CLI_NON_ZERO_EXIT`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR`, `CLI_BINARY_NOT_FOUND`) along with priority-discrimination boundaries (FR-016 a–j).
