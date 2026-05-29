# Quickstart: open_file

**Branch**: `057-open-vault-file` | **Date**: 2026-05-29
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Worked examples for the `open_file` typed MCP tool. Precondition for every call: Obsidian is running and the target vault is the **currently focused** vault (the open lands in the focused vault — upstream B1).

## Happy path — open a markdown note by path

```json
{ "vault": "Work", "path": "Projects/Q2 Roadmap.md" }
```

→ `Projects/Q2 Roadmap.md` becomes the focused, visible file (reusing an existing tab if already open).

```json
{ "opened": "Projects/Q2 Roadmap.md", "vault": "Work", "new_tab": false }
```

A subsequent active-mode tool call (e.g. an active-mode read) now operates on this file (FR-007).

## Open by bare name (any type — resolves attachments too)

```json
{ "vault": "Work", "file": "Q2 Roadmap" }
```

```json
{ "vault": "Research", "file": "diagram.png" }
```

→ Obsidian's link resolver finds the file by name; the PNG opens in Obsidian's image viewer. Same success shape as a note.

```json
{ "opened": "Assets/diagram.png", "vault": "Research", "new_tab": false }
```

## Open a non-markdown file by path

```json
{ "vault": "Research", "path": "Boards/Architecture.canvas" }
```

```json
{ "vault": "Research", "path": "Papers/transformer.pdf" }
```

→ Each opens via Obsidian's native viewer for that type; identical success shape (FR-009).

## Open in a new tab (preserve the current view)

```json
{ "vault": "Work", "path": "Reference/Style Guide.md", "new_tab": true }
```

→ The style guide opens in a **new** tab and becomes focused; whatever the person had open stays in its own tab (FR-008). With `new_tab: true`, a fresh tab is created even if the file was already open elsewhere.

## Failure modes

### Vault not the focused vault → `VAULT_NOT_FOUND` / `not-open`

```json
{ "vault": "Archive", "path": "old.md" }
```

When `Archive` is registered but not the focused vault (closed, or open in a background window):

```json
{ "code": "CLI_REPORTED_ERROR",
  "details": { "code": "VAULT_NOT_FOUND", "reason": "not-open", "vault": "Archive" } }
```

→ Nothing opened. Focus the `Archive` vault in Obsidian, then retry.

### Vault not registered → `VAULT_NOT_FOUND` / `unknown`

```json
{ "vault": "Typo Vault", "path": "x.md" }
```

```json
{ "code": "CLI_REPORTED_ERROR",
  "details": { "code": "VAULT_NOT_FOUND", "reason": "unknown", "vault": "Typo Vault" } }
```

→ Use `vaults` to list registered names.

### No such file → `FILE_NOT_FOUND`

```json
{ "vault": "Work", "path": "Projects/Does Not Exist.md" }
```

```json
{ "code": "CLI_REPORTED_ERROR",
  "details": { "code": "FILE_NOT_FOUND", "path": "Projects/Does Not Exist.md", "vault": "Work" } }
```

### Unrenderable type → `UNSUPPORTED_FILE_TYPE`

```json
{ "vault": "Work", "path": "data/export.sqlite" }
```

```json
{ "code": "CLI_REPORTED_ERROR",
  "details": { "code": "UNSUPPORTED_FILE_TYPE", "extension": "sqlite", "path": "data/export.sqlite", "vault": "Work" } }
```

→ Distinct from `FILE_NOT_FOUND`: the file exists, but Obsidian has no view for `.sqlite`.

### Input errors → `VALIDATION_ERROR` (before any open)

```json
{ "vault": "Work", "path": "a.md", "file": "a" }
```
→ `VALIDATION_ERROR` — supply exactly one of `path`/`file`.

```json
{ "vault": "Work", "file": "[[My Note]]" }
```
→ `VALIDATION_ERROR` at `["file"]` — strip the brackets, supply `My Note`.

```json
{ "vault": "Work", "path": "../outside.md" }
```
→ `VALIDATION_ERROR` (structural-path-safety) — vault-relative paths only.

## What open_file does NOT do

- Does not open files outside the vault (external paths) — FR-018.
- Does not close/split/move/rearrange tabs (only the `new_tab` opt-in) — FR-019.
- Does not switch or open a different vault — FR-010 (requires the target vault already focused).
- Does not edit the file's content — FR-020.
- Does not scroll to a heading or block within the file — FR-021.
