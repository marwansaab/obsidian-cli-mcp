# Feature Specification: Clarify heading-path rules

**Feature Branch**: `079-clarify-heading-paths`
**Created**: 2026-11-01
**Status**: Draft
**Input**: User description: "Clarify heading-path rules — the documentation for reading one heading's section and for editing one heading's section states exactly how a heading path must be written: it starts with the note's top-level (level-1) heading and names one heading per level, in order, down to the target. It also says which sections cannot be reached this way. What the two capabilities do does not change."

## Context

Two capabilities address one heading's section by a heading path: the section-read capability (`read_heading`, segments separated by `::`) and the section-edit capability (`patch_heading`, segments separated by `#`). Both resolve a path the same way today:

- The first segment must be the text of a level-1 heading in the note.
- Each later segment must be the text of a heading exactly one level below the previous segment, sitting inside that previous heading's section.
- The number of segments therefore equals the target heading's level.

As a consequence, a section is unreachable when the note has no level-1 heading above it, or when any heading on the way down skips a level (for example a level-3 heading placed directly under a level-1 heading).

The published wording does not say any of this. Both capabilities say only that a path needs "at least two segments", and the section-edit capability adds that "top-level headings are out of scope". Agents read that as "leave the level-1 heading out", write paths such as `Section::Subsection` or `Section#Subsection`, receive heading-not-found although both headings exist, and spend several calls recovering. In the unreachable cases no path works and nothing tells the agent to stop.

This feature changes documentation with no runtime behaviour change (BI-0125: "docs-only … No runtime change"): it changes tool descriptions, parameter descriptions and each capability's help page. Because tool and parameter descriptions are published from source, the change does touch source files, but only their description text. No runtime text changes — error messages and validation-failure messages stay as they are — and matching behaviour, error codes and result shapes are untouched.

## Clarifications

### Session 2026-11-01

- Q: Where should the heading-not-found cause hint live — documentation only, documentation plus the runtime error message, or also a structured hint field? → A: Documentation only (Option A). BI-0125 is docs-only ("No runtime change"), and its acceptance criterion places the hint in the error's documented recovery guidance; the runtime heading-not-found messages stay unchanged. By the same scope rule, the one-segment validation-failure messages also stay unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rule stated plainly (Priority: P1)

An agent that has never used the section-read or section-edit capability reads its description (and, if it wants more, its help page) and writes a correct heading path on the first attempt.

**Why this priority**: This is the root cause of the wasted calls. Every other story is a recovery aid; this one prevents the miss in the first place.

**Independent Test**: Read the published description and help page of each capability and confirm both state, in the same terms, that the first segment is the note's level-1 heading and each later segment is the heading one level below the previous one; confirm no sentence in either can be read as "omit the level-1 heading".

**Acceptance Scenarios**:

1. **Given** the section-read capability's description and help page, **When** an agent reads them, **Then** they state that the first segment must be the note's level-1 heading and that each later segment must be the heading one level below the previous one.
2. **Given** the section-edit capability's description and help page, **When** an agent reads them, **Then** they state the same rule in the same terms (differing only in the separator), and no sentence can be read as "omit the level-1 heading".
3. **Given** the heading-path parameter description of either capability, **When** an agent reads only the parameter description, **Then** it states the same rule in short form.

---

### User Story 2 - Unreachable sections named (Priority: P2)

An agent working on a note that has no level-1 heading, or that skips a heading level, learns from the documentation that the section it wants cannot be addressed by a heading path, and is told which whole-note capability to use instead.

**Why this priority**: In these cases no retry can succeed; without this statement the agent loops until it gives up. It matters less often than Story 1 but costs the most when it happens.

**Independent Test**: Read each capability's help page and confirm it names both unreachable cases and the whole-note alternative.

**Acceptance Scenarios**:

1. **Given** the section-read capability's help page, **When** an agent reads it, **Then** it states that sections in a note with no level-1 heading, and sections below a skipped heading level, cannot be addressed, and it names the whole-note read capability as the alternative.
2. **Given** the section-edit capability's help page, **When** an agent reads it, **Then** it states the same two unreachable cases and names the whole-note write capability as the alternative.

---

### User Story 3 - Error guidance names the cause (Priority: P2)

An agent that has just received heading-not-found from either capability reads that error's documented recovery guidance and finds the most common cause named first, so it can correct the path without outside help.

**Why this priority**: Agents that skipped the rule (or read an older description) recover in one call instead of several.

**Independent Test**: Read the heading-not-found entry in each capability's error documentation (description and help page) and confirm it names a missing level-1 segment or a skipped level as the most common cause before it suggests the outline capability.

**Acceptance Scenarios**:

1. **Given** a heading-not-found error from the section-read capability, **When** an agent reads that error's documented recovery guidance, **Then** it names a missing level-1 segment or a skipped level as the most common cause before suggesting the outline capability.
2. **Given** a heading-not-found error from the section-edit capability, **When** an agent reads that error's documented recovery guidance, **Then** the same holds.

---

### User Story 4 - Worked examples (Priority: P3)

An agent learning from examples sees a full path running from a level-1 heading down to a level-3 heading, and sees the shorter path that leaves out the level-1 heading failing with heading-not-found.

**Why this priority**: Examples reinforce the rule but depend on Story 1's wording being right.

**Independent Test**: Read the examples section of each help page and confirm the two required examples are present and consistent with the rule.

**Acceptance Scenarios**:

1. **Given** either capability's help page, **When** an agent reads the examples, **Then** at least one shows a three-segment path from a level-1 heading to a level-3 heading.
2. **Given** either capability's help page, **When** an agent reads the examples, **Then** at least one shows the failing shorter path (the level-1 heading left out) together with its heading-not-found result.

---

### User Story 5 - No other capability left misleading (Priority: P3)

A reviewer searching every capability's published text for the "at least two segments" and "top-level headings are out of scope" wording finds each remaining occurrence accurate, or corrected in the same change.

**Why this priority**: Keeps the fix from being undone by a stale sentence elsewhere; low effort once Stories 1–2 are written.

**Independent Test**: Search all published descriptions, parameter descriptions, validation messages, server instructions and help pages for both phrases and review each hit.

**Acceptance Scenarios**:

1. **Given** every capability's published description, parameter descriptions, validation messages and help page, **When** a reviewer looks for "at least two segments" or "top-level headings are out of scope", **Then** every remaining occurrence is accurate in context or has been corrected in the same change.

---

### Edge Cases

- **Note with several level-1 headings**: a path may start from any of them; the documentation must not imply that only the first level-1 heading in the note can start a path.
- **Target is a level-1 heading itself**: a one-segment path is rejected at validation; the documentation must present this as "a level-1 section cannot be addressed by these capabilities, use the whole-note capability", not as "leave the level-1 heading out".
- **Level skipped below the target**: a skip *below* the target (for example a level-4 heading directly under a level-2 target) does not stop the target from being addressed; the documentation must say the skip blocks only sections at or below the skipped level on that branch.
- **Level skipped above the target on a different branch**: a skip in one branch of the note does not affect sections in other branches; the wording must not suggest the whole note becomes unreachable.
- **Setext-style headings and headings inside code blocks**: existing statements about these stay; the new wording must not contradict them.
- **Separator difference**: the two capabilities keep different separators; the shared rule is stated once per capability using that capability's own separator in every example.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The section-read capability's description MUST state that the first path segment is the note's level-1 heading and that each later segment is the heading exactly one level below the previous one.
- **FR-002**: The section-edit capability's description MUST state the same rule in the same terms, using its own separator.
- **FR-003**: Each capability's heading-path parameter description MUST state the rule in short form (first segment is the level-1 heading; one segment per level down to the target).
- **FR-004**: No sentence in either capability's published documentation (descriptions, parameter descriptions, help page) may say or imply that the level-1 heading is to be omitted; "top-level headings are out of scope" and any equivalent MUST be reworded so it refers only to addressing a level-1 section by itself. The one exception is a help page's verbatim quote of the unchanged one-segment validation message (FR-006). That quote MUST be followed at once by a note that it refers to addressing the level-1 heading on its own and that every path still starts at the level-1 heading.
- **FR-005**: Where the "at least two segments" requirement is kept (it remains the validation rule), it MUST be accompanied by, or rephrased to, its meaning: the target must be at level 2 or deeper, and the path names the level-1 heading first.
- **FR-006**: The validation-failure message for a one-segment path in each capability MUST NOT change (no runtime change). It fires only for a one-segment path, so its "top-level headings are out of scope" wording is accurate in that context; the help page MUST explain that this message means a level-1 section cannot be addressed by itself, not that the level-1 heading is to be omitted.
- **FR-007**: Each capability's help page MUST state that sections in a note with no level-1 heading, and sections below a skipped heading level, cannot be addressed by a heading path.
- **FR-008**: Each capability's help page MUST name the whole-note alternative for unreachable sections and for level-1 sections: the whole-note read capability for the section-read capability, the whole-note write capability for the section-edit capability.
- **FR-009**: The documented recovery guidance for heading-not-found, in each capability's description and help page, MUST name a missing level-1 segment or a skipped level as the most common cause before suggesting the outline capability.
- **FR-010**: Each capability's help page MUST include at least one worked example with a three-segment path from a level-1 heading to a level-3 heading, and at least one worked example showing the shorter path without the level-1 heading and its heading-not-found result.
- **FR-011**: Every occurrence of "at least two segments", "minimum two segments", "top-level headings are out of scope" or equivalent wording in any capability's published documentation (descriptions, parameter descriptions, server instructions, help pages) MUST be accurate in context or corrected in this change. Occurrences in runtime messages are reviewed for accuracy in context and left unchanged (FR-006, FR-012).
- **FR-012**: How either capability matches heading paths, which sections it can reach, its error codes, its runtime error and validation messages, and the shape of its results MUST NOT change.
- **FR-013**: Every published-text change MUST be covered by a check that fails if the rule statement, the unreachable-section statement or the heading-not-found guidance is removed from either capability.

### Key Entities

- **Heading path**: an ordered list of heading texts, one per heading level, starting at a level-1 heading and ending at the target heading; written with `::` between segments for the section-read capability and `#` for the section-edit capability.
- **Unreachable section**: a section that no heading path can address — one in a note with no level-1 heading above it, one below a skipped heading level, or a level-1 section itself.
- **Recovery guidance**: the documented next step attached to a heading-not-found error.

## Success Criteria *(mandatory)*

### Measurable Outcomes

SC-001, SC-003 and SC-004 are reviewer-judged checks of the published text, not trials of agent behaviour, matching the acceptance criteria's "when an agent reads them, then they state…" form.

- **SC-001**: A reviewer reading only a capability's description and heading parameter description, for both capabilities, finds enough to write the correct path for a level-2 and a level-3 target under a level-1 heading on the first attempt: the text states that the path starts at the level-1 heading, that each segment is one level below the previous, and gives a three-segment example.
- **SC-002**: Zero occurrences remain, across all capabilities' published text, of wording that a reviewer can read as "omit the level-1 heading".
- **SC-003**: A reviewer reading either help page finds, for a note with no level-1 heading and for a section below a skipped level, a plain statement that the section cannot be addressed and the name of the whole-note alternative, so the page gives no reason to retry path variants.
- **SC-004**: A reviewer reading the documented heading-not-found guidance of either capability finds a missing level-1 segment or a skipped level named as the most common cause, before any other recovery step, in enough detail to correct such a path without outside help.
- **SC-005**: Both capabilities' existing behaviour checks pass unchanged, confirming no behavioural change.

## Assumptions

- The behaviour described in Context was confirmed by reading both capabilities' current path-resolution logic: both require the first segment at level 1 and each later segment exactly one level deeper. This feature documents that behaviour; it does not change it.
- "Help" means each capability's long reference page served by the help capability; "description" means the published tool description and parameter descriptions.
- The runtime heading-not-found error keeps its current code and message; the cause hint lives in the documented recovery guidance, not in the runtime message (confirmed in Clarifications, Session 2026-11-01). No runtime text changes at all, including the one-segment validation message (FR-006).
- Rewording published descriptions and parameter descriptions changes the published tool schema text; this is a deliberate change and the project's published-surface baseline is updated with it.
- The whole-note alternatives are the existing whole-note read capability (`read`) and whole-note write capability (`write_note`).
- The living system documentation (`.docs-as-code/`), which repeats the "at least two path segments" wording for the section-read capability, is brought in line during the project's documentation pass on this change's pull request.

## Out of Scope

- Changing how either capability matches heading paths, including letting a path start below the level-1 heading or skip levels.
- Making sections in notes without a level-1 heading reachable.
- Making the two capabilities use the same path separator (tracked separately).
- Changes to the outline capability.
