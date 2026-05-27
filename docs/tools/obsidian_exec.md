# `obsidian_exec`

Invoke any Obsidian Integrated CLI subcommand on the host where the bridge is running. Bridges MCP clients (including sandboxed ones that cannot exec the `obsidian` binary directly) to the running Obsidian desktop instance.

> **Freeform escape hatch.** This tool bypasses every typed-tool safety net: no per-mode validation, no per-field constraint enforcement, no structured output shape. The error-roster classifier still maps non-zero exits and `Error:`-prefixed in-band failures to `UpstreamError` codes, but malformed parameter combinations that a typed tool would reject at the schema layer reach the CLI here. Reserve `obsidian_exec` for cases where the typed tools genuinely don't fit.

## When to use a typed tool instead

The most common Obsidian CLI subcommands have dedicated typed wrappers — prefer them whenever they fit:

| You want to | Reach for |
|---|---|
| Read a note's body | [`read`](./read.md) |
| Create / overwrite a note | [`write_note`](./write_note.md) |
| Delete a note (recoverable via OS trash, or permanent) | [`delete`](./delete.md) |
| Rename a note in place | [`rename`](./rename.md) |
| Move a note to a different folder | [`move`](./move.md) |
| List files in a folder | [`files`](./files.md) |
| Read a single heading's body | [`read_heading`](./read_heading.md) |
| Read / write a frontmatter property | [`read_property`](./read_property.md) / [`set_property`](./set_property.md) |
| Append, prepend, patch heading/block | [`append_note`](./append_note.md), [`prepend`](./prepend.md), [`patch_heading`](./patch_heading.md), [`patch_block`](./patch_block.md) |
| Search vault content | [`search`](./search.md), [`pattern_search`](./pattern_search.md), [`context_search`](./context_search.md) |
| Use the `newtab` flag on `create`, run `obsidian version` / `help`, or any unwrapped subcommand | `obsidian_exec` |

The typed tools enforce per-mode validation, structured error propagation, and clean output shapes that `obsidian_exec` cannot.

## Input

| Field | Type | Required | Constraint | Description |
|-------|------|----------|------------|-------------|
| `command` | string | YES | length ≥ 1 | The CLI subcommand to invoke (the first positional after the binary). Examples: `"version"`, `"help"`, `"eval"`, `"search"`, `"read"`, `"tasks"`. |
| `parameters` | object | NO | values are `string \| number \| boolean` | Key/value pairs assembled into argv as `key=value` tokens (numbers and booleans stringified). Order in the spawned argv matches the object's property declaration order. Example: `{ "query": "meeting", "limit": 10 }` → `'query=meeting' 'limit=10'`. |
| `flags` | string[] | NO | each element non-empty, no `--` prefix | Bare-word boolean flags (no leading `--`). Each appended verbatim to argv. Example: `["silent", "overwrite"]`. The schema rejects any element starting with `--` — use the `copy` field for the one supported `--`-prefixed flag. |
| `vault` | string | NO | length ≥ 1 | Vault name or ID. When set, the bridge prepends `vault=<value>` as the FIRST positional argument after the binary, before the command name. When omitted, the command targets Obsidian's currently focused vault. |
| `copy` | boolean | NO | — | When `true`, append `--copy` as the final argv token to copy stdout to the OS clipboard. The only `--`-prefixed flag this tool produces. |
| `timeoutMs` | integer | NO | 1..120000 | Per-call timeout in milliseconds (default 30000, hard maximum 120000). Counted from the moment the child is spawned, not from when the call is enqueued. On expiry, the bridge sends SIGTERM, then SIGKILL after a 2-second grace period, and surfaces a `CLI_TIMEOUT` error. |

The input schema is `z.object({...}).strict()` — extra keys are rejected at the schema boundary as `VALIDATION_ERROR`.

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

All failure surfaces flow through `UpstreamError`. The codes that can fire from this tool:

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | `params.arguments` failed schema validation (missing `command`, malformed `parameters` value type, `flags` element starting with `--`, etc.). | Retry with corrected input. `details.issues` carries the zod-issue paths. |
| `TOOL_NOT_FOUND` | The dispatch received `params.name` other than `"obsidian_exec"`. | Retry with `name: "obsidian_exec"`. |
| `CLI_NON_ZERO_EXIT` | The spawned `obsidian` child exited with a non-zero code. | `details.{exitCode, signal, stdout, stderr, argv}` carry the failure context. Inspect `stderr` for diagnostic output. |
| `CLI_BINARY_NOT_FOUND` | `spawn` emitted `ENOENT` — the binary couldn't be resolved on PATH and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install or expose the `obsidian` binary, OR set `OBSIDIAN_BIN` to a valid path. |
| `CLI_TIMEOUT` | The child did not exit within `timeoutMs` (default 30000). The bridge sent SIGTERM then SIGKILL. | Retry with a higher `timeoutMs` (≤ 120000), OR investigate whether the underlying CLI command genuinely needs longer. |
| `CLI_OUTPUT_TOO_LARGE` | The captured stdout/stderr exceeded the 10 MiB cap. The bridge killed the child to prevent memory exhaustion. | Rephrase the query to produce smaller output, OR redirect the CLI command to write to a file directly via vault commands. |
| `CLI_REPORTED_ERROR` | The child exited with code 0 BUT stdout (after `.trimStart()`) starts with the literal `Error:` prefix. The Obsidian CLI uses this in-band format for soft failures (e.g., "Error: vault not found"). | Inspect `details.message` (the first line of stdout) for the specific failure. |
| `ERR_NO_ACTIVE_FILE` | The child exited with code 0 BUT stdout starts with the literal `Error: no active file` prefix — a recoverable user-action signal. | Ask the user to open a note in the editor, OR call this tool with an explicit `vault` and an in-band `file=` or `path=` parameter. |

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
