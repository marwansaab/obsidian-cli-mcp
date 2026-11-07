# `patch_heading`

## Overview

`patch_heading` surgically rewrites the body under a named heading inside a markdown note, addressed by its full hierarchical path through the note's heading hierarchy. Writes go directly to the vault filesystem; no per-call content size cap.

## When to use this tool

| You want to | Reach for |
|---|---|
| Insert/replace text **under a specific heading** in an existing note | `patch_heading` |
| Replace the body tied to a `^block-id` marker | [`patch_block`](./patch_block.md) |
| Create a new note, or wholesale-replace an existing note's contents | [`write_note`](./write_note.md) |
| Append at the end of an existing note | [`append_note`](./append_note.md) |
| Prepend at the start of an existing note | [`prepend`](./prepend.md) |
| Find/replace text patterns across many regions | [`find_and_replace`](./find_and_replace.md) |
| Read a heading's body (no write) | [`read_heading`](./read_heading.md), [`outline`](./outline.md) |
| Patch a level-1 section (one-segment path) or any unreachable section | Not addressable by `patch_heading`; use `write_note` to rewrite the whole note. |

## Input schema

The schema is strict: `additionalProperties: false`. Unknown fields trigger `VALIDATION_ERROR`.

### Specific mode

```json
{
  "target_mode": "specific",
  "vault": "<vault name>",
  "path": "<vault-relative path>",
  "heading_path": "<segment>#<segment>#…",
  "mode": "append" | "prepend" | "replace",
  "content": "<text to insert or swap in>"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `target_mode` | `"specific" \| "active"` | YES | Discriminator. |
| `vault` | string ≥ 1 char | iff specific | Resolved via the lazy vault registry. Unknown vault → `VALIDATION_ERROR`. |
| `file` | string ≥ 1 char (structurally safe) | XOR with `path`, iff specific | Note name, resolved like a wikilink (e.g. "Meeting Notes", "Projects/Meeting Notes" or "Meeting Notes.md"). A pre-flight `obsidian file` call resolves the name to a vault-relative path before the note is read; the edit and the response's `path` use that path. A name two notes share resolves to the same note `read` picks. |
| `path` | string ≥ 1 char (structurally safe) | XOR with `file`, iff specific | Vault-relative file path. |
| `heading_path` | string, 1–1000 chars | YES | Starts at the note's level-1 heading, one segment per level; the target is level 2 or deeper, so at least two segments. See *The heading_path locator* below. |
| `mode` | `"append" \| "prepend" \| "replace"` | YES | See *Three placement modes* below. |
| `content` | string | YES | Non-empty for append/prepend; any (including empty) for replace. |

### Active mode

```json
{
  "target_mode": "active",
  "heading_path": "<segment>#<segment>#…",
  "mode": "append" | "prepend" | "replace",
  "content": "<text>"
}
```

The wrapper resolves the focused note via a small `obsidian eval` call. When no note is focused, `ERR_NO_ACTIVE_FILE` fires with no filesystem access.

## Three placement modes

### `append` — extend the heading's full reach

`append` inserts content at the **end of the heading's reach**, right after its last non-blank line. The reach runs to the next equal-or-higher-rank heading, or to end-of-file if no such heading follows. Blank (empty or whitespace-only) lines that close the reach stay after the new content, so they still separate it from the next heading. Preserves the existing direct body, any child-heading subtrees, and every subsequent heading.

```markdown
### TODO          ← target
- existing item   ← last non-blank line of the reach
                  ← blank line
### Done          ← reach ends here
- done item
```

After `mode: "append"` with `content: "- new item\n"`:

```markdown
### TODO
- existing item
- new item

### Done
- done item
```

The new bullet extends the list, and the blank line stays before `### Done`. A table row appended under a table becomes its last row the same way.

The content is joined to the last line as it is, so a paragraph appended after a paragraph continues it. To start a separate block, begin `content` with a blank line (`"\nNew paragraph."`). A section with an empty or blank-only body takes the content directly after the heading line.

### `prepend` — land immediately after the marker line

`prepend` inserts content at the line **immediately after** the heading marker. When the marker is followed by a child heading (adjacency case), the content lands between the two markers — equivalent to a lead-in before the child subtree starts.

```markdown
## Notes          ← target
A quick thought.
```

After `mode: "prepend"` with `content: "(see also: yesterday's retrospective)\n\n"`:

```markdown
## Notes
(see also: yesterday's retrospective)

A quick thought.
```

### `replace` — swap the direct body, preserve child subtrees

`replace` swaps the **direct body only** — the lines from the marker through to the first child heading (or, when no child exists, through to the next equal-or-higher-rank heading). The marker line itself is preserved; every child subtree from the first child onward is preserved unchanged.

```markdown
### Done          ← target
- old item
                  ← direct body
### Archive       ← (would be a child — preserved if present)
```

After `mode: "replace"` with `content: "- new item\n"`:

```markdown
### Done
- new item
### Archive
```

**Asymmetric empty-content rule**: `replace` accepts empty content as the legitimate "clear the body" operation. `append` and `prepend` reject empty content with `VALIDATION_ERROR + details.code: "EMPTY_CONTENT" + details.reason: <mode>`.

## The heading_path locator

### Heading-path rule

The path starts at the note's level-1 heading and names one heading per level down to the target: each later segment is the heading exactly one level below the previous one. A level-3 target therefore needs three segments:

```
"Project#Tasks#Today"   →  # Project / ## Tasks / ### Today
"Project#Tasks"         →  # Project / ## Tasks
```

Leaving out the level-1 heading (`"Tasks#Today"`) fails with `HEADING_NOT_FOUND`, even though both headings exist in the note.

### Path format

The `heading_path` parameter is a single string addressing a heading by its full hierarchical path. Segments are joined by the literal `#` character (matching Obsidian wikilink anchors like `[[note#Top#Sub]]`):

```
"Daily#Tasks#TODO"   →  # Daily / ## Tasks / ### TODO
"Projects#Active"    →  # Projects / ## Active
"Top#Sub#Leaf"       →  # Top / ## Sub / ### Leaf
```

Constraints:

- **At least two segments** — the target is level 2 or deeper, and the path names the level-1 heading first. A one-segment path is rejected with `heading_path must contain at least two segments separated by '#'; top-level headings are out of scope`. This message refers to addressing a level-1 heading on its own (a one-segment path); it does not mean the level-1 heading is left out — every path still starts at the level-1 heading. To rewrite a level-1 section's body, use [`write_note`](./write_note.md) to rewrite the whole note.
- **No segment may be empty** — `Top##Sub` (empty middle), `#Sub` (leading `#`), and `Top#Sub#` (trailing `#`) all surface `INVALID_HEADING_PATH + details.reason: "empty-segment"`.
- **Maximum 1000 UTF-16 code units** — longer paths surface `INVALID_HEADING_PATH + details.reason: "too-long"`.

### Unreachable sections

No `heading_path` can reach the following sections. For each, use [`write_note`](./write_note.md) to rewrite the whole note:

- **A level-1 section by itself** (`heading_path: "Daily"` with no `#`): the validator rejects one-segment paths. Fallback: [`write_note`](./write_note.md).
- **Any section in a note with no level-1 heading** (e.g. a note whose top heading is `## Section`): every path starts at the level-1 heading, so there is nothing to start from. Fallback: [`write_note`](./write_note.md).
- **Any section below a skipped level** (e.g. `### Orphan` directly under `# Other`, with no `##` between them): each segment must be exactly one level below the previous, so no path names `### Orphan` or anything under it. Fallback: [`write_note`](./write_note.md).
- **Headings whose literal text contains `#`**: the `#` character is reserved as the path separator; no escaping mechanism is provided. This matches Obsidian's own wikilink-anchor behaviour. Fallback: [`write_note`](./write_note.md).

A skipped level only blocks the sections at and below the skip on that branch: a skip below the target (for example a `####` directly under the `##` you want), or a skip in another branch of the note, does not block the target. When a note has several level-1 headings, a path may start at any of them.

### Matching

Matching is **case-sensitive and whitespace-strict**. `## Tasks` and `## tasks` are different headings; `## Tasks ` (trailing space) and `## Tasks` are different headings.

**First-match-wins on duplicate siblings**: if `## Notes` appears twice under `# Daily`, the path `Daily#Notes` resolves to the first occurrence in document order. The match commits forward; the second occurrence is not reconsidered. Use a more specific ancestor chain or rename the duplicate to disambiguate.

**ATX headings only**: `# Heading` syntax is supported; setext headings (text underlined with `===` or `---`) are NOT recognised. Fenced-code blocks are opaque to the walker — `#`-prefixed lines inside ` ``` ` or `~~~` fences are not interpreted as headings.

## Active-mode focused-note locator

In active mode, the wrapper resolves the focused note via a small `eval`:

```javascript
JSON.stringify({
  path: app.workspace.getActiveFile()?.path ?? null,
  base: app.vault.adapter.basePath,
})
```

The returned `path` is the vault-relative path of the focused file (or `null` when nothing is focused). On `null`, `ERR_NO_ACTIVE_FILE` fires and no filesystem read occurs. On success, the rest of the chain (path-safety check, `fs.readFile`, heading walk, race-check, write) runs against the resolved path — identical to specific mode from that point.

## Output envelope

```json
{
  "path": "Daily Notes/2026-05-21.md",
  "vault": "Knowledge",
  "heading_path": "Daily#Tasks#TODO",
  "mode": "append",
  "bytes_written": 23
}
```

| Field | Meaning |
|---|---|
| `path` | Vault-relative path of the note that was patched. For a `path` input, echoes it; for a `file` name, the path the name resolved to; for active mode, the focused-file path returned by the eval. |
| `vault` | Vault display name. For specific mode, echoes the input's `vault`. For active mode, the display name resolved via the registry's reverse lookup (`basePath → name`, re-reading Obsidian's vault list once on a miss). It is never the basePath: a basePath that is not a registered vault fails with `VAULT_NOT_FOUND` / `focused-unregistered`. |
| `heading_path` | The supplied path, echoed verbatim. |
| `mode` | The placement mode that was applied. |
| `bytes_written` | Change in the note's size in bytes caused by this write: its size after the write minus its size before, counting a note that did not exist as 0. Zero when the size did not change; negative when the note shrank. To verify a write, compare `bytes_written` with the size change you intended; 0 and negative values are normal for same-size and shrinking edits. |

## Errors — Error states

Every failure routes through `UpstreamError`. A schema-layer rejection that carries a `details.code` (`INVALID_HEADING_PATH`, `EMPTY_CONTENT`) has the broken rule's own text as its top-level `message`, and keeps the generic `details.issues` list beside `details.code`, `details.reason` and any extra key.

| Top-level `code` | `details.code` | `details.reason` | Trigger |
|---|---|---|---|
| `VALIDATION_ERROR` | `INVALID_HEADING_PATH` | `empty` | `heading_path: ""` |
| | | `single-segment` | `heading_path: "Tasks"` (only one segment) |
| | | `empty-segment` | `Top##Sub`, `#Top`, `Top#` (also carries `details.segment_index`) |
| | | `too-long` | `>1000` UTF-16 units (also carries `details.value_length`) |
| | | `contains-hash` | Defensive sentinel (unreachable via split-on-`#`) |
| `VALIDATION_ERROR` | `EMPTY_CONTENT` | `append` | `mode: "append"` + `content: ""` |
| | | `prepend` | `mode: "prepend"` + `content: ""` |
| `CLI_REPORTED_ERROR` | `HEADING_NOT_FOUND` | — | The supplied `heading_path` does not resolve to any heading in the note. Most often the path leaves out the level-1 heading or skips a level; check that first. Then use [`outline`](./outline.md) to list the file's headings and retry. |
| `CLI_REPORTED_ERROR` | `HEADING_RACE` | — | The heading hierarchy along the resolved path changed between resolve and pre-write re-walk. Retry the call against the new state, or coordinate with the other writer externally. Carries `details.original_identity` and `details.current_identity` (3-tuples). Sibling [`patch_block`](./patch_block.md) publishes no race code; concurrent calls there resolve last-write-wins. |
| `CLI_REPORTED_ERROR` | `UNSAFE_PLACEMENT` | — | The edit could not be placed safely under the named heading, so the tool refused it. The note was not changed. Re-read the note and retry once; if it fails again, report it. This should not happen on any note. Carries `details.heading_path` and `details.path`. |
| `CLI_REPORTED_ERROR` | `EXTERNAL_EDITOR_CONFLICT` | `file-locked` | OS-level `fs.rename` / `fs.writeFile` failed with `EBUSY`/`EPERM`/`EACCES`. Ask the user to save and close the file in the external editor, then retry. Carries `details.errno` and `details.path`. |
| | | `unsaved-changes` | Reserved for forward compatibility; the wrapper never emits it today. |
| `CLI_REPORTED_ERROR` | — | — | A `file` name matches no note. The message is Obsidian's own, `Error: File "<name>" not found.`, the same failure [`read`](./read.md) returns for that name. Nothing is read or written. Check the name, or pass the note's `path`. |
| `PATH_ESCAPES_VAULT` | — | — | Canonical-path check detected a symlink escape. The message is the generic `CLI bridge upstream error: PATH_ESCAPES_VAULT`; `details: { vault, attemptedPath, resolvedPath }`. Fix the path. |
| `FS_WRITE_FAILED` | — | — | Generic `fs` failure not classified as `EXTERNAL_EDITOR_CONFLICT` (e.g. `ENOSPC`, `EROFS`, or `ENOENT` on a non-existent target — `patch_heading` does not create files). |
| `VALIDATION_ERROR` | — | — | Unknown vault, registry lookup failure (existing top-level surface). An unregistered `vault` carries `details.requestedVault` / `details.knownVaults`. |
| `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `folder-missing` | The vault is registered, but its folder is missing on disk (`details.vault`; no disk path in the message). Nothing is read or written. Ask the user to restore the folder, or re-open the vault in Obsidian, then call again. |
| `CLI_REPORTED_ERROR` | `VAULT_NOT_FOUND` | `focused-unregistered` | Active mode, and the focused vault's folder matches no vault Obsidian lists (no disk path in the message or `details`). Nothing is read or written. Call again in specific mode with `vault`, or ask the user to re-open the vault in Obsidian. |
| `CLI_REPORTED_ERROR` | — | — (carries `details.stage: "vault-root-check"`, `details.errno`, `details.vault`) | The vault's folder could not be checked for another reason. Nothing is read or written. Inspect `details.errno` (for example a permission problem). |
| `ERR_NO_ACTIVE_FILE` | — | — | Active mode with no focused note. Open a note in the editor, or call again with `target_mode: "specific"` + an explicit `vault` + `file`/`path`. |

## Platform-specific behaviour: EXTERNAL_EDITOR_CONFLICT

The `EXTERNAL_EDITOR_CONFLICT` signal is **platform-dependent**:

- **Windows**: when an external editor (including Obsidian's main editor with unsaved changes) holds the target file with `CreateFile` flags that omit `FILE_SHARE_DELETE`, the substrate's `fs.rename` throws `EBUSY` (some share modes surface `EPERM` instead). The wrapper catches this and surfaces `EXTERNAL_EDITOR_CONFLICT + details.reason: "file-locked" + details.errno`.
- **Linux / macOS**: POSIX `rename(2)` does not honour open file handles; the substrate's `fs.rename` succeeds even when an editor is holding the file with unsaved in-memory changes. The patch lands on disk and the editor sees a refreshed file on next focus — **no `EXTERNAL_EDITOR_CONFLICT` fires**.

Callers automating against multi-platform deployments must plan around this divergence. The wrapper has no cross-platform signal to fail on for in-memory dirty editor state.

## Examples — Worked examples

### Append a new TODO bullet

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

The path runs from the level-1 heading (`# Daily`) to the level-3 target (`### TODO`), one segment per level.

### Clear a heading's body via replace + empty content

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

### Append against the focused note (active mode)

```json
{
  "target_mode": "active",
  "heading_path": "Daily#Tasks#TODO",
  "mode": "append",
  "content": "- Order lunch\n"
}
```

### Heading-not-found error envelope

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "HEADING_NOT_FOUND",
    "heading_path": "Daily#Phantom",
    "path": "Daily Notes/2026-05-21.md"
  },
  "message": "Heading \"Daily#Phantom\" not found in \"Daily Notes/2026-05-21.md\""
}
```

Most often the path leaves out the level-1 heading or skips a level; check that first. Then use [`outline`](./outline.md) to list the note's headings and retry.

### Level-1 segment left out (heading-not-found)

The `Daily Notes/2026-05-21.md` note has `# Daily` / `## Tasks` / `### TODO`. A path that starts at `## Tasks` fails, even though both headings exist:

```json
{
  "target_mode": "specific",
  "vault": "Knowledge",
  "path": "Daily Notes/2026-05-21.md",
  "heading_path": "Tasks#TODO",
  "mode": "append",
  "content": "- File expense report\n"
}
```

```json
{
  "code": "CLI_REPORTED_ERROR",
  "details": {
    "code": "HEADING_NOT_FOUND",
    "heading_path": "Tasks#TODO",
    "path": "Daily Notes/2026-05-21.md"
  },
  "message": "Heading \"Tasks#TODO\" not found in \"Daily Notes/2026-05-21.md\""
}
```

The corrected path starts at the level-1 heading: `"Daily#Tasks#TODO"`.

### Empty-content rejection for append

```json
{
  "code": "VALIDATION_ERROR",
  "details": {
    "code": "EMPTY_CONTENT",
    "reason": "append",
    "mode": "append",
    "issues": [
      {
        "path": ["content"],
        "message": "content must be non-empty for mode='append'; use mode='replace' to clear a heading's direct body",
        "code": "custom"
      }
    ]
  },
  "message": "content must be non-empty for mode='append'; use mode='replace' to clear a heading's direct body"
}
```

## Body-shape gotchas

- **Multi-line content**: split on `\n` (or `\r\n` for CRLF) by the wrapper; the added lines take the heading line's line ending. Include a trailing `\n` in your content if you want it to occupy its own line(s); omit it if you want the inserted content to abut the next existing line.
- **Trailing newline preservation**: a file that ended with `\n` still does after edit; a file that did not still does not.
- **Line endings**: the note may mix LF and CRLF (a property edit can leave an LF frontmatter on a CRLF note). Every line outside the edit keeps its own line ending; lines the edit adds take the heading line's line ending (or, if the heading is the note's last line and has none, the nearest earlier line's; LF if the note has no line breaks). No normalisation.
- **Frontmatter preservation**: the YAML frontmatter block (`---\n…\n---`) is byte-identical before and after patching. The walker recognises ATX headings only and the splice operates strictly within the targeted heading's reach.
- **No backups taken**: the wrapper writes via atomic temp+rename. No `.bak`/`.backup`/`.old` files are created.
- **No streaming**: whole-file read/write only. For very large notes, `find_and_replace` or `write_note` may be better matches.
