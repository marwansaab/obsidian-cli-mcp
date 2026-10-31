# Feature Specification: Fix Section-Body Documentation

**Feature Branch**: `069-fix-section-body-docs`  
**Created**: 2026-10-31  
**Status**: Draft  
**Input**: User description: "Fix section-body documentation — the help for reading one heading's section describes accurately where the returned section body starts: immediately after the heading line, with the heading line's own line ending removed and everything after it, including any blank lines, kept exactly as written."

## Context

The section-read capability returns the body of one named heading. Its help page currently claims, in its overview caveat and in its output-field description, that the body "always begins with a leading newline byte (the line terminator after the matched heading line itself)", and it advises agents to trim that character. Its worked examples show bodies beginning with a newline.

That claim is false. The capability already removes the heading line's own line ending before returning the body. A body therefore starts with a line break only when the note itself has a blank line directly after the heading; a body whose text sits on the line directly under the heading starts with that text. In notes stored with Windows-style line endings, a leading blank line arrives as a carriage return followed by a line feed, not a single newline.

Agents that follow the current help and strip one leading character either delete the first character of real content or leave a stray carriage return at the start of the body. This feature corrects the help so it matches what the capability returns. The capability's behaviour is not changed.

This feature is backlog item BI-0039, which describes the change as documentation-only and rules out any runtime change to the section-read capability.

## Clarifications

### Session 2026-10-31

- Q: How should the corrected help be verified, and does this change ship an automated guard? → A: Docs-only (Option A). The help's claims are checked once with a live probe against the authorised test vault, covering a blank line after the heading in Unix-style and Windows-style notes, text directly under the heading, an empty section, and a heading followed only by a blank line. The evidence is recorded under the spec folder, and no tests are added. Rationale: BI-0039 calls the change documentation-only and excludes runtime changes, and the constitution's quality gates mark a docs-only change N/A on Principles II–V. The probe layouts match the fixtures already recorded in BI-0039's status.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start of body described accurately (Priority: P1)

An agent reads one heading's section and needs to know, from the help alone, exactly what the first characters of the returned body are, so it can use the body as-is without guessing or damaging it.

**Why this priority**: This is the defect itself. The current caveat leads agents to strip a character that is not there, corrupting the first word of content. Fixing the description of where the body starts delivers the whole value of the feature on its own.

**Independent Test**: Read the help page for the section-read capability and compare its description of the body's start against the bodies the capability returns for three notes: one with a blank line after the heading, one with text directly under the heading, and one with no content before the next heading.

**Acceptance Scenarios**:

1. **Given** a note whose target heading is followed by a blank line and then text, **When** an agent reads that section, **Then** the returned body starts with the blank line's line ending, and the help states that a body begins with a line break only when the note has a blank line directly after the heading.
2. **Given** a note whose target heading is followed directly by text on the next line, **When** an agent reads that section, **Then** the returned body starts with that text, and the help states that the heading line's own line ending is removed and no leading line break is added.
3. **Given** a note whose target heading has no content before the next heading, **When** an agent reads that section, **Then** the returned body is empty, and the help continues to say so.

---

### User Story 2 - Line endings described accurately (Priority: P2)

An agent reads sections from notes stored with Windows-style line endings and needs the help to state that every line ending in the body, including a leading blank line, is returned exactly as stored.

**Why this priority**: The Windows-style case is where the current advice to strip one character leaves a stray carriage return behind. It depends on Story 1's corrected description of the body's start, and extends it to the line-ending detail.

**Independent Test**: Read the help page and confirm it describes the Windows-style leading-blank-line case; then read a section from a Windows-style note with a blank line after the heading and confirm the body starts with a carriage return and line feed.

**Acceptance Scenarios**:

1. **Given** a note stored with Windows-style line endings and a blank line after the target heading, **When** an agent reads that section, **Then** the returned body starts with a carriage return followed by a line feed, and the help describes this case explicitly.
2. **Given** a note stored with Unix-style line endings and a blank line after the target heading, **When** an agent reads that section, **Then** the returned body starts with a single line feed, consistent with the help's statement that line endings are returned exactly as stored.

---

### User Story 3 - No false caveat remains (Priority: P3)

An agent reads the section-read help end to end and finds no statement that contradicts what the capability returns, and every worked example's body matches what the capability would return for that example's note.

**Why this priority**: Story 1 corrects the main statements; this story makes sure no stale copy of the old claim survives elsewhere on the page, including in the worked examples, which agents often copy literally.

**Independent Test**: Search the help page for any claim that the body always begins with a newline or that one leading character should be trimmed; for each worked example, construct the note it describes and confirm the shown body matches what the capability returns.

**Acceptance Scenarios**:

1. **Given** the help page for the section-read capability, **When** an agent reads it end to end, **Then** no statement claims the body always begins with a newline, and no statement advises trimming a leading character.
2. **Given** each worked example on the help page, **When** the example's note is read with the example's arguments, **Then** the body shown in the example equals the body the capability returns for that note.

---

### Edge Cases

- **Heading followed only by a blank line, then the next heading**: the body is that blank line's line ending (one line break), not empty. The help must not imply that every body with no prose is empty.
- **Heading followed by several blank lines**: the first blank line's ending and all later blank lines are kept; only the heading line's own ending is removed.
- **Heading is the last line of the note with no trailing line ending**: the body is empty.
- **Heading is the last line of the note with a trailing line ending and nothing after it**: the body is empty, because the only line ending present is the heading line's own.
- **Body text that itself begins with whitespace (for example an indented list item or code line directly under the heading)**: that whitespace is content and is kept exactly; the help must not suggest trimming it.
- **Note mixing Windows-style and Unix-style line endings**: each line ending is returned exactly as stored; the heading line's own ending is removed whichever style it uses.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The section-read help MUST state that the returned body begins immediately after the heading line, with the heading line's own line ending removed.
- **FR-002**: The section-read help MUST state that everything after the heading line's own line ending, including any blank lines, is returned exactly as written in the note.
- **FR-003**: The section-read help MUST state that a body begins with a line break only when the note has a blank line directly after the heading, and that a body whose text sits on the line directly under the heading begins with that text.
- **FR-004**: The section-read help MUST describe the Windows-style case: when the note uses Windows-style line endings and has a blank line after the heading, the body begins with a carriage return followed by a line feed.
- **FR-005**: The section-read help MUST continue to state that a heading with no content before the next heading returns an empty body and not an error, and MUST NOT imply that a heading followed only by blank lines returns an empty body.
- **FR-006**: The section-read help MUST NOT contain any statement that the body always begins with a newline, nor any advice to trim a leading character from the body.
- **FR-007**: Every worked example in the section-read help that shows a returned body MUST show the body the capability returns for the note that example describes; where an example's note is not otherwise described, the example MUST make the relevant note layout (blank line after the heading or not) clear enough for an agent to check it.
- **FR-008**: The section-read capability's returned bodies MUST remain unchanged by this feature; the correction is to the help only.
- **FR-009**: Any other user-facing description of the section-read capability that the server publishes (its short tool description and its output description) MUST NOT contradict FR-001 to FR-006 after this change.
- **FR-010**: The corrected help's statements and worked-example bodies MUST be checked once against real returned bodies with a live probe on the authorised test vault. The probe MUST cover a blank line after the heading (Unix-style endings), a blank line after the heading (Windows-style endings), text directly under the heading, an empty section, a heading followed only by a blank line, and a heading on the note's last line (with and without a trailing line ending). Every claim the corrected help makes about a returned body MUST be backed by one of these probe reads. Its observed results MUST be recorded as evidence in the feature folder.
- **FR-011**: This change MUST be documentation-only: it MUST NOT modify the section-read capability's source and MUST NOT add or change automated tests.

### Key Entities

- **Section body**: the text returned for one named heading — from just after the heading line's own line ending up to the next heading of any depth, or the end of the note. Attributes that matter here: its first characters, its line endings, and whether it is empty.
- **Line-ending styles**: "Windows-style" means CRLF (carriage return then line feed, `\r\n`) and "Unix-style" means LF (line feed, `\n`). The plan, contracts, tasks and help page use the CRLF / LF names.
- **Section-read help page**: the long-form reference agents read through the server's help capability for the section-read tool, containing the overview, output description, behavioural notes and worked examples.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero statements on the section-read help page claim the body always begins with a newline or advise trimming a leading character (from the current count of two statements plus four shown bodies with a leading newline: the Output block and Examples 1–3).
- **SC-002**: 100% of worked examples on the section-read help page that show a returned body match the body the capability returns for that example's note.
- **SC-003**: For each of the four note layouts in the acceptance scenarios (blank line after heading with Unix-style endings, blank line after heading with Windows-style endings, text directly under heading, no content before next heading), an agent following only the help predicts the first characters of the returned body correctly.
- **SC-004**: The capability's returned bodies for the same notes are identical before and after the change (no behaviour change).
- **SC-005**: The recorded live-probe evidence shows, for each of the six probed layouts, an observed body that agrees with the corrected help in every case (6 of 6).

## Assumptions

- "The help" means the long-form reference page for the section-read tool that agents retrieve through the server's help capability. That page is the only place the false claim appears today; the short tool description and the tool's output description do not repeat it, and FR-009 only requires they stay consistent.
- The capability's current behaviour — removing exactly one line ending (the heading line's own, in either Windows or Unix style) and returning the rest unchanged — is correct and intended, and is the behaviour the help will describe.
- The worked examples may be corrected either by changing the shown body or by stating the example note's layout, whichever keeps the example clearest; both satisfy FR-007.
- Existing automated checks on the help pages (for example, checks that each tool has a help page) continue to apply; no new help pages are added. No new automated guard is added: the strip rule the help describes stays unpinned by tests, which was accepted in the 2026-10-31 clarification in favour of keeping the change documentation-only.
- Out of scope: changing what the capability returns; trimming blank lines or other whitespace from bodies; adding an option that changes how the start of the body is returned; auditing other tools' help pages for similar claims.
