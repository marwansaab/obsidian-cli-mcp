# Feature Specification: Fix Empty-Note Insertion

**Feature Branch**: `076-fix-empty-prepend`  
**Created**: 2026-10-31  
**Status**: Draft  
**Input**: User description: "Fix empty-note insertion — adding text to the top of an empty note leaves the note containing exactly that text, with no extra line break added, matching what adding the same text to the end of an empty note already does."

## Context

The add-to-top capability (`prepend`) promises, in its reference documentation, that a note with no content, or with only a properties block and no body, receives the supplied text with no separator. Its worked example states that adding `"def"` to an empty note leaves the note holding exactly `"def"`. In practice the note ends up holding the supplied text followed by an extra line break, and the reported size change counts that extra line break. The add-to-end capability (`append_note`) already leaves an empty note holding exactly the supplied text.

The result is a silent mismatch: an agent that reads the note back and compares it with what it wrote sees a difference it did not cause, and an agent that treats add-to-top and add-to-end as mirror images on an empty note gets two different notes from the same text.

## Clarifications

### Session 2026-10-31

- Q: What happens when the exact empty-note result cannot be guaranteed (the step that removes the extra line break fails, or someone else edits the note between the tool's steps)? → A: Option A. If removing the extra line break fails, the call fails with the existing `FS_WRITE_FAILED` code and a new `details.reason` value saying the text landed with an extra trailing line break (ADR-015 sub-discriminator; no new top-level code). If someone else changed the note in between, the tool leaves the note alone and succeeds, reporting the note's actual size change (last-write-wins, as for the other writers). A failure is never only logged (Principle IV).
- Q (analyze I1): When the read-back after Obsidian's write fails, how is the unknown case handled, given a properties-only note cannot be recognised without a wrapper-side parser? → A: Option B. An empty `before` (certainly bodiless) fails with `FS_WRITE_FAILED` `reason: extra-trailing-newline`. Any non-empty `before` fails with `FS_WRITE_FAILED` `{ errno, syscall: "open", path }`, with no `reason`, and a message saying the content landed, must not be re-sent, and could not be checked for an extra trailing line break. Principle IV rules out staying silent and making a false claim.
- Q (analyze C1): How is a non-ENOENT failure of the new pre-call read surfaced? → A: `FS_WRITE_FAILED` `{ errno, syscall: "open", path }`, with no `reason`, raised before Obsidian is called so nothing is written (FR-009 (b)).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Empty note holds exactly the supplied text (Priority: P1)

An agent creates a fresh, empty note and adds text to its top. Afterwards the note holds exactly that text — no extra line break before or after it — and the reported size change is exactly the size of the supplied text.

**Why this priority**: This is the defect itself. Every other story follows from it: once the empty-note result is exact, the mirror behaviour and the documentation agreement hold.

**Independent Test**: Create an empty note, add `"first"` to its top, read the note back, and compare it byte-for-byte with `"first"`; compare the reported size change with the size of `"first"`.

**Acceptance Scenarios**:

1. **Given** an existing note with no content, **When** the agent adds `"first"` to its top, **Then** the note contains exactly `"first"` with no trailing line break.
2. **Given** the same call succeeds, **When** the result is returned, **Then** the reported size change equals the size of the supplied text exactly (5 bytes for `"first"`).
3. **Given** an existing note with no content, **When** the agent adds text that itself ends with a line break (for example `"first\n"`), **Then** the note contains exactly that text, its own line break included and nothing more.
4. **Given** an existing note with no content, **When** the agent adds text to its top with the inline option on, **Then** the note contains exactly the supplied text, the same result as with the inline option off.

---

### User Story 2 - Mirror behaviour with add-to-end (Priority: P2)

An agent that uses both add-to-top and add-to-end on empty notes gets the same note from the same text, whichever of the two it uses.

**Why this priority**: Agents reason about the two capabilities as a pair. Once Story 1 holds this follows, but it is the comparison agents actually rely on, so it is stated and tested on its own.

**Independent Test**: Create two empty notes, add the same text to the top of one and to the end of the other, read both back, and compare them byte-for-byte; compare the two reported size changes.

**Acceptance Scenarios**:

1. **Given** two empty notes and the same text, **When** the agent adds the text to the top of one and to the end of the other, **Then** both notes end up byte-for-byte identical.
2. **Given** the same two calls, **When** both results are returned, **Then** both report the same size change.

---

### User Story 3 - Notes with only a properties block (Priority: P2)

An agent adds text to the top of a note that has a properties block and no body. The text lands after the properties block, where it lands today, and no extra trailing line break follows it.

**Why this priority**: The documentation groups this case with the empty note ("frontmatter-only-no-body: no trailing separator"), so it carries the same promise and the same defect risk.

**Independent Test**: Create a note holding only a properties block, add `"Lead"` to its top, read the note back, and confirm that the properties block is unchanged, `"Lead"` follows it, and nothing follows `"Lead"`.

**Acceptance Scenarios**:

1. **Given** a note holding exactly `"---\nkey: v\n---\n"` and no body, **When** the agent adds `"Lead"` to its top, **Then** the note contains exactly `"---\nkey: v\n---\nLead"`: the properties block byte-for-byte unchanged, then the supplied text, then nothing.
2. **Given** the same call succeeds, **When** the result is returned, **Then** the reported size change equals the size of the supplied text exactly.

---

### User Story 4 - Documentation matches behaviour (Priority: P3)

A reader of the reference documentation finds that its empty-note rule and worked example describe what actually happens.

**Why this priority**: The documentation already states the intended behaviour; this story makes sure it stays true and is checked, and that any statement describing the old result is corrected.

**Independent Test**: Run the documentation's empty-note worked example against a real note and compare the result with what the documentation states.

**Acceptance Scenarios**:

1. **Given** the reference documentation's empty-note rule and worked example, **When** the agent compares them with the actual result, **Then** they agree.
2. **Given** any other place that describes the add-to-top result or its reported size change (the tool's own description, its long-form help, the shipped system documentation), **When** a reader compares it with the actual empty-note result, **Then** it agrees or says nothing that contradicts it.

---

### Edge Cases

- **Text that ends with a line break**: the note holds the supplied text verbatim, its own trailing line break included; nothing is added and nothing is removed.
- **Text that begins with or consists mostly of line breaks**: the supplied text is preserved byte-for-byte; only a line break the tool itself added is ever absent from the result.
- **Inline option on an empty note**: same result as the default, as the documentation already states ("Same").
- **Windows-style line endings**: an empty note has no line-ending convention of its own, so no line break of either style is added; supplied text containing Windows-style line endings is preserved as supplied.
- **Note that holds only whitespace or a single line break**: such a note has content and is not empty; the existing separator rules for notes with content apply unchanged (out of scope).
- **Properties block whose closing delimiter has no line break after it**: where the text lands relative to the properties block is out of scope and unchanged; this feature only guarantees that no extra trailing line break follows the supplied text.
- **Properties-only note and content that repeats the end of the note** (for example `"-"`, `"--"`, `"---"`, or only line breaks): the result cannot be told apart, byte for byte, from adding the same text above a body, so the tool keeps the result it would produce today rather than risk changing a note that has content (FR-006). The note keeps one extra trailing line break, and the reported size change still equals the note's actual size change. The reference documentation states this exception (plan research D2).
- **Note that does not exist**: unchanged — the existing not-found failure applies.
- **Note that is edited by someone else between the tool's steps**: the tool leaves the other writer's edit untouched (it does not overwrite or "correct" it) and succeeds, reporting the note's actual size change caused by the call as observed; last-write-wins, as for the other writers.
- **Removing the extra line break fails** (for example, the file is locked or the disk refuses the write), or the note was empty and cannot be read back: the call fails with the existing write-failure code and a reason that says the supplied text landed in the note with an extra trailing line break, so the agent knows the note's state and can retry or correct it.
- **A non-empty note cannot be read back after Obsidian's write**: the tool cannot tell whether the note was properties-only, so the call fails with the existing write-failure code, no reason, and a message saying the text landed, must not be sent again, and the tool could not check for an extra trailing line break (FR-009 (c)).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When text is added to the top of a note with no content, the note MUST afterwards contain exactly the supplied text, byte-for-byte, with no line break or other bytes added before or after it.
- **FR-002**: When text is added to the top of a note that holds a properties block and no body, the note MUST afterwards contain the properties block, byte-for-byte unchanged, followed by exactly the supplied text, with no line break or other bytes added after it, except the ambiguous case in Edge Cases.
- **FR-003**: FR-001 and FR-002 MUST hold both with the inline option off (the default) and with it on.
- **FR-004**: For the calls covered by FR-001 and FR-002, the reported size change MUST equal the size in bytes of the supplied text exactly.
- **FR-005**: For the same text and an empty note, adding to the top and adding to the end MUST produce byte-for-byte identical notes and the same reported size change.
- **FR-006**: Behaviour for notes that already have body content MUST remain unchanged: the separator rules, the inline option, where the text lands relative to a properties block, and the reported size change all behave exactly as before. One narrow exception: if the tool cannot read a non-empty note back right after Obsidian's write, it cannot tell a properties-only note from a note with a body (no wrapper-side frontmatter parser, spec 045 FR-005b), so the call fails as FR-009 (c) describes rather than reporting an unverified success.
- **FR-007**: The reported size change MUST continue to equal the note's actual size change caused by the call (the rule established by spec 075). If the tool's own step that keeps the extra line break out of the note fails, the call MUST fail with the existing `FS_WRITE_FAILED` code and a new `details.reason` value stating that the supplied text landed with an extra trailing line break; it MUST NOT report success, and MUST NOT only log the failure. If someone else changes the note between the tool's steps, the tool MUST NOT overwrite a change it has observed; a residual window between the check and the atomic rename is accepted. It succeeds and reports the note's actual size change (last-write-wins, as for the other writers).
- **FR-008**: The reference documentation's empty-note rule and worked example MUST agree with the actual behaviour, and every other user-facing description of the add-to-top result (the tool description, its long-form help, and the shipped system documentation) MUST agree with it or not contradict it.
- **FR-009**: The fix MUST NOT change the add-to-top capability's published input or output shape or its set of error codes, and MUST NOT change its failure behaviour for any input, with two exceptions: (a) the new `FS_WRITE_FAILED` `details.reason` value defined in FR-007; (b) when the tool cannot read the note before handing it to Obsidian (any failure other than "not found"), the call fails with the existing `FS_WRITE_FAILED` code carrying the error number, the failing operation and the path, before anything is written (Constitution Principle IV: every boundary failure surfaces as a structured error); (c) when the tool cannot read a non-empty note back after Obsidian's write, the call fails with the existing `FS_WRITE_FAILED` code carrying the error number, the failing operation and the path, with no `details.reason`, and a message saying the supplied text landed, must not be sent again, and that the tool could not check whether an extra trailing line break was left.
- **FR-010**: The fix MUST be achieved without changes to Obsidian itself.

### Key Entities *(include if feature involves data)*

- **Empty note**: an existing note whose content is zero bytes.
- **Properties-only note**: an existing note whose content is a properties block and nothing after it.
- **Supplied text**: the text the agent asks to add; it is written byte-for-byte and is never trimmed or normalised.
- **Reported size change**: the size figure the call returns — the note's size after the call minus its size before, in bytes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of trials, adding text to the top of an empty note leaves the note byte-for-byte equal to the supplied text, with the inline option off and on.
- **SC-002**: In 100% of trials, adding text to the top of a properties-only note leaves the note byte-for-byte equal to the properties block followed by the supplied text, except the ambiguous case in Edge Cases.
- **SC-003**: In 100% of trials on empty notes, the reported size change equals the size of the supplied text, and add-to-top and add-to-end produce identical notes and identical size changes for the same text.
- **SC-004**: Every existing check of add-to-top behaviour on notes with body content still passes unchanged.
- **SC-005**: The documentation's empty-note worked example, run against a real note, produces exactly the result the documentation states.

## Assumptions

- "Empty note" means a note whose content is zero bytes. A note holding only whitespace or only line breaks has content and keeps the existing separator rules.
- The extra trailing line break is added by the underlying Obsidian add-to-top operation, not by the supplied text; since Obsidian itself is out of scope, the correction is made on this project's side.
- The size of the supplied text is measured in bytes as stored in the note (UTF-8), consistent with the size rule from spec 075; for plain ASCII text such as `"first"` this equals its character count.
- The add-to-end capability's empty-note behaviour is already correct and is the reference for the mirror comparison; it is not changed by this feature.
- Live checks against a real vault follow the project's authorised test-vault protocol.

## Out of Scope

- Separator behaviour for notes that already have content.
- Where text lands relative to a properties block.
- Empty-note behaviour of the section and block editors.
- Changes to Obsidian itself.
