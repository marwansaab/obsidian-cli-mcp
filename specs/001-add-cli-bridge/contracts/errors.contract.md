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

## Codes registered by `obsidian_exec` (v0.1)

### `CLI_NON_ZERO_EXIT`

The spawned `obsidian` child exited with a non-zero code. Spec source: FR-014.

| Field | Value |
|-------|-------|
| `code` | `"CLI_NON_ZERO_EXIT"` |
| `cause` | `{ exitCode: number, signal: string \| null }` |
| `details.argv` | `string[]` — exact argv passed to `spawn` (excluding binary) |
| `details.stdout` | `string` — full captured stdout (UTF-8) |
| `details.stderr` | `string` — full captured stderr (UTF-8) |

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
| `details.argv` | `string[]` |
| `details.timeoutMs` | `number` — the timeout that was enforced |
| `details.partialStdout` | `string` — whatever stdout was captured before the kill (UTF-8) |
| `details.partialStderr` | `string` — whatever stderr was captured before the kill (UTF-8) |

### `CLI_OUTPUT_TOO_LARGE`

Either `stdout` or `stderr` capture crossed the 10 MiB hard cap. Bridge sent SIGTERM, then SIGKILL after 2-second grace. Spec source: FR-027.

| Field | Value |
|-------|-------|
| `code` | `"CLI_OUTPUT_TOO_LARGE"` |
| `cause` | `null` |
| `details.argv` | `string[]` |
| `details.stream` | `"stdout" \| "stderr"` — which stream tripped the cap |
| `details.limitBytes` | `number` — always `10485760` in v0.1 (`10 * 1024 * 1024`) |
| `details.capturedBytes` | `number` — bytes counted up to and including the chunk that tripped the cap |
| `details.partial` | `string` — the captured prefix of the offending stream (UTF-8 decoded; truncated to `limitBytes` if needed) |

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

`cause` is omitted from the serialized payload because Node `Error` objects don't serialize cleanly to JSON; the relevant context from `cause` is duplicated into `details` for the four codes above (e.g., `details.exitCode` mirrors `cause.exitCode` for `CLI_NON_ZERO_EXIT`). MCP clients should match on `code` first and consult `details` per the table above.

## Test coverage requirements (Principle II)

- [src/errors.test.ts](../../../src/errors.test.ts) — class construction, `code/cause/details` preservation, `instanceof UpstreamError`, `message` synthesis when omitted.
- [src/tools/obsidian_exec/handler.test.ts](../../../src/tools/obsidian_exec/handler.test.ts) — each of the four `code` paths is asserted (the four codes are not optional test cases; they each correspond to an FR).
