# Feature Specification: Verify Lifecycle Errors

**Feature Branch**: `094-verify-lifecycle-errors`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Verify lifecycle errors — the similar-notes search reports each state of the semantic-search plugin (not installed, installed but not ready, source note not yet indexed) and a target that is not a note with its own documented failure, in the documented order of precedence, and each of these is proven on demand without having to catch the plugin while it is starting or indexing."

## Background

The similar-notes search (the `smart_connections_similar` tool) depends on the Smart Connections plugin. Its published documentation (`docs/tools/smart_connections_similar.md`, *Error roster* and *Error-precedence chain*) promises one distinct failure per problem and a fixed order in which they are checked, so that a call with several problems reports only the most fundamental one:

1. plugin not installed (`SMART_CONNECTIONS_NOT_INSTALLED`)
2. target missing (`FILE_NOT_FOUND`, or `ERR_NO_ACTIVE_FILE` in active mode when no note is focused)
3. target not a note (`NOT_MARKDOWN`)
4. plugin installed but not ready (`SMART_CONNECTIONS_NOT_READY`)
5. source note not yet indexed (`SOURCE_NOT_INDEXED`)
6. success

Today's checks prove two things separately: how each failure is reported once it has been detected (the reporting step is given a ready-made answer), and how successful results are ordered (the detection step is run against a simulated plugin, but only in its ready state). Nothing runs the detection step itself through each failure state, so nothing proves that the search detects each state, or that it checks them in the documented order. Two of the states (not ready, not indexed) exist only for a few seconds while the plugin starts or indexes a new note, so they have never been observed end to end against a live plugin either. A later change could swap two checks or drop one and every existing check would still pass.

This item adds checks that put the search into each state on demand, by simulating the plugin and the vault, and confirm both the failure the agent receives and the order of precedence. It changes no failure, no wording and no order.

## Clarifications

### Session 2026-11-04

- **C-001** — Q: Should each new check run in one step from the simulated plugin state to the failure the agent receives, or should it prove only that the search detects the state and leave the reporting to the existing checks? → A: One step (Option A). Each check calls the similar-notes search with a stand-in for the Obsidian command-line call. The stand-in runs the search's real detection step against the simulated vault and plugin. The check then confirms the failure the search returns (its code, its `details.code`, its documented detail and, for not-ready, its reason) or the results it returns. Rationale: the backlog item's acceptance criteria are written as the failure "returned" to the agent, precedence included, and its Why and Impact name the gap: checks today confirm only how a ready-made answer is reported, not detection plus order. Under ADR-014, every lifecycle code is detected inside Obsidian and reaches the agent as `CLI_REPORTED_ERROR` with a `details.code`, so the check has to run from the detection step through to that failure. Applied to: User Story 5, FR-010, Key Entities, SC-001.
- **C-002** — Q: Should the checks also cover active mode, where the search uses the note focused in Obsidian and fails with `ERR_NO_ACTIVE_FILE` when no note is focused, or only specific mode, where the agent names the vault and note? → A: Specific mode in full, plus three active-mode checks with no note focused (Option B): on its own, combined with not-installed (not-installed wins), and combined with not-ready (no-focused-note wins). Rationale: the backlog item's Feature line requires failures "in the documented order of precedence". ADR-014 documents a separate active-mode order: `SMART_CONNECTIONS_NOT_INSTALLED` → `NO_ACTIVE_FILE` → `NOT_MARKDOWN` → `SMART_CONNECTIONS_NOT_READY` → `SOURCE_NOT_INDEXED`. Its no-focused-note step is the only one in that order that reaches the agent differently (`ERR_NO_ACTIVE_FILE`, not `CLI_REPORTED_ERROR` with a `details.code`), so it is proven there. The other active-mode steps share the specific-mode checks, so running the whole matrix again in active mode would go beyond the backlog item's precedence criteria. Applied to: User Story 4, Edge Cases, FR-006, FR-007, FR-008.
- **C-003** — Q: How should the item prove that the new checks really catch a detection step that is swapped or dropped: one recorded manual exercise while it is built, a permanent automated check, or the coverage argument alone? → A: One recorded manual exercise (Option A). While the item is built, each adjacent pair of detection steps is swapped and each step is dropped, one change at a time, in a scratch copy. The new checks are run on each copy, and the item's records list which check failed for each change. Nothing extra is committed to the test suite. Rationale: the permanent guard is the precedence checks themselves, which the backlog item asks to run before every release ("Story: precedence", "Story: proven on demand"). The backlog item is tier 3 (`impact: 03-low`), and neither it nor the Constitution asks for committed mutation tests. The detection steps are inline lines of ADR-014's frozen template, so an automated check would have to rewrite that template's text and would break whenever the text changed. A one-off recorded exercise gives the evidence without that brittle code. Applied to: User Story 5, FR-012, SC-003.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Distinct failure when the plugin is installed but not ready (Priority: P1)

An agent asks for notes similar to an existing note while the semantic-search plugin is installed but its similarity lookup is not yet available (it is still starting up, or its version exposes a different lookup). The agent receives the not-ready failure, with its reason, and no results, so it knows to wait and retry rather than install the plugin or pick another note.

**Why this priority**: Not-ready is the state most often confused with others: without a distinct failure an agent would treat a starting plugin as missing or as having no similar notes. It is also one of the two states that have never been observed.

**Independent Test**: Put the simulated plugin into each not-ready condition, call the search for an existing note, and confirm the not-ready failure, its reason and the absence of results.

**Acceptance Scenarios**:

1. **Given** the plugin is installed but its similarity lookup is not yet available, **When** an agent asks for notes similar to an existing note, **Then** the not-ready failure is returned with its reason and no results.
2. **Given** the plugin is installed and its index exists but is not yet in a usable shape, **When** the agent asks for notes similar to an existing note, **Then** the same not-ready failure is returned.

---

### User Story 2 - Distinct failure when the source note has not been indexed yet (Priority: P1)

An agent asks for notes similar to a note the plugin has not indexed yet (typically a note created a moment ago). The agent receives the not-indexed failure naming the note, so it retries shortly instead of concluding that the note has no similar notes. Once the plugin has indexed the note, the same call returns results.

**Why this priority**: A missing not-indexed failure would look like an empty result, the most misleading outcome for an agent. It is the second state that has never been observed.

**Independent Test**: With the simulated plugin ready but without the source note in its index, call the search and confirm the not-indexed failure names the note; then add the note to the simulated index, repeat the call and confirm results are returned.

**Acceptance Scenarios**:

1. **Given** the plugin is ready but the source note is not in its index, **When** the agent asks for similar notes, **Then** the not-indexed failure is returned and names the note.
2. **Given** the plugin has since indexed the note, **When** the agent repeats the call, **Then** results are returned.
3. **Given** the plugin's index holds an entry for the note that cannot yet be searched, **When** the agent asks for similar notes, **Then** the not-indexed failure is returned and names the note.

---

### User Story 3 - Distinct failure when the target is not a note (Priority: P2)

An agent asks for notes similar to a file that is not a note: a canvas, a base or an attachment. The agent receives the not-a-note failure naming the file and its type, so it chooses a note instead.

**Why this priority**: The failure is already reachable in a live vault at any time, so it is less at risk than the two transient states; it matters here mainly for its place in the precedence order.

**Independent Test**: For each of a canvas, a base and an attachment in the simulated vault, call the search and confirm the not-a-note failure names the file and its type.

**Acceptance Scenarios**:

1. **Given** the target is a canvas, a base or an attachment, **When** the agent asks for similar notes, **Then** the not-a-note failure is returned and names the file and its type.

---

### User Story 4 - The most fundamental problem is reported first (Priority: P1)

When a call has several problems at once, the agent receives only the failure for the most fundamental one, in the documented order, so it fixes things in the right order: install the plugin before worrying about the file, pick a note before waiting for the plugin, wait for the plugin before waiting for the note.

**Why this priority**: The order is the part no existing check covers at all, and the part a reshuffle would silently break.

**Independent Test**: Combine two failure states at a time in the simulated plugin and vault, call the search, and confirm the failure returned is the one the documented order puts first.

**Acceptance Scenarios**:

1. **Given** the target is not a note and the plugin is not ready, **When** the agent asks for similar notes, **Then** the not-a-note failure is returned.
2. **Given** the plugin is not ready and the source note is not indexed, **When** the agent asks, **Then** the not-ready failure is returned.
3. **Given** the plugin is not installed and the target is missing, **When** the agent asks, **Then** the not-installed failure is returned.
4. **Given** the plugin is not installed and the target is not a note, **When** the agent asks, **Then** the not-installed failure is returned.
5. **Given** the target is missing and the plugin is not ready, **When** the agent asks, **Then** the target-missing failure is returned.
6. **Given** active mode with no note focused and the plugin not installed, **When** the agent asks, **Then** the not-installed failure is returned.
7. **Given** active mode with no note focused and the plugin not ready, **When** the agent asks, **Then** the no-focused-note failure (`ERR_NO_ACTIVE_FILE`) is returned.

---

### User Story 5 - Every state proven on demand before a release (Priority: P1)

A maintainer runs the release checks and every state above is produced on demand, with its failure and its place in the order confirmed, without a live plugin and without waiting for one to start or index. A change that breaks detection of any state, swaps two adjacent checks or drops a check makes at least one of these checks fail before release.

**Why this priority**: This is the guard the item exists for; without it the other stories hold only until the next change.

**Independent Test**: Run the release checks and confirm each state and each precedence pair has a passing check that goes from the simulated state to the failure the search returns; then, as a one-off exercise recorded in the item's records, swap each adjacent pair of detection steps and drop each step, one change at a time, in a scratch copy, and confirm that a check fails for every change (Clarifications C-003).

**Acceptance Scenarios**:

1. **Given** each state above, **When** the checks for a release are run, **Then** each state is produced on demand and its failure and precedence are confirmed, without waiting for the plugin to start or index.
2. **Given** a scratch copy in which two adjacent detection steps are swapped or one is dropped, **When** the new checks are run against it during the one-off exercise, **Then** at least one check fails and names the state it expected, and the outcome is recorded (Clarifications C-003).

---

### Edge Cases

- **Active mode with no focused note**: in active mode the target-missing state is "no note focused". It takes the same place in the order as a missing file: not-installed is still reported before it, and it is reported before not-ready. It is the one failure in the order that reaches the agent under its own top-level code, `ERR_NO_ACTIVE_FILE`, rather than as `CLI_REPORTED_ERROR` with a `details.code`. Active mode's later steps (not a note, not ready, not indexed) are the same checks as in specific mode and are proven there, not again in active mode (Clarifications C-002).
- **Missing target named two ways**: a missing target named by its exact path and one named by its note name are both the target-missing failure, and each says which way it was named.
- **Several not-ready conditions**: the plugin has no index at all; it has an index without its note collection; it has a note collection with no entries table yet; or the entries table is empty (null). Each is the same not-ready failure with the same reason.
- **Several not-indexed conditions**: the source note is absent from the index, or present but not yet searchable. Each is the same not-indexed failure naming the note.
- **Attachment types**: an attachment of any non-note type (for example an image or a PDF) is reported as not-a-note, with its own type named.
- **A note that is ready and indexed but has no similar notes**: this is a success with zero results, never a not-indexed failure, so an empty result and a not-indexed failure stay distinguishable.
- **Failure details survive the reporting step**: the file name, file type and not-ready reason that the detection step produces reach the agent unchanged in the failure it receives.

## Requirements *(mandatory)*

### Functional Requirements

**Detection of each state**

- **FR-001**: When the plugin is not installed in the vault, the similar-notes search MUST return the not-installed failure (`SMART_CONNECTIONS_NOT_INSTALLED`), naming the vault, and no results.
- **FR-002**: When the plugin is installed but its similarity lookup is not available, in any of the not-ready conditions listed under Edge Cases, the search MUST return the not-ready failure (`SMART_CONNECTIONS_NOT_READY`) with its documented reason, and no results.
- **FR-003**: When the plugin is ready but the source note is not in its index, or is in it but not yet searchable, the search MUST return the not-indexed failure (`SOURCE_NOT_INDEXED`) naming the note, and no results.
- **FR-004**: When the same note is later present and searchable in the index, the same call MUST return results.
- **FR-005**: When the target is a canvas, a base or an attachment, the search MUST return the not-a-note failure (`NOT_MARKDOWN`) naming the file's path and its type.
- **FR-006**: When the target does not exist (named by path or by note name), or no note is focused in active mode, the search MUST return the documented target-missing failure (`FILE_NOT_FOUND`, or `ERR_NO_ACTIVE_FILE` in active mode). Active mode is checked only for the no-focused-note state (Clarifications C-002).

**Order of precedence**

- **FR-007**: When several of these problems apply to one call, the search MUST return exactly one failure: the first in the documented order *not installed → target missing → not a note → not ready → not indexed*. In active mode, "target missing" is "no note focused" (ADR-014's active-mode order).
- **FR-008**: The checks MUST cover at least these combinations: not-a-note with not-ready; not-ready with not-indexed; not-installed with a missing target; not-installed with a not-a-note target; a missing target with not-ready. Together these cover every adjacent pair in the order that can occur at once; a missing target and a not-a-note target cannot both hold, since a missing file has no type. In active mode, the checks MUST cover no note focused on its own, combined with not-installed (not-installed is returned) and combined with not-ready (`ERR_NO_ACTIVE_FILE` is returned). No other active-mode combination is required (Clarifications C-002).

**Proof on demand**

- **FR-009**: Each state in FR-001 to FR-006 and each combination in FR-008 MUST be produced on demand by simulating the plugin and the vault, without a live plugin and without waiting for a plugin to start or index.
- **FR-010**: Each check MUST go in one step from the simulated state to what the agent receives. It calls the similar-notes search itself, with only the Obsidian command-line call replaced by a stand-in. The stand-in runs the search's real detection step against the simulated vault and plugin, never a ready-made detection result. The check MUST confirm the failure the search returns: its code (`CLI_REPORTED_ERROR`, or `ERR_NO_ACTIVE_FILE` in active mode), its `details.code`, its documented detail (vault, file, type or note) and, for not-ready, its reason. It MUST also confirm that no results come back. For the success case, it confirms the results returned (Clarifications C-001).
- **FR-011**: The checks MUST run as part of the project's release checks, on every platform those checks run on, and MUST need no running Obsidian.
- **FR-012**: In each of these cases at least one of these checks MUST fail, and its failure message MUST name the state or combination it expected:
  - any state is no longer detected;
  - any two adjacent checks in the order are swapped;
  - any single check is removed.

  This is shown once, by the recorded manual exercise in Clarifications C-003. The exercise swaps each adjacent pair and drops each step, one change at a time. It does not swap non-adjacent checks, because the precedence this item proves is between adjacent states. No test that rewrites the detection step is committed.

**No change to the published contract**

- **FR-013**: This item MUST NOT change which failures exist, their codes, their wording, their details or their order of precedence, and MUST NOT add a mode that forces a state or makes the search wait for indexing.
- **FR-014**: If a check shows that current behaviour departs from the published documentation, the departure MUST be raised to the owner as a defect rather than written into the check as expected behaviour.

### Key Entities

- **Lifecycle state**: one condition the plugin or target can be in: not installed, not ready, source not indexed, ready and indexed (success), plus the target conditions missing and not a note. Each maps to one documented failure, or to success.
- **Simulated plugin and vault**: a stand-in for Obsidian's vault and the plugin, set up per check to put the search into one state or one combination of states, so the state exists for as long as the check needs it. The search's real detection step runs against it, reached through a stand-in for the Obsidian command-line call. Everything else on the way from the search call to the failure is the real code (Clarifications C-001).
- **Precedence order**: the documented sequence in which the search checks the states; the first failing state is the only one reported.
- **Failure as received**: what the agent gets back for a state: the failure's code, its documented detail and no results.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every one of the six documented outcomes (not installed, target missing, not a note, not ready, not indexed, success after indexing) has at least one passing check. Each check runs in one step from the simulated state to the failure or results the search returns (Clarifications C-001).
- **SC-002**: Each of the five precedence combinations in FR-008 has a passing check, covering every adjacent pair in the documented order that can occur at once (FR-008).
- **SC-003**: In the one-off exercise, every adjacent swap of detection steps and every dropped step (each tried on its own in a scratch copy) makes at least one check fail. The item's records list, for each change, the check that failed (Clarifications C-003).
- **SC-004**: The checks need no running Obsidian and no live plugin, and run within the project's existing release checks in under 5 seconds in total.
- **SC-005**: The published failures, their wording and their order are byte-for-byte unchanged by this item.

## Assumptions

- **Tool in scope**: "the similar-notes search" is the `smart_connections_similar` tool. Its documented order and roster in `docs/tools/smart_connections_similar.md` are the authority the checks prove.
- **The related-notes-for-a-question search is out of scope**: `smart_connections_query` has its own, separate checks (it has no source note, so no target or not-indexed checks, and its not-ready failures are split differently). It does not share the similar-notes search's checks, so the user's "unless it shares the same checks" exception does not apply.
- **Current behaviour matches the documentation**: a reading of the current search confirms its checks run in the documented order and produce the documented failures, so the item is expected to add checks only. Should a check prove otherwise, FR-014 applies.
- **"The checks for a release" are the project's automated test suite**, which runs on Linux and Windows in continuous integration and needs no Obsidian. Simulated states are what make the transient states provable there.
- **Existing checks stay**: the existing checks of how each ready-made failure is reported, and of result ordering in the ready state, remain; the new checks add the detection and precedence layer and do not replace them.
- **Manual steps stay manual**: installing the plugin in a test vault and writing the live test-case pages are outside this item, as is rejecting unknown input fields (already covered).
- **Backlog item**: the owner's backlog-item reference for this work was not available when the spec was written; it can be added to the spec header when known.
