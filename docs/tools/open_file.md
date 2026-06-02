# open_file

Surface an existing vault file — of **any** recognised type (markdown note, canvas, PDF, image, attachment) — as the focused, visible, active file in the running Obsidian workspace. Decouples the open/hand-off affordance from `write_note` (which only opens what it just wrote): `open_file` opens a file you merely located.

## When to reach for it

- You located a file (via `files`, `search`, `backlinks`, …) and want a human to see it in Obsidian.
- You want a non-markdown file (canvas board, PDF, image) surfaced in its native viewer.
- You want a subsequent `target_mode: "active"` call to operate on a specific file — `open_file` makes it the active file first.

## Cross-vault — opens in the vault you name, and switches focus to it

The open lands in the `vault` you request **whether that vault is the currently focused one, an open-but-unfocused (background) vault, or a closed-but-registered vault** — and Obsidian's focus moves to it. You do **not** pre-focus the vault yourself.

- The previously focused vault stays open; focus simply moves. No Obsidian setting or config is changed.
- A **closed** registered vault is brought up; a **fully-quit** app is launched automatically (inherited dispatch recovery, ADR-029/030). Either way it is a single call — no caller retry, no hang.
- The locator (`path` / bare `file`) resolves **in the requested vault**; a same-named file in another vault is never opened by mistake.

A registered vault that is merely closed or unfocused is **not** an error — it is a success path. The only hard vault error is an *unregistered* name (`VAULT_NOT_FOUND` / `unknown`).

## Input

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `vault` | string | yes | Display name of the vault to open in (focused, open-but-unfocused, or closed-but-registered). |
| `path` | string | exactly one of `path`/`file` | Vault-relative path of the file (any type). Structurally safe only. Resolves in the requested vault. |
| `file` | string | exactly one of `path`/`file` | Bare name resolved by Obsidian's link resolver in the requested vault (resolves attachments too). No `[[`/`]]` brackets. |
| `new_tab` | boolean | no (default `false`) | `true` → fresh tab, prior file stays open. `false` → focus an existing tab (no duplicate), else open in the active tab. |

Success shape — identical across all file types:

```json
{ "opened": "<resolved vault-relative path>", "vault": "<requested vault>", "new_tab": false, "placement": "active_tab_used" }
```

`placement` is exactly one of:

- `new_tab_created` — a fresh tab was opened (always for `new_tab: true`, even if the file was already open).
- `existing_tab_reused` — an already-open tab for the file was focused; no duplicate created.
- `active_tab_used` — the file was opened into the active tab.

The response carries no file-type field and no pane/leaf ids or split geometry; do not branch on type.

## Examples

### Example 1 — open a markdown note in an open-but-unfocused vault

```json
{ "vault": "Work", "path": "Projects/Q2 Roadmap.md" }
```

→ Focus switches to `Work` and `Projects/Q2 Roadmap.md` becomes the focused, visible file (reusing an existing tab if already open).

```json
{ "opened": "Projects/Q2 Roadmap.md", "vault": "Work", "new_tab": false, "placement": "existing_tab_reused" }
```

A subsequent `target_mode: "active"` tool call now operates on this file.

### Example 2 — open by bare name (any type, resolves attachments)

```json
{ "vault": "Research", "file": "diagram.png" }
```

→ Obsidian's link resolver finds the file by name in `Research`; the PNG opens in Obsidian's image viewer with the same success shape as a note.

```json
{ "opened": "Assets/diagram.png", "vault": "Research", "new_tab": false, "placement": "active_tab_used" }
```

### Example 3 — open a non-markdown file by path

```json
{ "vault": "Research", "path": "Boards/Architecture.canvas" }
```

```json
{ "vault": "Research", "path": "Papers/transformer.pdf" }
```

→ Each opens via Obsidian's native viewer for that type; identical success shape (with its own `placement`).

### Example 4 — open in a new tab (preserve the current view)

```json
{ "vault": "Work", "path": "Reference/Style Guide.md", "new_tab": true }
```

→ The style guide opens in a **new** tab and becomes focused; whatever was open stays in its own tab. With `new_tab: true`, a fresh tab is created even if the file was already open elsewhere.

```json
{ "opened": "Reference/Style Guide.md", "vault": "Work", "new_tab": true, "placement": "new_tab_created" }
```

### Example 5 — open in a closed-but-registered vault

```json
{ "vault": "Archive", "path": "2023/notes.md" }
```

→ `Archive` is closed but registered: it is brought up and focused, the file opens, and a single successful response is returned — no manual open, no caller retry, even though the first internal attempt hit the cold-launch window.

## Error roster

Every failure routes through `UpstreamError`. On every failure mode, nothing is opened.

| `code` | `details` | Meaning | Recovery |
|--------|-----------|---------|----------|
| `VALIDATION_ERROR` | `issues[].path` | Missing `vault`; both/neither `path`/`file`; bracketed `file`; structurally-unsafe `path`/`file`; unknown field; non-boolean `new_tab`. Fires before any open. | Fix the flagged field; supply exactly one locator. |
| `CLI_REPORTED_ERROR` | `code: "VAULT_NOT_FOUND"`, `reason: "unknown"`, `vault` | `vault` matches no registered Obsidian vault — the sole hard vault error. | Use `vaults` to list registered names; correct the typo. |
| `CLI_REPORTED_ERROR` | `code: "FILE_NOT_FOUND"`, `path`, `vault` | No file at the resolved location in the requested vault (or the locator named a folder). | Verify the path with `files`; use `write_note` to create. |
| `CLI_REPORTED_ERROR` | `code: "UNSUPPORTED_FILE_TYPE"`, `extension`, `path`, `vault` | The file exists, but Obsidian has no registered view for its extension. Distinct from `FILE_NOT_FOUND`. | The file type cannot be displayed in Obsidian; surface it through another channel or convert it. |
| `CLI_NON_ZERO_EXIT` | `reason: "obsidian-not-running"` | Obsidian is down and could not be launched within the bound — e.g. auto-launch is disabled (`OBSIDIAN_AUTO_LAUNCH=0`). | Start Obsidian (or enable auto-launch), then retry. |
| `CLI_BINARY_NOT_FOUND` | — | The `obsidian` CLI binary could not be found. | Install / expose the Obsidian CLI on `PATH` (or set `OBSIDIAN_BIN`); retry. |
| `INTERNAL_ERROR` | `stage: "json-parse" \| "envelope-parse"` | The eval returned a result the handler cannot interpret. Should not occur in normal operation. | Report with the full payload; retry once for a transient failure. |

The unregistered-vault, file-not-found, and app-down outcomes are mutually distinguishable: `VAULT_NOT_FOUND/unknown` vs `FILE_NOT_FOUND` vs `obsidian-not-running`.

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
{ "vault": "NoSuchVault", "path": "a.md" }
```
→ `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `reason: "unknown"` — the vault name is not registered.

```json
{ "vault": "Work", "path": "data/export.sqlite" }
```
→ `CLI_REPORTED_ERROR` / `UNSUPPORTED_FILE_TYPE` — the file exists, but Obsidian has no view for `.sqlite`.

For the full error roster and recovery hints inline in an MCP client, call `help({ tool_name: "open_file" })`.

## What open_file does NOT do

- Does not open files outside the vault (external paths).
- Does not close/split/move/rearrange tabs (only the `new_tab` opt-in).
- Does not create or delete a vault.
- Does not edit the file's content.
- Does not scroll to a heading or block within the file.
