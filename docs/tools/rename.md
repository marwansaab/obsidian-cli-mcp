# `rename`

## Overview

Rename a file in an Obsidian vault **in place** — the file's folder location is unchanged; only the filename changes. Wraps the Obsidian CLI's `rename` subcommand and returns `{ renamed, fromPath, toPath }`.

**Works on any file type** (notes, canvases, bases, attachments and others), and **the file keeps its type**: a `name` without an extension gets the file's own extension, and a `name` carrying another core type's extension is rejected with `UNSUPPORTED_FILE_TYPE` before anything is renamed (spec 070). Changing a file's type deliberately goes through [`obsidian_exec`](./obsidian_exec.md). See *Extension-handling rule* below.

Folder relocation is a separate operation: use [`move`](./move.md) (the typed wrapper around the CLI's `move` subcommand). The schema rejects `name` values containing `/` or `\` at the boundary with a `move` recovery hint.

> **Link-rewriting is vault-config-dependent.** Obsidian's Settings → Files & Links → "Automatically update internal links" governs whether existing `[[wikilinks]]` and `[markdown](links)` to the renamed note are rewritten to the new name. `rename` does NOT enforce or override this setting — it documents the dependency so callers can verify the vault's configuration before relying on link integrity.

## When to use this tool

| You want to | Reach for |
|---|---|
| Rename a note, canvas, base, attachment or other file in place | `rename` |
| Move a file to a different folder (with or without renaming) | [`move`](./move.md) |
| Change a file's type (`.md` → `.canvas`, etc.) | [`obsidian_exec`](./obsidian_exec.md) — `rename` keeps a file's type |
| Delete a note | [`delete`](./delete.md) |

The tool supports two target modes:

- **specific** — name the vault explicitly and locate the source file by either a wikilink (`file`) or a vault-relative `path`. The deterministic path; the focused file in the editor cannot shift between parse and execution. With `file`, the wrapper first resolves the name with one extra `obsidian file file=<name>` call (so the extension rule below can see the source's type), then forwards the original `file=` to `rename`. A name that cannot be resolved surfaces the resolver's error before anything else.
- **active** — rename the file currently focused in the Obsidian editor. The wrapper first resolves the focused file with one extra focused-file `eval` call, then renames that resolved path with `path=<focused path>` and no `vault=`, so the CLI uses the same vault the lookup read and a focus change to another file between the two calls cannot redirect the rename. The remaining caveat is the agent's own: the focused file may not be the one the agent had in mind when it decided to call. Agents that need certainty about which file is renamed should use specific mode. No focused file surfaces `ERR_NO_ACTIVE_FILE` before anything else.

## Input Schema

`rename` consumes the discriminated union below. Every field is rejected at the boundary as `VALIDATION_ERROR` if the constraints fail. Unknown top-level keys are rejected (`additionalProperties: false`).

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "path": "<vault-relative path>",
  "name": "<new file name>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"specific"` | YES | discriminator |
| `vault` | string | YES | length ≥ 1 |
| `file` | string | exactly one of `file`/`path` | wikilink form (e.g. `"QuickNote"`) — CLI resolves to the canonical folder-prefixed path |
| `path` | string | exactly one of `file`/`path` | vault-relative path (e.g. `"Inbox/Typo.md"`) |
| `name` | string | YES | length ≥ 1; MUST NOT contain `/` or `\` (use [`move`](./move.md) to relocate to a different folder) |

The schema enforces "exactly one of `file` or `path`": providing both is rejected with two issues (one per locator field); providing neither is rejected with a root-level issue.

### Active mode

```json
{
  "target_mode": "active",
  "name": "<new file name>"
}
```

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `target_mode` | literal `"active"` | YES | discriminator |
| `name` | string | YES | same constraints as specific mode |
| `vault` | (n/a) | FORBIDDEN | rejected with one issue on `path: ["vault"]` |
| `file` | (n/a) | FORBIDDEN | same |
| `path` | (n/a) | FORBIDDEN | same |

### Per-mode field policy

| Field | Specific Mode | Active Mode | Default |
|-------|---------------|-------------|---------|
| `target_mode` | required (`"specific"`) | required (`"active"`) | none |
| `vault` | REQUIRED | FORBIDDEN | n/a |
| `file` | OPTIONAL (XOR with `path`) | FORBIDDEN | undefined |
| `path` | OPTIONAL (XOR with `file`) | FORBIDDEN | undefined |
| `name` | REQUIRED | REQUIRED | n/a |

### Extension-handling rule

`rename` keeps the source file's type (spec 070). The wrapper looks at the source's extension (the resolved path for `file` and active calls) and the extension of `name` (the text after its last `.`), then:

1. If `name` ends in a **core** extension (`.md`, `.canvas`, `.base`, or an attachment extension such as `.png` or `.pdf`) that differs from the source's, ignoring case, the call is rejected with `VALIDATION_ERROR` + `details.code: "UNSUPPORTED_FILE_TYPE"`, `details.reason: "type-change"`. Nothing is renamed.
2. If the source has no extension, `name` is forwarded as given.
3. If `name` already carries the source's extension, it is forwarded as given. For a `.md` source this check is the byte-exact, case-sensitive `name.endsWith(".md")` it has always been, so Markdown behaviour is unchanged; for every other source it ignores case.
4. Otherwise the wrapper appends `.` plus the source's extension, in the source's own spelling. An extension that is not a core type (`.v1`, `.draft`, `.txt`) counts as part of the name.

| Source | Input `name` | Forwarded as | Why |
|---|---|---|---|
| `Inbox/Note.md` | `"Fixed"` | `"Fixed.md"` | Source extension appended (unchanged) |
| `Inbox/Note.md` | `"Fixed.md"` | `"Fixed.md"` | Verbatim — already `.md` (unchanged) |
| `Inbox/Note.md` | `"Renamed.MD"` | `"Renamed.MD.md"` | Markdown keeps the byte-exact check: `.MD` ≠ `.md` (unchanged) |
| `Inbox/Note.md` | `"Doc.v1.draft"` | `"Doc.v1.draft.md"` | Non-core segments are part of the name (unchanged) |
| `Inbox/Note.md` | `"日記"` | `"日記.md"` | Source extension appended (unchanged) |
| `Inbox/Note.md` | `"Sketch.canvas"` | — | Rejected: `type-change` (before spec 070 this became `Sketch.canvas.md`) |
| `Boards/Plan.canvas` | `"Roadmap"` | `"Roadmap.canvas"` | Source extension appended |
| `Boards/Plan.canvas` | `"Roadmap.canvas"` | `"Roadmap.canvas"` | Verbatim, no doubling |
| `Boards/Plan.canvas` | `"Plan.md"` | — | Rejected: `type-change` |
| `Boards/Plan.canvas` | `"Plan.v2"` | `"Plan.v2.canvas"` | Non-core segment is part of the name |
| `Views/Tasks.base` | `"Open Tasks"` | `"Open Tasks.base"` | Source extension appended |
| `Att/Photo.PNG` | `"New"` | `"New.PNG"` | Appended in the source's spelling |
| `Att/Photo.PNG` | `"New.png"` | `"New.png"` | Same type, case-only difference |
| `Att/Photo.png` | `"New.jpg"` | — | Rejected: `type-change` (a different attachment type) |
| `Misc/README` | `"Readme2"` | `"Readme2"` | Source has no extension |
| `Misc/todo.txt` | `"done"` | `"done.txt"` | Non-core source extension kept |

## Output

```json
{ "renamed": true, "fromPath": "Inbox/Typo.md", "toPath": "Inbox/Fixed.md" }
```

| Field | Type | Description |
|-------|------|-------------|
| `renamed` | literal `true` | Always `true` on success. Failures throw `UpstreamError`. |
| `fromPath` | string | The CLI-canonical vault-relative path of the source AT THE MOMENT OF THE RENAME. For wikilink-form input (`file=`) this is the resolved folder-prefixed path. |
| `toPath` | string | The CLI-canonical vault-relative path of the destination. Folder-prefix matches `fromPath` (in-place rename). |

### Same-name no-op

When the source and destination resolve to identical canonical paths, the CLI reports success and the response carries `fromPath === toPath` by string equality. Callers that need to distinguish "name actually changed" from "no-op" should compare `fromPath` and `toPath` by string equality.

## Scope

`rename` works on **files of any type** — notes, canvases, bases, attachments, and files whose extension is not a core type — and **keeps each file's type** (spec 070). Out of scope:

- **Changing a file's type**: renaming `.md → .canvas`, `.canvas → .md`, `.png → .jpg`, etc. A `name` that ends in a different core extension is rejected with `UNSUPPORTED_FILE_TYPE` / `type-change` (see *Extension-handling rule*); the wrapper never converts a file's type silently.
- **Folder relocation**: changing the file's folder location. Folder-separator characters (`/`, `\`) in `name` are rejected at the schema layer with a `move_note` recovery hint.

To change a file's type deliberately, route through [`obsidian_exec`](./obsidian_exec.md), which forwards `name` without the type check:

```json
{
  "name": "obsidian_exec",
  "arguments": {
    "command": "rename",
    "vault": "MyVault",
    "parameters": { "path": "Drafts/Sketch.md", "name": "Sketch.canvas" }
  }
}
```

For folder relocation, use [`move`](./move.md).

## Errors

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The input failed schema validation (missing `target_mode`, missing `vault` in specific mode, neither/both `file` and `path`, forbidden key in active mode, unknown top-level key, empty `name`, `name` non-string, `name` containing `/` or `\`, etc.). | Retry with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. For `/` or `\` in `name`, the message includes a `move_note` recovery hint — use [`move`](./move.md) for folder relocation. |
| `VALIDATION_ERROR` (`details.code: "UNSUPPORTED_FILE_TYPE"`, `details.reason: "type-change"`) | `name` ends in a core extension different from the source's (for example `"Plan.md"` on a `.canvas` source). Raised before the `rename` call; for `file` and active calls, after the source resolves. `details` carries `path` (the resolved source path), `extension` (the source's, original case), `supported` (all four categories: `["note", "canvas", "base", "attachment"]`), `destination` (the `name` as given), `destinationExtension`, and `alternative: "obsidian_exec"`. | Nothing was changed. Omit the extension (or give the source's own) to keep the type, or use [`obsidian_exec`](./obsidian_exec.md) to change the type deliberately. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (file locked by an external editor on Windows, permission error, etc.). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Inspect `stderr` for diagnostic output. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band — either stdout starts with `Error:` (source not found, destination collision, etc.), OR the unknown-vault response (`Vault not found.`) was detected, OR the success response was unparseable. | `details.message` (the first line of stdout, or the synthesised parse-failure message) names the specific failure. For `Error: Destination file already exists!`: pick a different `name`. For `Error: File "<path>" not found.`: verify the locator. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no file is focused in Obsidian (raised by the focused-file lookup, before the `rename` call). | Operator-side: open a file in the editor, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. |

## Examples

### (i) Specific mode — rename by path (bare `name`)

```json
{
  "name": "rename",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Typo.md",
    "name": "Fixed"
  }
}
```

Spawns `obsidian vault=MyVault rename path=Inbox/Typo.md name=Fixed.md` (`.md` appended by the wrapper). Returns `{ "renamed": true, "fromPath": "Inbox/Typo.md", "toPath": "Inbox/Fixed.md" }`.

### (ii) Specific mode — verbatim `.md` in `name`

```json
{
  "name": "rename",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Typo.md",
    "name": "Fixed.md"
  }
}
```

Spawns `obsidian vault=MyVault rename path=Inbox/Typo.md name=Fixed.md` (no double-append: `.md` is detected via case-sensitive `endsWith`). Returns the same shape as the previous example.

### (iii) Specific mode — internal periods preserved

```json
{
  "name": "rename",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Drafts/Note.md",
    "name": "Doc.v1.draft"
  }
}
```

Spawns `obsidian vault=MyVault rename path=Drafts/Note.md name=Doc.v1.draft.md`. Returns `{ "renamed": true, "fromPath": "Drafts/Note.md", "toPath": "Drafts/Doc.v1.draft.md" }`.

### (iv) Active mode — rename the focused note

```json
{
  "name": "rename",
  "arguments": {
    "target_mode": "active",
    "name": "Today"
  }
}
```

Resolves the focused file with a focused-file `eval` call, then spawns `obsidian rename path=<focused path> name=Today.md` (no `vault=`) (the extension is the focused file's own — `Today.canvas` if a canvas is focused). Returns `{ "renamed": true, "fromPath": "<focused note path>", "toPath": "<focused folder>/Today.md" }`. If no file is focused, surfaces `ERR_NO_ACTIVE_FILE`.

### (iv-b) Specific mode — rename a canvas, keeping its type

```json
{
  "name": "rename",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Boards/Plan.canvas",
    "name": "Roadmap"
  }
}
```

Spawns `obsidian vault=MyVault rename path=Boards/Plan.canvas name=Roadmap.canvas`. Returns `{ "renamed": true, "fromPath": "Boards/Plan.canvas", "toPath": "Boards/Roadmap.canvas" }`. The same call with `name: "Plan.md"` is rejected before any `rename` call:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "rename: Boards/Plan.canvas is a canvas; the new name \"Plan.md\" would make it a note. rename and move keep a file's type. Nothing was changed. Omit the extension to keep it a canvas, or use obsidian_exec to change the type deliberately.",
  "details": {
    "code": "UNSUPPORTED_FILE_TYPE",
    "reason": "type-change",
    "path": "Boards/Plan.canvas",
    "extension": "canvas",
    "supported": ["note", "canvas", "base", "attachment"],
    "destination": "Plan.md",
    "destinationExtension": "md",
    "alternative": "obsidian_exec"
  }
}
```

### (v) Failure recovery — destination collision

```json
{
  "name": "rename",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/A.md",
    "name": "B"
  }
}
```

If `Inbox/B.md` already exists, surfaces as `CLI_REPORTED_ERROR` with `details.message: "Error: Destination file already exists!"`. Pick a different `name`, OR delete/move the collision target first, OR use [`move`](./move.md) if the source needs to land in a different folder.

### (vi) Failure recovery — folder separator in `name`

```json
{
  "name": "rename",
  "arguments": {
    "target_mode": "specific",
    "vault": "MyVault",
    "path": "Inbox/Note.md",
    "name": "Subfolder/Note"
  }
}
```

Rejected at the schema boundary with `VALIDATION_ERROR`. The issue carries the path `["name"]` and a message naming the `move_note` recovery hint. Use [`move`](./move.md) for folder relocation, OR route through `obsidian_exec move` directly:

```json
{
  "name": "obsidian_exec",
  "arguments": {
    "command": "move",
    "vault": "MyVault",
    "parameters": { "path": "Inbox/Note.md", "to": "Subfolder/Note.md" }
  }
}
```

## Behavioural notes

- **Wikilink-form (`file=`) resolves to a canonical path**: the returned `fromPath` and `toPath` reflect the resolved folder-prefixed paths. The CLI resolves an extensionless `file` name only to a `.md` note, so to rename a canvas, base or attachment by `file`, include its extension (`"Plan.canvas"`).
- **Same-name rename succeeds**: the CLI accepts source-equals-destination with a success response; `fromPath === toPath` in the result.
- **Source not found** surfaces as `CLI_REPORTED_ERROR` with the verbatim `Error: File "<path>" not found.` message.
- **Destination collision** surfaces as `CLI_REPORTED_ERROR` with the verbatim `Error: Destination file already exists!` message.
- **Unknown vault names** surface as `CLI_REPORTED_ERROR` with the verbatim `Vault not found.` message.
- **Case-only rename on Windows NTFS** (`Note.md → note.md`): the CLI succeeds and emits a response with `fromPath` and `toPath` differing only in case. Callers that care about case-sensitivity should compare the two byte-perfectly.
- **Path-traversal is rejected by the CLI**: `path: "../../etc/x.md"` surfaces as `Error: File "../../etc/x.md" not found.` — the CLI's vault-relative path resolution refuses to escape the vault root.
- **External editor open during rename** (e.g. the source note has a live Obsidian tab): on Windows, an exclusive lock from an external process may surface as `CLI_NON_ZERO_EXIT`. POSIX hosts typically allow the rename to proceed and the editor sees the renamed buffer.
