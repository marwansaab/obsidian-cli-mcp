# `patch_block`

## Overview

`patch_block` surgically replaces the body content tied to a specific `^block-id` block-reference marker inside a markdown note, leaving the marker itself byte-stable and every byte outside the targeted block unchanged. Writes go directly to the vault filesystem; no per-call content size cap.

Block references are the only Obsidian anchor that survives heading renames, list-item reordering, and table edits. `patch_block` is the surgical equivalent for that anchor — when you need to update one paragraph, one list item, or one table without touching anything else.

## When to use this tool

| You want to | Reach for |
|---|---|
| Replace the body **tied to a named `^block-id`** in an existing note | `patch_block` |
| Replace the body **under a named heading** | [`patch_heading`](./patch_heading.md) |
| Create a new note, or wholesale-replace an existing note's contents | [`write_note`](./write_note.md) |
| Append at the end of an existing note | [`append_note`](./append_note.md) |
| Prepend at the start of an existing note (frontmatter-aware) | [`prepend`](./prepend.md) |
| Find/replace text patterns across many regions | [`find_and_replace`](./find_and_replace.md) |
| Edit a value in YAML frontmatter | [`set_property`](./set_property.md) |
| Patch a block whose marker is attached to a heading line (ATX or setext) | Out of scope — `patch_block` surfaces `BLOCK_ON_HEADING`. Use [`patch_heading`](./patch_heading.md) instead. |

## Input schema

The schema is strict: `additionalProperties: false`. Unknown fields trigger `VALIDATION_ERROR`.

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "path": "<vault-relative path>",
  "block_id": "<bare identifier, no leading ^>",
  "content": "<text to insert>"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | YES | Discriminator. |
| `vault` | string ≥ 1 char | iff specific | Resolved via the lazy vault registry. Unknown vault → `VALIDATION_ERROR`. |
| `file` | string ≥ 1 char (structurally safe) | XOR with `path`, iff specific | Vault-relative file path. |
| `path` | string ≥ 1 char (structurally safe) | XOR with `file`, iff specific | Vault-relative file path. |
| `block_id` | string, 1–1000 chars, `^[A-Za-z0-9-]+$` | YES | See *The block-id locator* below. |
| `content` | string | YES | Any string including empty (legitimate "clear the body" operation). |

### Active mode

```json
{
  "target_mode": "active",
  "block_id": "<bare identifier>",
  "content": "<text>"
}
```

The wrapper resolves the focused note via a small `obsidian eval` call. When no note is focused, `ERR_NO_ACTIVE_FILE` fires with no filesystem access.

## Single placement mode (replace)

`patch_block` has one placement mode — `replace`. The mechanic dispatched depends on the block shape the wrapper resolves from the `^block-id` marker. Three success shapes:

### `paragraph` shape

When the marker is the trailing token on a paragraph's final line:

```markdown
intro

A simple paragraph. ^foo

closing
```

After `content: "Replaced text."`:

```markdown
intro

Replaced text. ^foo

closing
```

The marker `^foo` is preserved byte-stably with the single ASCII-space separator. Multi-line content lands as multiple lines with the marker token appended to the last line. Empty content yields the single-space marker line ` ^foo`.

### `list-item` shape

When the marker is the trailing token on a list-item line, the list-marker bytes + indentation are preserved byte-stably:

```markdown
- sibling A
- target ^bar
- sibling B
```

After `content: "replaced"`:

```markdown
- sibling A
- replaced ^bar
- sibling B
```

Sibling items are untouched. The list-marker prefix (`-`, `*`, `+`, `N.`) and any leading indentation are byte-stable. Empty content yields `<list-marker> ^foo` (with the prefix's trailing space preserved — for `- ` prefix that means `-  ^foo` with two spaces between marker and `^`). Multi-line content into a list-item shape is accepted; subsequent lines do not auto-acquire a list marker — caller responsibility.

### `separately-placed` shape

When the marker is on a standalone line immediately following a table, callout, blockquote, or indented-code block, the marker line is preserved verbatim and only the preceding block's body is replaced:

```markdown
| col1 | col2 |
| ---- | ---- |
| a    | b    |
^baz
trailing
```

After `content: "| col1 | col2 |\n| ---- | ---- |\n| new1 | new2 |\n| new3 | new4 |"`:

```markdown
| col1 | col2 |
| ---- | ---- |
| new1 | new2 |
| new3 | new4 |
^baz
trailing
```

The `^baz` line's bytes are unchanged; its position relative to the (possibly resized) block is unchanged. Empty content collapses the block to zero lines while keeping the marker line byte-stable.

## The block-id locator

The `block_id` field is the **bare identifier** — no leading `^`. Schema-layer validation:

- **Alphabet**: alphanumeric + hyphen-minus only (`^[A-Za-z0-9-]+$`). Underscore, period, colon, and other punctuation are rejected.
- **Case-sensitive**: `^Foo` does not match `block_id: "foo"`.
- **Length cap**: 1000 UTF-16 code units.
- **No leading caret**: passing `"^foo"` is rejected with `INVALID_BLOCK_ID details.reason: "leading-caret"`. Pass `"foo"` instead.
- **First-match-wins**: when the same `block_id` appears more than once in a single note (through authoring error or imported content), the wrapper resolves to the FIRST occurrence in document order.

## Active-mode focused-note locator

`target_mode: "active"` resolves the focused note via the same bug-safe eval pattern used by `write_note` and `patch_heading`. When no note is focused, `ERR_NO_ACTIVE_FILE` fires with the remediation message "Open a note in the editor, or call patch_block with target_mode=specific + vault + file/path." The filesystem is not touched in the no-focus path.

## Output envelope

```typescript
interface PatchBlockOutput {
  path: string;
  vault: string;
  block_id: string;
  block_shape: "paragraph" | "list-item" | "separately-placed";
  bytes_written: number;
}
```

| Field | Meaning |
|---|---|
| `path` | Vault-relative path of the note that was patched. Echo for write-verification. |
| `vault` | Vault display name (resolved from input or focused-vault basePath reverse-lookup). |
| `block_id` | The supplied `block_id`, echoed verbatim (bare, no leading caret). |
| `block_shape` | Which surgery mechanic was applied — `paragraph`, `list-item`, or `separately-placed`. The on-heading shapes never appear in the success envelope (they short-circuit to `BLOCK_ON_HEADING`). |
| `bytes_written` | Total bytes written to disk (post-edit file size in UTF-8 bytes). Coarse confirmation signal — a near-zero value when the caller intended a substantial write is a red flag. |

## Error states

Every failure routes through `UpstreamError`.

| Top-level `code` | `details.code` | `details.reason` | What triggered it |
|---|---|---|---|
| `VALIDATION_ERROR` | `INVALID_BLOCK_ID` | `empty` / `contains-invalid-chars` / `leading-caret` / `too-long` | Schema-layer rejection of the `block_id` shape. |
| `CLI_REPORTED_ERROR` | `BLOCK_NOT_FOUND` | — | The id was not present in the resolved file's body. |
| `CLI_REPORTED_ERROR` | `BLOCK_ON_HEADING` | — (carries `details.heading_shape: "atx" \| "setext"`) | The id resolved to a marker attached to a heading line. Route to [`patch_heading`](./patch_heading.md). |
| `CLI_REPORTED_ERROR` | `NOTE_NOT_FOUND` | — | The target file does not exist. |
| `CLI_REPORTED_ERROR` | `EXTERNAL_EDITOR_CONFLICT` | `file-locked` (reserved: `unsaved-changes`) | An external editor holds the file (Windows). Ask the user to save and close, retry. |
| `VAULT_NOT_FOUND` | — | `unknown` / `not-open` | Vault is not registered, or is registered but not currently open. |
| `ERR_NO_ACTIVE_FILE` | — | — | Active mode but no note is focused. |
| `PATH_ESCAPES_VAULT` | — | — | Resolved path escapes the vault root (symlink traversal, `..` segments). Fix the path. |
| `FS_WRITE_FAILED` | — | — (carries `details.errno`) | Generic fs failure (ENOSPC, EACCES, etc.). Inspect `details.errno`. |

`BLOCK_NOT_FOUND` includes the case where the id appears only inside a fenced code block (markers inside ```` ``` ```` or `~~~` fences are content, not eligible targets). It also includes the case where the id appears only inside leading YAML frontmatter — frontmatter is never modified, and tokens inside it are not bound.

`BLOCK_ON_HEADING` carries `details.heading_shape` so callers can route shape-aware messages; both ATX and setext route to `patch_heading`'s `replace` mode.

## Platform-specific behaviour: EXTERNAL_EDITOR_CONFLICT

`EXTERNAL_EDITOR_CONFLICT` detection depends on the platform's natural `fs.rename` / `fs.writeFile` error surfaces — the wrapper does NOT implement its own editor-state probe:

- **Windows**: when an editor holds the file with non-shared-delete access (Obsidian's editor does this), `fs.rename` throws `EBUSY` (some share modes surface `EPERM`). The wrapper catches these errnos and classifies as `EXTERNAL_EDITOR_CONFLICT` with `details.reason: "file-locked"`.
- **Linux / macOS**: POSIX `rename(2)` does not honour open file handles. The rename succeeds; the editor sees a refreshed file on next focus. **No `EXTERNAL_EDITOR_CONFLICT` fires.** This is unavoidable given the substrate has no signal to fail on.

Callers automating against multi-platform deployments must plan around the divergence. The `unsaved-changes` sub-reason is reserved in the contract; the wrapper never emits it today.

## Atomicity and concurrent calls

A single `patch_block` invocation does not leave the note on disk in a half-written state at any observable instant within the wrapper's control. Writes go through a temp-then-rename atomic substrate.

Two concurrent `patch_block` calls against the same note resolve **last-write-wins**. Both calls read the current file, compute their respective surgery in memory, and write atomically via temp-then-rename. The atomic rename absorbs the race — one rename wins, the other overwrites it; both edits "land" in serial order, last writer wins. `patch_heading` publishes a `HEADING_RACE` discriminator for in-wrapper race detection; `patch_block` does not. The marker preservation invariant already provides identity stability across the wrapper's own writes, and external-editor races are covered by `EXTERNAL_EDITOR_CONFLICT` where the platform supports detection.

Callers needing stronger guarantees should coordinate externally.

## Worked examples

### Replace a paragraph by block-id

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-25.md",
  "block_id": "intro-summary",
  "content": "Today I shipped patch_block."
}
```

→ envelope `{ path, vault, block_id, block_shape: "paragraph", bytes_written }`.

### Replace a list-item by block-id

```json
{
  "target_mode": "specific",
  "vault": "Work",
  "path": "Projects/Onboarding.md",
  "block_id": "list-item-actionable-7",
  "content": "File expense report"
}
```

→ envelope with `block_shape: "list-item"`. The `-` / `*` / `+` / `N.` list marker and any indentation are preserved byte-stably.

### Replace a separately-placed-marker block

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Reference/Comparison Tables.md",
  "block_id": "table-row-3",
  "content": "| Alpha | Beta |\n| ----- | ---- |\n| 1     | 2    |"
}
```

→ envelope with `block_shape: "separately-placed"`. The `^table-row-3` line bytes are unchanged.

### Clear a paragraph's body via empty content

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-25.md",
  "block_id": "intro-summary",
  "content": ""
}
```

→ envelope with `block_shape: "paragraph"`; output paragraph line becomes ` ^intro-summary` (single space + marker).

### Failure: block-id attached to a heading line

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-25.md",
  "block_id": "heading-marker",
  "content": "..."
}
```

→ `CLI_REPORTED_ERROR` with `details.code: "BLOCK_ON_HEADING"` and `details.heading_shape: "atx" | "setext"`. File on disk is not modified. Route to [`patch_heading`](./patch_heading.md).

### Failure: malformed block-id

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "n.md",
  "block_id": "block_one",
  "content": "..."
}
```

→ `VALIDATION_ERROR` with `details.code: "INVALID_BLOCK_ID"`, `details.reason: "contains-invalid-chars"`, `details.offending_index: 5`. Drop the underscore (alphabet is alphanumeric + hyphen only).
