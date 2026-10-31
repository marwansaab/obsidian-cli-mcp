# Feature Specification: Prevent File Type Changes

**Feature Branch**: `070-prevent-filetype-changes`
**Created**: 2026-10-31
**Status**: Draft
**Input**: User description: "Prevent filetype changes. Every tool that takes a vault file path either handles Obsidian's native file types (notes, canvases, bases, attachments) correctly or rejects a type it does not support with a clear error; no tool silently changes a file's type."

## Background

Renaming a canvas today succeeds and turns it into a Markdown note: the server adds the note extension to any new name that lacks it, whatever the source file's type. The call reports success, so the agent believes it renamed the canvas, while the vault now holds a Markdown file full of canvas data. Other tools assume, to varying degrees, that every vault file is a Markdown note, and nothing on the tool surface tells the agent which ones do. This feature makes each file-path tool's behaviour per file type deliberate, visible and safe.

## Clarifications

### Session 2026-10-31

- Q: When the destination explicitly names a recognised file type extension that differs from the source's, should rename and move reject it, honour it, or should only move honour it? → A: Reject on both rename and move with the unsupported-file-type error. A changed extension never converts the content, so the type must never change through a typed tool; "unless explicitly asked" is served by the raw Obsidian CLI tool, already the documented route for non-note renames. Rationale: BI-0060 Impact (silent mutation is the worst failure mode) and its Cleanup constraint (the schema must reject unsupported types or the handler must preserve them, with no middle ground).
- Q: Which error envelope carries the unsupported-file-type rejection? → A: `VALIDATION_ERROR` with `details.code: "UNSUPPORTED_FILE_TYPE"`, with `details` carrying the received extension and the accepted types. No new top-level code (Constitution Principle IV, ADR-014, ADR-015; ADR-032 precedent for `find_and_replace`'s ineligible target). Existing `NOT_MARKDOWN` emissions (`links`, `backlinks`) and `open_file`'s CLI-reported `UNSUPPORTED_FILE_TYPE` stay unchanged, because ADR-015 allows only additive changes.
- Q: Which file types does `read` accept? → A: Notes, canvases and bases (all plain text) are supported; attachments (image, audio, video, PDF) are rejected with the unsupported-file-type error. Per BI-0060's Cleanup constraint a tool either handles a type properly or rejects it, so there is no "raw decoded text" middle ground. This is a per-tool choice recorded here, not in an ADR.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Renaming or moving a non-Markdown file keeps its type (Priority: P1)

An agent renames or moves a canvas, a base or an attachment (for example an image or a PDF). The file ends up with its new name or location and its original extension. A canvas stays a canvas.

**Why this priority**: This is the reported defect. It corrupts the vault silently and the agent cannot detect it from the result, so it is the most damaging behaviour in scope.

**Independent Test**: In a test vault, rename a canvas giving a new name without an extension, then move a base and an image to another folder, and confirm each result path and each file on disk keeps the original extension and content.

**Acceptance Scenarios**:

1. **Given** a canvas `Boards/Plan.canvas`, **When** the agent renames it to `Roadmap`, **Then** the file becomes `Boards/Roadmap.canvas`, the reported result path ends in `.canvas`, and its content is unchanged.
2. **Given** a base `Views/Tasks.base`, **When** the agent renames it to `Open Tasks`, **Then** the file becomes `Views/Open Tasks.base`.
3. **Given** an image `Attachments/photo.png`, **When** the agent moves it to the folder `Archive/`, **Then** the file becomes `Archive/photo.png`.
4. **Given** a canvas `Plan.canvas`, **When** the agent moves it to `Archive/Roadmap` (a full new path with no extension), **Then** the file becomes `Archive/Roadmap.canvas`.
5. **Given** a canvas, **When** the agent renames it giving a new name that already ends in `.canvas`, **Then** the extension is not doubled.
6. **Given** a Markdown note, **When** the agent renames or moves it exactly as before this feature, **Then** the outcome is unchanged (a name without an extension still gains `.md`).

---

### User Story 2 - Notes-only tools reject other file types clearly (Priority: P1)

An agent passes a canvas, base or attachment path to a tool that only works on Markdown notes. The call fails with a clear unsupported-file-type error that names the file type received and the types the tool accepts, and nothing in the vault changes.

**Why this priority**: Without a clear rejection the agent either gets a confusing upstream error, a misleading empty result, or a silently damaged file. A clear error tells it to choose another route.

**Independent Test**: For each notes-only tool, call it with a canvas path and with an image path, and confirm the result is an error, the vault is byte-for-byte unchanged, and the message names the accepted types. The error is the unsupported-file-type error, except for the tools listed in FR-007a, which keep their existing non-Markdown rejection.

**Acceptance Scenarios**:

1. **Given** a tool that supports notes only, **When** the agent passes a canvas, base or attachment path, **Then** the call fails with the unsupported-file-type error (or, for the tools listed in FR-007a, their existing non-Markdown rejection) and no file in the vault is created, changed, moved or deleted.
2. **Given** a rename or move whose destination would carry a different extension from the source, **When** the agent calls it, **Then** the call fails with the unsupported-file-type error and nothing in the vault changes. This holds even when the agent types the different extension explicitly (for example renaming `Plan.canvas` to `Plan.md`, or moving it to `Archive/Plan.md`); the error points to the raw Obsidian CLI tool as the route for a deliberate type change.
3. **Given** the unsupported-file-type error, **When** the agent reads it, **Then** it can tell, from the error alone, which file type was received, which types the tool accepts, and that nothing was changed.

---

### User Story 3 - Each tool documents the file types it supports (Priority: P2)

An agent reading the tool list can see, for every tool that takes a vault file path, which file types it accepts, so it picks the right tool first time instead of discovering limits by failure.

**Why this priority**: It prevents wasted calls and wrong tool choices, but the safety guarantees in Stories 1 and 2 hold without it.

**Independent Test**: Read the published description of every tool that takes a vault file path and confirm each names its supported file types, and that the named types match the tool's actual behaviour in Stories 1 and 2.

**Acceptance Scenarios**:

1. **Given** any in-scope tool that takes a vault file path, **When** the agent reads its description, **Then** the supported file types are named.
2. **Given** a tool's description names its supported types, **When** the agent calls it with an unnamed type, **Then** the call is rejected as in Story 2 (description and behaviour agree).
3. **Given** the long-form reference available through the help tool, **When** the agent looks up an in-scope tool, **Then** the same supported types are stated there.

---

### User Story 4 - No silent conversion anywhere (Priority: P2)

A vault owner can trust that no typed tool ever changes a file's type; a deliberate change goes through the raw Obsidian CLI tool. Canvases, bases and attachments are never converted as a side effect.

**Why this priority**: This is the overall invariant that Stories 1 and 2 deliver for specific tools; stating it separately makes it a check that covers every in-scope tool, including ones not named in the defect report.

**Independent Test**: For every in-scope tool that can create, move or rename a file, call it on each core file type and compare the resulting path's extension with the input's.

**Acceptance Scenarios**:

1. **Given** any successful path-handling call, **When** the agent compares the resulting path with the input path, **Then** the extension is unchanged; an explicit request for a different extension is rejected (User Story 2, scenario 2) and is served only by the raw Obsidian CLI tool.
2. **Given** any call that would change a file's type without an explicit request, **When** it runs, **Then** it fails with the unsupported-file-type error instead of succeeding.

---

### Edge Cases

- A note name containing dots, such as `Release v1.2`: the trailing `.2` is not a recognised file type, so it is treated as part of the name; renaming a note to `Release v1.2` still produces `Release v1.2.md`.
- Extension case: `Photo.PNG` is recognised as an image; preserving its type keeps the original spelling `.PNG`. A destination that differs from the source only in the extension's letter case (`Photo.png`) is the same file type and is not rejected.
- An explicit destination extension that is a different core type (renaming `Plan.canvas` to `Plan.md`, `Notes.md` to `Notes.canvas`): rejected, in both directions, by rename and move alike.
- A file addressed by name rather than full path (link-style resolution) or the active file in Obsidian: the file type check applies to the resolved file, not just to paths the agent typed with an extension.
- A file with no extension at all, or with an extension that is not one of Obsidian's core types: treated as an unsupported type by notes-only tools; file-level tools (rename, move, delete, open) keep whatever extension it has.
- Moving to a folder (destination ending in `/`): the file keeps its full original name, including extension, for every type.
- A rename name that already ends with the source's own extension: used as is, never doubled.
- A file that does not exist, addressed by name or as the active file: the existing not-found or no-active-file behaviour applies; the file type check runs only on a resolved file and does not mask it with a misleading unsupported-type error. A file addressed by an explicit path is type-checked at the boundary, before any vault access, so a missing `photo.png` passed to `read` by path reports the unsupported-file-type error.
- Tools that only take folder paths (listing and vault-wide search scope) are not file-path tools and are unaffected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST recognise Obsidian's core file types by extension: Markdown notes, canvases, bases, and attachments (the image, audio, video and PDF types Obsidian opens natively). Recognition MUST be case-insensitive.
- **FR-002**: Every in-scope tool that takes a vault file path MUST have a declared set of supported file types, and MUST behave according to it: it either handles a supported type correctly or rejects any other type.
- **FR-003**: The rename, move, delete and open-file tools MUST support every core file type.
- **FR-003a**: The read tool MUST support notes, canvases and bases, returning their text unchanged, and MUST reject attachments (image, audio, video, PDF) with the unsupported-file-type error instead of returning decoded binary content.
- **FR-004**: When rename or move is given a destination name or path with no recognised file type extension, the result MUST carry the source file's extension (for notes this remains `.md`, matching today's behaviour).
- **FR-005**: When rename or move is given a destination that already ends with the source file's extension, the extension MUST NOT be added again.
- **FR-006**: A rename or move MUST NOT produce a file whose extension differs from the source's. When the destination explicitly names a recognised file type extension that differs from the source's, the call MUST be rejected with the unsupported-file-type error before anything in the vault changes, and the error MUST name the raw Obsidian CLI tool as the route for a deliberate type change. No typed tool offers a type-changing rename or move.
- **FR-007**: A tool that does not support a given file type MUST reject the call before changing anything in the vault, returning a tool error under the existing validation-error code with the stable discriminator `details.code: "UNSUPPORTED_FILE_TYPE"`. No new top-level error code is introduced.
- **FR-007a**: Existing non-Markdown rejections that agents already rely on MUST keep their current shape: `links`, `backlinks` and `smart_connections_similar` continue to report `NOT_MARKDOWN`; `find_and_replace` continues to report `VALIDATION_ERROR` with `details.code: "INVALID_NOTE"` and `details.reason: "not-eligible"`; `views_base`, `query_base` and `create_base` continue to report `INVALID_BASE_PATH`; and `open_file` continues to report its CLI-reported `UNSUPPORTED_FILE_TYPE` when Obsidian has no view for an extension. The `UNSUPPORTED_FILE_TYPE` discriminator of FR-007 applies to new rejections only (ADR-015 allows only additive changes).
- **FR-008**: The unsupported-file-type error MUST state the file type received, the file types the tool accepts, and, where one exists, the tool to use instead.
- **FR-009**: The file type check MUST apply to the file the tool will actually act on, however it was addressed (full path, name-based resolution, or the active file).
- **FR-010**: Every in-scope tool's description MUST name the file types it supports, and the help tool's reference for that tool MUST state the same types.
- **FR-011**: Every successful in-scope call that returns a result path MUST return a path whose extension matches the input file's extension.
- **FR-012**: Behaviour for Markdown notes MUST be unchanged in every in-scope tool, apart from description wording.
- **FR-013**: Heading-, block- and property-level tools are outside this feature and MUST be left as they are.

### Key Entities

- **Core file type**: one of Obsidian's native file categories — note, canvas, base, attachment — identified by file extension.
- **Supported-type declaration**: for one tool, the set of core file types it accepts; the single statement from which both its description and its rejection behaviour follow.
- **Unsupported-file-type error**: the failure an agent receives when it passes a type outside a tool's declaration; a validation error discriminated by `details.code: "UNSUPPORTED_FILE_TYPE"`, carrying the received extension and the accepted types.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Renaming or moving a canvas, a base and an attachment, each with a destination that has no extension, yields a file with its original extension in 100% of cases (zero silent conversions to Markdown).
- **SC-002**: 100% of in-scope tools name their supported file types in their description, and in every case the named types match the tool's observed behaviour.
- **SC-003**: For every notes-only in-scope tool, a call with a canvas, a base and an attachment path fails, and the vault is unchanged afterwards in 100% of cases. The failure is the unsupported-file-type error, or, for the tools listed in FR-007a, that tool's existing non-Markdown rejection.
- **SC-004**: An agent receiving the unsupported-file-type error can identify, from the error text alone, the type it passed and at least one accepted alternative, with no further lookup.
- **SC-005**: All existing behaviour for Markdown notes is unchanged: every existing note-handling check continues to pass. The one exception is checks that pin the CLI arguments of an active-mode call: FR-009 requires those calls to act on the resolved file, so their expected arguments name that file explicitly, while the file acted on and the returned result stay the same.

## Assumptions

- "Attachments" means the file types Obsidian opens natively without plugins (images, audio, video, PDF). Plugin-defined types are out of scope, as the input states.
- In-scope tools are those that act on a single vault file named by path, name or the active file: read, write, append, prepend, find-and-replace (single-file scope), links, backlinks, outline, rename, move, delete, open-file, and the base-file and similarity tools. Heading-, block- and property-level tools are excluded, as the input states.
- Which in-scope tools beyond rename, move, delete, open-file and read support non-note types is a per-tool decision for planning; the requirement is that each decision is declared, documented and enforced, not that every tool gains new support. Base-file tools naturally support bases; content-editing tools (write, append, prepend, single-file find-and-replace) are expected to stay notes-only.
- The general escape-hatch command (raw Obsidian CLI access) takes no structured file path and is not covered; it remains the route for operations the typed tools reject.
- A file's type is determined by its extension, not by inspecting content.
- No new tools are added for editing canvas or base contents, and attachments are not rendered or previewed.
