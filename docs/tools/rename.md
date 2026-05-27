# `rename`

## Overview

Rename a `.md` note in an Obsidian vault **in place** — the file's folder location is unchanged; only the filename changes. Wraps the Obsidian CLI's `rename` subcommand and returns `{ renamed, fromPath, toPath }`.

Folder relocation is a separate operation: use [`move`](./move.md) (the typed wrapper around the CLI's `move` subcommand). The schema rejects `name` values containing `/` or `\` at the boundary with a `move` recovery hint.

> **Link-rewriting is vault-config-dependent.** Obsidian's Settings → Files & Links → "Automatically update internal links" governs whether existing `[[wikilinks]]` and `[markdown](links)` to the renamed note are rewritten to the new name. `rename` does NOT enforce or override this setting — it documents the dependency so callers can verify the vault's configuration before relying on link integrity.

## When to use this tool

| You want to | Reach for |
|---|---|
| Rename a `.md` note in place | `rename` |
| Move a note to a different folder (with or without renaming) | [`move`](./move.md) |
| Rename a `.canvas`, `.pdf`, or other non-`.md` file | [`obsidian_exec`](./obsidian_exec.md) |
| Convert across extensions (`.md` → `.canvas`, etc.) | [`obsidian_exec`](./obsidian_exec.md) |
| Delete a note | [`delete`](./delete.md) |

The tool supports two target modes:

- **specific** — name the vault explicitly and locate the source note by either a wikilink (`file`) or a vault-relative `path`. The deterministic path; the focused note in the editor cannot shift between parse and execution.
- **active** — target the active vault context. The CLI's `rename` subcommand with no locator renames the note currently focused in the Obsidian editor. **Active mode + rename has a TOCTOU caveat**: the focused note may shift between the time the agent decides to call and the time the CLI executes. Agents that need certainty about which file is renamed should use specific mode.

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

The wrapper appends `.md` to `name` **only when** `name.endsWith(".md")` returns `false`. Literal byte-equality, case-sensitive.

| Input `name` | Forwarded as |
|---|---|
| `"Fixed"` | `"Fixed.md"` |
| `"Fixed.md"` | `"Fixed.md"` (verbatim) |
| `"Doc.v1.draft"` | `"Doc.v1.draft.md"` (internal periods preserved) |
| `"Renamed.MD"` | `"Renamed.MD.md"` (case-sensitive: `.MD` ≠ `.md`) |
| `"Sketch.canvas"` | `"Sketch.canvas.md"` (cross-extension narrowing — see Scope) |
| `"日記"` | `"日記.md"` |

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

`rename` is **scoped to `.md` notes**. The `.md` extension-handling allowlist is exactly `{".md"}`. Out of scope:

- **Non-`.md` filename targets**: renaming `.canvas` files, `.pdf` attachments, image files (`.png`, `.jpg`, `.svg`), or any non-`.md` extension. The wrapper appends `.md` to a bare `name`, so attempting to rename `.canvas → .canvas` would produce `<name>.canvas.md` (a typed `.md` file with an internal-period that happens to look like a canvas extension).
- **Cross-extension type conversion**: changing `.md → .canvas`, `.md → .pdf`, etc. The wrapper enforces `.md` as the only recognised extension; supplying `name: "Sketch.canvas"` produces `"Sketch.canvas.md"` (still a `.md` file).
- **Folder relocation**: changing the file's folder location. Folder-separator characters (`/`, `\`) in `name` are rejected at the schema layer with a `move_note` recovery hint.

For non-`.md` rename or cross-extension conversion, route through [`obsidian_exec`](./obsidian_exec.md):

```json
{
  "name": "obsidian_exec",
  "arguments": {
    "command": "rename",
    "vault": "MyVault",
    "parameters": { "path": "Drafts/Sketch.canvas", "name": "Sketch.canvas" }
  }
}
```

For folder relocation, use [`move`](./move.md).

## Errors

| Code | When | Recovery |
|------|------|----------|
| `VALIDATION_ERROR` | The input failed schema validation (missing `target_mode`, missing `vault` in specific mode, neither/both `file` and `path`, forbidden key in active mode, unknown top-level key, empty `name`, `name` non-string, `name` containing `/` or `\`, etc.). | Retry with corrected input. `details.issues` carries the per-issue `path` + `message` + zod code. For `/` or `\` in `name`, the message includes a `move_note` recovery hint — use [`move`](./move.md) for folder relocation. |
| `CLI_BINARY_NOT_FOUND` | The `obsidian` CLI binary is not on `PATH` and `OBSIDIAN_BIN` was unset/invalid. | Operator-side: install the Obsidian CLI, OR set `OBSIDIAN_BIN` to a valid path. |
| `CLI_NON_ZERO_EXIT` | The Obsidian CLI exited with a non-zero code (file locked by an external editor on Windows, permission error, etc.). | `details.{exitCode, signal, stdout, stderr}` carry the failure context. Inspect `stderr` for diagnostic output. |
| `CLI_REPORTED_ERROR` | The CLI exited 0 but reported a failure in-band — either stdout starts with `Error:` (source not found, destination collision, etc.), OR the unknown-vault response (`Vault not found.`) was detected, OR the success response was unparseable. | `details.message` (the first line of stdout, or the synthesised parse-failure message) names the specific failure. For `Error: Destination file already exists!`: pick a different `name`. For `Error: File "<path>" not found.`: verify the locator. |
| `ERR_NO_ACTIVE_FILE` | `target_mode: "active"` was used but no note is focused in Obsidian. | Operator-side: open a note in the editor, OR call again with `target_mode: "specific"` and an explicit `vault` + `file`/`path`. |

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

Spawns `obsidian rename name=Today.md` (no `vault=`, no locator). Returns `{ "renamed": true, "fromPath": "<focused note path>", "toPath": "<focused folder>/Today.md" }`. If no note is focused, surfaces `ERR_NO_ACTIVE_FILE`.

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

- **Wikilink-form (`file=`) resolves to a canonical path**: the returned `fromPath` and `toPath` reflect the resolved folder-prefixed paths.
- **Same-name rename succeeds**: the CLI accepts source-equals-destination with a success response; `fromPath === toPath` in the result.
- **Source not found** surfaces as `CLI_REPORTED_ERROR` with the verbatim `Error: File "<path>" not found.` message.
- **Destination collision** surfaces as `CLI_REPORTED_ERROR` with the verbatim `Error: Destination file already exists!` message.
- **Unknown vault names** surface as `CLI_REPORTED_ERROR` with the verbatim `Vault not found.` message.
- **Case-only rename on Windows NTFS** (`Note.md → note.md`): the CLI succeeds and emits a response with `fromPath` and `toPath` differing only in case. Callers that care about case-sensitivity should compare the two byte-perfectly.
- **Path-traversal is rejected by the CLI**: `path: "../../etc/x.md"` surfaces as `Error: File "../../etc/x.md" not found.` — the CLI's vault-relative path resolution refuses to escape the vault root.
- **External editor open during rename** (e.g. the source note has a live Obsidian tab): on Windows, an exclusive lock from an external process may surface as `CLI_NON_ZERO_EXIT`. POSIX hosts typically allow the rename to proceed and the editor sees the renamed buffer.
