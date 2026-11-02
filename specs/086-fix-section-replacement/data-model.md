# Data Model: Fix section replacement

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

This feature has no stored data and no schema change. The "data" is the in-memory view of one note during one edit call. The entities below are that view.

## E1. Raw note

The note's text as read from disk (`fs.readFile(…, "utf8")`): a string, compared and written byte-for-byte.

- **Line break**: a `"\n"`, optionally preceded by `"\r"` (then the break is `"\r\n"`). A `"\r"` not followed by `"\n"` is an ordinary character.
- **Final line break**: `true` iff the raw note ends with `"\n"` (`detectTrailingNewline`, unchanged).
- **Uniform / mixed**: uniform when every line break has the same form, mixed otherwise.

## E2. Note line (new, `_note-lines.ts`)

One element of `splitNoteLines(raw)`: the line's own text plus its own terminator.

| Part | Value | Rule |
|------|-------|------|
| terminator | `"\r\n"`, `"\n"`, or `""` | `""` only on the last element, and only when the note has no final line break |
| text (scanner view) | `lineText(line)` | drop a trailing `"\n"`, then one trailing `"\r"`; equals both scanners' `splitLinesForScan` element at the same index (research F10) |

**Invariants**:

- **V1, index agreement**: for every index `i` below the scanner's content-line count, `lineText(splitNoteLines(raw)[i]) === splitLinesForScan(raw)[i]`. The heading walk's and the block scanner's indices therefore address the same line in the edit array.
- **V2, lossless**: `splitNoteLines(raw).join("") === raw`.
- **V3, no phantom**: a raw note ending in a line break does not produce an empty last element. `""` gives `[""]`.

## E3. Edit point

Where the edit removes or inserts lines. The indices come from the unchanged finders.

| Tool / mode | Lines replaced or insertion index | Source |
|-------------|-----------------------------------|--------|
| `patch_heading` `replace` | `[reachStartLineIndex, directBodyEndLineIndex)` | `ResolvedHeading` (`heading-walk.ts:3`) |
| `patch_heading` `append` | insert at `reachEndLineIndex` | same |
| `patch_heading` `prepend` | insert at `markerLineIndex + 1` | same |
| `patch_block`, paragraph or list item | `[markerLineIndex, markerLineIndex]` (marker line rebuilt) | `BlockMatch` (`block-scan.ts:10`) |
| `patch_block`, separately placed | `[blockStartLineIndex, blockEndLineIndex]` (marker-only line kept) | same |

The splice helpers (`applyAppend`, `applyPrepend`, `applyReplace`, `applyDetachReattach`, `applyVerbatimMarkerPreserve`) are unchanged. They receive E2 lines and return E2 lines (kept) mixed with new, terminator-less content lines.

## E4. Insert ending (FR-005, FR-015)

`insertEnding(lines, anchor)` is the ending given to every added line and to any kept line that needs a terminator because a line now follows it.

- **anchor**: `markerLineIndex` for both tools.
- **Rule**: the anchor line's terminator if it has one; else the terminator of the nearest earlier line that has one; else `"\n"`.
- **V4**: on a uniform note, the insert ending equals the note's single line-break form, which is today's `detectLineEnding` result.

## E5. Edited note

`joinNoteLines(edited, insertEnding, finalLineBreak)`:

1. An element ending in `"\n"` is written as it is. Any other element is followed by the insert ending, unless it is the last element.
2. Fix-up, as in today's `reassemble`: if the note had a final line break and the result lacks one, append the insert ending. If it had none and the result ends with a line break, strip that one terminator (`"\r\n"` or `"\n"`).

**Invariants**:

- **V5, kept endings**: every kept original line keeps its terminator, except where V5a applies.
- **V5a**: the kept line that becomes the new last line of a note with no final line break loses its terminator. This is today's rule.
- **V6, uniform identity**: on a uniform note the output equals today's output byte-for-byte.
- **V7, equivalence**: two notes that differ only in line-break forms give outputs that differ only in line-break forms.

## E6. Placement check (FR-009, FR-016)

The check runs on (raw note, edited note, `prefixEnd`, `suffixStart`). The offsets are computed from E2 with `lineStart`.

| Tool | `prefixEnd` | `suffixStart` |
|------|-------------|---------------|
| `patch_heading` | end of the heading line's text (before its terminator) | start of line `min(reachEndLineIndex, lines.length)` |
| `patch_block` | start of line `blockStartLineIndex` | start of line `blockEndLineIndex + 1` |

**Passes iff all three hold**:

- **A, agreement**: `lineText(lines[markerLineIndex]) === markerLineText`.
- **B, prefix kept**: `edited.startsWith(raw.slice(0, prefixEnd))`.
- **C, suffix kept, no overlap**: `edited.endsWith(raw.slice(suffixStart))` and `edited.length >= prefixEnd + (raw.length − suffixStart)`.

**On failure**: `UpstreamError { code: "CLI_REPORTED_ERROR", cause: null, details: { code: "UNSAFE_PLACEMENT", heading_path | block_id, path } }`. No write and no rename happen. In `patch_heading` the race re-read does not run either.

## State flow (per call; only the bold steps are new or changed)

```text
read raw ─▶ find (walkHeadings / findBlock, unchanged)
        ─▶ **splitNoteLines(raw)**
        ─▶ splice helper (unchanged)
        ─▶ **joinNoteLines(…, insertEnding(lines, marker), finalLineBreak)**
        ─▶ **placement check** ──fail──▶ UNSAFE_PLACEMENT (no write)
        ─▶ [patch_heading: race re-read + identity check, unchanged]
        ─▶ writeAtomic ─▶ metadata refresh ─▶ success envelope (unchanged)
```
