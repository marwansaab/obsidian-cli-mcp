# open_file

Surface an existing vault file — of **any** recognised type (markdown note, canvas, PDF, image, attachment) — as the focused, visible, active file in the running Obsidian workspace. Decouples the open/hand-off affordance from `write_note` (which only opens what it just wrote): `open_file` opens a file you merely located.

## When to reach for it

- You located a file (via `files`, `search`, `backlinks`, …) and want a human to see it in Obsidian.
- You want a non-markdown file (canvas board, PDF, image) surfaced in its native viewer.
- You want a subsequent `target_mode: "active"` call to operate on a specific file — `open_file` makes it the active file first.

## Focused-vault precondition (upstream B1)

The open **always lands in Obsidian's currently focused vault**. You MUST name that focused vault in `vault`. If the named vault is registered but is not the focused one (closed, or open in a background window), the call fails with `VAULT_NOT_FOUND` / `not-open` and opens nothing. Make the requested vault active in Obsidian, then retry.

## Input

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `vault` | string | yes | Display name of the vault that owns the file. MUST be the currently focused vault. |
| `path` | string | exactly one of `path`/`file` | Vault-relative path of the file (any type). Structurally safe only. |
| `file` | string | exactly one of `path`/`file` | Bare name resolved by Obsidian's link resolver (resolves attachments too). No `[[`/`]]` brackets. |
| `new_tab` | boolean | no (default `false`) | `true` → fresh tab, prior file stays open. `false` → focus an existing tab (no duplicate), else open in the active tab. |

Success shape — identical across all file types:

```json
{ "opened": "<resolved vault-relative path>", "vault": "<vault>", "new_tab": false }
```

## Examples

### Example 1 — open a markdown note by path

```json
{ "vault": "Work", "path": "Projects/Q2 Roadmap.md" }
```

→ `Projects/Q2 Roadmap.md` becomes the focused, visible file (reusing an existing tab if already open).

```json
{ "opened": "Projects/Q2 Roadmap.md", "vault": "Work", "new_tab": false }
```

A subsequent `target_mode: "active"` tool call now operates on this file.

### Example 2 — open by bare name (any type, resolves attachments)

```json
{ "vault": "Research", "file": "diagram.png" }
```

→ Obsidian's link resolver finds the file by name; the PNG opens in Obsidian's image viewer with the same success shape as a note.

```json
{ "opened": "Assets/diagram.png", "vault": "Research", "new_tab": false }
```

### Example 3 — open a non-markdown file by path

```json
{ "vault": "Research", "path": "Boards/Architecture.canvas" }
```

```json
{ "vault": "Research", "path": "Papers/transformer.pdf" }
```

→ Each opens via Obsidian's native viewer for that type; identical success shape.

### Example 4 — open in a new tab (preserve the current view)

```json
{ "vault": "Work", "path": "Reference/Style Guide.md", "new_tab": true }
```

→ The style guide opens in a **new** tab and becomes focused; whatever was open stays in its own tab. With `new_tab: true`, a fresh tab is created even if the file was already open elsewhere.

## Error roster

Every failure routes through `UpstreamError`. On every failure mode, nothing is opened and workspace focus is unchanged.

| `code` | `details` | Meaning | Recovery |
|--------|-----------|---------|----------|
| `VALIDATION_ERROR` | `issues[].path` | Missing `vault`; both/neither `path`/`file`; bracketed `file`; structurally-unsafe `path`/`file`; unknown field; non-boolean `new_tab`. Fires before any open. | Fix the flagged field; supply exactly one locator. |
| `CLI_REPORTED_ERROR` | `code: "VAULT_NOT_FOUND"`, `reason: "unknown"`, `vault` | `vault` matches no registered Obsidian vault. | Use `vaults` to list registered names; correct the typo. |
| `CLI_REPORTED_ERROR` | `code: "VAULT_NOT_FOUND"`, `reason: "not-open"`, `vault` | `vault` is registered but is not the focused vault (closed, or background). | Focus the vault in Obsidian, then retry. |
| `CLI_REPORTED_ERROR` | `code: "FILE_NOT_FOUND"`, `path`, `vault` | No file at the resolved location (or the locator named a folder). | Verify the path with `files`; use `write_note` to create. |
| `CLI_REPORTED_ERROR` | `code: "UNSUPPORTED_FILE_TYPE"`, `extension`, `path`, `vault` | The file exists, but Obsidian has no registered view for its extension. Distinct from `FILE_NOT_FOUND`. | The file type cannot be displayed in Obsidian; surface it through another channel or convert it. |
| `CLI_BINARY_NOT_FOUND` / `CLI_NON_ZERO_EXIT` | — | Obsidian not running, the `obsidian` binary is missing, or the eval spawn failed. | Ensure Obsidian is running with the target vault focused and the CLI is installed; retry. |
| `INTERNAL_ERROR` | `stage: "json-parse" \| "envelope-parse"` | The eval returned a result the handler cannot interpret. Should not occur in normal operation. | Report with the full payload; retry once for a transient failure. |

### Failure examples

```json
{ "vault": "Work", "path": "a.md", "file": "a" }
```
→ `VALIDATION_ERROR` — supply exactly one of `path`/`file`.

```json
{ "vault": "Work", "file": "[[My Note]]" }
```
→ `VALIDATION_ERROR` at `["file"]` — strip the brackets, supply `My Note`.

```json
{ "vault": "Work", "path": "data/export.sqlite" }
```
→ `CLI_REPORTED_ERROR` / `UNSUPPORTED_FILE_TYPE` — the file exists, but Obsidian has no view for `.sqlite`.

For the full error roster and recovery hints inline in an MCP client, call `help({ tool_name: "open_file" })`.

## What open_file does NOT do

- Does not open files outside the vault (external paths).
- Does not close/split/move/rearrange tabs (only the `new_tab` opt-in).
- Does not switch or open a different vault (requires the target vault already focused).
- Does not edit the file's content.
- Does not scroll to a heading or block within the file.
