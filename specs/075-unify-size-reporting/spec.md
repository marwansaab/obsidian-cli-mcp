# Feature Specification: Unify Size Reporting

**Feature Branch**: `075-unify-size-reporting`  
**Created**: 2026-10-31  
**Status**: Draft  
**Input**: User description: "Unify size reporting — every capability that writes to a note reports, in its result, how much the note's size changed because of that write, and the figure means the same thing whichever writing capability was used, including creating or replacing a whole note, which today reports no size at all."

## Background

Five capabilities write text into a single note: adding to the end of a note, adding to the top of a note, editing a section under a heading, editing a block, and creating or replacing a whole note. The first four return a size figure under the same name, but the figure does not mean the same thing:

- Adding to the end and adding to the top report how much the note grew: the note's size after the write minus its size before.
- The section editor and the block editor report the note's total size after the edit.
- Creating or replacing a whole note reports no size figure at all.

An agent that checks the reported figure against what it meant to write gets a correct check from one capability and a badly wrong one from its sibling, and nothing in the result says which meaning applies. The reference pages make this worse: they recommend using the figure to confirm a write, and the section and block editors' pages describe a "near-zero value" as a warning sign, advice that only fits the total-size meaning. This feature gives the figure one meaning, the change in the note's size caused by the write, on all five capabilities, and documents and announces the change.

## Clarifications

### Session 2026-10-31

- Q: Which writing capabilities carry the size figure? → A: The five single-note text writers only: append_note, prepend, patch_heading, patch_block and write_note. set_property, find_and_replace and create_base stay unchanged. These five single-note text writers are the cohort that BI-0116's Related section lists, and BI-0116's Out of scope section excludes the other tool cohorts.
- Q: What name does the size figure use? → A: `bytes_written` on all five, described the same way everywhere as the size change; write_note gains `bytes_written`. BI-0116 ("Align Bytes Written On Byte Delta") names the field and keeps append_note's and prepend's meaning, and reporting old and new fields side by side is out of scope.
- Q: What happens if write_note cannot measure the existing note before replacing it? → A: The call fails before anything is written, through the existing `FS_WRITE_FAILED` error with `details.errno` (ADR-009 Decision §7). There is no write without a figure, no guessed figure and no new error code (Constitution Principle IV).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Section and block edits report the size change (Priority: P1)

An agent edits a section under a heading, or a block, and the reported figure is how much the note's size changed because of the edit, not the note's total size. When the edit makes the note shorter, the figure shows the reduction; when the edit swaps text for text of the same size, the figure is zero.

**Why this priority**: This is the defect. The section and block editors are the two capabilities whose figure disagrees with their siblings', and they are the ones an agent is most likely to verify wrongly today.

**Independent Test**: Place a note of known size in the test vault, edit one of its sections (and, separately, one of its blocks) so that the note grows, shrinks and stays the same size, and check each time that the reported figure equals the note's size after the edit minus its size before.

**Acceptance Scenarios**:

1. **Given** a note of known size, **When** an agent adds text to a section or replaces a section's or a block's body with longer text, **Then** the reported figure equals the note's new size minus its old size, not the note's total size.
2. **Given** a note of known size, **When** an agent replaces a section's or a block's body with text of exactly the same size, **Then** the reported figure is zero.
3. **Given** a note of known size, **When** an agent replaces a section's or a block's body with shorter text, or clears it, **Then** the reported figure is negative and equals the note's new size minus its old size, rather than a total size.
4. **Given** each of the three placements the section editor offers (end of section, start of section, replace), **When** the agent edits a section, **Then** the reported figure has the same meaning for every placement.

---

### User Story 2 - Adding to the end or top keeps the same meaning (Priority: P1)

An agent adds text to the end or the top of a note and the reported figure is, as today, the note's new size minus its old size. The unified meaning is the one these capabilities already use, so their behaviour must not change.

**Why this priority**: The adding capabilities define the meaning the others move to. A regression here would break the agents that already verify writes correctly.

**Independent Test**: Place a note of known size, add text to its end (and, separately, its top) with and without a separating line break, and check that the reported figure equals the note's new size minus its old size.

**Acceptance Scenarios**:

1. **Given** a note of known size, **When** an agent adds text to its end or top, **Then** the reported figure equals the note's new size minus its old size.
2. **Given** a write in which the capability inserts a separating line break, **When** the result is returned, **Then** the reported figure includes the separator's size, exactly as it does today.

---

### User Story 3 - Whole-note writes report the size change (Priority: P2)

An agent creates a note, or replaces a note's whole content, and the result reports how much the note's size changed, so that the agent can confirm the write landed at the expected size.

**Why this priority**: Today these writes report nothing to verify against. Adding the figure completes the set, but it extends results rather than correcting a wrong figure, so it follows the correction.

**Independent Test**: Create a note at a location where none exists and check that the figure equals the new note's size. Then replace that note's content with longer and with shorter content and check that each figure equals the new size minus the old size.

**Acceptance Scenarios**:

1. **Given** no note exists at a location, **When** an agent creates one, **Then** the result reports the new note's size as the change from zero.
2. **Given** an existing note, **When** an agent replaces its whole content, **Then** the result reports the new size minus the old size.
3. **Given** an existing note, **When** an agent replaces its content with shorter content, **Then** the reported figure is negative.
4. **Given** an existing note, **When** an agent replaces its content with content of exactly the same size, **Then** the reported figure is zero.
5. **Given** an agent that creates an empty note, **When** the result is returned, **Then** the reported figure is zero.

---

### User Story 4 - One assertion shape for test authors (Priority: P2)

A test author checks the size figure of every writing capability in the same way: read the note's size before the write, read it after, and compare the difference with the reported figure.

**Why this priority**: A uniform check keeps the test suite uniform and is itself the evidence that the five capabilities agree.

**Independent Test**: Write one check, "reported figure equals size after minus size before", and apply it unchanged to each of the five writing capabilities; every one passes.

**Acceptance Scenarios**:

1. **Given** any of the five writing capabilities and a note of known size (or no note, for creation), **When** the capability writes successfully, **Then** the reported figure equals the note's size after the write minus its size before, with no per-capability adjustment.

---

### User Story 5 - Documentation says one thing (Priority: P2)

An agent reads the reference documentation for any writing capability and finds the size figure described with the same meaning in the same words, and any advice to use the figure for verification holds for every capability it names.

**Why this priority**: The documentation's verification advice is what leads agents into the mismatch today. Unifying the figure without unifying its description would leave the trap in place.

**Independent Test**: Compare the description of the size figure on the five reference pages and in the tools' published descriptions; the wording is identical, and no page carries advice (such as treating a near-zero value as a warning sign) that is wrong for a size change.

**Acceptance Scenarios**:

1. **Given** the reference documentation for each of the five writing capabilities, **When** an agent reads the description of the size figure, **Then** every capability describes the same meaning in the same words.
2. **Given** any advice to use the figure to verify a write, **When** an agent applies it to any capability the advice names, **Then** the advice is correct for that capability, including when the figure is zero or negative.

---

### User Story 6 - The change is announced (Priority: P3)

An agent upgrading from a version in which the section and block editors reported total note size finds the change called out in the release notes with a migration note, and finds the new figure on whole-note writes listed as an addition.

**Why this priority**: The announcement does not change behaviour, but without it agents discover the change at runtime. It ships with the change, not before it.

**Independent Test**: Read the release notes for the release that introduces this change and check that the section and block editors' change in meaning is listed as a change with a migration note, and the whole-note figure is listed as an addition.

**Acceptance Scenarios**:

1. **Given** the release that introduces this change, **When** an agent reads the release notes, **Then** the change in meaning for the section and block editors is called out explicitly as a change that affects existing callers, with a migration note saying how to update a check that relied on total size.
2. **Given** the same release notes, **When** an agent reads them, **Then** the new figure on whole-note writes is listed as an addition.

---

### Edge Cases

- **Shrinking edits**: the figure for a section edit, block edit or whole-note replacement can be negative. The figure must be allowed to be negative on those capabilities and must not be clamped to zero.
- **Same-size edits**: an edit that swaps text for text of the same size reports zero. Zero is a successful result, not a warning sign.
- **Adding to the end or top**: these capabilities reject empty text, so on success their figure stays at least one, as today.
- **Multi-byte characters**: size is measured in the same unit the adding capabilities use today (bytes of the note as stored), so a write of accented or non-Latin text reports its stored size, not its character count.
- **Byte-order mark and line-ending style**: any bytes the capability itself adds or preserves, such as a separating line break or a preserved byte-order mark, count toward the figure, because the figure is the difference between the note's stored sizes.
- **Creating an empty note**: the figure is zero.
- **Replacing a note the capability is not allowed to overwrite**: the write fails as it does today, and no figure is reported.
- **Failed writes**: a write that fails returns its existing error and no figure; this feature changes no error code or details shape.
- **The existing note's size cannot be measured before a whole-note replacement** (for example, access denied or the file is locked): the call fails before anything is written, with the existing filesystem write-failure error carrying the operating-system error code. Nothing is written, and the capability never reports a guessed figure or a result without one.
- **Another program changes the note at the same moment**: the figure describes the write the capability made: the size of what it wrote minus the size it observed before writing. Edits made by other programs between those two moments are outside the figure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each of the five writing capabilities (add to end, add to top, edit a section, edit a block, create or replace a whole note) MUST report, on success, one size figure meaning "the note's size after this write minus its size before this write", where a note that did not exist before has a size of zero.
- **FR-002**: The size figure MUST be measured in the same unit on every writing capability: bytes of the note as stored.
- **FR-003**: The section editor and the block editor MUST report the size change defined in FR-001 instead of the note's total size after the edit, for every placement they offer.
- **FR-004**: The size figure MUST be allowed to be zero or negative on the capabilities whose writes can leave a note the same size or smaller (section edit, block edit, whole-note write), and MUST NOT be clamped.
- **FR-005**: Adding to the end and adding to the top MUST keep reporting the figure exactly as they do today; their meaning already matches FR-001.
- **FR-006**: Creating a note and replacing a note's whole content MUST report the size figure in their results.
- **FR-006a**: When replacing a whole note, if the existing note's size cannot be determined before the write, the capability MUST fail before writing anything, through the existing filesystem write-failure error with the operating-system error code in its details. That failure takes the place of today's failed existence check, with the same code and details shape; only the name of the failing operation in its details changes. It MUST NOT write and then omit, estimate or substitute the figure, and MUST NOT introduce a new error code.
- **FR-007**: The size figure MUST be named `bytes_written` in every writing capability's result: the name the adding, section and block capabilities already use. Creating or replacing a whole note gains a `bytes_written` field; no capability renames the field or reports a second size field.
- **FR-008**: The published description of each writing capability's result MUST describe the size figure with the same meaning in the same words, and that description MUST state that the figure can be zero or negative where FR-004 applies.
- **FR-009**: The reference documentation for each writing capability MUST describe the size figure with the same meaning in the same words, and MUST NOT carry verification advice that is wrong for a size change (for example, treating a near-zero figure as a warning sign).
- **FR-010**: The release notes for the release that introduces this change MUST list the section and block editors' change in meaning as a change affecting existing callers, with a migration note, and MUST list the whole-note figure as an addition.
- **FR-011**: Apart from the size figure's meaning, its addition to whole-note writes, and the failure FR-006a describes (a new cause of an existing error, with the same code and details shape), the inputs, errors and other result fields of the writing capabilities MUST stay unchanged.
- **FR-012**: Each writing capability MUST have tests that check the reported figure against the note's size after the write minus its size before, covering at least growth and, where FR-004 applies, a same-size write and a shrinking write.

### Key Entities

- **Size figure**: a whole number in a writing capability's successful result: the note's stored size after the write minus its stored size before the write, in bytes. Positive when the note grew, zero when its size did not change, negative when it shrank.
- **Writing capability**: one of the five capabilities that write text into a single note: add to end, add to top, edit a section, edit a block, create or replace a whole note.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every successful write by any of the five writing capabilities, the reported figure equals the note's stored size after the write minus its stored size before, in 100% of tested cases, including growing, same-size and shrinking writes.
- **SC-002**: One check, "reported figure equals size after minus size before", applied unchanged to all five writing capabilities, passes for every one of them.
- **SC-003**: The size figure is described in identical words on all five reference pages and in all five published result descriptions, and no page contains verification advice that fails for a zero or negative figure.
- **SC-004**: The release notes for the release name both changed capabilities (section editor, block editor) under a change heading with a migration note, and name whole-note writes under an addition heading.
- **SC-005**: No writing capability's inputs, error codes, error details shapes or other result fields change. The existing tests for those behaviours keep their assertions. The only changes are to the size figure, and to the test fixtures of the changed capabilities where the changed measurement needs them (for example, a fake filesystem that must now report a note's size). Constitution Principle II requires these test changes in the same change set as the surface.

## Assumptions

- **Scope is the five single-note text writers** (confirmed in Clarifications). "Every capability that writes to a note" means the five single-note text writers BI-0116 lists: append_note, prepend, patch_heading, patch_block and write_note. prepend writes through the Obsidian CLI and the other four write to the vault filesystem directly (ADR-009, amended 2026-05-26; BI-0120), so the cohort is defined by what the tools write, not by how they write it. Setting a frontmatter property, finding and replacing across notes, and adding an item to a base also change files, but they belong to other tool cohorts and stay unchanged. Move, rename, delete and the reading capabilities are out of scope as stated.
- **The figure keeps its existing name, `bytes_written`** (confirmed in Clarifications). The adding, section and block capabilities already return the figure under that name. This feature keeps the name and changes only what the section and block editors put in it, and whole-note writes adopt the same name. Renaming the figure would break agents that already verify correctly, and reporting the old and new meanings side by side is out of scope.
- **The unit is unchanged.** The adding capabilities already measure the difference in the note's stored bytes; that unit becomes the shared one.
- **This is a deliberate change to the published result of the section and block editors, and an addition to the whole-note write's published result.** The project's published-schema baseline is expected to change for the result schemas of all five writing capabilities and for no other capability: three because the figure's meaning, bounds or presence change, and two (adding to the end and to the top) only because FR-008's shared description is attached to their figure.
- **Release notes live in the project's changelog** under the unreleased section, following the existing "Changed" and "Added" headings.
- **The project is before its first major release**, so a change in meaning is announced with a migration note rather than held for a major version, as earlier changes to published behaviour have been.

## Out of Scope

- Reporting a breakdown of the size change (for example separator bytes versus content bytes); one figure is enough.
- Adding a size figure to capabilities that only read, or to move, rename and delete.
- Adding a size figure to setting a frontmatter property, finding and replacing across notes, or adding an item to a base.
- Reporting both the old total-size meaning and the new change meaning side by side for a transition period.
- Any other change to the inputs, errors or other result fields of the writing capabilities.
