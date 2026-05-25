# Quickstart: patch_block

**Branch**: `043-patch-block` | **Date**: 2026-05-25
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Data Model**: [data-model.md](./data-model.md) | **Contracts**: [contracts/](./contracts/)

Agent-facing usage examples for the `patch_block` typed MCP tool. Every example assumes the tool is registered on the MCP server and accessible via the `tools/call` MCP method (or whichever invocation primitive the consuming agent runtime exposes).

## Setup: the example note

All examples below use this vault file at `Daily Notes/2026-05-25.md`:

````markdown
---
date: 2026-05-25
tags: [daily]
---

# Daily

A quick lead-in for the day. ^intro-summary

## Active tasks

- Buy groceries ^todo-groceries
- Submit timesheet ^todo-timesheet
- Reviewed PR #128 ^todo-pr-review

## Comparison

| Tool          | Locator      | Modes               |
|---------------|--------------|---------------------|
| patch_heading | heading-path | append / prepend / replace |
| patch_block   | block-id     | replace             |

^table-tools-compare

## Code snippets

```javascript
// A block marker inside a fence is content, not an anchor:
// const note = "see ^foo for the value";
function foo() { return 42; }
```
````

Vault display name: `Knowledge`. The examples target `target_mode: "specific"`, but every example has an active-mode counterpart (open the note in Obsidian, drop `vault`/`file`/`path` from the call, set `target_mode: "active"`).

## Example 1 — Replace a paragraph by block-id

**Intent**: Refresh the lead-in paragraph attached to `^intro-summary` without touching the marker itself, the heading, or any other section.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-25.md",
  "block_id": "intro-summary",
  "content": "A focused start: shipped patch_block end-to-end."
}
```

**Result** (success envelope):

```json
{
  "path": "Daily Notes/2026-05-25.md",
  "vault": "Knowledge",
  "block_id": "intro-summary",
  "block_shape": "paragraph",
  "bytes_written": 451
}
```

**Post-edit fragment** (only the changed line shown):

```markdown
# Daily

A focused start: shipped patch_block end-to-end. ^intro-summary
```

Note the trailing ` ^intro-summary` marker remains at the conventional paragraph-trailing position with a single ASCII space separator (per FR-008). Everything outside the paragraph — the heading line, the Active tasks section, the table, the code fence — is byte-identical to the pre-call state.

## Example 2 — Replace a list-item by block-id

**Intent**: Rewrite the `^todo-timesheet` list item's content; preserve the list marker, the indentation, the trailing block marker, and the sibling items above and below.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-25.md",
  "block_id": "todo-timesheet",
  "content": "Submit Q2 timesheet by EOD"
}
```

**Result**:

```json
{
  "path": "Daily Notes/2026-05-25.md",
  "vault": "Knowledge",
  "block_id": "todo-timesheet",
  "block_shape": "list-item",
  "bytes_written": 463
}
```

**Post-edit fragment**:

```markdown
## Active tasks

- Buy groceries ^todo-groceries
- Submit Q2 timesheet by EOD ^todo-timesheet
- Reviewed PR #128 ^todo-pr-review
```

The `-` list marker, the single-space indent after it, and the trailing ` ^todo-timesheet` marker are all byte-stable (per FR-009). Sibling items `^todo-groceries` and `^todo-pr-review` are untouched.

## Example 3 — Replace a separately-placed-marker block (table)

**Intent**: Swap the comparison table for a new variant; the `^table-tools-compare` marker line immediately following the table is preserved verbatim and at the same position relative to the (resized) table.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-25.md",
  "block_id": "table-tools-compare",
  "content": "| Tool          | Locator      | Modes   | Marker preservation |\n|---------------|--------------|---------|---------------------|\n| patch_heading | heading-path | 3 modes | n/a                 |\n| patch_block   | block-id     | replace | byte-stable per FR-008/009/010 |"
}
```

**Result**:

```json
{
  "path": "Daily Notes/2026-05-25.md",
  "vault": "Knowledge",
  "block_id": "table-tools-compare",
  "block_shape": "separately-placed",
  "bytes_written": 612
}
```

**Post-edit fragment**:

```markdown
## Comparison

| Tool          | Locator      | Modes   | Marker preservation |
|---------------|--------------|---------|---------------------|
| patch_heading | heading-path | 3 modes | n/a                 |
| patch_block   | block-id     | replace | byte-stable per FR-008/009/010 |

^table-tools-compare
```

The `^table-tools-compare` line is byte-stable; only the table above it has changed (per FR-010). Same behaviour applies to callouts, blockquotes, and indented-code blocks whose marker sits on a separate following line.

## Example 4 — Clear a block's body (empty content)

**Intent**: Stage the paragraph attached to `^intro-summary` for repopulation by clearing its body first.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-25.md",
  "block_id": "intro-summary",
  "content": ""
}
```

**Result**:

```json
{
  "path": "Daily Notes/2026-05-25.md",
  "vault": "Knowledge",
  "block_id": "intro-summary",
  "block_shape": "paragraph",
  "bytes_written": 398
}
```

**Post-edit fragment**:

```markdown
# Daily

 ^intro-summary
```

The paragraph body is empty; the marker is preserved at its conventional position. Cohort parity with `patch_heading`'s `replace` mode accepting empty content as the legitimate "clear the body" operation.

## Example 5 — Patch in the focused note (active mode)

**Intent**: With `Daily Notes/2026-05-25.md` open in Obsidian, patch the `^intro-summary` block without restating the locator.

**Request**:

```json
{
  "target_mode": "active",
  "block_id": "intro-summary",
  "content": "Quick stand-up note: patch_block ships."
}
```

**Result**: same envelope shape as Example 1, with `path` + `vault` populated from the pre-write eval that resolves the focused file.

## Example 6 — Failure: block-id does not exist (`BLOCK_NOT_FOUND`)

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-25.md",
  "block_id": "nonexistent-block",
  "content": "anything"
}
```

**Result** (typed error):

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "BLOCK_NOT_FOUND",
    "block_id": "nonexistent-block",
    "path": "Daily Notes/2026-05-25.md"
  },
  "message": "Block reference '^nonexistent-block' not found in note 'Daily Notes/2026-05-25.md'."
}
```

The file on disk is unchanged. Caller remediation: inspect the note via `read` and verify the intended id is present and outside any fenced code block. (A `block_id` that appears only inside a fence surfaces as `BLOCK_NOT_FOUND` too per FR-011 — the scanner does not bind markers inside fences.)

## Example 7 — Failure: block-id attached to a heading line (`BLOCK_ON_HEADING`)

**Setup**: suppose the note contains `## Active tasks ^section-active` instead of the plain `## Active tasks`. The marker is attached to an ATX heading line.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-25.md",
  "block_id": "section-active",
  "content": "new section name"
}
```

**Result**:

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "BLOCK_ON_HEADING",
    "block_id": "section-active",
    "path": "Daily Notes/2026-05-25.md",
    "heading_shape": "atx"
  },
  "message": "Block reference '^section-active' is attached to a heading line; use patch_heading instead."
}
```

Caller remediation: route the request to `patch_heading` with `mode: "replace"` and a `heading_path` naming the heading. Setext-heading attachments (where the marker is on the heading text line whose next line is `===` or `---`) surface the same error with `heading_shape: "setext"`.

## Example 8 — Failure: malformed block-id (`INVALID_BLOCK_ID`)

**Request** (underscore in id):

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-25.md",
  "block_id": "block_one",
  "content": "anything"
}
```

**Result**:

```json
{
  "code": "VALIDATION_ERROR",
  "details": {
    "code": "INVALID_BLOCK_ID",
    "reason": "contains-invalid-chars",
    "offending_index": 5
  },
  "message": "block_id 'block_one' contains invalid characters at index 5; allowed alphabet is alphanumeric + hyphen-minus."
}
```

No filesystem access occurred. Other sub-states fire for empty input (`reason: "empty"`), leading caret (`reason: "leading-caret"`), and over-cap input (`reason: "too-long"`).

## Example 9 — Failure: note path does not exist (`NOTE_NOT_FOUND`)

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Nowhere/Missing.md",
  "block_id": "intro-summary",
  "content": "anything"
}
```

**Result**:

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "NOTE_NOT_FOUND",
    "path": "Nowhere/Missing.md",
    "vault": "Knowledge"
  },
  "message": "Note 'Nowhere/Missing.md' not found in vault 'Knowledge'."
}
```

No note is created (per FR-018). Caller remediation: verify the path via `list_files` before patching.

## Example 10 — Failure: external editor holds the file (`EXTERNAL_EDITOR_CONFLICT`)

**Setup**: open `Daily Notes/2026-05-25.md` in a Windows editor with unsaved changes (the editor holds the file with non-shared-delete access).

**Request**: same as Example 1.

**Result**:

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "EXTERNAL_EDITOR_CONFLICT",
    "reason": "file-locked",
    "path": "Daily Notes/2026-05-25.md",
    "errno": "EBUSY"
  },
  "message": "External editor holds 'Daily Notes/2026-05-25.md' with non-shared-delete access; close the file in the editor and retry."
}
```

The file on disk is unchanged. Detection-capability caveat applies on Linux / macOS for editors that hold dirty state in-memory only — there, the write lands and the editor sees a refreshed file on next focus.

## Example 11 — Failure: active mode with no focused note (`ERR_NO_ACTIVE_FILE`)

**Request**:

```json
{
  "target_mode": "active",
  "block_id": "intro-summary",
  "content": "anything"
}
```

(with no note focused in Obsidian)

**Result**:

```json
{
  "code": "ERR_NO_ACTIVE_FILE",
  "details": {},
  "message": "No file focused in Obsidian. Open a note in the editor, or call patch_block with target_mode=specific + vault + file/path."
}
```

Cohort parity with `write_note` / `patch_heading` active-mode failures.

## Caller-side switch pattern

See [contracts/errors.md](./contracts/errors.md) for the full caller-side switch pattern covering every error class above plus `PATH_ESCAPES_VAULT`, `FS_WRITE_FAILED`, `VAULT_NOT_FOUND`, and `INTERNAL_ERROR`.

## Cohort cross-reference

- For heading-body edits (append / prepend / replace under a heading), use `patch_heading`.
- For frontmatter field writes, use `set_property`.
- For full-note rewrites, use `write_note`.
- For text-anchored search-and-replace inside a block, use `find_and_replace`.
- For reading a block-anchored body (when implemented), use the read-side cohort tool — `patch_block` is write-only.
