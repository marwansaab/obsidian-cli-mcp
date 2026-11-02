# Feature Specification: Classify Missing Destination

**Feature Branch**: `090-classify-missing-destination`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Classify missing destination. When an agent moves a note into a folder that does not exist, the failure is reported as a clear, typed 'destination folder not found' error that names the folder by its vault-relative path. Moving a note into a missing folder currently fails with the operating system's raw error text, which exposes the vault's absolute location on disk and gives the agent no stable signal to act on. The equivalent failure for a missing source note is already reported clearly. Out of scope: creating missing destination folders automatically; link-rewriting behaviour after a successful move; rename failures."

## Background

The `move` capability moves a file within a vault, optionally renaming it. The agent names the destination by a vault-relative path: either a folder ending in `/` (the file keeps its name) or a full new path (for example `Archive/2026/Old.md`).

Two of the ways a move can fail are already reported in a form an agent can act on:

- When the source note does not exist, the failure carries Obsidian's own message naming the missing note by its vault-relative path.
- When a file already exists at the destination, the failure carries Obsidian's own "destination file already exists" message.

A third failure is not. When the destination's folder does not exist, the move fails with the operating system's raw error text. That text names both the source and the destination by their absolute locations on the operator's disk (for example `C:\Users\<name>\Documents\Vault\Inbox\Note.md`), so it leaks the operator's folder layout into the agent's context, and it carries no stable signal the agent can test for. An agent cannot reliably tell "the folder is missing, create it and retry" apart from any other failure without parsing operating-system wording, which differs between Windows, macOS and Linux.

Other capabilities on this server already report a missing folder as a typed, named failure (the folder-scoped search and listing capabilities report a missing folder with a stable "folder not found" signal and the folder's vault-relative path). This feature brings `move` in line with them.

## Clarifications

### Session 2026-11-02

- Q: When a move fails, which absolute disk paths must be kept out of the error the agent receives? → A: Option A. Only vault paths are covered: no move failure may contain the vault's absolute location or the absolute path of anything inside it. That holds for the message and every structured detail field, including the raw command-line output and argument list the failure carries. Installation diagnostics are left as they are: the program locations searched and the `PATH` value carried by the binary-not-found failure, which every tool shares.
- Q: Which stable signal should a move into a missing destination folder carry? → A: Option A. Top-level code `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"`, and the missing folder's vault-relative path in `details.folder`, the field `paths` already uses beside `FOLDER_NOT_FOUND`. There is no `details.reason`: there is only one sub-state, so ADR-015's test for a `reason` is not met. The missing-source failure is left unchanged, because the BI scopes the fix to the destination and its Why says the missing source is "already reported clearly". Reusing `FOLDER_NOT_FOUND` and `details.folder` follows ADR-015's rule against splitting the discriminator namespace.
- Q: When a move fails in a way the server does not recognise and the raw command-line text contains the vault's absolute location, what should the agent receive? → A: Option A, rewrite. Every occurrence of the vault's absolute folder in the message and in every detail field, raw command-line output and error output included, is replaced with the vault-relative form. Both path separators are matched, and on Windows letter case is ignored. The failure keeps its code and the rest of Obsidian's wording. In specific mode this means looking up the vault's folder, which `move` does not do today.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Typed failure for a missing destination folder (Priority: P1)

An agent moves a note into a folder that does not exist in the vault. The move fails, the note stays where it was, and the agent receives a stable, machine-readable "destination folder not found" signal that names the missing folder by its vault-relative path. The agent creates the folder and retries the move.

**Why this priority**: This is the defect itself. Without a stable signal the agent cannot recover programmatically, and the recovery (create the folder, retry) is simple once the cause is known.

**Independent Test**: In the test vault, move an existing note to a destination whose folder does not exist, using both the folder form (`Missing/`) and the full-path form (`Missing/Renamed.md`). Confirm each failure carries the destination-folder-not-found signal and the folder `Missing`, and that the note is still at its original path, unchanged.

**Acceptance Scenarios**:

1. **Given** an existing note and a destination folder that does not exist, **When** an agent moves the note into that folder, **Then** the move fails with a stable destination-folder-not-found signal and the note remains at its original path with its content unchanged.
2. **Given** that failure, **When** the agent reads it, **Then** it names the missing folder by its vault-relative path (for example `Archive/2026`), in the same separator form the agent would use to address it.
3. **Given** a destination written as a full new path (`Archive/2026/Old.md`) whose folder `Archive/2026` does not exist, **When** the agent moves the note there, **Then** the failure names `Archive/2026` as the missing folder, not the full destination path.
4. **Given** a destination written in the folder form (`Archive/2026/`) whose folder does not exist, **When** the agent moves the note there, **Then** the failure names `Archive/2026` as the missing folder.
5. **Given** the failure, **When** the agent creates the named folder and repeats the same move, **Then** the move succeeds.

---

### User Story 2 - No absolute disk paths in move failures (Priority: P1)

An operator runs the server against a vault on their own machine. Whatever goes wrong with a move, the error the agent receives refers to locations only by their vault-relative paths and never reveals where the vault lives on disk.

**Why this priority**: Exposing the operator's disk layout is a privacy defect independent of whether the agent can recover. It shares top priority with Story 1 because the same failure triggers both.

**Independent Test**: Trigger each move failure the test vault can produce (missing source, missing destination folder, existing destination file, rejected type change, unknown vault) and search every returned error, including all of its structured detail, for the vault's absolute folder path and for any absolute path to something inside the vault (in drive-letter, leading-`/` or home-folder form).

**Acceptance Scenarios**:

1. **Given** a destination folder that does not exist, **When** the move fails, **Then** neither the error message nor any of its structured detail contains the vault's absolute location or the absolute path of anything inside it.
2. **Given** any other move failure that involves a location inside the vault, **When** the error is returned, **Then** it contains no absolute disk path of the vault or of anything inside it.
3. **Given** a move failure whose cause the server does not recognise, **When** the error is returned, **Then** every absolute vault location the underlying error text contained has been replaced by the vault-relative form, and the failure keeps its code and the rest of the underlying wording.

---

### User Story 3 - Distinguishable missing-source and missing-destination failures (Priority: P2)

An agent handles move failures by their signal, not by reading message text. A missing source note and a missing destination folder call for different recoveries (find the right note versus create the folder), so the agent must be able to tell them apart from the signal alone.

**Why this priority**: Stories 1 and 2 already make the missing-destination failure typed and safe; this story guarantees the two not-found failures cannot be confused with each other, which is what lets an agent branch on them reliably.

**Independent Test**: In the test vault, run one move whose source note does not exist (to an existing folder) and one whose source exists but whose destination folder does not. Compare the two failures' stable signals.

**Acceptance Scenarios**:

1. **Given** a missing source note and, separately, a missing destination folder, **When** each move fails, **Then** the two failures carry different stable signals.
2. **Given** a move whose source note is missing **and** whose destination folder is missing, **When** the move fails, **Then** the failure reports the missing source note (the source is checked first), and nothing is changed.
3. **Given** the existing missing-source and destination-file-exists failures, **When** this feature ships, **Then** those failures keep the signal and message they carry today.

---

### Edge Cases

- **Nested missing folders**: the destination is `A/B/C/` and neither `A`, `A/B` nor `A/B/C` exists. The failure names the destination's own folder, `A/B/C`, the folder the agent asked to move into, not only the first missing ancestor.
- **Destination folder name exists as a file**: the destination's folder segment names an existing file rather than a folder (for example `Inbox/Note.md/` where `Inbox/Note.md` is a note). This is not a missing folder; it must not be reported with the destination-folder-not-found signal, and its error must still contain no absolute disk path.
- **Destination at the vault root**: a destination with no folder segment (for example `Renamed.md`) has the vault root as its folder, which always exists; the destination-folder-not-found signal never applies.
- **Non-Markdown files**: moving a canvas, base or attachment into a missing folder reports the same signal and folder as moving a note.
- **Every way of naming the source**: the behaviour is the same whether the source is given by path, by note name, or as the note focused in Obsidian.
- **Separators and case**: a destination written with backslashes, or with different letter case from an existing folder on a case-insensitive file system, is reported with the vault-relative folder in forward-slash form exactly as the agent wrote it (separators normalised, case preserved).
- **Folder created concurrently**: if the folder appears between the failure and the agent's retry, the retry simply succeeds; no state carries over between calls.
- **Unknown vault**: looking up the vault's folder for the path rewrite must not change how a move that names an unregistered vault fails today (FR-007).
- **Vault folder cannot be looked up**: if the vault's folder cannot be determined when a failure needs cleaning (for example, Obsidian stops answering), the failure's raw text is withheld rather than returned uncleaned (FR-005).
- **Upstream behaviour change**: if a future Obsidian release starts creating missing destination folders itself, the move succeeds and no error is raised; this feature never blocks a move that would otherwise succeed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a move's destination folder does not exist in the vault, the move MUST fail with a stable destination-folder-not-found signal that an agent can test for without reading message text: top-level code `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"`, and no `details.reason`.
- **FR-002**: The destination-folder-not-found failure MUST name the missing folder by its vault-relative path in `details.folder`: the folder part of the resolved destination (for the folder form, the folder as written without its trailing `/`; for the full-path form, everything before the final segment), using forward slashes.
- **FR-003**: When the move fails because the destination folder is missing, the source file MUST remain at its original path with its content unchanged, and no folder, file or temporary artefact MUST be created in the vault.
- **FR-004**: The destination-folder-not-found failure MUST carry a human-readable message that states the folder was not found, names it by its vault-relative path, and tells the agent the folder must exist before the move (for example, create it, then retry).
- **FR-005**: No move failure MUST contain an absolute disk path of the vault or of anything inside it, in its message or in any of its structured detail, including any raw command-line output, error output or argument list the failure carries. Where an underlying error text would contain such a path, the server MUST replace every occurrence of the vault's absolute folder with the vault-relative form before returning the failure, matching either path separator and, on Windows, ignoring letter case. The failure keeps its code and the rest of the underlying wording; raw text is not withheld. The one exception is when the vault's folder cannot be looked up for a reason other than the vault not being registered. Then the raw text cannot be cleaned, so it is withheld: the failure keeps its code, names the vault-relative source and destination, and carries the lookup failure as its cause (analyze-time owner ruling, 2026-11-02). Installation diagnostics (the program locations searched and the `PATH` value reported when the Obsidian command-line program cannot be found) are not vault paths and are outside this requirement.
- **FR-006**: The missing-source failure and the destination-folder-not-found failure MUST be distinguishable by their stable signals alone: the destination failure carries `details.code: "FOLDER_NOT_FOUND"`; the missing-source failure carries no `details.code`, as today.
- **FR-007**: The existing move failures (missing source, destination file already exists, rejected file-type change, unknown vault, CLI unavailable, cancellation and timeout) MUST keep the signal they carry today; the missing-source and destination-exists failures MUST keep their current message text. The missing-source failure gains no sub-code.
- **FR-008**: The destination-folder-not-found signal MUST follow the server's existing convention for typed failures: it reuses the existing `CLI_REPORTED_ERROR` category and the existing `FOLDER_NOT_FOUND` sub-code with its `folder` detail field, the way the folder-scoped capabilities already report a missing folder. It introduces no new top-level failure category and no new sub-code (ADR-015).
- **FR-009**: The behaviour MUST be the same for every file type `move` accepts and for every way of naming the source (path, note name, active note).
- **FR-010**: The behaviour MUST be the same on Windows, macOS and Linux: the same signal, the same vault-relative folder and the same absence of absolute paths, regardless of how each operating system words the underlying error.
- **FR-011**: The `move` capability's published description and its help reference MUST list the destination-folder-not-found failure, its signal and the recovery (create the folder, retry), so an agent can learn it without triggering it.
- **FR-012**: A move whose destination folder exists MUST behave exactly as it does today; this feature MUST NOT add a failure to any move that currently succeeds.

### Key Entities

- **Destination folder**: the vault-relative folder a move would place the file into, derived from the agent's destination (the folder form as written, or the full path minus its final segment). It is the thing reported as missing.
- **Move failure**: the error an agent receives when a move does not happen. It carries a stable top-level category, an optional specific sub-signal, a human-readable message, and structured detail. After this feature, every location it names is vault-relative.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of moves into a missing destination folder, across all three operating systems the project supports, the agent receives the destination-folder-not-found signal and the correct vault-relative folder.
- **SC-002**: Zero move failures, across every failure the test vault can produce, contain the vault's absolute location or the absolute path of anything inside it, in their message or structured detail.
- **SC-003**: An agent that receives the destination-folder-not-found failure can recover in exactly two further calls (create the folder, repeat the move), with no message parsing.
- **SC-004**: A missing source note and a missing destination folder are told apart by signal alone in 100% of cases.
- **SC-005**: After a failed move into a missing folder, the vault's contents are byte-for-byte identical to before the call.
- **SC-006**: Every move that succeeds today still succeeds, with the same result, after this feature ships.

## Assumptions

- "No absolute disk paths" covers the vault's own location and anything inside it, which is what the operator story protects (confirmed in Clarifications). Diagnostics that concern the server's installation rather than the vault (where the Obsidian command-line program was searched for, and the `PATH` value, when it cannot be found) are not move-specific, are produced by a shared layer used by every capability, and are outside this feature.
- The stable signal is `CLI_REPORTED_ERROR` with `details.code: "FOLDER_NOT_FOUND"` and `details.folder` (confirmed in Clarifications), matching how the folder-scoped search and listing capabilities already report a missing folder (Constitution Principle IV forbids new top-level categories; ADR-015 forbids splitting the sub-code namespace).
- The source is checked before the destination: a move with both a missing source and a missing destination folder reports the missing source, as it does today.
- The destination folder is reported as the agent addressed it (separators normalised to `/`, letter case preserved); the server does not search for a differently-cased existing folder.
- The test vault and the destructive-probe protocol named in the project's test-execution instructions are used for every live check; live checks only create and remove folders and notes inside the authorised scratch area.
- Obsidian itself does not create missing destination folders during a move (the current behaviour the feature description reports). Planning confirmed this with a live probe on Windows (research P1–P3, F2). On macOS and Linux it is inferred, not probed: the same Obsidian (Electron/Node) code path reports the same Node error format there (research F5), and test row M7 covers that form.

## Out of Scope

- Creating missing destination folders automatically.
- Link-rewriting behaviour after a successful move.
- Rename failures (the `rename` capability is unchanged).
- Changing the wording or signal of any existing move failure other than removing absolute paths from it.
- Absolute paths in failures of capabilities other than `move`.
