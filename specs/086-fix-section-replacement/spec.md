# Feature Specification: Fix section replacement

**Feature Branch**: `086-fix-section-replacement`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Fix section replacement — replacing the body of a named heading writes the new body exactly under that heading and nowhere else, whatever mix of line endings the note uses. In notes whose top block uses one line-ending style and whose body uses another, replacing a section's body currently writes the new text further down the note, overwriting unrelated sections and leaving the target section unchanged, while reporting success. Setting a property on a Windows-style note produces exactly this mix, so the corruption follows naturally from normal use and is easy to miss. Out of scope: changing how property edits write the frontmatter block's line endings (tracked separately); the append and prepend modes of section editing, unless they share the same fault (verify and fix together if so); normalising line endings across a whole note."

## Context

`patch_heading` edits one heading's section of a note in place. The agent names the heading by its path (for example `Plan#Risks`) and picks a mode: `replace` swaps the heading's direct body for new content, `append` adds content at the end of the heading's whole section, and `prepend` adds content directly under the heading line.

The tool finds the heading and then edits the note in two separate steps, and the two steps count lines differently when a note mixes line-ending styles:

- Finding the heading treats every line feed as the end of a line, whether or not a carriage return comes before it. Its line numbers are correct for any note.
- Editing first decides one line-ending style for the whole note: Windows style (CRLF) if a single CRLF appears anywhere, otherwise Unix style (LF). It then splits the note only on that style. In a note classified as CRLF, a run of LF-only lines is counted as one line.

When the note is uniform, the two counts agree. When it is mixed, they disagree, and the line numbers the first step found point at the wrong place in the second step's view of the note. The edit lands lower down than the heading, over unrelated text, and the tool reports success. Its race check compares the heading line, not where the edit landed, so it does not catch the mistake.

The common way to get such a note: a CRLF note on Windows whose frontmatter is rewritten with LF line endings by a property edit. Every LF line in the frontmatter shifts the edit one line further down the body.

The fault is in the shared line-numbering step, not in the replace mode, so `append` and `prepend` land in the wrong place on the same notes. The user description says to fix them together in that case, so this feature covers all three modes.

`patch_block` replaces the block a `^block-id` marker identifies, and it has the same fault. Its block finder treats every line feed as the end of a line, but its edit step splits only on CRLF once the note contains one, so on a mixed note the replacement lands lower down than the block. `patch_block` has no re-read race check, so nothing catches the wrong placement. By owner ruling (Clarifications, Session 2026-11-02), this feature fixes `patch_block` under the same rules as `patch_heading`.

## Clarifications

### Session 2026-11-02

- Q: Should this feature also fix `patch_block`, which lands its edits in the wrong place on notes with mixed line endings in the same way as `patch_heading`? → A: Option A. Yes: owner ruling 2026-11-02 puts `patch_block` in scope. Apply the same rules to it as to `patch_heading`: the edit lands at the block found, line endings outside the edit are kept, mixed and uniform notes behave the same, and an unsafe placement is refused without writing. Include tests and a help-reference update. Recorded under BI-0168 `## Out of scope` and `## Related`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Only the named section changes (Priority: P1)

An agent replaces the body of a named heading in a note whose frontmatter uses one line-ending style and whose body uses the other. The new body appears directly under that heading. Every other part of the note, before the heading line and after the section, is byte-for-byte unchanged.

**Why this priority**: This is the defect. Today the call overwrites unrelated sections and reports success, so the agent believes the edit worked and the damage goes unnoticed. Data loss in a user's notes is the worst outcome this tool can have.

**Independent Test**: Make a note whose frontmatter lines end in LF and whose body lines end in CRLF, with three or more headings, each with a distinct body. Replace the body of the last heading. Confirm that the new body sits directly under that heading, that the bytes before the start of the section's body are identical to the original, and that nothing else in the note changed. Repeat for the first heading and a middle heading. Repeat with the styles swapped (CRLF frontmatter, LF body).

**Acceptance Scenarios**:

1. **Given** a note with an LF frontmatter block and a CRLF body, **When** the agent replaces the body of a heading near the end of the note, **Then** the new body appears directly under that heading, and every byte before the start of that heading's body and every byte after the end of the replaced body is unchanged.
2. **Given** the same note, **When** the agent replaces the body of the first heading, **Then** the heading's old body is gone, the new body is in its place, and every following section is unchanged.
3. **Given** a note with a CRLF frontmatter block and an LF body, **When** the agent replaces the body of any heading, **Then** the outcome is the same as in scenarios 1 and 2.
4. **Given** a note with mixed line endings, **When** the agent replaces a section's body, **Then** reading that heading afterwards returns exactly the new body.

---

### User Story 2 - Mixed and uniform notes behave the same (Priority: P1)

An agent edits notes without knowing or checking their line endings. The same section edit gives the same text on a note with mixed line endings as it does on a note with uniform line endings, so the agent never needs to inspect line endings first.

**Why this priority**: This is the guarantee that makes Story 1 hold in general, not just for one fixture. It also extends the fix to `append` and `prepend`, which share the fault.

**Independent Test**: Take two notes with identical text, one with uniform line endings and one with mixed line endings. For each of `replace`, `append` and `prepend`, make the same edit on both. Convert both results to a single line-ending style and confirm they are identical.

**Acceptance Scenarios**:

1. **Given** two notes with identical text, one with uniform line endings and one with mixed line endings, **When** the same `replace` is made on each, **Then** the two resulting notes are identical apart from line endings.
2. **Given** the same pair of notes, **When** the same `append` is made on each, **Then** the two resulting notes are identical apart from line endings, and the new content sits at the end of the named heading's section in both.
3. **Given** the same pair of notes, **When** the same `prepend` is made on each, **Then** the two resulting notes are identical apart from line endings, and the new content sits directly under the named heading line in both.
4. **Given** a note with uniform line endings (all LF or all CRLF), **When** any section edit is made, **Then** the result is byte-for-byte the same as today.

---

### User Story 3 - Line endings outside the edit are preserved (Priority: P2)

A note owner keeps notes with whatever line endings their tools produce. After a section edit, every line outside the edited section keeps the line ending it had, so the edit does not churn the file and version-control diffs show only the real change.

**Why this priority**: Not data loss, but a whole-file line-ending rewrite makes every line show as changed, hides the real edit in diffs, and may fight other tools. It matters less than landing the edit in the right place.

**Independent Test**: Make a note with mixed line endings. Edit one section in each mode. Compare the result with the original line by line, and confirm that every line outside the edited section has the same line ending as before.

**Acceptance Scenarios**:

1. **Given** a note with mixed line endings, **When** a section body is replaced, **Then** every line before the heading's body and after the replaced body keeps its original line ending.
2. **Given** a note with mixed line endings, **When** content is appended or prepended to a section, **Then** every line that was already in the note keeps its original line ending.
3. **Given** a note whose last line has, or does not have, a final line ending, **When** any section edit is made, **Then** the note still has, or still does not have, a final line ending.

---

### User Story 4 - No silent corruption (Priority: P2)

If the tool cannot place an edit safely under the named heading, it refuses: the call fails with an error and the note is left exactly as it was. It never reports success for an edit that landed somewhere else.

**Why this priority**: Stories 1 to 3 remove the known cause. This story is the safety net for any cause not yet known, so a future regression shows up as a failed call, not as silent damage.

**Independent Test**: Force a case where the edited text would not keep the original note's text intact before the section and after the edited region (for example, by feeding the edit step a wrong line position in a unit test). Confirm the call fails, the error names the heading and the note, and the note's bytes are unchanged.

**Acceptance Scenarios**:

1. **Given** an edit whose result would not keep the named heading line in place, with the original text before it and after the edited region unchanged, **When** the agent makes it, **Then** the call fails with an error and the note is not changed.
2. **Given** such a failure, **When** the agent reads the error, **Then** it identifies the heading path and the note, and says the edit could not be placed safely.

---

### User Story 5 - Block-reference edits get the same guarantees (Priority: P1)

An agent replaces the block a `^block-id` marker identifies, using `patch_block`, in a note with mixed line endings. The replacement lands exactly on that block, every other byte and line ending in the note is kept, and the result matches the same edit on a uniform note. If the edit cannot be placed safely, the call fails and the note is left unchanged.

**Why this priority**: `patch_block` has the same fault, causes the same silent data loss on the same notes, and has no race check to catch it (Clarifications, Session 2026-11-02).

**Independent Test**: Make a note whose frontmatter lines end in LF and whose body lines end in CRLF, with several bound blocks, one of each supported shape (paragraph, list item, separately placed). Replace each block in turn and confirm that only that block changed. Repeat with the styles swapped. Repeat on a uniform copy and compare the results after converting both to one line-ending style. Force an unsafe placement in a unit test and confirm the call fails and the note is unchanged.

**Acceptance Scenarios**:

1. **Given** a note with an LF frontmatter block and a CRLF body, **When** the agent replaces a block near the end of the note, **Then** the new content appears in that block's place with its marker kept as today, and every byte before and after the block is unchanged.
2. **Given** a note with a CRLF frontmatter block and an LF body, **When** the agent replaces any block, **Then** the outcome is the same as in scenario 1.
3. **Given** two notes with identical text, one with uniform line endings and one with mixed line endings, **When** the same block replacement is made on each, **Then** the two resulting notes are identical apart from line endings.
4. **Given** a note with mixed line endings, **When** a block is replaced, **Then** every line outside the replaced block keeps its original line ending, and whether the note ends with a final line ending is unchanged.
5. **Given** a block replacement whose result would not keep the original text before and after the block unchanged, **When** the agent makes it, **Then** the call fails with an error that identifies the block id and the note, and the note is not changed.
6. **Given** a note with uniform line endings, **When** any block is replaced, **Then** the result is byte-for-byte the same as today.

---

### Edge Cases

- **Heading is the last line of the note, with no final line ending**: replacing or appending adds the body under it. The new lines use the ending chosen by FR-005, and the "final line ending present or absent" state of the note follows the existing rule (Story 3, scenario 3).
- **Empty replacement content**: replacing with empty content clears the direct body (existing behaviour). It works the same on mixed notes.
- **Content supplied with its own line endings**: the agent's content may use LF or CRLF. The new lines are written with the ending chosen by FR-005, as today, not with the ending the agent typed.
- **Lone carriage returns** (a carriage return not followed by a line feed): they are not line endings today and stay ordinary characters in the line; this feature does not change that.
- **Line-ending style changes inside the section being replaced**: the old body is removed whatever its line endings; the new body uses the ending chosen by FR-005.
- **Heading with child headings**: `replace` changes only the direct body, before the first child heading, as today. The child sections keep their bytes and line endings.
- **Headings inside fenced code blocks**: still ignored, as today.
- **Concurrent change between read and write**: the existing race check and its error stay as they are.
- **Heading not found**: unchanged error.
- **`patch_block` on a block attached to a heading line**: still refused with the existing error that routes the agent to `patch_heading`, on mixed and uniform notes alike.
- **`patch_block` marker inside frontmatter or a fenced code block**: still not a valid target, as today; the frontmatter's line endings do not change which block is found.
- **`patch_block` block not found**: unchanged error.

## Requirements *(mandatory)*

### Functional Requirements

"Section edit" below means a `patch_heading` call in any of its three modes: `replace`, `append` or `prepend`. FR-001 to FR-013 cover `patch_heading`; FR-014 to FR-018 cover `patch_block` (Clarifications, Session 2026-11-02).

- **FR-001**: A section edit MUST place its change at the position of the named heading as found in the note, whatever mix of LF and CRLF line endings the note contains. Finding the heading and editing the note MUST agree on where every line starts and ends.
- **FR-002**: For `replace`, the new body MUST appear directly after the named heading line, in place of the heading's direct body. Every byte from the start of the note up to the start of the heading's direct body, and every byte from the end of the direct body to the end of the note, MUST be unchanged, subject to FR-006.

  When the heading becomes the note's last line in a note with no final line break, that rule removes the heading line's own terminator.
- **FR-003**: For `append` and `prepend`, the new content MUST be inserted at the same logical position as on a note with uniform line endings (end of the heading's whole section for `append`; directly after the heading line for `prepend`). Every byte of the original note MUST be kept, in order, around the inserted content.
- **FR-004**: Every line of the original note that the edit keeps MUST keep its original line ending. The edit MUST NOT rewrite line endings anywhere outside the lines it adds or removes.
- **FR-005**: The lines the edit adds MUST use one line ending, chosen from the note around the edit point: the ending of the named heading's own line, or, if that line has none because it is the last line of the note, the ending of the nearest earlier line that has one. A note with no line endings at all uses LF. On a uniform note this gives the same ending as today.
- **FR-006**: Whether the note ends with a final line ending MUST be the same after the edit as before it, as today.
- **FR-007**: For two notes with identical text that differ only in line endings, the same section edit MUST produce results that are identical apart from line endings.
- **FR-008**: On a note with uniform line endings (all LF or all CRLF), every section edit MUST produce the same bytes as today.
- **FR-009**: Before writing, the tool MUST check that the edited note keeps the original note's bytes unchanged before the edit point and after the edited region, with the named heading line still in place. If the check fails, the call MUST fail with an error, and the note MUST NOT be written.
- **FR-010**: The FR-009 failure MUST be reported through an existing top-level error code, with a structured detail that identifies it as an unsafe placement and carries the heading path and the note path. No new top-level error code is introduced. Error codes, details and precedence for every other failure (heading not found, race, file errors) MUST stay unchanged.
- **FR-011**: The input schema, output schema, success response shape and tool annotations of `patch_heading` MUST stay unchanged.
- **FR-012**: `patch_heading`'s help reference MUST state that section edits work on notes with mixed line endings, keep line endings outside the edit, and describe the new unsafe-placement failure and its recovery. The typed-error list in the tool's published description MUST include `UNSAFE_PLACEMENT`, as a `details.code` under the existing top-level code, so no new top-level code is added (ADR-015).
- **FR-013**: Automated tests MUST cover at least:
  - (a) `replace` on a note with an LF frontmatter and a CRLF body, targeting the first, a middle and the last heading;
  - (b) the same with the styles swapped (CRLF frontmatter, LF body);
  - (c) `append` and `prepend` on the same mixed notes;
  - (d) the mixed-versus-uniform equivalence of FR-007 for all three modes;
  - (e) preservation of every line ending outside the edit (FR-004);
  - (f) the unsafe-placement refusal of FR-009, with the note unchanged;
  - (g) uniform LF and uniform CRLF notes, showing no change from today (FR-008).
- **FR-014**: A `patch_block` edit MUST replace exactly the lines of the block found for the requested `^block-id`, whatever mix of LF and CRLF line endings the note contains, with the marker handling of each block shape unchanged from today. Finding the block and editing the note MUST agree on where every line starts and ends. Every byte before the block's first line and after its last edited line MUST be unchanged, subject to FR-006 as applied to `patch_block` by FR-015.
- **FR-015**: For `patch_block`, the rules of FR-004 (line endings kept outside the edit), FR-006 (final line ending kept), FR-007 (mixed and uniform notes give results identical apart from line endings) and FR-008 (uniform notes give today's bytes) MUST hold, with the block in place of the heading section. The lines `patch_block` adds MUST use the line ending of the block's marker line, or, if that line has none because it is the last line of the note, the ending of the nearest earlier line that has one; a note with no line endings at all uses LF.
- **FR-016**: Before writing, `patch_block` MUST check that the edited note keeps the original note's bytes unchanged before the block and after the edited region. If the check fails, the call MUST fail with an error and the note MUST NOT be written. The failure MUST be reported through the same existing top-level error code and the same unsafe-placement detail as FR-010, carrying the block id and the note path. Error codes, details and precedence for every other `patch_block` failure (block not found, block on heading, file errors) MUST stay unchanged.
- **FR-017**: The input schema, output schema, success response shape and tool annotations of `patch_block` MUST stay unchanged. Its help reference MUST state that block edits work on notes with mixed line endings, keep line endings outside the edit, and describe the unsafe-placement failure and its recovery. The typed-error list in its published description MUST include `UNSAFE_PLACEMENT`, as a `details.code` under the existing top-level code (ADR-015).
- **FR-018**: Automated tests MUST cover, for `patch_block`, at least:
  - (a) a replacement of each supported block shape (paragraph, list item, separately placed) on a note with an LF frontmatter and a CRLF body, and on one with the styles swapped;
  - (b) the mixed-versus-uniform equivalence of FR-015;
  - (c) preservation of every line ending outside the edit;
  - (d) the unsafe-placement refusal of FR-016, with the note unchanged;
  - (e) uniform LF and uniform CRLF notes, showing no change from today.

### Key Entities

- **Note**: a Markdown file in a vault, made of lines. Each line ends in LF, CRLF or (for the last line only) nothing. A note may optionally start with a frontmatter block.
- **Line-ending style**: LF or CRLF. A note is uniform when every line ending in it has the same style, and mixed otherwise.
- **Heading section**: a heading line plus everything up to the next heading of the same or higher level, or the end of the note. Its **direct body** is the part before its first child heading.
- **Block**: the lines a `^block-id` marker identifies. For a paragraph or list item, this is the marker's own line; for a separately placed block (table, callout, blockquote, indented code), it is the lines of the block before a marker-only line.
- **Edit point**: where an edit removes or inserts lines: for `patch_heading`, the direct body for `replace`, the end of the section for `append`, and the line after the heading for `prepend`; for `patch_block`, the lines of the block.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On notes with mixed line endings (both LF-frontmatter/CRLF-body and CRLF-frontmatter/LF-body), 100% of section edits in each mode, targeting each heading of a multi-heading fixture, land at the named heading, with 0 bytes changed outside the edit point.
- **SC-002**: For every fixture pair of identical text with uniform and mixed line endings, the results of the same edit are identical after converting both to one line-ending style, in 100% of cases across all three modes.
- **SC-003**: 0 line endings changed outside the edit point, counted line by line against the original note.
- **SC-004**: 0 byte differences from today's output on notes with uniform line endings, across the existing test suite and the new uniform fixtures.
- **SC-005**: In 100% of forced unsafe-placement cases, the call fails and the note's bytes are identical to before the call.
- **SC-006**: 0 changes to the published input schema, output schema or annotations of `patch_heading` or `patch_block`, and 0 new top-level error codes. In the fingerprint baseline exactly two lines move: the description fingerprints of `patch_heading` and `patch_block`, for the `UNSAFE_PLACEMENT` entry added by FR-012 and FR-017.
- **SC-007**: On notes with mixed line endings, 100% of `patch_block` replacements, across every supported block shape in a multi-block fixture, land on the block found, with 0 bytes and 0 line endings changed outside it. SC-002 to SC-005 hold for `patch_block` as they do for `patch_heading`.

## Assumptions

- The usual source of mixed notes is a property edit that writes the frontmatter in LF on a CRLF note. That behaviour is out of scope, so mixed notes will keep appearing, and section edits must handle them.
- Choosing the ending of the added lines from the heading's own line (FR-005) matches what a person editing at that spot would expect. It gives today's result on uniform notes. A note-wide majority vote was considered and rejected, because it can differ from the lines next to the edit.
- The unsafe-placement check (FR-009) is a safety net. After the line-numbering fix it should never fire on real notes. It exists so that a future regression shows up as a failed call, not as silent damage.
- The existing error spine already has a top-level code for "the tool refused a note-level operation, with a structured `details.code`": both tools use it today, for heading-not-found and heading-race in `patch_heading` and for block-not-found and block-on-heading in `patch_block`. Using it for the unsafe-placement refusal in both tools needs no new top-level code.
- `patch_block` is brought into scope by owner ruling (Clarifications, Session 2026-11-02; BI-0168 `## Out of scope` and `## Related`). It does not gain a re-read race check; only the placement fix, line-ending preservation and the unsafe-placement refusal are added.

## Out of Scope

- Changing how property edits (`set_property`) write the frontmatter block's line endings. This is tracked separately.
- Normalising line endings across a whole note, or converting a mixed note to one style.
- `append_note`, `prepend`, `find_and_replace` and any editing tool other than `patch_heading` and `patch_block`. They are not changed by this feature, even if they handle mixed notes in a similar way.
- Any change to how headings are found: heading-path syntax, duplicate-sibling rule, fenced-code opacity and setext headings stay as they are.
- Any change to how blocks are found or classified in `patch_block`: block-id syntax, first-match-wins on duplicate ids, frontmatter and fenced-code exclusion, and the block shapes stay as they are. Adding a race check to `patch_block` is also out of scope.
