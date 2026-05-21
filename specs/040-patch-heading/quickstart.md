# Quickstart: patch_heading

**Branch**: `040-patch-heading` | **Date**: 2026-05-21
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Data Model**: [data-model.md](./data-model.md) | **Contracts**: [contracts/](./contracts/)

Agent-facing usage examples for the `patch_heading` typed MCP tool. Every example assumes the tool is registered on the MCP server and accessible via the `tools/call` MCP method (or whichever invocation primitive the consuming agent runtime exposes).

## Setup: the example note

All examples below use this vault file at `Daily Notes/2026-05-21.md`:

```markdown
---
date: 2026-05-21
tags: [daily]
---

# Daily

## Tasks

### TODO

- Buy groceries
- Submit timesheet

### Done

- Reviewed PR #128

## Notes

A quick thought: the patch_heading clarify pass surfaced an asymmetric empty-content rule that I had not expected.

## Code snippets

```javascript
// Heading-marker characters inside a fence are not section boundaries:
// # this is body text, not a heading
function foo() { return 42; }
```
```

Vault display name: `Knowledge`. The examples target `target_mode: "specific"`, but every example has an active-mode counterpart (open the note in Obsidian, drop `vault`/`file`/`path` from the call, set `target_mode: "active"`).

## Example 1 — Append a new TODO item

**Intent**: Add a new bullet at the end of the TODO list, without touching the Done sublist or the Notes section.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-21.md",
  "heading_path": "Daily#Tasks#TODO",
  "mode": "append",
  "content": "- File expense report\n"
}
```

**Result** (success envelope):

```json
{
  "path": "Daily Notes/2026-05-21.md",
  "vault": "Knowledge",
  "heading_path": "Daily#Tasks#TODO",
  "mode": "append",
  "bytes_written": 412
}
```

**Post-edit file** (only the changed region shown):

```markdown
### TODO

- Buy groceries
- Submit timesheet
- File expense report

### Done

- Reviewed PR #128
```

The new bullet lands at the end of `### TODO`'s reach — immediately before `### Done` (the next equal-rank heading per FR-010). Nothing else in the note changed.

## Example 2 — Prepend a header line under Notes

**Intent**: Add a lead-in paragraph under `## Notes` without disturbing the existing thought.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-21.md",
  "heading_path": "Daily#Notes",
  "mode": "prepend",
  "content": "(see also: 2026-05-20 retrospective)\n\n"
}
```

**Result**:

```json
{
  "path": "Daily Notes/2026-05-21.md",
  "vault": "Knowledge",
  "heading_path": "Daily#Notes",
  "mode": "prepend",
  "bytes_written": 449
}
```

**Post-edit file** (only the changed region shown):

```markdown
## Notes

(see also: 2026-05-20 retrospective)

A quick thought: the patch_heading clarify pass surfaced an asymmetric empty-content rule that I had not expected.
```

The lead-in landed immediately after `## Notes`'s marker line and before the existing thought (FR-011).

## Example 3 — Replace the Done sublist's body

**Intent**: Clear the Done list and write a new wrap-up summary. Note this is `replace`, not `append` — the existing entries go away.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-21.md",
  "heading_path": "Daily#Tasks#Done",
  "mode": "replace",
  "content": "- PR #128 reviewed\n- Caught up on 2026-05-21 BI-040 spec\n- Filed bug report against upstream\n"
}
```

**Result**:

```json
{
  "path": "Daily Notes/2026-05-21.md",
  "vault": "Knowledge",
  "heading_path": "Daily#Tasks#Done",
  "mode": "replace",
  "bytes_written": 478
}
```

**Post-edit file** (only the changed region shown):

```markdown
### Done

- PR #128 reviewed
- Caught up on 2026-05-21 BI-040 spec
- Filed bug report against upstream

## Notes
```

The marker line `### Done` and the parent `## Tasks` reach are preserved; only the direct body changed (FR-012).

## Example 4 — Clear a heading's body via replace + empty content

**Intent**: Empty the TODO list ahead of repopulating it. Per FR-018a, `replace` accepts empty content as a legitimate operation.

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-21.md",
  "heading_path": "Daily#Tasks#TODO",
  "mode": "replace",
  "content": ""
}
```

**Result**: success envelope (`bytes_written` reflects the smaller post-edit file).

**Post-edit file** (only the changed region shown):

```markdown
### TODO

### Done
```

The `### TODO` marker line is preserved; its direct body is now zero bytes; the `### Done` child-or-sibling subtree is untouched.

## Example 5 — Append against the focused note (active mode)

**Intent**: Add to TODO without restating the path; the note is open in Obsidian's editor.

**Request**:

```json
{
  "target_mode": "active",
  "heading_path": "Daily#Tasks#TODO",
  "mode": "append",
  "content": "- Order lunch\n"
}
```

**Result**: success envelope with `vault` + `path` filled from the focused-note resolution.

## Failure-mode examples

### Heading not found

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-21.md",
  "heading_path": "Daily#NotebookExtract",
  "mode": "append",
  "content": "- new entry\n"
}
```

**Result** (UpstreamError):

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "HEADING_NOT_FOUND",
    "heading_path": "Daily#NotebookExtract",
    "path": "Daily Notes/2026-05-21.md"
  },
  "message": "Heading 'NotebookExtract' not found under 'Daily' in 'Daily Notes/2026-05-21.md'"
}
```

The file on disk is unchanged. Use `outline` or `read_heading` to inspect the note's actual headings before retrying.

### Malformed heading path (single segment)

**Request**:

```json
{
  "heading_path": "Tasks",
  "mode": "append",
  "content": "- new item\n",
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-21.md"
}
```

**Result**:

```json
{
  "code": "VALIDATION_ERROR",
  "details": {
    "code": "INVALID_HEADING_PATH",
    "reason": "single-segment"
  },
  "message": "heading_path must contain at least two segments separated by '#'; top-level headings are out of scope"
}
```

No vault access; no fs read; no fs write. The caller adds an ancestor segment (e.g., `Daily#Tasks`).

### Empty content for append

**Request**:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-21.md",
  "heading_path": "Daily#Tasks#TODO",
  "mode": "append",
  "content": ""
}
```

**Result**:

```json
{
  "code": "VALIDATION_ERROR",
  "details": {
    "code": "EMPTY_CONTENT",
    "reason": "append",
    "mode": "append"
  },
  "message": "content must be non-empty for mode='append'; use mode='replace' to clear a heading's direct body"
}
```

No vault access; no fs read; no fs write. The caller's content is empty — almost always a bug (uninitialised variable, missing string interpolation). For the legitimate "clear the body" intent, switch to `mode: "replace"` with empty content.

### Heading-text race

**Request** (a `patch_heading` call interleaved with a concurrent rename of the target heading):

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-21.md",
  "heading_path": "Daily#Tasks#TODO",
  "mode": "append",
  "content": "- File expense report\n"
}
```

If another process renames `### TODO` to `### Pending` between path resolution and the pre-write re-walk, the wrapper detects the identity mismatch and fails loud:

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "HEADING_RACE",
    "heading_path": "Daily#Tasks#TODO",
    "path": "Daily Notes/2026-05-21.md",
    "original_identity": {
      "markerLineText": "### TODO",
      "rank": 3,
      "parentChainText": "Daily#Tasks"
    },
    "current_identity": null
  },
  "message": "Heading 'Daily#Tasks#TODO' was modified between resolve and write; refusing to write to a different heading"
}
```

The file is unchanged. The caller re-reads the note's current headings and retries with the updated locator.

### External editor conflict (Windows)

**Request**: an `append` against a note currently open in Obsidian's main editor with unsaved changes on Windows.

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-21.md",
  "heading_path": "Daily#Notes",
  "mode": "append",
  "content": "Sudden idea: graphify the entire vault\n"
}
```

If the substrate's `fs.rename` throws `EBUSY`:

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "EXTERNAL_EDITOR_CONFLICT",
    "reason": "file-locked",
    "path": "Daily Notes/2026-05-21.md",
    "errno": "EBUSY"
  },
  "message": "Cannot patch 'Daily Notes/2026-05-21.md' — the file is held open by an external editor (EBUSY). Save and close the file in the editor, then retry."
}
```

The file is unchanged. The caller coordinates with the user holding the file open.

### No focused note (active mode failure)

**Request**:

```json
{
  "target_mode": "active",
  "heading_path": "Daily#Notes",
  "mode": "append",
  "content": "- new note\n"
}
```

If no note is focused in Obsidian:

```json
{
  "code": "ERR_NO_ACTIVE_FILE",
  "details": {},
  "message": "No active file in Obsidian. Open a note in the editor, or call patch_heading with target_mode=specific + vault + file/path."
}
```

No fs read; no fs write. The caller switches to `target_mode: "specific"` or directs the user to focus the intended note.

## Body-shape gotchas

- **Multi-line content**: the wrapper inserts the `content` string as-is, splitting on `\n` if present. Callers responsible for choosing their own line endings; the wrapper preserves the note's existing line-ending convention at the boundaries but does NOT normalise the content's own line endings.
- **Trailing newline on `content`**: include a trailing `\n` if you want the inserted content to occupy its own line(s); omit it if you want the next existing line to abut the inserted content. The wrapper does NOT add or strip trailing newlines from the supplied content.
- **`append` with no body**: if the target heading has no body (its reach is empty), `append` lands content immediately after the marker line. The result reads as though `prepend` had been used; this is correct and intentional (the position "end of empty reach" and "start of empty body" are the same offset).
- **`prepend` with adjacent child heading**: if the target heading is immediately followed by a child heading marker, `prepend` inserts between the two markers. Equivalent to "this is now the lead-in for the section before the child subtree starts".
- **`replace` with multiple children**: only the direct body (between marker line and first child heading) is swapped. Every child subtree from the first child onward is preserved.
- **Fenced code with heading-marker characters**: lines inside ` ``` ` fences whose first non-whitespace character is `#` are treated as ordinary body content, not as headings (FR-013). The walker tracks fence open/close state line by line.
- **First-match-wins on duplicate sibling headings**: if `## Notes` appears twice under `# Daily` (which is unusual but legal markdown), `Daily#Notes` resolves to the first occurrence in document order. Use a more specific heading hierarchy if you need to target the second.
