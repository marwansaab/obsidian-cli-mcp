# Feature Specification: Fix active-file messaging

**Feature Branch**: `082-fix-active-file-messaging`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "Fix active-file messaging — two accuracy corrections on the active-file reporting surface: the validation message shown when a caller wrongly names a specific note, and the documented statement (in both the help reference and the short tool description) of how the returned file name relates to its base name and extension."

## Context

The active-file reader (`get_active_file`) reports which file Obsidian currently has focused, in either the focused vault (`target_mode: "active"`) or a named vault (`target_mode: "specific"` + `vault`). It accepts no note locator in either mode: the active file is the implicit target. Automated agents read its rejection messages and its documentation as the contract of record when deciding how to call it.

Two statements on that surface are inaccurate today:

1. **The rejection message.** The active-file reader shares its input rule with the two genuinely folder-scoped listing tools (`files` and `paths`). When a caller supplies a `file` or `path` locator, the reader rejects it, as it should, but with the shared message "file is not allowed for folder-scoped tools" (or the `path` equivalent). The active-file reader does not operate on a folder, so the message tells the caller something false about the surface.
2. **The file-name formula.** Both the short tool description and the help reference state that `name === basename + extension`. The extension is reported without its leading dot (`note.md` gives `basename: "note"`, `extension: "md"`), so that formula would produce `notemd`. The real relationship is base name, then a dot, then the extension when the file has an extension, and just the base name when it has none. The values the reader returns already follow the real relationship; only the stated formula is wrong.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accurate rejection when a note is named (Priority: P1)

An agent mistakenly supplies a `file` or `path` locator when calling the active-file reader, in either targeting mode. The call is rejected, as it is today, but the message now describes this surface correctly: the active file is the implicit target and no note may be named. The agent drops the locator and retries, instead of being told the reader is a folder-scoped tool.

**Why this priority**: The rejection message is the only feedback an agent gets at the moment it has called the surface wrongly. A message that names the wrong kind of surface can send the agent looking for a folder parameter, or lead it to conclude that it called the wrong tool, rather than simply dropping the locator.

**Independent Test**: Call the active-file reader with a `file` locator, and separately with a `path` locator, in each of the two targeting modes. Confirm each call is rejected with the same validation failure category as today, flags the same field, and carries a message that says the active file is the implicit target and no note may be named, and that does not contain "folder-scoped".

**Acceptance Scenarios**:

1. **Given** a call to the active-file reader in `active` mode that supplies a `file` locator, **When** it is rejected, **Then** the issue on `file` says the active file is the implicit target and no note may be named, and does not call the surface folder-scoped.
2. **Given** a call to the active-file reader in `active` mode that supplies a `path` locator, **When** it is rejected, **Then** the issue on `path` carries the same accurate message, and does not call the surface folder-scoped.
3. **Given** a call to the active-file reader in `specific` mode with a `vault` that also supplies a `file` or a `path` locator, **When** it is rejected, **Then** the issue on the supplied locator carries the same accurate message.
4. **Given** a call that supplies both `file` and `path`, in either mode, **When** it is rejected, **Then** each of the two fields is flagged and each carries the accurate message.
5. **Given** a call to `files` or `paths` (the genuinely folder-scoped tools) that supplies a `file` or `path` locator, **When** it is rejected, **Then** the message is exactly the existing folder-scoped message, unchanged.

---

### User Story 2 - Correct file-name formula in the documentation (Priority: P2)

An agent reading the active-file reader's short tool description or its help reference wants to rebuild or predict the returned `name` from `basename` and `extension`. The documentation now states the relationship exactly: base name, a dot, and the extension for a file that has an extension; just the base name for a file with no extension.

**Why this priority**: An agent that applies the stated formula literally gets a wrong name (for example `notemd` for `note.md`). The returned values are already correct, so the harm is limited to agents that rebuild the name instead of reading it. That makes this less urgent than the rejection message, which every miscalled request meets.

**Independent Test**: Read the short tool description and the help reference for the active-file reader. Confirm each states the relationship with the separating dot and the no-extension case, and that neither still states the dot-less formula. Then check the stated relationship against the documented examples (`note.md`, `note.draft.md`, `README`).

**Acceptance Scenarios**:

1. **Given** the active-file reader's short tool description, **When** it states how `name` is built, **Then** it says `name` is the base name, a dot, and the extension when the extension is non-empty, and just the base name when the extension is empty.
2. **Given** the active-file reader's help reference, **When** it states how `name` is built, **Then** it gives the same relationship as the short tool description.
3. **Given** the documented examples `note.md` → (`note`, `md`), `note.draft.md` → (`note.draft`, `md`) and `README` → (`README`, `""`), **When** the stated relationship is applied to each, **Then** it reproduces the documented `name` exactly.
4. **Given** either document, **When** it is searched for the old formula, **Then** no statement remains that `name` equals the base name joined directly to the extension without a dot.

---

### Edge Cases

- **Both locators supplied at once.** Each supplied locator is flagged with the accurate message; neither is left with the old folder-scoped wording.
- **A locator supplied alongside another rule break** (for example `vault` missing in `specific` mode, or `vault` given in `active` mode). The locator issue carries the accurate message, and the other issues are reported exactly as today.
- **A locator supplied as explicitly undefined.** It is still treated as not supplied, exactly as today; no new rejection is introduced.
- **Multi-dot name** (`note.draft.md`). The formula splits at the final dot only: base name `note.draft`, then a dot, then `md`.
- **Name with no dot** (`README`). The extension is empty and the name is just the base name; no trailing dot is implied.
- **Other tools that share the folder-scoped input rule.** `files` and `paths` keep their existing messages word for word. A global reword would mislabel them in the opposite direction.

## Requirements *(mandatory)*

### Functional Requirements

**Rejection message (User Story 1)**

- **FR-001**: When the active-file reader rejects a supplied `file` locator, in either targeting mode, the message on that issue MUST state that the active file is the implicit target and that no note may be named.
- **FR-002**: When the active-file reader rejects a supplied `path` locator, in either targeting mode, the message on that issue MUST state the same thing as FR-001, naming the `path` field.
- **FR-003**: Rejection messages produced by the active-file reader MUST NOT describe the surface as folder-scoped.
- **FR-004**: The rejection behaviour of the active-file reader MUST be unchanged apart from the message text. Every input it rejects today is still rejected, every input it accepts today is still accepted, the failure is the same validation-error category, and each issue is reported on the same field as today.
- **FR-005**: The rejection messages of the genuinely folder-scoped tools (`files`, `paths`) for a supplied `file` or `path` locator MUST remain exactly as they are today.
- **FR-006**: The active-file reader's other validation messages (`vault` required in `specific` mode, `vault` not allowed in `active` mode, unknown field) MUST remain unchanged.

**File-name formula (User Story 2)**

- **FR-007**: The active-file reader's short tool description MUST state that `name` is the base name, a dot, and the extension when the file has an extension, and just the base name when the extension is empty.
- **FR-008**: The active-file reader's help reference MUST state the same relationship as FR-007 where it describes the `name` field, and its description of the `extension` field MUST stay consistent with it.
- **FR-009**: After the change, the short tool description and the help reference MUST NOT state that `name` equals the base name joined directly to the extension.
- **FR-010**: The stated relationship MUST be consistent with every worked example already in the help reference (single extension, multi-dot, no extension).

**Scope guard**

- **FR-011**: The change MUST NOT add, remove or rename any input field, targeting mode or output field of the active-file reader, and MUST NOT change the values it returns.

### Key Entities

- **Active-file rejection message**: the human-readable text attached to the validation issue raised when a caller supplies a `file` or `path` locator to the active-file reader. It carries the flagged field and a description of why the field is refused.
- **Returned file identity**: the four fields the reader returns for the active file: `path`, `name`, `basename`, `extension`. `extension` carries no leading dot and is empty when the name has no dot.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In all 6 locator-rejection cases (a `file` locator, a `path` locator, or both, each in `active` and `specific` mode), 100% of the issues on `file` or `path` carry the accurate active-file message, and 0 contain "folder-scoped".
- **SC-002**: Across the same 6 cases, the set of inputs rejected or accepted, the failure category, and the flagged fields are identical to the behaviour before the change (0 behavioural differences).
- **SC-003**: For `files` and `paths`, the locator-rejection messages match the pre-change text character for character (0 differences).
- **SC-004**: The corrected file-name relationship appears in both the short tool description and the help reference (2 of 2 surfaces), and the dot-less formula appears in neither (0 of 2).
- **SC-005**: Applying the documented relationship to each of the 3 worked examples in the help reference reproduces the documented `name` in 3 of 3 cases.

## Assumptions

- The "help reference" is the active-file reader's long-form tool document (the one the `help` tool serves), and the "short tool description" is the description the reader publishes when it registers. These are the only two published places that state the file-name formula.
- The help reference's existing failure example already says that no locator is accepted because the active file is the implicit target. The corrected rejection message is expected to use the same wording, so message and documentation agree.
- The exact wording of the new rejection message is left to planning, provided it meets FR-001 to FR-003. A suitable shape is "file is not allowed: the active file is the implicit target, so no note may be named" (and the `path` equivalent).
- The values the reader returns already follow the corrected relationship (the substrate supplies `name`, `basename` and `extension` directly). This feature changes only what the documentation says about them, not how they are produced.
- Internal source commentary that repeats the dot-less formula is not a published contract surface. Whether to align it is left to planning.
- Updates to the living system description (`.docs-as-code/`) follow in the project's normal documentation pass for the pull request, and are not specified here.

## Out of Scope

- Any change to validation behaviour: supplying a `file` or `path` locator is still rejected in both modes. Only the message text changes.
- The folder-scoped rejection message on `files` and `paths`, which stays as it is.
- Any new field, mode or output-shape change to the active-file reader.
- Any change to the values the active-file reader returns.
