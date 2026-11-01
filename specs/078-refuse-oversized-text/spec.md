# Feature Specification: Refuse Oversized Text on Add-to-Top

**Feature Branch**: `078-refuse-oversized-text`  
**Created**: 2026-11-01  
**Status**: Draft  
**Input**: User description: "Refuse oversized text — adding text to the top of a note refuses, before anything reaches Obsidian, any text whose encoded size is too large for Obsidian to receive safely, even when the text is within the existing character limit, so that text in non-Latin scripts can never crash Obsidian."

## Context

The add-to-top capability (`prepend`) passes the caller's text to Obsidian on the command line. Obsidian's command-line channel on Windows breaks when that text reaches about 4 KB: the call hangs, Obsidian shows a crash dialog the user has to dismiss, and Obsidian may stop accepting commands until it is restarted. The capability already guards against this with a limit of 3,072 characters, chosen to leave about 1 KB of headroom below the fault for the rest of the command (the vault name and the note's location).

That limit counts characters, but the fault is triggered by the text's encoded size in bytes. A plain Latin letter takes one byte; characters from scripts such as Arabic, Cyrillic or Greek take two; Chinese, Japanese and Korean characters take three; emoji take four. Text well within the character limit can therefore exceed the size Obsidian can receive: 1,500 Chinese characters are about half the character limit but take about 4,500 bytes, past the point where Obsidian fails. The agent learns only afterwards that nothing was written, and the person using Obsidian is interrupted by a crash dialog for content they did not type.

This feature adds a second limit, on the text's encoded size, checked alongside the character limit before anything reaches Obsidian.

## Clarifications

### Session 2026-11-01

- Q: How many UTF-8 bytes should the safe size be? → A: Option A, 3,072 bytes. The 3,072-character limit was set on purpose to leave about 1 KB for argv overhead and for failures that come and go with Obsidian's state (bisect: 4,062 characters passed, 4,125 failed). A byte budget of 3,072 keeps the same margin, now counted in bytes, and still accepts plain Latin text at exactly 3,072 characters, as the acceptance criteria require. Sources: BI-0120 (fix shape §1) and BI-0123 (Impact; Out of scope: "published constant").
- Q (plan): Should the size-limit error be a new `details.code` or a `details.reason` under `CONTENT_TOO_LARGE`? → A: Option A, `details.reason: "bytes"` under `details.code: CONTENT_TOO_LARGE`. ADR-015 rejects a parallel `details.code` (its option b) and prescribes `details.reason` under the existing code, with the origin sub-state (the character limit) left without a `reason`. BI-0123's Related section names ADR-015 as the pattern for this byte-cap discriminator. The closed `reason` set goes into `docs/tools/prepend.md`, and the ADR-015 row of the Constitution Compliance checklist is Y.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Oversized multi-byte text is refused up front (Priority: P1)

An agent adds non-Latin text to the top of a note. When the text's encoded size is larger than Obsidian can receive safely, the call is refused immediately with an error that names the size limit and states both the text's size and the limit. Obsidian is never asked to handle the text, so no crash dialog appears, Obsidian keeps responding, and the note is unchanged. The agent knows to write the content another way.

**Why this priority**: This is the defect. Without it, an agent writing in a non-Latin script can crash Obsidian with text the capability accepts as valid, and the person using Obsidian bears the cost.

**Independent Test**: Against an existing note in the authorised test vault, add 1,500 Chinese characters to its top; check that the call is refused with the size-limit error, that Obsidian was not called, that no crash dialog appeared, that a following request to Obsidian succeeds, and that the note's bytes are unchanged.

**Acceptance Scenarios**:

1. **Given** an existing note and text within the character limit whose encoded size exceeds the safe size (for example 1,500 Chinese characters, about 4,500 bytes), **When** the agent adds it to the top of the note, **Then** the call is refused promptly with the size-limit error, whose message names the size limit and states both the text's size in bytes and the limit.
2. **Given** that refusal, **When** the agent and the user look at Obsidian and the note, **Then** no crash dialog has appeared, Obsidian still responds to further requests, and the note is unchanged.
3. **Given** text over the safe size, **When** the agent adds it with the inline option set, or to the note focused in Obsidian (active mode), **Then** the call is refused with the same size-limit error.

---

### User Story 2 - Text within the safe size is unaffected (Priority: P1)

An agent adds text that fits within the safe size, in any script. The call behaves exactly as it does today: same placement, same result, same reported size change.

**Why this priority**: The guard must not cost existing uses anything. Plain Latin text at the existing character limit is the most common large payload and must keep working.

**Independent Test**: Add, in turn, plain Latin text of exactly 3,072 characters, mixed Latin and non-Latin text under the safe size, and entirely non-Latin text exactly at the safe size to the top of notes in the authorised test vault; check each succeeds with the same result it gives today.

**Acceptance Scenarios**:

1. **Given** text within the safe size, whether plain Latin, mixed, or entirely non-Latin, **When** the agent adds it to the top of a note, **Then** the call succeeds exactly as it does today.
2. **Given** plain Latin text exactly at the existing character limit (3,072 characters), **When** the agent adds it, **Then** the call succeeds.
3. **Given** non-Latin text whose encoded size is exactly the safe size (for example 1,024 Chinese characters, 3,072 bytes), **When** the agent adds it, **Then** the call succeeds and Obsidian shows no crash dialog.

---

### User Story 3 - The two limits work together (Priority: P2)

An agent whose text breaks a limit receives the error for the limit that applies, so it can tell "too many characters" from "too many bytes" and react to each.

**Why this priority**: Clear, distinct errors let an agent choose its recovery without guessing. It builds on Story 1: the size-limit error must exist before its relationship to the character-limit error matters.

**Independent Test**: Add text over the character limit, then text within the character limit but over the safe size, and compare the two errors.

**Acceptance Scenarios**:

1. **Given** text over the character limit, **When** the agent adds it, **Then** the existing character-limit error is returned, unchanged.
2. **Given** text within the character limit but over the safe size, **When** the agent adds it, **Then** the new size-limit error is returned.
3. **Given** the two errors, **When** the agent inspects them, **Then** both carry `details.code: CONTENT_TOO_LARGE` and only the size-limit error carries `details.reason: "bytes"`, so an agent can branch on which limit was broken without reading the message, and an agent that already handles `CONTENT_TOO_LARGE` handles both.

---

### User Story 4 - Documentation explains the size limit (Priority: P3)

An agent reading the reference documentation for adding text to the top of a note learns, before it calls, that non-Latin text counts more heavily towards a size limit, and where to turn for larger content.

**Why this priority**: Documentation lets an agent avoid the refusal rather than recover from it. It has no value until the limit exists.

**Independent Test**: Read the capability's reference documentation and the published description of its text parameter; check both state the size limit, explain that non-Latin characters take more space, and point to the way of writing larger content.

**Acceptance Scenarios**:

1. **Given** the reference documentation for adding text to the top of a note, **When** the agent reads it, **Then** it explains that non-Latin text counts more heavily towards a size limit, states the limit, and points to the way of writing larger content (`write_note`).
2. **Given** the capability's published description of its text parameter, **When** the agent reads it before calling, **Then** it states both the character limit and the size limit.

---

### Edge Cases

- **Text exactly at the safe size**: accepted. Only text whose encoded size is strictly greater than the safe size is refused.
- **Text over both limits**: the character-limit error is returned, as today; the size check does not replace it.
- **Emoji and other characters outside the basic range**: each counts by its encoded size (4 bytes), so 769 emoji (1,538 characters by the existing count, 3,076 bytes) are refused by the size limit.
- **Mixed text**: the encoded size is the sum over all characters; text that is mostly Latin with a few non-Latin characters is refused only if the total exceeds the safe size.
- **Line breaks and whitespace**: count by their encoded size like any other character; a Windows line ending is two bytes.
- **Malformed text** (an unpaired surrogate half in the supplied string): counts by the size it takes when encoded for Obsidian, so the check measures what Obsidian would actually receive.
- **Oversized text against a missing note, a non-note file, or with no note focused**: the size-limit error is returned, because the size check runs with the other input checks before the note is located, as the character-limit check does today.
- **Text between the safe size and the point where Obsidian actually fails**: refused, even though some such calls succeed today. The safe size is deliberately below the fault; see Assumptions.
- **The existing check for a write that silently did nothing**: still runs for accepted text, unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Add-to-top MUST refuse any text whose encoded size (UTF-8 bytes, the encoding in which the text reaches Obsidian) exceeds the safe size of 3,072 bytes, even when the text is within the character limit.
- **FR-002**: The refusal MUST happen before Obsidian is called and before the note is read or changed, with the other input checks, in specific mode and active mode, with and without the inline option.
- **FR-003**: The refusal MUST be reported as `VALIDATION_ERROR` with `details.code: CONTENT_TOO_LARGE` and the sub-discriminator `details.reason: "bytes"` (ADR-015); the character-limit error stays the origin sub-state, with no `reason`. The closed `reason` set for `CONTENT_TOO_LARGE` (absent, `"bytes"`) MUST be listed in the reference documentation. No new top-level error code and no new `details.code` (Constitution IV).
- **FR-004**: The size-limit error's `details` MUST carry the text's encoded size in bytes (`contentBytes`) and the safe size (`maxBytes`), and its message MUST name the size limit and state both numbers, in bytes.
- **FR-005**: Text over the character limit MUST continue to be refused with the existing `CONTENT_TOO_LARGE` error, with its code, `details` and message unchanged, whatever its encoded size.
- **FR-006**: Text within both limits MUST behave exactly as before this change: same placement, same result envelope, same `bytes_written`, same failures for other causes.
- **FR-007**: The character limit (3,072 characters) MUST remain as it is; this feature adds a limit and changes neither the existing limit nor its error.
- **FR-008**: The safe size MUST be a single published value: the enforced limit, the error's reported limit, the published parameter description and the reference documentation MUST all state the same number and cannot drift apart.
- **FR-009**: The published description of the text parameter MUST state the size limit alongside the character limit, so an agent can see the rule before calling (MCP Tool Surface Standards: visible input rules).
- **FR-010**: The reference documentation for add-to-top MUST explain that non-Latin text counts more heavily towards the size limit (with the per-character sizes of common scripts), state the limit, describe the size-limit error, and point to `write_note` for larger content.
- **FR-011**: The existing check that reports a write that silently did nothing MUST remain in place and unchanged.
- **FR-012**: The behaviour MUST be covered by automated tests: text one byte over the safe size is refused with the size-limit error; text exactly at the safe size is accepted, in plain Latin and in a multi-byte script; plain Latin text at the character limit is accepted; text over the character limit returns the character-limit error; and a refused call never invokes Obsidian.
- **FR-013**: That non-Latin text at the safe size is accepted by Obsidian without a crash dialog, and that 1,500 Chinese characters are refused without reaching Obsidian, MUST be confirmed against the authorised test vault under the project's test-execution instructions.

### Key Entities

- **Safe size**: the published maximum encoded size, in bytes, of the text add-to-top will pass to Obsidian (3,072 bytes). A constant, not detected at run time.
- **Character limit**: the existing maximum length of the text, counted the way the capability counts characters today (3,072). Unchanged.
- **Size-limit error**: the structured refusal for text within the character limit but over the safe size. Attributes: top-level code (`VALIDATION_ERROR`), `details.code: CONTENT_TOO_LARGE` with `details.reason: "bytes"`, the text's encoded size (`contentBytes`), the safe size (`maxBytes`), and a message naming the size limit with both numbers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero crash dialogs appear in Obsidian across all add-to-top calls in the test vault with text over the safe size, in any script.
- **SC-002**: 100% of add-to-top calls with text over the safe size are refused without Obsidian being called, and the target note is unchanged in every case.
- **SC-003**: Every refusal arrives in under one second, with no wait on Obsidian.
- **SC-004**: 100% of calls with text within both limits, in plain Latin, mixed and non-Latin scripts, produce the same result as before the change (zero regressions in the existing add-to-top tests).
- **SC-005**: An agent can tell from the error's `details.code` and `details.reason` alone which limit was broken, and from the error's fields alone how far over the limit its text was.
- **SC-006**: After a refusal, Obsidian responds to the next request without needing a restart.

## Assumptions

- The safe size is 3,072 bytes (Clarifications, Session 2026-11-01). It equals the character limit, so plain Latin text at the character limit (one byte per character) still fits, and it keeps the same headroom below the fault (about 4 KB; bisect: 4,062 characters passed, 4,125 failed) that the character limit was chosen for: about 1 KB for argv overhead and for failures that come and go with Obsidian's state, now measured in the unit the fault actually depends on. Some calls that succeed today with text between 3,072 bytes and the fault will now be refused; that is the deliberate cost of a safe margin.
- The rest of the command (the vault name and the note's location) fits in the existing headroom, as it is assumed to today. Limiting the size of those values is not part of this feature.
- Obsidian receives the text UTF-8 encoded, so the UTF-8 size of the text is the size that matters for the fault.
- `write_note` remains the way to write content larger than add-to-top accepts; it does not pass the text on the command line and has no such limit.
- Live probes against Obsidian run only under the project's test-execution instructions, in the authorised test vault and scratch folder.

## Out of Scope

- Applying a size limit to other capabilities that pass text to Obsidian (property values, base items, other writers); separate items.
- Changing or removing the existing character limit.
- Splitting, compressing or otherwise reshaping oversized text to make it fit.
- Detecting Obsidian's actual limit at run time; the safe size is a published constant.
- Removing the existing check that catches a write that silently did nothing.
