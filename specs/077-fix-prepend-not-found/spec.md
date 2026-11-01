# Feature Specification: Report Missing Notes on Add-to-Top

**Feature Branch**: `077-fix-prepend-not-found`  
**Created**: 2026-11-01  
**Status**: Draft  
**Input**: User description: "Report missing notes — when an agent adds text to the top of a note that does not exist, the failure is reported in the same structured way the add-to-end capability already reports it: a clear not-found classification, the note's location and vault echoed back, and a message that names the missing note."

## Context

The add-to-top capability (`prepend`) promises, in its reference documentation, that a call against a note that does not exist fails with `CLI_REPORTED_ERROR` carrying the sub-discriminator `details.code: NOTE_NOT_FOUND`. In practice the failure arrives as a generic upstream error: the top-level code is unchanged, there is no `NOTE_NOT_FOUND` sub-discriminator, and the cause is visible only inside the raw command output Obsidian printed. Obsidian's report of the missing note does not match the wording the capability recognises, so the failure falls through to the "unrecognised upstream failure" path.

The add-to-end capability (`append_note`) already reports the same missing note as documented: `CLI_REPORTED_ERROR` with `details.code: NOTE_NOT_FOUND`, the supplied location and the vault name echoed in `details`, and the message `Note "<location>" not found in vault.`

The result is a silent mismatch. An agent that branches on the documented classification does not recognise the missing note when it adds to the top, and an agent that treats add-to-top and add-to-end as interchangeable has to translate one capability's failure into the other's.

## Clarifications

### Session 2026-11-01

- Q: Should add-to-top detect a missing note itself before calling Obsidian, recognise Obsidian's report of it, or both? → A: Option A, both. The existing pre-call not-found check fails with `NOTE_NOT_FOUND` before Obsidian is called, as add-to-end's pre-write read does (and as `query_base`'s pre-flight `BASE_NOT_FOUND` does). Add-to-top also recognises Obsidian's actual missing-note wording (`Error: File "<path>" not found.`) for the cases the local check cannot see: a path whose case differs from the real note on a case-insensitive file system, or a note removed between the check and Obsidian's call. Both layers report the same shape within `CLI_REPORTED_ERROR`, with no new top-level code (Constitution IV).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Documented not-found classification (Priority: P1)

An agent adds text to the top of a note that may not exist. When the note is missing, the failure carries the not-found classification the reference documentation promises, so the agent's error handling needs no special case for this capability, and the vault is left as it was.

**Why this priority**: This is the defect itself. Without it, the documented contract is false and agents cannot recognise the missing-note case at all.

**Independent Test**: Against a test vault with no note at a chosen location, call add-to-top for that location and check the failure's classification; then list the vault and confirm no note exists at that location.

**Acceptance Scenarios**:

1. **Given** a vault in which no note exists at the given location, **When** the agent adds text to the top of that location, **Then** the call fails with `CLI_REPORTED_ERROR` and `details.code: NOTE_NOT_FOUND`.
2. **Given** the same failure, **When** the agent inspects the vault afterwards, **Then** no note has been created at that location and no other note in the vault has changed.
3. **Given** a missing location, **When** the agent adds text to its top with the inline option set, **Then** the failure carries the same classification as in default mode.
4. **Given** a location the tool's own check finds but Obsidian reports missing (case mismatch, or the note removed in between), **When** the agent adds text to its top, **Then** the failure carries the same classification and fields as a plainly missing note.

---

### User Story 2 - Same report as add-to-end (Priority: P2)

An agent that handles missing notes the same way for add-to-top and add-to-end gets identical failures from both, so it can switch between them without translating errors.

**Why this priority**: Parity is what lets one error handler serve both capabilities. It builds on Story 1: the classification must exist before the echoed fields can match.

**Independent Test**: For one missing location in one vault, call add-to-top and, separately, add-to-end, and compare the two failures field by field.

**Acceptance Scenarios**:

1. **Given** the same missing location in the same vault, **When** the agent adds text to its top and, separately, to its end, **Then** both failures carry the same top-level code, the same `details.code`, the same set of `details` fields with the same values, and the same message.
2. **Given** the location is supplied as a vault-relative path, **When** both capabilities fail, **Then** the echoed location in both is the path exactly as the agent supplied it.

---

### User Story 3 - Location and vault echoed, message specific (Priority: P2)

An agent deciding how to recover (create the note, report to the user, or try another location) reads the missing note's location and vault straight from the failure, and the message tells a human reader which note is missing.

**Why this priority**: The echoed fields make recovery a single follow-up call; the specific message makes the failure readable in logs and transcripts. Both arrive with the same change as Story 2.

**Independent Test**: Trigger the missing-note failure and check that `details` holds the targeted path and the vault name, and that the message names the location.

**Acceptance Scenarios**:

1. **Given** the missing-note failure, **When** the agent reads it, **Then** `details` includes the vault-relative path the call targeted (as supplied, or the path a bare name resolved to) and the vault name.
2. **Given** the missing-note failure, **When** the agent reads its message, **Then** the message names the missing note's location (`Note "<location>" not found in vault.`) rather than describing a generic upstream error or repeating raw command output.

---

### User Story 4 - Other failures unchanged (Priority: P3)

An agent whose add-to-top call fails for any reason other than a missing note sees that failure reported exactly as it is today.

**Why this priority**: A guard against regressions. It adds no new value on its own but keeps the change scoped.

**Independent Test**: Run the existing add-to-top failure cases (unknown vault, path escaping the vault, unsupported file type, unresolvable wikilink-form name, file held open by an external editor, unrecognised upstream failure, write that did not land, read failures) and confirm each produces the same code, `details` and message as before.

**Acceptance Scenarios**:

1. **Given** a failure that is not a missing note, **When** the agent adds text to the top of a note, **Then** that failure is reported with the same code, `details` and message as before this change.
2. **Given** an upstream failure whose output mentions "not found" but is not about the target note (for example an unknown vault or an unrecognised command), **When** the agent adds text to the top of a note, **Then** the failure is not reported as `NOTE_NOT_FOUND`.

---

### Edge Cases

- **Missing folder in the path**: a location whose parent folder does not exist is a missing note and reports `NOTE_NOT_FOUND`, as it does for add-to-end.
- **Missing note addressed by bare name (`file`)**: a name that does not resolve fails during target resolution, before add-to-top runs. That path is shared with add-to-end and is unchanged by this feature.
- **Missing non-note path** (for example `Boards/Plan.canvas`): the file-type check runs first and reports `UNSUPPORTED_FILE_TYPE`, as documented today; unchanged.
- **Plainly missing note**: handled by FR-001a (reported before Obsidian is called).
- **Note removed between the tool's own checks and Obsidian's write**: the failure Obsidian reports for the missing note is classified as `NOTE_NOT_FOUND`, not as a generic upstream error.
- **Case mismatch on a case-insensitive file system** (for example `notes/plan.md` when the note is `Notes/Plan.md`, on Windows or default macOS): the local check finds the file, but Obsidian, whose vault paths are case-sensitive, reports it missing; that report is classified as `NOTE_NOT_FOUND`.
- **Active mode**: with no focused note the call fails with `ERR_NO_ACTIVE_FILE` before any write, as today; unchanged.
- **Obsidian's not-found wording**: the wording Obsidian was confirmed to emit for a missing target note on add-to-top (`Error: File "<path>" not found.`) is recognised with either line ending; the wordings recognised before this change are still recognised (FR-007).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When add-to-top targets a location at which no note exists, the call MUST fail with top-level code `CLI_REPORTED_ERROR` and `details.code: NOTE_NOT_FOUND`, in both default and inline mode.
- **FR-001a**: When add-to-top's own pre-call check finds no file at the target location, the call MUST fail with the missing-note failure at that point, before Obsidian is called, matching add-to-end's pre-write check.
- **FR-001b**: When the pre-call check finds the file but Obsidian then reports the target note missing (case mismatch on a case-insensitive file system, or the note removed in between), the call MUST fail with the same missing-note failure, recognised from Obsidian's report.
- **FR-002**: The missing-note failure's `details` MUST include the vault-relative path the call targeted (`path`: as supplied, or the path a bare name resolved to) and the vault name (`vault`), and no fields beyond those add-to-end's missing-note failure carries for the same input.
- **FR-003**: The missing-note failure's message MUST name the missing location using the same wording add-to-end uses (`Note "<location>" not found in vault.`), not a generic upstream-error description or raw command output.
- **FR-004**: For the same missing location in the same named vault (specific mode; see Assumptions for active mode), add-to-top's and add-to-end's failures MUST carry the same top-level code, the same `details` fields and values, and the same message.
- **FR-005**: A failed add-to-top call against a missing note MUST NOT create the note or change any other file in the vault.
- **FR-006**: The missing-note failure MUST keep the originating failure as its cause, so the raw report stays available for diagnosis (Principle IV chain of custody): the file-system not-found error for the pre-call check, Obsidian's upstream failure for the recognised report.
- **FR-007**: Failures of add-to-top that are not a missing target note MUST be reported with the same code, `details` and message as before this change; in particular, upstream output that mentions "not found" about something other than the target note (vault, command) MUST NOT be reported as `NOTE_NOT_FOUND`.
- **FR-008**: The change MUST NOT introduce a new top-level error code; `NOTE_NOT_FOUND` remains a sub-discriminator within the existing `CLI_REPORTED_ERROR` category (ADR-015).
- **FR-009**: The recognition of Obsidian's missing-note report (FR-001b) MUST be grounded in the wording Obsidian actually emits for add-to-top against a missing note (reported as `Error: File "<path>" not found.`), confirmed against the authorised test vault, and covered by an automated test that fails if that wording stops being recognised. Both detection points (FR-001a, FR-001b) MUST be covered by automated tests.
- **FR-010**: Add-to-top's reference documentation MUST remain accurate after the change; any text describing the missing-note failure's fields or message MUST match the behaviour delivered.

### Key Entities

- **Missing-note failure**: the structured failure an agent receives when the target note does not exist. Attributes: top-level code (`CLI_REPORTED_ERROR`), sub-discriminator (`details.code: NOTE_NOT_FOUND`), echoed location (`details.path`), echoed vault (`details.vault`), human-readable message naming the location, and the originating failure as its cause (the file-system not-found error, or Obsidian's report).
- **Target location**: the vault-relative path (or the path a bare name resolved to) the agent asked to add text to.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of add-to-top calls against a missing note in the test vault, in both default and inline mode, report `NOTE_NOT_FOUND`; none report a generic upstream error.
- **SC-002**: For every tested missing location, add-to-top's and add-to-end's failures are identical in code, `details` and message (zero differing fields).
- **SC-003**: After every missing-note failure, the vault's file listing is unchanged (zero notes created).
- **SC-004**: Every existing add-to-top failure case other than a missing note produces the same report as before (zero regressions in the existing failure tests).
- **SC-005**: An agent can build its recovery call (create the note in the same vault at the same location) from the failure's fields alone, with no further lookup.

## Assumptions

- Obsidian's add-to-top command reports a missing target note through its normal error output and does not create the note. For a plainly missing note Obsidian is no longer called (FR-001a); for the cases only Obsidian can see, the change reclassifies its report and does not alter Obsidian's behaviour or output.
- The vault echoed in specific mode is the vault name the agent supplied, as add-to-end echoes today. Active mode reaches the missing-note case only if the focused note is removed before the write; there add-to-top echoes the focused vault's name, while add-to-end echoes no vault. Aligning add-to-end is outside this feature (Out of Scope: other capabilities).
- The existing reference documentation's promise of `NOTE_NOT_FOUND` is the intended contract; the defect is in the behaviour, not the documentation.
- Live probes against Obsidian run only under the project's test-execution instructions, in the authorised test vault and scratch folder.

## Out of Scope

- New top-level error categories; the change sits within the existing `CLI_REPORTED_ERROR` category.
- Changes to how other failures of add-to-top are reported.
- Auditing missing-note reports of other capabilities; separate items if any diverge.
- Changes to Obsidian's own output.
