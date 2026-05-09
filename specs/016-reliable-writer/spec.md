# Feature Specification: Reliable Writer

**Feature Branch**: `016-reliable-writer`
**Created**: 2026-05-10
**Status**: Draft
**Input**: User description: "Add Reliable Writer — a new typed write tool, `write_note_w_eval`, that creates or overwrites notes in an Obsidian vault without crashing the Obsidian application. Its public input contract and output shape mirror the existing `write_note` tool. The existing `write_note` tool is disabled — kept in the codebase but no longer advertised by the MCP server — so that re-enabling it is a single small change for retesting once an upstream Obsidian release lands."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reliable specific-mode writes at any practical size (Priority: P1)

An agent calling this MCP creates or overwrites a note at a named path inside a named vault. The note contains arbitrary text — frontmatter, prose, code blocks, embedded quotes, mixed Markdown — and may range from a few bytes to many kilobytes. The call either succeeds (producing the note byte-for-byte) or fails with a structured error. In no case does the host Obsidian application present a "JavaScript error occurred in the main process" dialog, and in no case is the call's content silently truncated or its target path silently renamed.

**Why this priority**: This is the entire reason the feature exists. The previous `write_note` tool deterministically crashes the host application for content beyond ~95 bytes, forcing every non-trivial write through a different MCP server. Without a crash-free specific-mode write path, no other story matters — the user has no usable write surface in this MCP at all.

**Independent Test**: Can be fully tested by invoking the new tool against a real Obsidian vault with content samples of approximately 60 bytes, 5 KB, and 12 KB (the previous tool's failure thresholds), then verifying that (a) the file exists at the requested path, (b) the file's bytes match the supplied content exactly, and (c) no Obsidian error dialog has appeared during or after the call. Delivers a fully usable specific-mode write capability in isolation.

**Acceptance Scenarios**:

1. **Given** a fresh path inside an open vault, **When** an agent calls `write_note_w_eval` with approximately 60 bytes of plain ASCII content, **Then** the note is created at the exact path with byte-for-byte matching content and no host-application error dialog appears.
2. **Given** a fresh path inside an open vault, **When** an agent calls `write_note_w_eval` with approximately 5 KB of plain ASCII content (the size at which the previous tool deterministically crashed), **Then** the note is created successfully and no host-application error dialog appears.
3. **Given** a fresh path inside an open vault, **When** an agent calls `write_note_w_eval` with approximately 12 KB of mixed Markdown content (the size at which the previous tool returned an empty-response error), **Then** the note is created successfully, no empty-response error is returned, and no host-application error dialog appears.
4. **Given** content that contains characters previously suspected to break the call path (double quotes, square brackets, trailing commas, embedded JSON-like fragments), **When** an agent calls `write_note_w_eval`, **Then** the content is persisted byte-for-byte in the resulting note.
5. **Given** an agent passes the same input parameters that the previous `write_note` tool would have accepted for a successful create or overwrite, **When** the agent calls `write_note_w_eval`, **Then** the response shape matches what the previous tool would have returned for the equivalent successful call.

---

### User Story 2 - Structured collision behaviour (Priority: P1)

An agent attempts to create a note at a path that is already occupied by another note. The tool's response distinguishes deliberately between "I refuse to overwrite" and "I have overwritten as instructed", based on an explicit caller-supplied flag. The tool never silently produces a renamed copy when the caller asked for a fresh create.

**Why this priority**: Silent path renames cause idempotency bugs in agent workflows that retry. The previous tool's behaviour of silently renaming on collision is one of the documented motivations for this BI. Pairing the crash-free write surface with deliberate collision behaviour is what makes the tool safe to use in multi-step agent flows, not just convenient.

**Independent Test**: Can be fully tested by writing a note at path P, then issuing a second `write_note_w_eval` call to path P with the overwrite flag disabled (must return a structured collision error and leave the original content intact), then issuing a third call with the overwrite flag enabled (must replace the content and return success). Verify the on-disk content after each call.

**Acceptance Scenarios**:

1. **Given** an existing note at the target path, **When** an agent calls `write_note_w_eval` with overwrite disabled, **Then** the call returns a structured error indicating the path is already occupied and the existing note's content is unchanged.
2. **Given** an existing note at the target path, **When** an agent calls `write_note_w_eval` with overwrite enabled, **Then** the existing note's content is replaced with the new content and the call returns success.
3. **Given** an existing note at the target path, **When** an agent calls `write_note_w_eval` with overwrite disabled, **Then** the tool does NOT silently produce a renamed copy of the note at any path.

---

### User Story 3 - Active-mode writes to the focused note (Priority: P2)

An agent calling this MCP wants to update whichever note Obsidian currently has focused, without naming a specific path — for example, to act on the user's current editing context. When a note is focused, the call replaces its content and returns success. When no note is focused, the call returns a structured error explaining the situation, so the agent can prompt the user or fall back to a path-specific call.

**Why this priority**: Active-mode is a documented capability of every typed tool in the project's prior shipped surface. It is part of the input-contract-parity promise with the previous `write_note`. It is P2 rather than P1 because specific-mode covers the dominant agent use case (workflow-driven writes); active-mode primarily supports interactive editor-context writes which are a smaller fraction of calls.

**Independent Test**: Can be fully tested by (a) opening a note in Obsidian, calling `write_note_w_eval` in active-mode with new content, and verifying the focused note's content is replaced, then (b) closing all notes so no file is focused, calling `write_note_w_eval` in active-mode, and verifying the response is a structured no-active-file error rather than a crash or a silent fallback.

**Acceptance Scenarios**:

1. **Given** Obsidian has a focused note in its editor, **When** an agent calls `write_note_w_eval` in the focused-note mode, **Then** the focused note's content is replaced with the new content and the call returns success.
2. **Given** Obsidian has no focused note, **When** an agent calls `write_note_w_eval` in the focused-note mode, **Then** the call returns a structured error stating no active file is available.

---

### User Story 4 - Old tool disabled with explanatory replacement pointer (Priority: P2)

An MCP client whose configuration still references the legacy `write_note` tool name attempts to invoke it. Rather than receiving a crash, a generic "tool not found" error, or — worst — a successful write that crashes the host application, the client receives a structured error that explains the tool is currently disabled, names `write_note_w_eval` as the replacement, and cites the upstream Obsidian defect that motivated the disable. Listing the MCP server's available tools no longer returns `write_note`. The legacy tool's source, tests, and documentation remain present in the codebase so a maintainer can re-enable it for a one-off retest after a future Obsidian release lands, in a single small change rather than a code-archaeology exercise.

**Why this priority**: Migration-friendliness for existing clients and a low-friction retest path for the maintainer. The maintainer-facing reversibility requirement is non-negotiable per the BI's framing. P2 because the new tool's reliability (Stories 1, 2, 3) is what unblocks users; the disable plumbing is the orderly cleanup of the broken predecessor.

**Independent Test**: Can be fully tested by (a) listing the MCP server's tools and verifying `write_note_w_eval` appears and `write_note` does not, (b) directly invoking `write_note` and verifying the response is a structured error naming `write_note_w_eval` and citing the upstream defect, (c) inspecting the codebase to confirm `write_note`'s source, tests, and help documentation are still present, and (d) demonstrating that re-enabling `write_note` requires a small isolated change without restoring code from version history.

**Acceptance Scenarios**:

1. **Given** the MCP server is running the new bridge version, **When** an MCP client lists available tools, **Then** `write_note_w_eval` appears in the list and `write_note` does not.
2. **Given** the MCP server is running the new bridge version, **When** an MCP client attempts to invoke `write_note` directly, **Then** the client receives a structured error explaining that the tool is currently disabled, naming `write_note_w_eval` as the replacement, and citing the upstream Obsidian defect that motivated the disable.
3. **Given** the new bridge version has shipped, **When** a maintainer wants to retest whether the upstream Obsidian defect is fixed by a future release, **Then** re-enabling `write_note` is a small, isolated change that does not require re-implementing tool logic from version history.
4. **Given** the new bridge version has shipped, **When** a maintainer inspects the codebase, **Then** the legacy `write_note` source, tests, and help documentation are still present.

---

### User Story 5 - Discoverable, self-describing tool (Priority: P3)

An agent calling this MCP requests progressive-disclosure help for `write_note_w_eval`. The returned help is sufficient on its own — without external documentation, without reading the source — to construct a valid invocation, predict the response shape on success, predict the response shape on each documented failure, and understand why this tool exists separately from any other write surface.

**Why this priority**: Project-wide convention; every prior typed tool has shipped with progressive-disclosure help meeting this bar. The new tool inherits the requirement automatically. P3 because the tool is functionally usable without exhaustive help (an agent who knows the shape can invoke it), but discoverability and rationale-transparency are part of the project's quality bar.

**Independent Test**: Can be fully tested by requesting help for the new tool through the MCP help surface and asserting that the returned text covers each of the six required dimensions (purpose, when-to-use including comparison with other write surfaces, input contract with parameter meanings and defaults, output and error contract with stable error codes, upstream rationale, at least one worked invocation example).

**Acceptance Scenarios**:

1. **Given** an MCP client requests progressive-disclosure help for `write_note_w_eval`, **When** the help is returned, **Then** it explains what the tool does and identifies it as a write-targeted tool that creates or overwrites a single note.
2. **Given** an MCP client requests progressive-disclosure help for `write_note_w_eval`, **When** the help is returned, **Then** it explains when to use this tool and when not to, including its relationship to other write surfaces.
3. **Given** an MCP client requests progressive-disclosure help for `write_note_w_eval`, **When** the help is returned, **Then** it documents the full input contract including each parameter's meaning, type, requiredness, and default.
4. **Given** an MCP client requests progressive-disclosure help for `write_note_w_eval`, **When** the help is returned, **Then** it documents the full output and error contract, including each stable error code the tool may emit.
5. **Given** an MCP client requests progressive-disclosure help for `write_note_w_eval`, **When** the help is returned, **Then** it explains the upstream Obsidian defect that motivated the tool's existence.
6. **Given** an MCP client requests progressive-disclosure help for `write_note_w_eval`, **When** the help is returned, **Then** it includes at least one worked invocation example.

---

### Edge Cases

- **Vault name not recognised by Obsidian**: the call returns a structured error consistent with the existing project-wide unknown-vault behaviour, not a crash dialog and not a silent write to a different vault.
- **Multi-vault Obsidian instance with vault-routing ambiguity**: the call's effect on which vault is targeted matches the project's existing inherited limitation (the vault parameter is functionally ignored by the eval composition surface, so the currently-focused vault is the de facto target). Documented as a known limitation, not a defect of this tool.
- **Path with directory components that do not yet exist**: behaviour matches the input-contract-parity promise — the same outcome the previous `write_note` would have produced for the same input.
- **Empty content**: the note is created or overwritten with empty content; no special-case error.
- **Content that includes the literal characters used internally for argument transport** (e.g. characters that previously broke the `write_note` payload): persisted byte-for-byte; this is one of the explicit reliability acceptance scenarios.
- **Overwriting a note that is currently open in the Obsidian editor**: the on-disk file is replaced; the editor's view of the file refreshes per Obsidian's normal external-edit handling. No host-application crash.
- **Two concurrent calls to overwrite the same path**: last-write-wins; no atomicity guarantee beyond what the underlying eval composition surface provides. Documented limitation, not a defect.
- **Content far above the largest tested size (e.g. tens of MiB)**: the call returns a structured size-related error consistent with the project-wide upper-bound handling, never a silent truncation and never a host-application crash.
- **A direct invocation of the legacy `write_note` arrives during the brief window before a client has refreshed its tool list**: the structured replacement-pointer error fires; the client is not left guessing.

## Requirements *(mandatory)*

### Functional Requirements

#### The new tool — public surface

- **FR-001**: The MCP server MUST advertise a typed tool named exactly `write_note_w_eval` in its tool list.
- **FR-002**: `write_note_w_eval`'s public input contract MUST mirror the previous `write_note` tool's input contract — same parameter names, same parameter meanings, same requiredness, same defaults, same target-mode discriminator semantics — except where the deliberately-improved collision behaviour in FR-009 requires a difference.
- **FR-003**: `write_note_w_eval`'s success response shape MUST match the shape that the previous `write_note` would have returned for an equivalent successful call.
- **FR-004**: `write_note_w_eval`'s failure response codes MUST be drawn from the project's existing stable error-code roster, except where this tool's contract requires a code the roster does not yet contain; any new code MUST be documented in the tool's help.

#### The new tool — reliability and behaviour

- **FR-005**: `write_note_w_eval` MUST create a note at a caller-supplied path inside a caller-supplied vault when the path is unoccupied, with the caller-supplied content persisted byte-for-byte.
- **FR-006**: `write_note_w_eval` MUST overwrite a note at a caller-supplied path inside a caller-supplied vault when the caller has explicitly opted in to overwriting, with the caller-supplied content replacing the previous content.
- **FR-007**: `write_note_w_eval` MUST replace the content of the currently-focused note when the caller invokes it in active (focused-note) mode and a focused note exists.
- **FR-008**: `write_note_w_eval` MUST return a structured no-active-file error when the caller invokes it in active mode and no note is currently focused.
- **FR-009**: `write_note_w_eval` MUST return a structured path-collision error when the caller attempts to create a note at an already-occupied path without explicitly opting in to overwriting; it MUST NOT silently produce a renamed copy in this case.
- **FR-010**: `write_note_w_eval` MUST persist content byte-for-byte regardless of which characters the content contains, including characters previously suspected to break the predecessor's call path (double quotes, square brackets, trailing commas, embedded JSON-like fragments).
- **FR-011**: `write_note_w_eval` MUST NOT cause the host Obsidian application to display a "JavaScript error occurred in the main process" dialog for any content size up to and including the project's documented per-call output cap.
- **FR-012**: `write_note_w_eval` MUST NOT return an empty-response error for content sizes that the predecessor returned empty-response errors for (specifically tested up to and including ~12 KB of mixed Markdown).

#### The legacy tool — disable, not remove

- **FR-013**: The MCP server MUST NOT advertise `write_note` in its tool list.
- **FR-014**: The MCP server MUST respond to a direct invocation of `write_note` with a structured error that (a) states the tool is currently disabled, (b) names `write_note_w_eval` as the replacement, and (c) cites the upstream Obsidian defect that motivated the disable.
- **FR-015**: The legacy `write_note` source files MUST remain present in the codebase.
- **FR-016**: The legacy `write_note` test files MUST remain present in the codebase and MUST continue to be runnable in isolation, so a maintainer retesting after a future Obsidian release can validate the upstream fix without rebuilding the test surface.
- **FR-017**: The legacy `write_note` help documentation MUST remain present in the codebase.
- **FR-018**: Re-enabling `write_note` for a one-off retest after a future Obsidian release MUST require only a small, isolated edit (registration toggle plus help-list adjustment), with no need to restore tool logic, tests, or help text from version history.

#### Discoverability and contract transparency

- **FR-019**: The progressive-disclosure help for `write_note_w_eval` MUST cover, at minimum: (a) what the tool does, (b) when to use it and when not to versus other write surfaces, (c) the full input contract including parameter meanings, requiredness, and defaults, (d) the full output and error contract including each stable error code the tool may emit, (e) the upstream rationale that motivated this tool's existence, and (f) at least one worked invocation example.
- **FR-020**: The progressive-disclosure help for the disabled `write_note` MUST NOT appear in the MCP server's advertised help index (consistent with FR-013).

#### Cross-cutting non-impact

- **FR-021**: This feature MUST NOT change the public input contract of any other typed tool (`read_note`, `read_property`, `read_heading`, `find_by_property`, `delete_note`, `obsidian_exec`, `help`).
- **FR-022**: This feature MUST NOT change the MCP server's progressive-disclosure conventions or schema-stripping behaviour beyond what the new tool's contract requires.
- **FR-023**: This feature MUST NOT add new error codes to the project's stable error-code roster beyond those required to express the new tool's contract and the disabled-tool's structured rejection.

### Key Entities *(include if feature involves data)*

- **Tool registration**: the set of typed tools the MCP server advertises to clients. Gains `write_note_w_eval`. Loses `write_note`. Other entries unchanged.
- **Note**: a file at a given path inside a given vault, holding caller-supplied textual content. The unit of work the new tool reads, creates, or replaces.
- **Disabled-tool stub**: the structured error response returned when a client invokes the legacy `write_note` directly. Carries (a) a human-readable explanation that the tool is disabled, (b) the name of the replacement tool, and (c) a citation of the upstream Obsidian defect.
- **Progressive-disclosure help entry**: per-tool documentation that a client can fetch on demand. New entry exists for `write_note_w_eval`. The legacy `write_note` entry is retained in the codebase but not advertised.
- **Upstream defect record**: the BI-038 record in the project's investigation log holding the empirical evidence that the predecessor crashes on writes >~95 bytes. Referenced by FR-014's citation requirement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of `write_note_w_eval` invocations carrying content of approximately 60 bytes, 5 KB, or 12 KB succeed without producing an Obsidian "JavaScript error occurred in the main process" dialog. (Measured against the predecessor's reliability of 0% above approximately 95 bytes.)
- **SC-002**: 100% of `write_note_w_eval` invocations that complete successfully persist the caller-supplied content byte-for-byte, including across edge-character cases (double quotes, square brackets, trailing commas, embedded JSON-like fragments).
- **SC-003**: 0% of `write_note_w_eval` create-without-overwrite invocations against an already-occupied path produce a silent renamed-copy outcome; 100% return a structured path-collision error and leave the existing note unchanged.
- **SC-004**: 0% of `write_note_w_eval` invocations across the tested content sizes (up to and including approximately 12 KB) return an empty-response error.
- **SC-005**: 100% of attempts by an MCP client to invoke the legacy `write_note` directly return a structured error response that contains all three required pieces of information (disabled-status statement, replacement-tool name, upstream-defect citation).
- **SC-006**: The MCP server's tool list contains `write_note_w_eval` and does not contain `write_note` (a binary check on the server's advertised tool inventory).
- **SC-007**: An agent provided only with the new tool's progressive-disclosure help — and no external documentation — can construct a syntactically valid invocation that the MCP server accepts on first attempt.
- **SC-008**: Re-enabling the legacy `write_note` for a one-off retest is achievable by editing two surfaces only: the MCP server's tool registration list (one entry added back, one removed) and the help advertisement (one entry added back). No tool-logic source file, no tool-test source file, and no help-documentation source file need to be touched for the re-enable.
- **SC-009**: The other typed tools' input contracts, output shapes, and error codes are unchanged by this feature (zero observable changes against the prior shipped surface for `read_note`, `read_property`, `read_heading`, `find_by_property`, `delete_note`, `obsidian_exec`, `help`).
- **SC-010**: The progressive-disclosure help for `write_note_w_eval` covers all six required dimensions enumerated in FR-019 (verifiable by inspection against a checklist).

## Assumptions

- The Obsidian eval composition surface that the new tool routes through remains crash-free for write operations in the current Obsidian release line and the near-future releases the project targets — empirical evidence in BI-038 supports this for the tested versions.
- The previous `write_note` tool's input contract is the parity reference; agents already calling the predecessor should be able to retarget to the new tool by changing only the tool name (subject to the deliberately-improved collision behaviour in FR-009, which is a strictly safer change for callers and therefore not a breaking input-contract change).
- The project's existing progressive-disclosure conventions and schema-stripping behaviour, as already shipped for prior typed tools, apply to the new tool unchanged.
- The multi-vault routing limitation inherited from prior typed tools (the vault parameter being functionally ignored by the eval composition surface, with the currently-focused vault being the de facto target) also applies to this tool. This limitation is documented in the new tool's help; it is not a defect of this feature and is not in scope to fix here.
- The previous `write_note` tool's source, tests, and help documentation are valuable enough to retain for a future retest after an upstream Obsidian fix; the cost of carrying them as quiescent code is lower than the cost of rebuilding them from history.
- The new tool's per-call latency is acceptable as long as it remains within the same order of magnitude as the predecessor's per-call latency for equivalent inputs (a quality bar, not a performance target with a specific number; the latency cost of the eval composition surface has been observed in prior typed tools without complaint).
- Filing the upstream Obsidian issue, patching the upstream Obsidian Integrated CLI binary, and any other work targeting the upstream defect's root cause are tracked separately on the BI-038 investigation plan and are not in scope for this feature.
