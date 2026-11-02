# Feature Specification: Resolve Note Names

**Feature Branch**: `089-resolve-note-names`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Resolve note names. When an agent edits a section of a note and identifies the note by name rather than by path, the note is found the same way the reading tools find it. The section-editing capability advertises a note-name locator that resolves like a wikilink, but it actually treats the name as a literal path, so the edit fails with a file-system error even though the same name works when reading the note. The published contract is false and the failure does not point at the real cause. Out of scope: creating notes that do not exist; changing how path-based targeting works; the section-placement behaviour of the edit itself."

## Background

Every capability that acts on one note lets the agent name the note in one of two ways: by its exact vault-relative path, or by its note name. The published description of the note-name locator says the name is "resolved like a wikilink": a bare name such as `Meeting Notes` finds the note wherever it sits in the vault, the way a link `[[Meeting Notes]]` would.

The reading capabilities (`read`, `read_heading`, `outline` and others) and the add-to-note capabilities (`append_note`, `prepend`) honour that description: they ask Obsidian which note the name refers to and then act on that note.

`patch_heading`, the capability that edits one heading's section of a note, publishes the same description but does not honour it. It takes the name as if it were a path relative to the vault's root folder. A note named `Meeting Notes` stored in `Projects/Meeting Notes.md` is therefore not found, and the call fails with a file-system write error (`FS_WRITE_FAILED`, "Note file not found at ...") that tells the agent to create the note with `write_note`, even though the note exists and the agent may have just read it by the same name. Following that advice would create a second, duplicate note.

`patch_block`, the capability that edits one block of a note, publishes the same description and has the same defect: it too takes the name as a path from the vault's root folder, so a block in a note in a sub-folder cannot be edited by the note's name. BI-0171's scope note says sibling capabilities that write to notes directly are checked during the fix and included if they share the defect, so `patch_block` is in scope (see Clarifications).

## Clarifications

### Session 2026-11-02

- Q: Is `patch_block` in scope? It publishes the same note-name description as `patch_heading` and fails the same way. → A: Option B, both `patch_heading` and `patch_block`. BI-0171 §Out of scope says: "Sibling fs-direct tools — check during the fix and include them if they share the defect." `patch_block` shares it. The fix reuses the shared name resolution that `append_note` and `prepend` already use. `patch_block` gets happy-path and failure tests (Constitution Principle II), and its help page is checked as well.
- Q: When an agent edits a section or a block by a note name that matches no note, which error should come back? → A: Option A. The shared name lookup's failure comes back unchanged: a `CLI_REPORTED_ERROR` that carries Obsidian's own not-found message, the same failure `read`, `append_note` and `prepend` return today for that name. BI-0171's acceptance criteria ask for a failure that says the note was not found and behaves the way the reading tools do for the same name, and Option A gives exactly that. Neither editor converts it to the `NOTE_NOT_FOUND` sub-code. The shared lookup is not changed, because that would change other tools' errors, which is outside this BI.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit a section by note name (Priority: P1)

An agent reads a note by its name, finds the heading (or block) it wants to change, and then edits that heading's section (or that block), again naming the note by its name. The edit is applied to the note the agent read, wherever that note sits in the vault.

**Why this priority**: This is the defect itself. Today an agent that uses the documented note-name locator cannot edit any note outside the vault's root folder, and the error it gets sends it in the wrong direction.

**Independent Test**: Put a note with a known heading and a known block id in a sub-folder of the test vault. Read it by its bare name, then edit the heading's section and the block by the same bare name, and confirm the note in the sub-folder changed and no other note was created or changed.

**Acceptance Scenarios**:

1. **Given** a note in a sub-folder, **When** an agent edits one of its sections by the note's bare name, **Then** the edit is applied to that note.
2. **Given** the same note, **When** the agent reads it by name and then edits it by name, **Then** both calls act on the same file, and the edit's result reports that file's vault-relative path.
3. **Given** a note at the vault's root folder, **When** an agent edits one of its sections by its bare name, **Then** the edit is applied to that note (today this fails unless the `.md` extension is given).
4. **Given** a note-name locator that already includes a folder or the `.md` extension (for example `Projects/Meeting Notes` or `Meeting Notes.md`), **When** an agent edits by it, **Then** the note found is the one the reading tools find for the same locator.
5. **Given** a note in a sub-folder that holds a block with a known block id, **When** an agent edits that block by the note's bare name, **Then** the edit is applied to that note, and the result reports that note's vault-relative path.

---

### User Story 2 - Clear failure when the name does not identify one note (Priority: P2)

An agent edits a section or a block by a note name that matches no note in the vault, or that more than one note shares. The agent gets an answer that tells it what happened to the name, so it knows to give a path instead, rather than a file-system error that points at the wrong cause.

**Why this priority**: Once Story 1 holds, these are the remaining ways a name-based edit can go wrong. They matter less often than the main defect, but a misleading error here repeats the original harm.

**Independent Test**: In the test vault, edit a section and a block by a name that matches no note, and by a name two notes in different folders share. Compare each outcome with the outcome of reading the note by the same name.

**Acceptance Scenarios**:

1. **Given** a name that matches no note, **When** the agent edits by that name, **Then** the failure says the note was not found, not that a file-system write failed, and no note is created or changed.
2. **Given** a name that matches no note, **When** the agent reads by that name and then edits by it, **Then** both calls fail, and both failures say the note was not found.
3. **Given** a name that matches several notes, **When** the agent edits by that name, **Then** the behaviour matches how the reading tools handle the same name: if reading picks one of the notes, the edit acts on that same note; if reading fails, the edit fails the same way and changes nothing.

---

### User Story 3 - The published contract is true (Priority: P3)

An agent learns from the published descriptions and help pages of `patch_heading` and `patch_block` how to name a note. What they say about the note-name locator is what happens.

**Why this priority**: Once Stories 1 and 2 hold, the published descriptions become true without changing. This story is the check that nothing in either help page, its worked examples or its error reference still describes the old behaviour.

**Independent Test**: For each of the two capabilities, list every statement in its published description and help page about the note-name locator and about the not-found failure, then run the matching calls against the test vault and confirm each statement holds.

**Acceptance Scenarios**:

1. **Given** the help page of `patch_heading` or of `patch_block`, **When** an agent compares what it says about naming a note and about the not-found failure with the observed behaviour, **Then** the two match.
2. **Given** either capability's published description, **When** an agent follows the note-name locator's description, **Then** the call behaves as described.

---

### Edge Cases

- **Name and path both given, or neither**: rejected before any lookup, as today. The rule that exactly one locator is given does not change.
- **Path-based targeting of a note that does not exist**: unchanged (see Out of Scope). Only name-based targeting changes.
- **Active mode** (editing the note Obsidian has open): unchanged. It does not use a name.
- **A name that resolves to a file that is not a Markdown note** (for example a canvas or a base with the same name): the outcome is the same as targeting that file by its path today. The editors have no file-type check, and this feature adds none (plan-time alignment, research D2).
- **A name whose resolved note sits outside the vault through a link or junction**: still refused by the existing containment check, which runs on the resolved path.
- **The note is renamed, moved or deleted between the name lookup and the edit**: the edit fails with a not-found or file-system error and changes nothing; it never writes to the old location.
- **The heading or block is not found in the resolved note**: the existing heading-not-found or block-not-found failure, now naming the resolved note's path.
- **Unknown vault**: fails before the name lookup, as today.

## Requirements *(mandatory)*

### Functional Requirements

In these requirements, "the name-targeted editors" means `patch_heading` and `patch_block`.

- **FR-001**: When either name-targeted editor is given a note name, it MUST act on the note that the reading capabilities would act on for the same vault and name.
- **FR-002**: The name lookup MUST happen before the note is read or written. A name-based call MUST NOT read, create or change a file at any other location.
- **FR-003**: When a note name matches no note, the call MUST fail before any note is read or written, with the same error the reading capabilities return for that vault and name: a `CLI_REPORTED_ERROR` carrying Obsidian's own not-found message, passed through unchanged from the shared name lookup. It MUST NOT report a file-system write failure, MUST NOT advise creating the note, and MUST NOT be turned into a different code or sub-code by either editor.
- **FR-004**: When a note name matches more than one note, the outcome MUST be the same as the reading capabilities' outcome for the same name: the same note is chosen, or the call fails the same way.
- **FR-005**: The result of a successful name-based edit MUST report the vault-relative path of the note that was edited, not the name the agent gave.
- **FR-006**: Every failure introduced or changed by this feature MUST surface as a structured error through an existing top-level error code, identified where needed by a sub-discriminator. The feature MUST NOT add a new top-level error code.
- **FR-007**: Path-based targeting, active-mode targeting, and the placement behaviour of each edit (section placement for `patch_heading`, block placement for `patch_block`) MUST stay as they are today, including their results and error behaviour.
- **FR-008**: Any file-type check, the vault containment check, and the heading or block lookup MUST run on the resolved note, as they do today on a given path.
- **FR-009**: Neither editor's published description, input shape or output shape MUST change unless the help-page review in FR-010 shows that it says something false; the published fingerprints therefore stay as they are.
- **FR-010**: The help pages of both name-targeted editors MUST describe the note-name locator and the not-found failure as they behave after this feature. Any statement there, in their worked examples or in their error references that contradicts that behaviour MUST be corrected or removed.
- **FR-011**: The name-targeted editors MUST use the same name-resolution step the add-to-note capabilities (`append_note`, `prepend`) already use, not a separate copy of it, so all four resolve a name the same way.
- **FR-012**: Each name-targeted editor MUST have, in the same change, automated tests for at least one successful name-based edit of a note in a sub-folder and at least one name-based failure (a name that matches no note).

### Key Entities

- **Note-name locator**: the name an agent gives to identify a note, as opposed to its exact path. Resolved the way Obsidian resolves a wikilink to a note.
- **Resolved note**: the note a locator identifies, known by its vault-relative path. All checks and the edit act on it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a test vault with notes at the root and in nested sub-folders, 100% of section edits and block edits by bare note name change the note that a read by the same name returns, and change no other file.
- **SC-002**: For every name in that vault that matches no note, 100% of name-based edits fail with a not-found error, and zero report a file-system write failure.
- **SC-003**: For every name in that vault shared by two or more notes, the name-based edit and the name-based read agree in 100% of cases: same note, or both fail.
- **SC-004**: For the same vault and inputs, path-based and active-mode edits give identical results and identical errors before and after the change.
- **SC-005**: Zero statements in either editor's published description or help page about the note-name locator are contradicted by results from the test vault.

## Assumptions

- "The reading tools" means the capabilities that read a note by name today (`read`, `read_heading` and their peers). They, and the add-to-note capabilities `append_note` and `prepend`, resolve a name through Obsidian, and that shared resolution is the behaviour to match. `read` is the reference for every comparison in this feature (FR-001, FR-003, FR-004, SC-001, SC-003). It was confirmed live against the same lookup the editors will use (research F11, F12). The other reading tools were not probed and are assumed to agree.
- The user story asks for "a clear not-found or ambiguous-name error", while the acceptance criterion asks for the reading tools' behaviour on a shared name. The acceptance criterion governs: if the reading tools pick one note for a shared name rather than failing, the edit picks the same note and no ambiguous-name error is added. Adding one would make the edit and the read disagree, which Story 1 forbids.
- A name lookup needs Obsidian to be running, as it already does for the reading capabilities and for `append_note` and `prepend`. A path-based edit keeps working without the lookup.
- The not-found error for an unmatched name is the one the shared name lookup already produces for `read`, `append_note` and `prepend` (see Clarifications), so an agent sees one not-found shape for a name across all of them. Obsidian's exact not-found wording is captured from the live CLI at plan time; this spec relies only on its saying the note or file was not found.
- Path-based failures for a missing note do not change: `patch_block` keeps its structured `NOTE_NOT_FOUND` error and `patch_heading` keeps its current file-system error (see Out of Scope). Either one can still appear on a name-based call if the resolved note disappears between the lookup and the read.

## Out of Scope

- Creating notes that do not exist.
- Changing how path-based targeting works, including its error for a path that does not exist.
- The section-placement behaviour of `patch_heading`'s edit, and the block-placement behaviour of `patch_block`'s edit.
- Changing how the reading capabilities resolve a name.
- Other capabilities that write to notes directly but do not share this defect.

## Dependencies

- The shared name-resolution step that `append_note` and `prepend` already use (spec 070), which this feature reuses rather than duplicates.
- BI-0171, whose scope note brings in sibling capabilities that write to notes directly and share the defect.
