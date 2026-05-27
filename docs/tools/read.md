# `read`

## Overview

Read a note's raw text from an Obsidian vault. Returns the note's UTF-8 content from the CLI's stdout.

**Trailing-newline caveat:** the upstream CLI may append a synthetic trailing `\n` when the file on disk does not already end with one. A file containing exactly `"first"` (5 bytes on disk) is returned as `"first\n"` (6 chars). A file ending with `\n` is returned unchanged. No other transformations are applied — no trim, no line-ending normalisation, no BOM strip. If you need byte-exact verification of a file's on-disk content, use the `bytes_written` field returned by the fs-direct write tools (`append_note`, `patch_heading`, `patch_block`) rather than reading-and-comparing.

## When to use this tool

| You want to | Reach for |
|---|---|
| Full text of a named note | `read` |
| Just one heading's body, not the whole file | [`read_heading`](./read_heading.md) |
| One frontmatter property value | [`read_property`](./read_property.md) |
| List all properties in a vault | [`properties`](./properties.md) |
| Search for content matching a phrase | [`search`](./search.md) or [`context_search`](./context_search.md) |
| Read whatever note is currently focused in Obsidian | `read` with `target_mode: "active"` |

## Input schema

`read` consumes a discriminated union on `target_mode`. Every field is rejected at the boundary as `VALIDATION_ERROR` if the constraints fail.

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "file": "<wikilink>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `file` | string | exactly one of `file`/`path` | wikilink form (e.g. `"Recipe"`) |
| `path` | string | exactly one of `file`/`path` | vault-relative path (e.g. `"Templates/Recipe.md"`) |

The schema enforces "exactly one of `file` or `path`": providing both is rejected with two issues (one per locator field), and providing neither is rejected with a root-level issue. Empty-string locators (`file: ""` or `path: ""`) are NOT rejected at the schema layer — they forward to the CLI and surface as `CLI_NON_ZERO_EXIT` or `CLI_REPORTED_ERROR`.

### Active mode

```json
{ "target_mode": "active" }
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |

`vault`, `file`, and `path` are FORBIDDEN in active mode and rejected at the schema layer (one issue per forbidden key found, even if the value is explicitly `undefined`).

## Output

```json
{ "content": "<note text>" }
```

| Field | Type | Description |
|-------|------|-------------|
| `content` | string | The note's UTF-8 text from the CLI's `stdout`. The upstream CLI may append a synthetic trailing `\n` if the file did not already end with one. Empty strings are valid (empty notes succeed). |

## Errors

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The input failed schema validation (missing `target_mode`, missing `vault` in specific mode, neither/both `file` and `path`, forbidden key in active mode, etc.). | Retry with corrected input. `details.issues` carries the per-issue path + message + zod code. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (note doesn't exist, vault unknown, etc.). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Inspect `stderr` for diagnostic output. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but stdout starts with `Error:` (and is NOT the more-specific `Error: no active file` case). | `details.message` (the first line of stdout) names the specific failure. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no note is focused in Obsidian. | Ask the user to open a note in the editor, OR call again with `target_mode: "specific"` and explicit `vault` + `file`/`path`. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |

## Examples

### Specific mode by wikilink

```json
{
  "name": "read",
  "arguments": { "target_mode": "specific", "vault": "MyVault", "file": "Recipe" }
}
```

Returns `{ "content": "<the raw text of Recipe.md>" }`.

### Specific mode by vault-relative path

```json
{
  "name": "read",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Templates/Recipe.md"
  }
}
```

Returns the template's body in `content`.

### Active mode

```json
{ "name": "read", "arguments": { "target_mode": "active" } }
```

Returns the focused note's body, OR raises `ERR_NO_ACTIVE_FILE` if no note is focused.
