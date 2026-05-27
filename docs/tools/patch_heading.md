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
| Patch a top-level heading (1-segment path) | Out of scope — `patch_heading` requires ≥2 segments. Use `write_note` to rewrite the whole note, or wrap the top-level heading in a parent. |

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
| `file` | string ≥ 1 char (structurally safe) | XOR with `path`, iff specific | Vault-relative file path. |
| `path` | string ≥ 1 char (structurally safe) | XOR with `file`, iff specific | Vault-relative file path. |
| `heading_path` | string, 1–1000 chars, ≥2 segments | YES | See *The heading_path locator* below. |
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

`append` inserts content at the **end of the heading's reach**: immediately before the next equal-or-higher-rank heading, or at end-of-file if no such heading follows. Preserves the existing direct body, any child-heading subtrees, and every subsequent heading.

```markdown
### TODO          ← target
- existing item
                  ← blank line preserved
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

The new bullet lands at the line immediately before `### Done`. The intervening blank stays where it was.

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

The `heading_path` parameter is a single string addressing a heading by its full hierarchical path. Segments are joined by the literal `#` character (matching Obsidian wikilink anchors like `[[note#Top#Sub]]`):

```
"Daily#Tasks#TODO"   →  # Daily / ## Tasks / ### TODO
"Projects#Active"    →  # Projects / ## Active
"Top#Sub#Leaf"       →  # Top / ## Sub / ### Leaf
```

Constraints:

- **Minimum two segments** — top-level headings (a path that addresses a `# H1` directly) are out of scope. To rewrite a top-level heading's body, use [`write_note`](./write_note.md) to rewrite the whole note.
- **No segment may be empty** — `Top##Sub` (empty middle), `#Sub` (leading `#`), and `Top#Sub#` (trailing `#`) all surface `INVALID_HEADING_PATH + details.reason: "empty-segment"`.
- **Maximum 1000 UTF-16 code units** — longer paths surface `INVALID_HEADING_PATH + details.reason: "too-long"`.
- **Headings whose literal text contains `#` are permanently unreachable** through this tool. The `#` character is reserved as the path separator; no escaping mechanism is provided. This matches Obsidian's own wikilink-anchor behaviour.

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
  "bytes_written": 412
}
```

| Field | Meaning |
|---|---|
| `path` | Vault-relative path of the note that was patched. For specific mode, echoes the input's `file`/`path`. For active mode, the focused-file path returned by the eval. |
| `vault` | Vault display name. For specific mode, echoes the input's `vault`. For active mode, the display name resolved via the registry's reverse lookup (`basePath → name`), falling back to the basePath literal if the basePath is not a registered vault. |
| `heading_path` | The supplied path, echoed verbatim. |
| `mode` | The placement mode that was applied. |
| `bytes_written` | UTF-8 byte count of the final on-disk content. A near-zero value when the caller intended a substantial write is a red flag worth auditing. |

## Error states

Every failure routes through `UpstreamError`.

| Top-level `code` | `details.code` | `details.reason` | Trigger |
|---|---|---|---|
| `VALIDATION_ERROR` | `INVALID_HEADING_PATH` | `empty` | `heading_path: ""` |
| | | `single-segment` | `heading_path: "Tasks"` (only one segment) |
| | | `empty-segment` | `Top##Sub`, `#Top`, `Top#` (also carries `details.segment_index`) |
| | | `too-long` | `>1000` UTF-16 units (also carries `details.value_length`) |
| | | `contains-hash` | Defensive sentinel (unreachable via split-on-`#`) |
| `VALIDATION_ERROR` | `EMPTY_CONTENT` | `append` | `mode: "append"` + `content: ""` |
| | | `prepend` | `mode: "prepend"` + `content: ""` |
| `CLI_REPORTED_ERROR` | `HEADING_NOT_FOUND` | — | The supplied `heading_path` does not resolve to any heading in the note. Use [`outline`](./outline.md) to enumerate the file's actual headings, then retry with a valid path. |
| `CLI_REPORTED_ERROR` | `HEADING_RACE` | — | The heading hierarchy along the resolved path changed between resolve and pre-write re-walk. Retry the call against the new state, or coordinate with the other writer externally. Carries `details.original_identity` and `details.current_identity` (3-tuples). |
| `CLI_REPORTED_ERROR` | `EXTERNAL_EDITOR_CONFLICT` | `file-locked` | OS-level `fs.rename` / `fs.writeFile` failed with `EBUSY`/`EPERM`/`EACCES`. Ask the user to save and close the file in the external editor, then retry. Carries `details.errno` and `details.path`. |
| | | `unsaved-changes` | Reserved for forward compatibility; the wrapper never emits it today. |
| `PATH_ESCAPES_VAULT` | — | — | Canonical-path check detected a symlink escape. Fix the path. |
| `FS_WRITE_FAILED` | — | — | Generic `fs` failure not classified as `EXTERNAL_EDITOR_CONFLICT` (e.g. `ENOSPC`, `EROFS`, or `ENOENT` on a non-existent target — `patch_heading` does not create files). |
| `VALIDATION_ERROR` | — | — | Unknown vault, registry lookup failure (existing top-level surface). |
| `ERR_NO_ACTIVE_FILE` | — | — | Active mode with no focused note. Open a note in the editor, or call again with `target_mode: "specific"` + an explicit `vault` + `file`/`path`. |

## Platform-specific behaviour: EXTERNAL_EDITOR_CONFLICT

The `EXTERNAL_EDITOR_CONFLICT` signal is **platform-dependent**:

- **Windows**: when an external editor (including Obsidian's main editor with unsaved changes) holds the target file with `CreateFile` flags that omit `FILE_SHARE_DELETE`, the substrate's `fs.rename` throws `EBUSY` (some share modes surface `EPERM` instead). The wrapper catches this and surfaces `EXTERNAL_EDITOR_CONFLICT + details.reason: "file-locked" + details.errno`.
- **Linux / macOS**: POSIX `rename(2)` does not honour open file handles; the substrate's `fs.rename` succeeds even when an editor is holding the file with unsaved in-memory changes. The patch lands on disk and the editor sees a refreshed file on next focus — **no `EXTERNAL_EDITOR_CONFLICT` fires**.

Callers automating against multi-platform deployments must plan around this divergence. The wrapper has no cross-platform signal to fail on for in-memory dirty editor state.

## Worked examples

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

### Empty-content rejection for append

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

## Body-shape gotchas

- **Multi-line content**: split on `\n` (or `\r\n` for CRLF) by the wrapper; the file's detected line ending is used on reassembly. Include a trailing `\n` in your content if you want it to occupy its own line(s); omit it if you want the inserted content to abut the next existing line.
- **Trailing newline preservation**: a file that ended with `\n` still does after edit; a file that did not still does not.
- **Line-ending preservation**: CRLF files stay CRLF; LF files stay LF. No platform normalisation.
- **Frontmatter preservation**: the YAML frontmatter block (`---\n…\n---`) is byte-identical before and after patching. The walker recognises ATX headings only and the splice operates strictly within the targeted heading's reach.
- **No backups taken**: the wrapper writes via atomic temp+rename. No `.bak`/`.backup`/`.old` files are created.
- **No streaming**: whole-file read/write only. For very large notes, `find_and_replace` or `write_note` may be better matches.
