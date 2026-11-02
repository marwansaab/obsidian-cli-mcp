# Research: Fix section replacement

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **HEAD at research time**: `926bac7`

Findings come from CodeGraph (`codegraph_explore`) and direct reads of the files named. Line numbers are at `926bac7`.

## Findings

### F1. Finding and editing split the note differently

`patch_heading` finds the heading with `walkHeadings` (`src/tools/patch_heading/heading-walk.ts:92`). It splits the raw note through `splitLinesForScan` (`heading-walk.ts:68-71`): `content.split("\n")`, then one trailing `\r` is stripped from each line. Every line feed ends a line, whatever comes before it.

`executePatchHeading` (`src/tools/patch_heading/handler.ts:131-141`) builds the array it edits differently. It calls `detectLineEnding` (`src/tools/patch_heading/body-edit.ts:90`), which returns `"crlf"` if the note contains a single `\r\n` anywhere. It then splits the note on `/\r\n/` in that case, and on `"\n"` otherwise. The heading's line indices (`markerLineIndex`, `reachStartLineIndex`, `directBodyEndLineIndex`, `reachEndLineIndex`) come from the first split. They are applied to the second.

### F2. What the mismatch does

On a uniform note the two splits agree. On a mixed note classified as CRLF, every LF-only line break is not a split point in the edit array, so a run of LF-only lines becomes one element.

- **LF frontmatter, CRLF body** (the shape a property edit leaves on a CRLF note): the frontmatter's k LF-only line breaks are not split points, so the frontmatter and the first body line become one element, and the edit array is k elements shorter above the body. Every body index from the walk therefore addresses the line k lines further down. For a three-line frontmatter (`---`, one property, `---`), k = 3, and the edit lands three lines below the heading, over unrelated text.
- **CRLF frontmatter, LF body**: the whole LF body becomes one or a few elements. The walk's indices point past the end of the edit array. `applyReplace` then keeps the whole note (`lines.slice(0, start)` with `start > lines.length`), adds the new content, and keeps nothing after it (`lines.slice(directBodyEnd)` is empty). The new body is appended at the end of the note, and the heading's old body stays in place.

In both cases `reassemble` (`handler.ts:75-92`) joins the edit array with `\r\n`. LF breaks inside a collapsed element survive as they were, so the result looks plausible.

### F3. The race check does not catch it

The pre-write check (`handler.ts:173-216`) re-reads the note and re-walks it only when the bytes changed since the first read. It then compares heading identity: marker text, rank and parent chain. It never compares the edit array with the walk, so a wrong placement on an unchanged note passes and the write goes ahead.

### F4. All three `patch_heading` modes share the fault

`applyAppend`, `applyPrepend` and `applyReplace` (`body-edit.ts:37-82`) are pure index splices over the same edit array, using the walk's indices. All three land in the wrong place on mixed notes. Spec Context brings `append` and `prepend` into scope for this reason.

### F5. `patch_block` has the same fault

`findBlock` → `scanBlocks` → `splitLinesForScan` (`src/tools/patch_block/block-scan.ts:65-67, 81, 195`) splits on `"\n"` and strips one `\r`. `executePatchBlock` (`src/tools/patch_block/handler.ts:113-123`) uses its own `detectLineEnding` (`src/tools/patch_block/block-edit.ts:121`) and splits on `/\r\n/` for a CRLF note. `patch_block` has no re-read race check. It is in scope by owner ruling (spec Clarifications, Session 2026-11-02).

### F6. The edit helpers never read existing line text

- The three `patch_heading` helpers (`body-edit.ts:37-82`) only slice the `lines` array at indices and insert the split content.
- `applyVerbatimMarkerPreserve` (`block-edit.ts:97-113`) is a pure splice.
- `applyDetachReattach` (`block-edit.ts:54-83`) builds the new marker line from `match.markerLineText` (the scanner's text), never from `lines[i]`.

So the helpers work unchanged on any array whose indices match the scanner's lines, whatever each element holds. This makes D2 possible without changing a helper signature or an existing helper test.

### F7. Published surface and help text

- Neither tool's published description (`src/tools/patch_heading/index.ts:9-28`, `src/tools/patch_block/index.ts:9-29`) nor its schema mentions line endings.
- Each description ends with an enumeration: "Typed errors via `UpstreamError.details.code`: …". It lists every `details.code` the tool can return (`HEADING_NOT_FOUND`, `HEADING_RACE`, … / `BLOCK_NOT_FOUND`, `BLOCK_ON_HEADING`, …). A new `details.code` therefore has to join that list, or the published enumeration becomes incomplete. That is a deliberate change to the description bytes of these two tools (see D6).
- `docs/tools/patch_heading.md` claims, under "Body-shape gotchas", that "the file's detected line ending is used on reassembly" (`:340`) and that "CRLF files stay CRLF; LF files stay LF" (`:342`). Both are wrong for mixed notes, and must be reworded.
- `docs/tools/patch_block.md` says nothing about line endings.
- Both error tables (`patch_heading.md:207-227`, `patch_block.md:166-184`) list the `CLI_REPORTED_ERROR` + `details.code` rows that the new refusal joins.

### F8. Existing test coverage

- `body-edit.test.ts:201-213` and `block-edit.test.ts:197-213` pin `detectLineEnding`.
- `patch_heading/handler.test.ts:189` pins a uniform CRLF note.
- No test anywhere uses a mixed note.
- The handler suites share vitest-free `_handler-fixtures.ts` builders per tool (`fakeFs` with read/write/rename tracking). Spec 075 put extra handler tables in `handler.bytes-written.test.ts` beside `handler.test.ts`.
- The repository has no `vi.mock(` call yet.

### F9. Error convention

Both tools report note-level refusals as `CLI_REPORTED_ERROR` with a `details.code`:

- `HEADING_NOT_FOUND` and `HEADING_RACE` (`patch_heading/handler.ts:146-155, 185-215`);
- `BLOCK_NOT_FOUND` and `BLOCK_ON_HEADING` (`patch_block/handler.ts:127-152`).

`details.reason` (ADR-015) is not used by these rows.

### F10. Lone carriage returns

Both scanners strip one trailing `\r` from every line, including a last line that has no line feed. A note ending in `## H\r` is seen as heading `## H`. Any comparison between the edit array and the scanner's `markerLineText` must apply the same strip, or it would refuse an edit the scanner accepted.

### F11. Sibling with its own splitter (out of scope)

`append_note` has its own `detectLineEnding` (`src/tools/append_note/append-edit.ts:3`), which reads the first line break. It does not use line indices, so it does not have this fault. It is out of scope (spec Out of Scope).

## Decisions

### D1. One shared line model: lines that keep their own terminator

**Decision**: add the cohort leaf module `src/tools/_note-lines.ts`. It imports nothing and owns:

- `splitNoteLines(raw)`: splits on `"\n"`, exactly where both scanners split. Each element is the line's text plus its own terminator (`"\r\n"`, `"\n"`, or `""` for a last line without one). A trailing terminator does not produce a phantom empty last element, as `trimmedForSplit` does today. `""` splits to `[""]`, as today.
- `lineText(line)`: the scanner's view of a line. It drops a trailing `"\n"`, then one trailing `"\r"` (F10).
- `insertEnding(lines, index)`: the FR-005 / FR-015 ending for added lines, as below.
- `joinNoteLines(edited, ending, trailingNewline)`: the reassembly.
- `lineStart(lines, index)`: the byte offset (in UTF-16 units) at which line `index` starts in the original; `lines.length` and beyond give the note's length.
- `keepsOriginalAround(original, edited, prefixEnd, suffixStart)`: the D3 check.

**Insert ending**: the ending of the named line, `"\r\n"` or `"\n"`. If that line has none, use the ending of the nearest earlier line that has one. If no line has one, use `"\n"`. On a uniform note this always equals today's file-wide `detectLineEnding` result (FR-008).

**Join rule**: an element that ends in `"\n"` is an original line and keeps its own terminator. Any other element (a new content line, or the original last line when the note had no final line break) gets `ending` after it, unless it is the last element. Then the same trailing-newline fix-up as today's `reassemble` runs:

- if the note had a final line break and the result does not end in one, append `ending`;
- if it had none and the result ends in one, strip that last terminator, whether it is `"\r\n"` or `"\n"`.

**Rationale**:

- Splitting the edit array where the scanners split makes the indices agree by construction (FR-001, FR-014).
- Keeping each line's own terminator leaves every kept line byte-identical (FR-004, FR-015).
- On a uniform note every terminator equals the file ending, so the output bytes equal today's (FR-008, SC-004).
- One module serves both tools, following the pattern of `_note-io.ts` and `_smart-connections.ts` (Principle I: cohort leaf, imported downward, no tool → tool edge).

**Alternatives considered**:

- *Text array plus a parallel ending array.* The helpers' output does not say which elements are original, so the endings cannot be re-aligned without repeating each helper's splice. Rejected.
- *Change the helpers to return a splice (`{start, deleteCount, insert}`) or take `{text, ending}` records.* This is cleaner in isolation, but it rewrites every helper and every helper test (`body-edit.test.ts`, `block-edit.test.ts`) for no behavioural gain (F6). Per `.memory/refactor-decisions.md` item 5, that test churn needs its own approval. Rejected.
- *Normalise the whole note to one ending before editing.* Violates FR-004 and the spec's Out of Scope.
- *Split the edit array on `/\r?\n/` and keep today's file-wide ending.* The indices would agree, but every kept line would be rewritten to one ending, which violates FR-004. Rejected.

### D2. Handlers use the shared model; the helpers stay as they are

**Decision**:

- `executePatchHeading` replaces `detectLineEnding` + `trimmedForSplit` + `split` with `splitNoteLines(originalContent)`. It passes those lines to the unchanged `applyAppend` / `applyPrepend` / `applyReplace`, and reassembles with `joinNoteLines(edited, insertEnding(lines, resolved.markerLineIndex), trailingNewline)`.
- `executePatchBlock` does the same, using `match.markerLineIndex` for the insert ending.
- Each handler's local `reassemble` is deleted.
- The two `detectLineEnding` exports (`body-edit.ts:90`, `block-edit.ts:121`) are deleted, because the change leaves them unused.
- `detectTrailingNewline` stays; it is still used.
- The helpers' doc comments that say the handler "glues the segments with the file's detected line ending" are corrected.

**Rationale**: this is the smallest change that fixes both tools (F6). Removing the orphaned `detectLineEnding` follows the rule of removing what the change makes unused.

**Test edit this forces** (enumerated per `.memory/refactor-decisions.md` item 5). The owner approved it on 2026-11-02, on one condition: the deletion happens only if no caller of that `detectLineEnding` remains in `src/` after the handler switch; otherwise the export and its tests stay (tasks T007, T013). The edit:

- delete the `describe("detectLineEnding", …)` block (`body-edit.test.ts:201-213`) and its import (`:8`);
- delete the `describe("detectLineEnding (FR-013)", …)` block (`block-edit.test.ts:197-213`) and its import (`:7`).

No other existing assertion changes. The uniform-CRLF handler test (`patch_heading/handler.test.ts:189`) keeps passing unedited (FR-008).

**Alternative considered**: keep `detectLineEnding` exported and tested, with no production caller. That leaves dead code behind. Rejected.

### D3. The safety check before writing (FR-009, FR-016)

**Decision**: after computing `editedContent` and before any further read or write, each handler checks two things.

1. **Agreement**: `lineText(lines[markerLineIndex]) === markerLineText`. This holds for the walk's `resolved` and for the scanner's `match`. It is the check that fails on today's bug (F2).
2. **Kept bytes**: `keepsOriginalAround(original, edited, prefixEnd, suffixStart)` is true. That means `edited` starts with `original.slice(0, prefixEnd)`, ends with `original.slice(suffixStart)`, and `edited.length ≥ prefixEnd + (original.length − suffixStart)`.

The offsets:

| Tool | `prefixEnd` | `suffixStart` |
|------|-------------|---------------|
| `patch_heading` (all modes) | `lineStart(marker) + lineText(lines[marker]).length`: everything up to the end of the heading's text | `lineStart(clamp(reachEndLineIndex))`: everything from the start of the next same-or-higher heading |
| `patch_block` | `lineStart(blockStartLineIndex)` | `lineStart(blockEndLineIndex + 1)`: for paragraph and list item that is the line after the marker line; for a separately placed block it is the kept marker-only line |

The `patch_heading` offsets are the same for all three modes: no mode changes bytes before the end of the heading line or from the next same-or-higher heading on. This is what the spec's acceptance criterion states, and it avoids repeating each helper's index logic. The prefix stops before the heading line's terminator, because when the heading becomes the last line of a note with no final line break, today's trailing-newline rule strips that terminator.

**On failure**: throw `UpstreamError` with `code: "CLI_REPORTED_ERROR"`, `cause: null` and `details: { code: "UNSAFE_PLACEMENT", heading_path | block_id, path }`. The message says the edit could not be placed safely and the note was not changed. Nothing is written.

In `patch_heading` the check runs before the race re-read, so a refusal costs no second read.

**Rationale**:

- The check costs two string comparisons, and it turns any future index disagreement into a failed call instead of silent damage (spec Story 4 and Story 5).
- `CLI_REPORTED_ERROR` + `details.code` is the convention both tools already use for note-level refusals (F9), so there is no new top-level code (Principle IV, FR-010).
- `UNSAFE_PLACEMENT` names the condition in the style of `HEADING_RACE` and `BLOCK_ON_HEADING`.

**Alternatives considered**:

- *`INTERNAL_ERROR`.* It is reserved for an output-contract break (`.memory/refactor-decisions.md` item 6), and agents of these tools already branch on `CLI_REPORTED_ERROR` + `details.code`. Rejected.
- *Re-walk the edited note and compare.* This costs a full rescan, and it does not prove that the bytes outside the edit are unchanged. Rejected.
- *A mode-specific suffix (direct-body end for `replace`).* Stronger for `replace`, but it duplicates the helper's clamp logic. The mode-independent bounds already cover the spec's guarantee. Rejected.

### D4. How the refusal is tested

**Decision**:

- `_note-lines.test.ts` pins `keepsOriginalAround` and `lineText` directly, including the F10 lone-CR case.
- One new file per tool, `handler.unsafe-placement.test.ts`, forces a wrong index through the real handler. It uses `vi.mock` with `importOriginal` on `./heading-walk.js` (shifting `walkHeadings`' result by one line) or `./block-scan.js` (shifting `findBlock`'s result). It asserts `CLI_REPORTED_ERROR` / `UNSAFE_PLACEMENT` with the expected details, and that the fake fs recorded no write and no rename.

**Rationale**: once the fix lands, no real note can reach the refusal. A module mock is the only way to drive the handler wiring without adding a production seam that exists only for tests. Each mock is confined to its own file because `vi.mock` is hoisted per module. This is the repository's first `vi.mock`, and the plan records it.

**Alternative considered**: an injectable walker in `ExecuteDeps`. That adds production surface for a test, and it touches the deps types that `server.ts` builds. Rejected.

### D5. Tests for the fix itself

**Decision**: new co-located files.

- `src/tools/_note-lines.test.ts`: split, text, insert-ending, join and the check, as pure functions, including empty notes, no final line break, the lone CR, `\r\r\n`, and mixed runs.
- `src/tools/patch_heading/handler.line-endings.test.ts`: the contract's H-rows. Mixed fixtures in both directions; first, middle and last heading; all three modes; mixed-against-uniform equivalence; kept line endings; final line break kept; uniform notes byte-identical to the pre-change expectation.
- `src/tools/patch_block/handler.line-endings.test.ts`: the contract's B-rows. The three block shapes in both mixed directions, the equivalence, kept line endings, uniform notes unchanged.

Fixtures are built from one LF template with a converter, so each mixed note and its uniform twin share their text by construction.

**Rationale**:

- This covers spec FR-013 and FR-018.
- It follows the spec 075 `handler.<topic>.test.ts` split, and it reuses each tool's vitest-free `_handler-fixtures.ts` (`fakeFs` tracks writes) without editing it, unless a builder is missing; any addition stays vitest-free.

### D6. Documentation, surface and changelog

**Decision**:

- In `docs/tools/patch_heading.md`, reword "Body-shape gotchas" `:340` and `:342`: kept lines keep their own endings, added lines take the heading line's ending, and mixed notes are supported. Add an `UNSAFE_PLACEMENT` row to the error table.
- In `docs/tools/patch_block.md`, add a line-endings sentence (same rule, with the block's marker line) and an `UNSAFE_PLACEMENT` row.
- In `CHANGELOG.md`, add the `Spec 086-fix-section-replacement (BI-0168).` line under `[Unreleased]`, plus a Fixed entry.
- In each tool's description enumeration (`index.ts`), add `UNSAFE_PLACEMENT` with a short recovery note ("note unchanged; re-read and retry once"), so the list stays complete (F7). The long-form trigger and recovery go to the help pages, following the ADR-040 split.
- Regenerate `_register-baseline.json` with `npm run baseline:write`. Exactly two lines may move: the `descriptionFingerprint` of `patch_heading` and of `patch_block`. Titles, annotations and input and output schema fingerprints stay byte-identical (spec FR-011, FR-017, SC-006). This mirrors spec 085's surface gate.

**Alternative considered**: leave the descriptions alone, so the baseline does not move. The enumerations would then be incomplete for a code these tools can return. Rejected. FR-011 and FR-017 fix the schemas, response shape and annotations, not the description text.

### D7. Live reproduction (optional, recorded)

**Decision**: quickstart §3 gives a T0-style live check in `TestVault-Obsidian-CLI-MCP/Sandbox/`, under `.memory/test-execution-instructions.md`:

1. Seed a CRLF note with three headings.
2. Call `set_property` on it, which produces the LF-frontmatter mix.
3. Confirm the mix on disk.
4. Call `patch_heading` `replace` on the last heading, and `patch_block` on a bound paragraph.
5. Check that the bytes outside the edit are unchanged.
6. Clean up.

Before the fix this shows the corruption; after it, the check passes. It is optional because the unit suites are the gate. When run, the result is recorded in post-implement.

## Open items

None. No `NEEDS CLARIFICATION` remains.
