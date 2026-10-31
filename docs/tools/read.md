# `read`

## Overview

Read a note, canvas or base from an Obsidian vault. Returns the file's exact text.

**Supported file types: notes, canvases and bases.** Attachments (images, audio, video, PDF) and files of any other type are rejected with `UNSUPPORTED_FILE_TYPE` before the read runs (spec 070); to show an attachment in Obsidian, use [`open_file`](./open_file.md). See *File types* below.

**Exact content:** `content` is the file's text exactly as it is on disk, with nothing added and nothing removed. Real final line breaks are kept, whether LF, CRLF or repeated (`"first\n"` stays `"first\n"`, `"a\n\n"` stays `"a\n\n"`). A missing final line break stays missing: a file containing exactly `first` is returned as `"first"`. A leading byte-order mark is kept as `"\uFEFF"`. Line endings are not normalised and nothing is trimmed. To verify a write, read the file back right after it and compare.

## When to use this tool

| You want to | Reach for |
|---|---|
| Full text of a named note | `read` |
| Just one heading's body, not the whole file | [`read_heading`](./read_heading.md) |
| One frontmatter property value | [`read_property`](./read_property.md) |
| List all properties in a vault | [`properties`](./properties.md) |
| Search for content matching a phrase | [`search`](./search.md) or [`context_search`](./context_search.md) |
| Read whatever note is currently focused in Obsidian | `read` with `target_mode: "active"` |
| Show an attachment (image, audio, video, PDF) in Obsidian | [`open_file`](./open_file.md) |

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

## File types

`read` checks the type of the file it is about to read and accepts notes (`.md`), canvases (`.canvas`) and bases (`.base`), matched case-insensitively. Anything else is rejected with `VALIDATION_ERROR` + `details.code: "UNSUPPORTED_FILE_TYPE"` and the read never runs. How the file is found depends on the locator:

- **`path`** — the type check runs on the path as given, before any CLI call. A `path` naming an attachment is rejected whether or not the file exists, so a missing `photo.png` reports `UNSUPPORTED_FILE_TYPE`, not a not-found error.
- **`file`** — the wrapper first resolves the name with one extra `obsidian file file=<name>` call, checks the type of the resolved path, then forwards the original `file=` to `read`. A name that cannot be resolved surfaces the resolver's error before any type check. The CLI resolves an extensionless name only to a `.md` note, so to read a canvas or base by `file`, include its extension (`"Plan.canvas"`).
- **active mode** — the wrapper first resolves the focused file with one extra focused-file `eval` call, checks its type, then reads that resolved path with no `vault=` (`read path=<focused path>`), so the CLI uses the same vault the lookup read. A focus change to another file between the two calls cannot redirect the read. No focused file surfaces `ERR_NO_ACTIVE_FILE` before any type check.

The rejection for an attachment names [`open_file`](./open_file.md) as the alternative:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "read: Att/photo.png is an attachment (.png); read supports notes, canvases and bases. Nothing was changed. Use open_file for this file instead.",
  "details": {
    "code": "UNSUPPORTED_FILE_TYPE",
    "reason": "unsupported-type",
    "path": "Att/photo.png",
    "extension": "png",
    "supported": ["note", "canvas", "base"],
    "alternative": "open_file"
  }
}
```

A file whose extension is not a core type (for example `Misc/todo.txt`) is rejected the same way, with the message `read: Misc/todo.txt is a ".txt" file; read supports notes, canvases and bases. Nothing was changed.` and no `alternative` field.

This `UNSUPPORTED_FILE_TYPE` sits under the top-level `VALIDATION_ERROR` and means "`read` does not handle this type". It is distinct from [`open_file`](./open_file.md)'s `CLI_REPORTED_ERROR` + `details.code: "UNSUPPORTED_FILE_TYPE"`, which means Obsidian has no view for the extension; tell them apart by the top-level `code`.

## Output

```json
{ "content": "<note text>" }
```

| Field | Type | Description |
|-------|------|-------------|
| `content` | string | The file's exact text: nothing added or removed. Final line breaks (LF, CRLF, repeated) and a leading byte-order mark are kept; a missing final line break stays missing. Empty strings are valid (empty notes succeed). |

## Errors

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The input failed schema validation (missing `target_mode`, missing `vault` in specific mode, neither/both `file` and `path`, forbidden key in active mode, etc.). | Retry with corrected input. `details.issues` carries the per-issue path + message + zod code. |
| `VALIDATION_ERROR` (`details.code: "UNSUPPORTED_FILE_TYPE"`, `details.reason: "unsupported-type"`) | The file to read is not a note, canvas or base: an attachment (image, audio, video, PDF) or a file of any other type. Raised before the read; for `file` and active calls, after the target resolves. `details` carries `path` (the resolved vault-relative path), `extension` (original case, `""` if none), `supported: ["note", "canvas", "base"]`, and `alternative: "open_file"` when the file is an attachment. | Nothing was changed. Show an attachment with [`open_file`](./open_file.md). |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (note doesn't exist, vault unknown, etc.). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Inspect `stderr` for diagnostic output. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but stdout starts with `Error:` (and is NOT the more-specific `Error: no active file` case). | `details.message` (the first line of stdout) names the specific failure. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no note is focused in Obsidian. | Ask the user to open a note in the editor, OR call again with `target_mode: "specific"` and explicit `vault` + `file`/`path`. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |
| `FS_WRITE_FAILED` (`details.reason: "read"`) | After a successful CLI read, the file's bytes could not be read from disk to confirm its first and last characters (for example, it was deleted or locked in between, or the server cannot read the vault folder). `read` reuses the project's existing filesystem-failure code for a failed read, with the same `reason: "read"` shape as `find_and_replace`. `details` carries `errno`, `syscall` (when known) and `path` (vault-relative). Nothing was written, and no uncorrected text is returned. | Retry. If it persists, check the server's access to the vault folder. |

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

Resolves the focused file first, then spawns `obsidian read path=<focused path>` (no `vault=`: the CLI uses the vault the lookup read). Returns the focused file's body, OR raises `ERR_NO_ACTIVE_FILE` if no file is focused, OR `UNSUPPORTED_FILE_TYPE` if the focused file is an attachment or another unsupported type.

### Attachment rejected

```json
{
  "name": "read",
  "arguments": { "target_mode": "specific", "vault": "MyVault", "path": "Att/photo.png" }
}
```

Rejected with `VALIDATION_ERROR` + `details.code: "UNSUPPORTED_FILE_TYPE"` and `details.alternative: "open_file"` (envelope under *File types*); no `read` call is made.
