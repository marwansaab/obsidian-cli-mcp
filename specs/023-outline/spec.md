## Feature Specification: Outline — Structured Heading Outline of a Vault Note

**Feature Branch**: `023-outline`
**Created**: 2026-05-13
**Status**: Draft
**Input**: User description: "Add Heading Outline — MCP clients can retrieve the heading outline of a vault note (the flat list of headings in source order, each entry carrying depth level, heading text verbatim, and source line number). Works against a specifically named note or against whichever note the user currently has focused in their editor."

## Clarifications

### Session 2026-05-13

- Q: The user input said the `text` field "contains the heading line verbatim". Should `text` include the `##` marker prefix / closing-ATX suffix, or only the text payload after marker stripping? → A: Option A — strip the leading `#`-run-plus-required-space AND optional trailing-space-plus-`#`-run (closing-ATX form), then strip surrounding whitespace from the remainder. `## Heading` → `Heading`; `## Heading ##` → `Heading`; `## **Bold**` → `**Bold**`. "Verbatim" means inline-Markdown and anchor content survive unchanged — NOT that marker characters are kept. Matches the BI-015 FR-028 precedent (the only other heading-text-extraction surface in the project) and makes the `level` field non-redundant. Locks FR-011 and US5 scenarios.
- Q: How should the outline detector treat `#`-prefixed lines inside CommonMark indented code blocks (4+ spaces / 1+ tab indentation)? → A: Option A — defer entirely to the upstream CLI / Obsidian metadata cache. The wrapper does NOT implement an indented-code-block detector; whatever Obsidian's parser decides about indented-code lines is what the outline returns. Matches the BI-015 architectural pattern (Obsidian-as-source-of-truth; metadataCache.headings reuse). The live-CLI characterisation pass (FR-023) verifies the observable behaviour and locks it in the research artefact and regression tests. Adds the indented-code-block opacity case to FR-023's roster.
- Q: When a locator resolves to a non-`.md` file (Canvas, PDF, attachment, image), what should the outline tool do? → A: Option A — reject non-`.md` files at the wrapper boundary with a structured error (reusing an existing CLI-failure code, message naming the unsupported filetype). Active mode resolving to non-`.md` produces the same error. Aligns with the typed-tool surface as it stands today (every existing tool implicitly assumes `.md`), keeps the contract crisp, and preserves the BI-060 widening trajectory — that future work will widen `read` to other filetypes, and the outline tool can be widened in lockstep with explicit per-filetype semantics rather than absorbing the question implicitly here. Adds FR-027 (non-`.md` rejection contract), SC-021 (rejection success criterion), an `UNSUPPORTED_FILETYPE` edge case, and a non-`.md`-filetype characterisation case to FR-023.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Specific-mode outline of a named note (Priority: P1)

An agent needs the heading structure of a known note in a known vault — for example "give me the outline of the Architecture document so I can pick the right section to read", "list every heading in this week's stand-up note so I can navigate to a specific Action Items block", or "show me every section of this ADR before I drill into the Decision". The agent calls the outline tool with `target_mode: "specific"`, the vault display name, and exactly one locator (`file` or `path`). The tool returns the flat ordered list of every heading in the note — each entry carrying the heading's depth level, the heading text verbatim from disk, and the source line number where the heading appears.

**Why this priority**: This is the dominant use case and the entry point that justifies the feature's existence. An outline is one of the cheapest reads the wrapper offers — typically a few hundred bytes for a note that costs tens of thousands of bytes to read in full. Agents that need to plan structure-aware navigation today are forced into a full-file read followed by client-side Markdown parsing — brittle (heading boundaries, fenced blocks, indentation) and expensive (5–50k tokens for a long document where the outline alone would be 100–500). A typed surface with a stable structural contract removes the parsing burden from every caller and makes outline-then-targeted-read a single-digit-token-cost discovery pattern. Without specific-mode support, the typed surface offers no advantage over the existing read path; this story alone justifies the feature.

**Independent Test**: Construct a note in a real vault with multi-level headings (at minimum: an `H1`, two child `H2` blocks, a grandchild `H3`, prose under each). Call the outline tool once with the `path` locator and once with the `file` locator. Assert each call returns every heading in source order with the correct level, byte-faithful text, and line numbers matching the on-disk file. Independently testable in isolation; nothing in P2/P3 is required.

**Acceptance Scenarios**:

1. **Given** a note in vault `Demo` at `notes/architecture.md` with the heading hierarchy `# Architecture` (line 1) → `## Modules` (line 5) → `### Auth` (line 9) → `## Data Flow` (line 14), **When** the agent calls the outline tool with `{ target_mode: "specific", vault: "Demo", path: "notes/architecture.md" }`, **Then** the response carries `count: 4` and a `headings` list of four entries in that exact source order, each entry's `level` reflecting the heading depth (1, 2, 3, 2), each entry's `text` matching the on-disk heading text byte-for-byte, and each entry's `line` matching the on-disk line number where the heading appears.
2. **Given** a note with no headings at all (only prose, lists, fenced blocks, or a YAML frontmatter block), **When** the agent calls the outline tool, **Then** the response succeeds with `count: 0` and an empty `headings` list — no error.
3. **Given** a note that includes heading levels that skip (for example a `# H1` directly followed by an `### H3` with no intermediate H2), **When** the agent calls the outline tool, **Then** the response preserves the source levels as-is (one entry at `level: 1`, the next at `level: 3`); the wrapper does not normalise, re-number, or warn.
4. **Given** a locator (`file` or `path`) that resolves to no file in the named vault, **When** the agent calls the outline tool, **Then** the call fails with a structured error preserving the operation's context (the named vault and locator).
5. **Given** a vault display name that does not match any registered Obsidian vault, **When** the agent calls the outline tool, **Then** the call fails with a structured error (the same reclassified-CLI-response shape that the existing typed tools already use for unknown vaults).
6. **Given** a note whose body contains fenced code blocks (triple-backtick or triple-tilde) where lines inside the fence begin with `#` characters and visually resemble Markdown heading markers, **When** the agent calls the outline tool, **Then** the fenced lines are NOT returned as headings — fenced blocks are treated as opaque content.

---

### User Story 2 — Active-mode outline of the focused note (Priority: P1)

An agent operating in a session where Obsidian's editor has a specific note focused needs the outline of whichever note is currently focused, without naming a vault or locator. The agent calls the outline tool with `target_mode: "active"` and no locator fields. The tool returns the focused note's outline, identical in shape to the specific-mode response.

**Why this priority**: Active mode is the standard target-mode discriminator across every typed file-scoped tool in the project. Omitting it would create an inconsistency in the typed surface and force agents to fall back to a different tool when the user is mid-editor. Pairs equally with US1 — together they cover the full target-mode discriminator contract for this feature.

**Independent Test**: Run Obsidian with a known note focused that contains multiple headings. Call the outline tool with `{ target_mode: "active" }`. Assert the response carries the focused file's outline. Independently testable from US1 because no specific-mode locator is exercised.

**Acceptance Scenarios**:

1. **Given** Obsidian has note `notes/x.md` focused in vault `Demo` with two top-level headings, **When** the agent calls the outline tool with `{ target_mode: "active" }`, **Then** the response carries `count: 2` and the two headings in source order with correct `level`, `text`, and `line`.
2. **Given** active mode and no note is focused (or no Obsidian instance is reachable), **When** the agent calls the outline tool, **Then** the call fails with a structured error directing the caller to focus a note or switch to specific mode.

---

### User Story 3 — Validation rejects malformed inputs at the boundary (Priority: P1)

An agent (or a misbehaving caller) submits an input shape that violates the tool's contract. The tool MUST reject the call at the validation boundary, before any underlying CLI invocation occurs, and MUST surface a structured validation error that names the offending field. Path-traversal handling for `path` is permissively located: rejection MAY happen at the input-validation boundary or at the underlying vault-access layer; either locus satisfies the safety contract.

**Why this priority**: Validation is the safety contract for every typed tool in this project, and zod-as-source-of-truth is a constitutional requirement. Without it, malformed callers reach the CLI and produce undefined or harmful behaviour. Independently testable because every validation case can be exercised with a mock/spy on the CLI dispatcher to assert the dispatcher was never called.

**Independent Test**: For each invalid input shape, call the outline tool with a CLI dispatcher spy. Assert the call rejects with a structured validation error AND that the dispatcher was never invoked. No real CLI or vault required.

**Acceptance Scenarios**:

1. **Given** `target_mode: "specific"` with NO `vault`, **When** the agent calls the outline tool, **Then** the call fails validation; no CLI call is made.
2. **Given** `target_mode: "specific"` with NO `file` and NO `path`, **When** the agent calls the outline tool, **Then** the call fails validation; no CLI call is made.
3. **Given** `target_mode: "specific"` with BOTH `file` and `path` set, **When** the agent calls the outline tool, **Then** the call fails validation; no CLI call is made.
4. **Given** `target_mode: "active"` with `vault` set, **When** the agent calls the outline tool, **Then** the call fails validation; no CLI call is made.
5. **Given** `target_mode: "active"` with `file` set, **When** the agent calls the outline tool, **Then** the call fails validation; no CLI call is made.
6. **Given** `target_mode: "active"` with `path` set, **When** the agent calls the outline tool, **Then** the call fails validation; no CLI call is made.
7. **Given** any input with an unknown top-level key (for example `{ target_mode: "active", foo: "bar" }`), **When** the call is forwarded by an MCP client that does NOT strip unknown keys, **Then** the server-side validation fails; no CLI call is made.
8. **Given** a path-style locator containing path-traversal characters (for example `path: "../escape.md"`), **When** the agent calls the outline tool, **Then** the call is rejected — either at the input-validation boundary or by the underlying vault-access layer; in both cases a structured error reaches the caller and no escape from the vault occurs.

---

### User Story 4 — Count-only mode skips the per-entry payload (Priority: P2)

An agent only needs to know how many headings a note has — for a structural audit ("does this template have its required eight sections?"), a heuristic ("is this document long enough to warrant a TOC?"), or a pre-flight check before deciding whether a per-heading scan is worthwhile. The agent calls the outline tool with `total: true`. The response carries the count only — the `headings` list is empty. The tool MUST NOT pay the per-entry payload cost when the caller asks only for a count.

**Why this priority**: Count-only mode is an explicit ask in the user input and matches the established `total: true` precedent from the project's other listing tool. It is an optimisation, not a requirement of the core read path — agents that always set `total: false` lose no functionality. Independently testable from US1 with a separate single-line input variation.

**Independent Test**: Author a fixture note with N headings (N > 0) and a fixture note with zero headings. Call the outline tool with `total: true` against each. Assert the first response carries `count: N` and an empty `headings` list; assert the second response carries `count: 0` and an empty `headings` list. Both succeed.

**Acceptance Scenarios**:

1. **Given** a note with exactly five headings, **When** the agent calls the outline tool with `{ ..., total: true }`, **Then** the response carries `count: 5` and `headings: []` (empty list).
2. **Given** a note with zero headings, **When** the agent calls the outline tool with `{ ..., total: true }`, **Then** the response carries `count: 0` and `headings: []` (empty list); no error.
3. **Given** count-only mode AND a locator that resolves to no file, **When** the agent calls the outline tool, **Then** the call fails with a structured error — count-only mode does NOT short-circuit the file-not-found path.

---

### User Story 5 — Heading text is byte-faithful to the source (Priority: P2)

An agent or downstream consumer needs the heading text exactly as it appears on disk — with inline Markdown tokens, Obsidian anchor markers, and any literal `::` substrings preserved verbatim. The tool MUST NOT strip, render, or normalise the heading text in any way. This contract makes the outline a faithful structural snapshot of the source file rather than a rendered presentation.

**Why this priority**: Byte-faithful preservation is what makes the outline programmable. A consumer building a TOC, generating ADR cross-references, or auditing structural consistency relies on the text matching the source exactly. The same contract makes a heading whose text contains the literal substring `::` observable to the caller — important because such headings are unreachable through some sibling read tools, and surfacing them in the outline lets callers detect the case and fall back accordingly. Independently testable with a single fixture file containing structurally rich headings.

**Independent Test**: Author a fixture note whose headings include: a heading with inline `**bold**` text; a heading containing a `[wikilink](target.md)` anchor; a heading with a trailing Obsidian anchor marker `^anchor-id`; a heading whose text contains the literal substring `::`; a heading with the closing-ATX form `## Heading ##`. Call the outline tool. Assert each entry's `text` field carries the heading bytes verbatim (after stripping only the leading `#`-run-plus-required-space marker and trailing-space-plus-`#`-run if any closing-ATX form is present).

**Acceptance Scenarios**:

1. **Given** a heading written as `## My **Bold** Section`, **When** the agent calls the outline tool, **Then** the entry's `text` field is exactly `My **Bold** Section` — the inline emphasis markers are preserved.
2. **Given** a heading written as `## Section ^my-id`, **When** the agent calls the outline tool, **Then** the entry's `text` field is exactly `Section ^my-id` — the Obsidian anchor marker is preserved.
3. **Given** a heading written as `## Edge::Case Naming`, **When** the agent calls the outline tool, **Then** the entry's `text` field is exactly `Edge::Case Naming` — the literal `::` substring is preserved so callers can detect the heading is unreachable through path-based heading-body reads.
4. **Given** a heading written as `### Setup ###` (closing-ATX form), **When** the agent calls the outline tool, **Then** the entry's `text` field is exactly `Setup` — only the leading `#`-run-plus-space and the trailing-space-plus-`#`-run are stripped; other formatting is preserved.

---

### User Story 6 — Documentation surface for the typed tool (Priority: P2)

An operator or agent inspects the project's progressive-disclosure help facility to understand how the outline tool works. The published documentation MUST cover the per-field input contract, the output shape (both with and without count-only mode), the failure-mode roster, and at least four worked examples covering at least: a specific-mode happy path, a focused-note happy path, a count-only-mode call, and at least one failure path (locator-resolves-to-no-file OR unknown-vault OR active-mode-no-focus).

**Why this priority**: The help facility is the primary discovery surface for tool consumers (mirrored from every typed tool). The tool is callable without docs but undiscoverable without them. Should-pass for ship; not required for the read code path itself to function. Independently testable by loading the help facility output and asserting structural completeness.

**Independent Test**: Invoke the help facility for the outline tool. Assert the doc carries: per-field input contract, output shape for both default and count-only modes, failure-mode roster, and at least four worked examples covering at least four distinct usage modes. The registry-consistency test from `005-help-tool` already auto-asserts the file's existence once the tool is registered; this story expands the assertion to content completeness.

**Acceptance Scenarios**:

1. **Given** the help facility, **When** an operator queries the outline tool, **Then** the response carries the full per-field input contract, the output shape for both default and count-only modes, the failure-mode roster (including file-not-found, unknown-vault, active-mode-no-focus, validation-rejection, and the practical ceiling for very large outlines), and at least four worked examples covering at least four distinct usage modes from {specific-mode happy path, focused-note happy path, count-only-mode call, file-not-found error, validation-rejection error}.
2. **Given** the help facility, **When** an operator queries the outline tool, **Then** the doc explicitly names the practical ceiling for very large outlines (the underlying execution layer's output cap inherited from feature 003) so callers can choose to defer to a different read strategy when the target file's outline is unusually large.

---

### Edge Cases

The implementation MUST handle, document, or explicitly defer each of the following observable shapes.

**CONCURRENCY**

- The note may be edited (heading added, removed, reordered, or renamed) between the moment the request is received and the moment its contents are read. The response reflects the file's state at the moment of read; there are no stale-read or partial-update guarantees beyond that. Documented as a known limitation.

**CONTENT — duplicate heading text**

- A note may contain two or more headings whose text is textually identical at the same or different depths. Each MUST appear as its own entry in the outline at the position it occurs in source order. The first-vs-subsequent distinction is the caller's concern; the outline does not de-duplicate.

**CONTENT — empty outline**

- A note with zero headings (only prose, only frontmatter, only fenced blocks, or empty) MUST return `{ count: 0, headings: [] }` — no error. Both default and count-only modes share this contract.

**CONTENT — fenced code blocks as opaque regions**

- A note's body may contain fenced code blocks (triple-backtick or triple-tilde) whose content includes lines that visually resemble Markdown heading markers (e.g. a Markdown-about-Markdown note containing `## Example` lines inside a fence). The outline MUST treat fenced code blocks as opaque — heading-like text inside fences is content, not a heading entry. Both ` ``` ` and `~~~` fence styles MUST be honoured. Fence markers MUST be matched in pairs.

**CONTENT — indented code blocks as opaque regions (deferred-to-upstream)**

- A note's body may contain CommonMark indented code blocks (lines indented by 4+ spaces or 1+ tab, not continuations of a paragraph). Lines within these blocks that begin with `#` are code, not headings. Per the 2026-05-13 clarifications session, the wrapper defers handling of this case to the upstream CLI / Obsidian metadata cache — no wrapper-side indented-code-block detector is built. Whatever Obsidian's parser decides is what the outline returns; the live-CLI characterisation pass (FR-023) exercises this case so the observable behaviour is locked in the regression suite.

**CONTENT — heading levels that skip**

- The source file MAY skip heading levels (e.g. `# H1` directly to `### H3`). The outline MUST preserve the source levels as-is — it is not the wrapper's role to normalise heading hierarchy. Consumers building a tree representation handle level-skipping in their own logic.

**CONTENT — Setext underline-style headings**

- Headings written in Setext underline form (a text line followed by `====` for H1 or `----` for H2) are NOT included in the outline. Only ATX-style headings (`#` through `######` followed by a space and at least one non-space character) appear. This matches the project's heading-detection precedent (feature 015) and Obsidian's own metadata cache. Documented fallback for callers needing Setext addressing: full-file read plus client-side parse.

**CONTENT — line endings**

- The outline's `line` field MUST count source lines using the on-disk file's actual line terminators (CRLF or LF). The line count MUST be the same for the same logical content regardless of which terminator is present, because both CRLF and LF terminate exactly one source line. The `text` field MUST NOT include trailing terminator bytes.

**CONTENT — very large outlines and the underlying execution layer's output cap**

- The underlying execution layer enforces a 10 MiB output cap on a single CLI invocation (inherited from feature 003). A note whose serialised outline would exceed this cap MUST produce a structured `CLI_NON_ZERO_EXIT` (output-cap kill) rather than a silent truncation. The practical ceiling MUST be documented in the published help facility so callers can choose to defer when the target file's outline is unusually large.

**CONTENT — non-`.md` filetypes (rejected)**

- A locator may resolve to a file that is not a Markdown note — a Canvas (`.canvas`), a PDF (`.pdf`), an image attachment, or any other file Obsidian can open. Per the 2026-05-13 clarifications session, the wrapper rejects such calls at the boundary with a structured error naming the unsupported filetype. Active mode resolving to a non-`.md` focused tab produces the same rejection. Filetype widening is tracked separately under BI-060; absorbing it into this feature is explicitly out of scope.

**UNDERLYING CLI — unknown vault**

- An unknown vault display name may produce a CLI response that the existing bridge classifier does not natively treat as an error (the same shape covered for `delete` / `write_note` / `read_property` / `find_by_property` / `read` / `set_property` via the 011-R5 inheritance). The implementation MUST handle this case explicitly: the response MUST be reclassified to a structured `CLI_REPORTED_ERROR`, not silently returned as a successful empty outline.

**CLIENT-CLASS — unknown-key validation**

- The server-side validation behaviour for "unknown top-level keys" (US3 scenario 7) is directly observable only from MCP clients that forward unknown keys to the server. Strict-naive clients strip unknown keys client-side per the published JSON Schema's `additionalProperties: false`, in which case the server never sees the offending key and validation does not trigger. Both pathways MUST be documented; the test case MUST exercise the server-side path explicitly so the validation contract holds for the client class that does forward unknown keys.

**SECURITY — structural data-passing**

- The `vault`, `file`, `path` fields are caller-supplied. The implementation MUST pass them to the underlying CLI as **data** (process arguments and structured parameters), never as text concatenated into a shell command, an `eval` payload, or any other text-based execution surface. Path-traversal handling (US3 scenario 8) is independently a separate concern handled either at the schema layer or by the underlying vault-access layer.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a typed MCP tool that returns the heading outline of a vault note. The tool's registered name follows the project's post-022 single-word-verbatim-from-upstream convention (the upstream Obsidian CLI subcommand name).
- **FR-002**: The tool MUST accept a `target_mode` discriminator with the values `"specific"` and `"active"`, mirroring the discriminator contract used by every other file-scoped typed tool in the project.
- **FR-003**: In `target_mode: "specific"`, the tool MUST require a `vault` display name AND exactly one locator field — either `file` (wikilink form, no extension, no folder) or `path` (vault-relative path including the `.md` extension), never both, never neither.
- **FR-004**: In `target_mode: "active"`, the tool MUST forbid the keys `vault`, `file`, and `path`. Presence of any of those keys in active mode MUST produce a validation failure.
- **FR-005**: The tool MUST accept an optional `total` boolean field, defaulting to `false`. When `total: true`, the response carries the count only and the `headings` list MUST be empty. When `total: false` (or omitted), the response carries the full per-heading entry list.
- **FR-006**: The tool's input schema MUST forbid unknown top-level keys (`additionalProperties: false`).
- **FR-007**: The tool MUST return an output object with two fields: `count` (a non-negative integer — the total number of headings detected in the note) and `headings` (an ordered list of per-heading entries). The list is empty when `total: true`; it is fully populated when `total: false`.
- **FR-008**: Each per-heading entry MUST carry exactly three fields: `level` (an integer from 1 to 6 reflecting the heading depth — 1 for `#`, 6 for `######`), `text` (the heading's text payload as a string), and `line` (the 1-based source line number where the heading appears).
- **FR-009**: The `headings` list MUST be in source order — the order in which the headings appear in the file from top to bottom. The implementation MUST NOT re-order, group, or sort entries.
- **FR-010**: The `line` field MUST be a 1-based integer counting source lines from the start of the file, with line breaks (LF or CRLF) each terminating exactly one source line. The line number MUST point to the line on which the heading marker itself appears.
- **FR-011**: Each entry's `text` field MUST be byte-faithful to the source's heading text payload (per the 2026-05-13 clarifications session). The implementation MUST extract heading text by: (a) stripping the leading `#`-run-plus-required-single-space marker; (b) stripping an optional trailing-space-plus-`#`-run (the closing-ATX form, e.g. `## Heading ##`); (c) stripping surrounding whitespace from the remainder. Inline Markdown tokens (`**bold**`, `*italic*`, `_emphasis_`, ` `code` `, `[anchor](url)`), Obsidian-style anchor markers (`^anchor-id`), and literal `::` substrings inside the text payload MUST NOT be stripped, rendered, or normalised.
- **FR-012**: The outline detector MUST treat fenced code blocks (triple-backtick `` ``` `` or triple-tilde `~~~`) as opaque regions. Lines inside an open fence that begin with `#` MUST NOT be returned as headings. Fence markers MUST be matched in pairs — an opening fence stays opaque until its matching closing fence (same fence character) is encountered. The implementation MAY satisfy this requirement by deferring to the upstream CLI / Obsidian metadata cache (per the 2026-05-13 clarifications session), which already enforces fence opacity in its `headings` array; no wrapper-side fence detector is required.
- **FR-012a**: For CommonMark indented code blocks (a line indented by 4+ spaces or 1+ tab that is not a continuation of a preceding paragraph), the wrapper MUST defer to the upstream CLI / Obsidian metadata cache (per the 2026-05-13 clarifications session). The wrapper MUST NOT implement a wrapper-side indented-code-block detector. The live-CLI characterisation pass (FR-023) MUST exercise an indented-code-block-containing-`#`-line fixture so the actual upstream behaviour is observable in the regression suite; if upstream behaviour changes in a future Obsidian release, the wrapper inherits the change and the regression test surfaces the delta.
- **FR-013**: The outline detector MUST recognise only ATX-style headings (`#` through `######` followed by a space and at least one non-space character). Setext underline-style headings (a text line followed by `====` for H1 or `----` for H2) MUST NOT be returned as headings — they are content. (This matches the project's heading-detection precedent established in feature 015.)
- **FR-014**: The implementation MUST preserve source heading levels as-is. Files containing level skips (e.g. `# H1` directly to `### H3` with no intermediate H2) MUST be reflected in the outline with the source levels unchanged. The wrapper MUST NOT normalise, re-number, or warn about heading hierarchy.
- **FR-015**: The tool MUST surface a structured error when the locator (`file` or `path`) resolves to no file in the named vault. The error MUST preserve the operation's context (vault and locator).
- **FR-016**: The tool MUST surface a structured error when the named vault does not match any registered Obsidian vault. If the underlying CLI returns a non-error-shaped response for unknown vaults (the 011-R5 inherited shape), the implementation MUST reclassify that response to `CLI_REPORTED_ERROR` before returning to the caller.
- **FR-017**: The tool MUST surface a structured error in `target_mode: "active"` when no note is focused (or no Obsidian instance is reachable). The error message MUST direct the caller to focus a note or switch to specific mode.
- **FR-018**: All validation failures MUST occur strictly before any underlying CLI invocation. Tests MUST be able to assert a CLI dispatcher spy was never called for invalid inputs.
- **FR-019**: Path-style locators containing path-traversal characters (e.g. `../escape.md`) MUST be rejected. The locus of rejection MAY be the input-validation boundary, the underlying vault-access layer, or both; in all cases a structured error MUST reach the caller and no escape from the vault MUST occur.
- **FR-020**: Errors MUST flow through the project's existing structured error codes — no new error codes MUST be introduced by this feature. Validation failures MUST surface as `VALIDATION_ERROR`; CLI failures MUST surface through the existing CLI-failure codes; the file-not-found and unknown-vault cases MUST surface through one of those existing codes (selected at planning time based on the underlying CLI's observable response shape).
- **FR-021**: The tool MUST be registered through the project's existing typed-tool registration factory. The progressive-disclosure help facility's documentation file for the outline tool MUST be authored with the per-field input contract, the output shape (for both default and count-only modes), the failure-mode roster, the practical ceiling for very large outlines, and at least four worked examples covering at least four distinct usage modes from {specific-mode happy path, focused-note happy path, count-only-mode call, file-not-found error, validation-rejection error}.
- **FR-022**: Each acceptance criterion across US1–US6 MUST be locked by at least one regression test that survives subsequent re-runs unchanged. The test count MUST be sufficient to cover schema validation, handler behaviour, and registration consistency.
- **FR-023**: The feature MUST run a live-CLI characterisation pass before ship that documents observable CLI behaviour for: specific-mode happy path with multi-level headings; specific-mode with zero headings; specific-mode with level-skipping; specific-mode with fenced-block-containing-`#`-lines; specific-mode with indented-code-block-containing-`#`-lines (verifies the deferred-to-upstream contract per FR-012a and the 2026-05-13 clarifications session); specific-mode with closing-ATX-form heading (`## Heading ##`); specific-mode with inline-Markdown-rich heading text; specific-mode with Obsidian-anchor-in-heading; specific-mode with literal `::` in heading text; specific-mode with Setext-underline-headings (verifies they are NOT included); specific-mode with CRLF and LF line endings (verifies `line` correctness across both); specific-mode count-only mode; specific-mode file-not-found; specific-mode unknown-vault response shape; specific-mode with non-`.md` filetype locator (verifies the FR-027 rejection contract for `.canvas`, `.pdf`, and at least one other Obsidian-recognised non-Markdown extension); active-mode with focused note; active-mode with no focus; active-mode with non-`.md` focused tab (verifies the FR-027 rejection covers active-mode parity); very-large-outline cap-boundary behaviour. Findings MUST be persisted in the feature's research artefact.
- **FR-024**: The feature MUST NOT change the public surface of any existing typed tool (`read`, `delete`, `files`, `write_note`, `read_property`, `find_by_property`, `set_property`, `read_heading`, `rename`, `obsidian_exec`, the help tool). The only permitted edit to existing source is the addition of the outline tool to the registration list AND the corresponding rolled-forward FR-018 baseline (per feature 022's durable registry-stability machinery).
- **FR-025**: All new source files introduced by this feature MUST carry the project's "Original — no upstream." attribution header per the project Constitution's originality principle.
- **FR-026**: The `vault`, `file`, `path` inputs MUST be passed to the underlying CLI as **data** (process arguments and structured parameters), never interpolated into a shell-evaluated string, an `eval` payload, or any other text-based execution surface.
- **FR-027**: When the resolved target file is not a Markdown note (i.e. its extension is anything other than `.md`), the tool MUST reject the call with a structured error (per the 2026-05-13 clarifications session). The error MUST reuse an existing CLI-failure error code (selected at planning time) and the message MUST name the unsupported filetype so callers can react. Both specific-mode (path-style locator pointing at a non-`.md` file, or wikilink-style locator that resolves to a non-`.md` file) and active-mode (focused tab is a Canvas, PDF, or other non-`.md` filetype) MUST produce the same rejection. Filetype widening is explicitly out of scope for this feature and is tracked separately under BI-060.

### Key Entities *(include if feature involves data)*

- **Heading entry**: A record describing one heading detected in the source file. Carries three fields: `level` (1–6, the depth), `text` (the heading's text payload, byte-faithful from disk modulo only the marker-stripping rule of FR-011), `line` (1-based source line number where the heading appears).
- **Outline**: An ordered list of heading entries in source order plus a `count` (the list's length). The list is fully populated in default mode and empty in count-only mode (`total: true`); the `count` is identical in both modes.
- **Locator (specific mode)**: An ordered triple of (vault display name, choice of `file`-vs-`path`, locator value). The `file` form names a note by its wikilink (no extension, no folder); the `path` form names a note by its vault-relative path including the `.md` extension. Exactly one of `file` or `path` MUST be provided.
- **Focused-note reference (active mode)**: An implicit reference to whichever note Obsidian's editor currently has focused. Resolved by the underlying CLI at execution time; not addressable by the caller through any input field.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A specific-mode call against a fixture note with multi-level headings returns every heading in source order with correct `level`, byte-faithful `text`, and correct `line` in 100% of test runs.
- **SC-002**: A specific-mode call against a fixture note with zero headings returns `{ count: 0, headings: [] }` with no error in 100% of test runs.
- **SC-003**: A note with skipped heading levels is reflected in the outline with source levels preserved as-is in 100% of test runs.
- **SC-004**: A locator that resolves to no file in the named vault produces a structured error in 100% of test runs.
- **SC-005**: An unknown vault display name produces a structured `CLI_REPORTED_ERROR` (reclassified per the 011-R5 inheritance) in 100% of test runs.
- **SC-006**: A note containing fenced code blocks with `#`-prefixed lines inside the fence does NOT include those lines as headings in 100% of test runs.
- **SC-007**: An active-mode call with a focused note returns the focused file's outline in 100% of test runs; an active-mode call with no focus produces a structured error directing the caller to focus a note or switch to specific mode in 100% of test runs.
- **SC-008**: Every invalid input shape rejected at the validation boundary (US3 scenarios 1–7) produces a structured error AND zero underlying CLI invocations across 100% of test runs.
- **SC-009**: A path-style locator containing path-traversal characters is rejected (at the schema layer or the vault-access layer) and never produces a successful read of a file outside the vault root in 100% of test runs.
- **SC-010**: Count-only mode returns `{ count: N, headings: [] }` for both N > 0 and N = 0 cases in 100% of test runs; count-only mode also surfaces file-not-found errors when the locator resolves nothing.
- **SC-011**: Heading text is byte-faithful: a heading with inline `**bold**`, a heading with an Obsidian `^anchor-id`, a heading containing the literal `::` substring, and a heading in closing-ATX form (`## Heading ##`) all produce the expected `text` field per FR-011 in 100% of test runs.
- **SC-012**: An agent retrieving a note's outline can do so in a single tool call returning a payload typically two orders of magnitude smaller than a full-file read (an outline of a 50-section, 30k-character document is on the order of a few hundred bytes vs ~30k for a full read). Token saving relative to a full-file read is observable from any tracing layer that records request/response payload sizes.
- **SC-013**: Every byte of the public output of the existing typed tools (`read`, `delete`, `files`, `write_note`, `read_property`, `find_by_property`, `set_property`, `read_heading`, `rename`, `obsidian_exec`, the help tool) is unchanged by this feature, except for the help facility growing one new entry for the outline tool AND the FR-018 baseline file rolling forward to include the new tool's fingerprint.
- **SC-014**: The published documentation for the outline tool covers the full per-field input contract, the output shape (for both default and count-only modes), the failure-mode roster, the practical ceiling for very large outlines, and at least four worked examples covering at least four distinct usage modes.
- **SC-015**: Every acceptance criterion across US1–US6 is locked by at least one regression test, totalling no fewer than 25 tests across schema, handler, and registration suites.
- **SC-016**: Zero new error codes are introduced by this feature; every failure flows through existing structured error codes.
- **SC-017**: The live-CLI characterisation pass (FR-023) documents observable behaviour for all 16 cases enumerated in FR-023, persisted in the feature's research artefact and surfaceable from the published documentation.
- **SC-018**: The caller-supplied `vault`, `file`, `path` inputs cannot reach a shell-evaluated context. The structural data-passing contract is verifiable by inspection of the dispatcher call shape (no shell, no `eval`-payload string interpolation of locator text).
- **SC-019**: The CRLF-saved and LF-saved fixture variants of the same logical note return identical heading entries (same `level`, same `text`, same `line` per entry) in 100% of test runs, demonstrating line-counting correctness across both terminator styles.
- **SC-020**: A note whose serialised outline would exceed the underlying execution layer's 10 MiB cap produces a structured `CLI_NON_ZERO_EXIT` (output-cap kill) rather than a silent truncation in 100% of test runs.
- **SC-021**: A locator (specific-mode or active-mode) resolving to a non-`.md` file produces a structured error per FR-027 in 100% of test runs across at least three Obsidian-recognised non-Markdown extensions (`.canvas`, `.pdf`, plus one image-attachment extension).

## Assumptions

- **Tool name**: The registered tool name follows the project's post-022 single-word-verbatim-from-upstream convention (FR-001). The exact name is the upstream Obsidian CLI subcommand for this surface; the planning phase confirms the upstream name via `obsidian help` and locks it before implementation.
- **Setext exclusion**: ATX-only heading recognition (FR-013) is the assumed default, matching the project's precedent established in feature 015 and matching Obsidian's own metadata cache (which only surfaces ATX headings). Callers needing Setext addressing fall back to a full-file read plus client-side parse — recorded in the documented out-of-scope list.
- **Count-only field name**: The optional boolean `total` (FR-005) follows the established precedent from feature 019 (`list_files`'s `total` field). The default is `false` so existing callers unaware of count-only mode receive the full outline.
- **Line numbering basis**: 1-based source line numbering (FR-010) matches editor conventions (Obsidian's UI, every common Markdown editor, every IDE) and the convention used by the upstream CLI's plain-text outline output.
- **Output shape consistency between modes**: The same envelope `{ count, headings }` is returned in both default and count-only modes (FR-007); count-only differs only by `headings` being empty. This eliminates a discriminated-union output type and keeps client code uniform.
- **The post-010 flat-extension idiom for `target_mode` schemas** (single `z.object().strict().superRefine(...)` plus `applyTargetModeRefinement`) and the post-011 module-layout convention (`{schema, handler, index}.ts` plus co-located `*.test.ts`) are the conventions this feature consumes. No precedent feature's spec or plan is amended.
- **The bridge classifier's existing inheritance for unknown-vault response inspection** (introduced in feature 011 and inherited unchanged by features 012, 013, 014, 015, 018, 019, 021, 022) is applicable to this feature's CLI subcommand. If the underlying response shape differs, the feature's planning phase will surface that as a delta and the unknown-vault classification will be addressed there.
- **The release impact is purely additive**: no existing tool's public surface changes; no error codes are added; no ADRs are amended. The version bump is a planning-phase decision (additive surface — likely a MINOR bump under pre-v1.0 semver) but the additive shape is a constraint set by this spec.
- **Out of scope** for this feature, recorded here so the planning phase does not silently absorb them: returning heading body content alongside the outline (use `read_heading`); returning a tree-shaped response with parent/child relationships pre-computed (callers build the tree client-side from `level` plus order); alternative output renderings such as Markdown-rendered or indented plain-text (callers needing a different shape use `obsidian_exec`); filtering by heading level (callers filter the `headings` list client-side); modifying the note's headings — adding, renaming, reordering (this feature is read-only); resolving or expanding inline Markdown inside heading text (heading text is returned verbatim per FR-011); Setext underline-style headings (out of reach per FR-013; documented fallback is full-file read plus client-side parse); non-`.md` filetypes such as Canvas, PDF, attachment images (rejected at the wrapper boundary per FR-027 per the 2026-05-13 clarifications session; widening to non-Markdown filetypes is tracked separately under BI-060).
