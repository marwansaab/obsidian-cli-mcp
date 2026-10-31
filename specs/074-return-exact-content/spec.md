# Feature Specification: Return Exact Content

**Feature Branch**: `074-return-exact-content`  
**Created**: 2026-10-31  
**Status**: Draft  
**Input**: User description: "Return exact content — reading a note returns exactly the text stored in the note, with no extra trailing line break added when the note does not end with one."

## Background

Today the capability that reads a whole note returns a note whose text does not end with a line break with one line break added, while a note that already ends with a line break comes back unchanged. Because the added line break looks exactly like a real one, an agent cannot tell from the result whether the note really ends with a line break. Agents that write a note and read it back cannot compare the two directly, and an agent deciding whether to put a separator before adding more text bases that decision on a character that may not be in the note. The reference documentation for reading a note currently carries a caveat warning about the added line break and steers agents away from read-and-compare verification. This feature makes the read return the note's real content and removes the caveat.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read a note without a trailing line break exactly (Priority: P1)

An agent reads a note whose text does not end with a line break and receives exactly that text, with nothing added at the end.

**Why this priority**: This is the defect itself. Every other story depends on the read no longer adding a character that is not in the note.

**Independent Test**: Place a note containing exactly `first` (no trailing line break) in the test vault, read it, and check that the result is exactly `first`, five characters long.

**Acceptance Scenarios**:

1. **Given** a note containing exactly `first` with no trailing line break, **When** the agent reads it, **Then** the result is exactly `first`.
2. **Given** a multi-line note whose last line has no trailing line break, **When** the agent reads it, **Then** the result is the note's text exactly, ending with the last character of that last line.

---

### User Story 2 - Keep a real trailing line break (Priority: P1)

An agent reads a note that genuinely ends with a line break and receives that line break, exactly once. Fixing the added line break must not remove real content.

**Why this priority**: A fix that strips a final line break unconditionally would trade one wrong answer for another and lose real content. This story is the guard that keeps the fix honest, so it shares top priority with Story 1.

**Independent Test**: Place a note containing `first` followed by one line break, read it, and check that the result is `first` followed by exactly one line break. Repeat with a note whose lines end in Windows-style line breaks.

**Acceptance Scenarios**:

1. **Given** a note containing `first` followed by one line break, **When** the agent reads it, **Then** the result is `first` followed by exactly one line break.
2. **Given** a note whose lines end in Windows-style line breaks (carriage return then line feed), **When** the agent reads it, **Then** those line breaks are returned unchanged and no extra line break is added.
3. **Given** a note that ends with two or more consecutive line breaks, **When** the agent reads it, **Then** every one of those line breaks is returned and none is added.

---

### User Story 3 - Empty note stays empty (Priority: P2)

An agent reads an empty note and receives an empty result, as it does today.

**Why this priority**: Current behaviour is already correct; this story protects it from regression.

**Independent Test**: Place an empty note in the test vault, read it, and check that the result is empty and the read succeeds.

**Acceptance Scenarios**:

1. **Given** an empty note, **When** the agent reads it, **Then** the read succeeds and the result is empty.

---

### User Story 4 - Round trip with the writing capabilities (Priority: P2)

An agent writes text to a note with any of the note-writing capabilities and then reads the note back, and the result equals the text the note holds, so the agent can confirm the write by direct comparison.

**Why this priority**: This is the main practical payoff for agents and test authors, but it follows directly from Stories 1–3 once they hold.

**Independent Test**: For each note-writing capability, produce a note holding a known text both with and without a trailing line break, read it immediately afterwards, and compare the result with the known text character for character.

**Acceptance Scenarios**:

1. **Given** text written to a note by any of the note-writing capabilities (create or replace a note, add to its end, add to its top, edit a heading's section, edit a block, set a property, replace text across notes) so that the note holds exactly that text, **When** the agent reads the note immediately afterwards, **Then** the result equals that text exactly.
2. **Given** a note created with text that has no trailing line break, **When** the agent reads it and then decides whether to add a separator before adding more text, **Then** the read shows that the note's final character is not a line break.

---

### User Story 5 - Documentation states the exact contract (Priority: P3)

An agent consulting the reference documentation for reading a note finds the result described as the note's exact content, with no added-line-break caveat.

**Why this priority**: The documentation must match the new behaviour, but it carries no behaviour of its own.

**Independent Test**: Review the reading capability's reference documentation and its published description, and check that both describe the result as the note's exact content and that no text mentions an added or synthetic trailing line break.

**Acceptance Scenarios**:

1. **Given** the reference documentation for reading a note, **When** the agent consults it, **Then** it describes the result as the note's exact content and no longer carries an added-line-break caveat.
2. **Given** the reference documentation for reading a note, **When** the agent looks for how to verify a write, **Then** it no longer steers the agent away from reading the note back and comparing.

---

### Edge Cases

- A note whose last line ends with a lone carriage return (no line feed) is returned with that carriage return and nothing added.
- A note that consists only of one or more line breaks is returned as exactly those line breaks.
- A note that begins with a byte-order mark keeps it in the result. Today's read drops it (research.md F2); the read must return it. No other transformation (trimming, line-ending conversion) is introduced.
- Notes with mixed line-ending styles are returned unchanged.
- Canvases and bases, which the same reading capability also returns, follow the same exact-content contract.
- Reading the focused note (active mode) follows the same exact-content contract as reading a named note.
- A note that cannot be found, an unknown vault, a file of an unsupported type, or no focused note fails exactly as it does today; this feature changes only the content of successful reads.
- A note deleted, locked or made unreadable after its text has been fetched but before its first and last characters are confirmed makes the read fail with an explicit error (FR-008). It does not return the unconfirmed text.
- A note changed by another writer during the read (a window of a few milliseconds of local disk access) may come back with its first or last character taken from the other version. This is accepted, as it is for the writing capabilities: the latest write wins, and the next read is exact.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The reading capability MUST return the note's stored text exactly: the same characters, in the same order, with nothing added and nothing removed.
- **FR-002**: When a note's text does not end with a line break, the result MUST NOT end with a line break.
- **FR-003**: When a note's text ends with one or more line breaks, the result MUST end with exactly those line breaks, in their original style (line feed, or carriage return then line feed).
- **FR-004**: Reading an empty note MUST succeed and return an empty result.
- **FR-005**: The exact-content contract MUST hold for every way of choosing what to read: by note name, by vault-relative path, and the focused note.
- **FR-006**: The exact-content contract MUST hold for every file type the reading capability accepts (notes, canvases and bases).
- **FR-007**: For any note produced by a note-writing capability, reading it immediately afterwards MUST return text equal to what that note holds.
- **FR-008**: The feature MUST NOT change which files can be read, how the file to read is located, the result's shape, or the failures reported for reads that do not succeed. The only new failure allowed: if the read has fetched the note's text but the note can no longer be found or read before its real first and last characters are confirmed (for example, it was deleted or locked at that moment), the read MUST fail with an explicit error. It MUST NOT return text it could not confirm.
- **FR-009**: The reading capability's published description and reference documentation MUST describe the result as the note's exact content and MUST NOT mention an added trailing line break.
- **FR-010**: Automated tests MUST cover at least: a note without a trailing line break, a note with one trailing line feed, a note with Windows-style line breaks, and an empty note.

### Key Entities

- **Note content**: the exact sequence of characters stored in a note (or canvas or base), including any final line breaks and their style. It is the single source of truth the read result must equal.
- **Read result**: the text the reading capability returns for one successful read. After this feature, it is identical to the note content.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of the acceptance cases above, the read result equals the stored note content character for character, and its length equals the note's length.
- **SC-002**: A note containing exactly `first` reads back as 5 characters, not 6.
- **SC-003**: For every note-writing capability, a write followed by an immediate read compares equal on the first attempt, with no caveat or post-processing by the agent.
- **SC-004**: The reading capability's documentation and published description contain zero references to an added or synthetic trailing line break.
- **SC-005**: Reads that failed before this feature fail the same way after it. Every read that succeeds today still succeeds, unless the note disappears or becomes unreadable while it is being read (the FR-008 case). That case is reported as an explicit failure, never as unconfirmed text.

## Assumptions

- The note's stored content is what is on disk at the moment of the read; reading it directly gives the authority against which the result is checked.
- The added line break comes from the layer below this project (Obsidian's command-line read), which is not changed (see Out of scope); the fix lives in this project.
- The reading capability keeps its current result shape; only the text inside it changes, and only for notes that do not end with a line break or that begin with a byte-order mark. A plan-time check found that today's read also drops a leading byte-order mark, which the byte-order-mark edge case and FR-001 rule out (see research.md F2).
- Canvases and bases are included because the same capability reads them and an asymmetric contract across file types would be surprising; the out-of-scope list names only other capabilities.
- Agents and tests that currently strip one trailing line break to work around the old behaviour must stop doing so; the change is treated as a defect fix, not a breaking interface change, because the result now matches the documented intent of returning the file's raw text.

## Out of Scope

- Other read-side capabilities (reading one heading, reading one property, searches); they are separate items if they show the same behaviour.
- An option letting the caller choose between exact output and output with an added line break.
- Changes to Obsidian itself.
- Any change to how notes are located or which notes can be read.
