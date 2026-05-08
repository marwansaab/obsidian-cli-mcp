# `obsidian_exec`

Invoke any Obsidian Integrated CLI subcommand on the host where the bridge is running. Bridges MCP clients (including sandboxed ones that cannot exec the `obsidian` binary directly) to the running Obsidian desktop instance.

## When to use a typed tool instead

Two of the most common Obsidian CLI subcommands have dedicated typed wrappers — prefer them over `obsidian_exec` whenever they fit:

- **`read_note`** wraps `obsidian read` (see [read_note.md](./read_note.md)).
- **`write_note`** wraps `obsidian create` (see [write_note.md](./write_note.md)) — use it for creating new notes and overwriting existing ones (`overwrite: true`).

Reserve `obsidian_exec` for: (a) the `newtab` flag on `create` (not exposed by `write_note`), (b) any other CLI subcommand without a dedicated typed wrapper, and (c) experimental or one-off invocations where typing the input is overkill. The typed tools enforce per-mode validation, structured error propagation, and clean output shapes that `obsidian_exec` cannot.

## Input

| Field | Type | Required | Constraint | Description |
|-------|------|----------|------------|-------------|
| `command` | string | YES | length ≥ 1 | The CLI subcommand to invoke (the first positional after the binary). Examples: `"version"`, `"help"`, `"eval"`, `"search"`, `"read"`, `"tasks"`. |
| `parameters` | object | NO | values are `string \| number \| boolean` | Key/value pairs assembled into argv as `key=value` tokens (numbers and booleans stringified). Order in the spawned argv matches the object's property declaration order. Example: `{ "query": "meeting", "limit": 10 }` → `'query=meeting' 'limit=10'`. |
| `flags` | string[] | NO | each element non-empty, no `--` prefix | Bare-word boolean flags (no leading `--`). Each appended verbatim to argv. Example: `["silent", "overwrite"]`. The schema rejects any element starting with `--` — use the `copy` field for the one supported `--`-prefixed flag. |
| `vault` | string | NO | length ≥ 1 | Vault name or ID. When set, the bridge prepends `vault=<value>` as the FIRST positional argument after the binary, before the command name. When omitted, the command targets Obsidian's currently focused vault. |
| `copy` | boolean | NO | — | When true, append `--copy` as the final argv token to copy stdout to the OS clipboard. The only `--`-prefixed flag this tool produces. |
| `timeoutMs` | integer | NO | 1..120000 | Per-call timeout in milliseconds (default 30000, hard maximum 120000). Counted from the moment the child is spawned, not from when the call is enqueued. On expiry, the bridge sends SIGTERM, then SIGKILL after a 2-second grace period, and surfaces a `CLI_TIMEOUT` error. |

The input schema is `obsidianExecSchema` at [src/tools/obsidian_exec/schema.ts](../../src/tools/obsidian_exec/schema.ts) — a `z.object({...}).strict()` (extra keys rejected at the zod boundary as `VALIDATION_ERROR`).

## argv assembly

For an input `{ command: "search", parameters: { query: "meeting", limit: 10 }, flags: ["silent"], vault: "Notes", copy: true }`, the bridge spawns:

```
obsidian vault=Notes search query=meeting limit=10 silent --copy
```

- The binary is resolved from `OBSIDIAN_BIN` env var if set, else falls back to `obsidian` (PATH lookup).
- The first positional after the binary is `vault=<value>` (when `vault` is set), then the command name, then `parameters` as `key=value` tokens (in declared order), then `flags` verbatim, then `--copy` (when `copy: true`).
- The full assembled argv (including `argv[0]` = the binary) is returned in the success-response `argv` field for reproducibility.

## Output (success)

| Field | Type | Description |
|-------|------|-------------|
| `stdout` | string | Full captured stdout (UTF-8 decoded). Capped at 10 MiB; overflow yields `CLI_OUTPUT_TOO_LARGE`. |
| `stderr` | string | Full captured stderr (UTF-8 decoded). May be non-empty even on `exitCode: 0` (CLI warnings). |
| `exitCode` | `0` | Always 0 on the success path. Any non-zero exit raises `CLI_NON_ZERO_EXIT` instead. |
| `argv` | string[] | The fully reproducible argv vector `[binary, ...spawnArgs]` — binary INCLUDED as `argv[0]`. Provided for diagnostic and reproducibility purposes. |

## Errors

All failure surfaces flow through `UpstreamError` per Constitution Principle IV. The codes that can fire from this tool:

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The `CallToolRequest` `params.arguments` failed `obsidianExecSchema` zod validation (missing `command`, malformed `parameters` value type, `flags` element starting with `--`, etc.). | Agent retries with corrected input. `details.issues` carries the zod-issue paths. |
| `TOOL_NOT_FOUND` | The dispatch received `params.name` other than `"obsidian_exec"`. | Agent retries with `name: "obsidian_exec"`. |
| `CLI_NON_ZERO_EXIT` | The spawned `obsidian` child exited with a non-zero code. | `details.{exitCode, signal, stdout, stderr, argv}` carry the failure context. Agent inspects `stderr` for diagnostic output. |
| `CLI_BINARY_NOT_FOUND` | `spawn` emitted `ENOENT` — the binary couldn't be resolved on PATH and `OBSIDIAN_BIN` was unset/invalid. | Operator-side fix: install or expose the `obsidian` binary; OR set `OBSIDIAN_BIN` to a valid path. |
| `CLI_TIMEOUT` | The child did not exit within `timeoutMs` (default 30000). The bridge sent SIGTERM then SIGKILL. | Agent may retry with a higher `timeoutMs` (≤ 120000), OR investigate whether the underlying CLI command genuinely needs longer. |
| `CLI_OUTPUT_TOO_LARGE` | The captured stdout/stderr exceeded the 10 MiB cap. The bridge killed the child to prevent memory exhaustion. | Agent rephrases the query to produce smaller output, OR redirects the CLI command to write to a file directly via vault commands. |
| `CLI_REPORTED_ERROR` | The child exited with code 0 BUT stdout (after `.trimStart()`) starts with the literal `Error:` prefix. The Obsidian CLI uses this in-band format for soft failures (e.g., "Error: vault not found"). | Agent inspects `details.message` (the first line of stdout) for the specific failure. |
| `ERR_NO_ACTIVE_FILE` | The child exited with code 0 BUT stdout (after `.trimStart()`) starts with the literal `Error: no active file` prefix — a recoverable user-action signal. Reachable when stdout begins with that exact literal (newly reachable through `obsidian_exec` per FR-021 / feature 008-refactor; previously this case surfaced as `CLI_REPORTED_ERROR`). | Open a note in the editor, or call this tool with an explicit `vault` and an in-band `file=` or `path=` parameter. |

For the canonical errors contract (every code's full `details` shape, MCP serialization rules), see [specs/001-add-cli-bridge/contracts/errors.contract.md](../../specs/001-add-cli-bridge/contracts/errors.contract.md).

## Examples

### Basic version check

```json
{ "name": "obsidian_exec", "arguments": { "command": "version" } }
```

Spawns `obsidian version`. Returns the version string in `stdout`.

### Search a specific vault

```json
{
  "name": "obsidian_exec",
  "arguments": {
    "command": "search",
    "parameters": { "query": "meeting notes" },
    "vault": "Notes"
  }
}
```

Spawns `obsidian vault=Notes search query="meeting notes"`. Returns matching note paths in `stdout`.

### Read a note and copy to clipboard

```json
{
  "name": "obsidian_exec",
  "arguments": {
    "command": "read",
    "parameters": { "file": "Daily/2026-05-06" },
    "copy": true
  }
}
```

Spawns `obsidian read file=Daily/2026-05-06 --copy`. Returns the note's content in `stdout` and copies it to the OS clipboard.

### Custom timeout for a slow operation

```json
{
  "name": "obsidian_exec",
  "arguments": { "command": "rebuild-index", "timeoutMs": 90000 }
}
```

Allows up to 90 seconds before the bridge sends SIGTERM.

## Related

- [Architecture document](../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) — names this tool as the original `obsidian_exec` bridge from feature 001.
- [001 contracts](../../specs/001-add-cli-bridge/contracts/) — the canonical machine-readable contract this doc was transcribed from.
- The progressive-disclosure pattern (ADR-005) means this tool's stripped `inputSchema` in `tools/list` carries no `description` keys; the per-field semantics live in this doc.
