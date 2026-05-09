# Feature Specification: Read Heading — Typed Heading-Body Read

**Feature Branch**: `015-read-heading`
**Created**: 2026-05-09
**Status**: Draft
**Input**: User description: "Add Read Heading — A typed MCP tool that reads the body content of a specific heading inside a vault note, returning only the text that lives under that heading (up to but not including the next sibling-or-higher heading)."

## Clarifications

### Session 2026-05-09

- Q: The user input contained two boundary phrasings — "up to the next sibling-or-higher heading, exclusive" AND "Does NOT include child-heading subtrees" — which produce different bodies for headings WITH children appearing before any sibling. Which terminator rule does the tool use? → A: First-subsequent-heading-marker-of-any-depth — the body terminates at whichever heading marker (child, sibling, or shallower) appears first in the document, or at EOF. Child subtrees are naturally excluded because the child heading itself terminates the body. Locks FR-010 and US1 scenarios 2–5.
- Q: Markdown supports both ATX (`# Heading`) and Setext (`Heading\n====` or `Heading\n----`) heading syntaxes. Which syntax does the boundary detector and segment matcher recognise as a heading marker? → A: ATX only — `#` through `######` followed by a space and heading text. Setext underline-style headings are content, not boundaries. Removes the YAML-frontmatter-`---` and horizontal-rule-`---` disambiguation surface entirely. Setext-style headings are added to the out-of-scope list; documented fallback is `read_note` plus client-side parse. Locks the boundary-detector parser surface for FR-010, FR-012, and FR-025.
- Q: How are caller-supplied heading-path segments compared against actual heading text in the file? Specifically: trailing whitespace, optional closing-ATX `#` sequences (`## Heading ##`), inline markdown (`**bold**`, `[link](url)`), Obsidian anchor markers (`^anchor-id`), and case sensitivity. → A: Minimal-normalisation, case-sensitive byte compare (FR-028). For each ATX heading line: strip the leading `#`-run plus the required following space, strip an optional trailing-space-plus-`#`-run (closing-ATX form), strip surrounding whitespace; the remainder is the heading text. Caller's segment is compared to that text with case-sensitive byte equality. Inline markdown tokens (`**`, `*`, `_`, ` `` `, `[text](url)`) and Obsidian anchor markers (`^id`) are NOT stripped — they are part of the heading text and the caller MUST supply them verbatim. Locks FR-013 / SC-011's "mis-cased fails" semantics and adds the closing-ATX, surrounding-whitespace, inline-markdown-survives, and anchor-marker-survives cases to the FR-025 characterisation roster.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Specific-mode heading-body read returns the named section verbatim (Priority: P1)

An agent needs the body of a single named heading from a known note in a known vault — for example "give me just the Decision section of ADR-007", "give me just the Action Items of last Tuesday's stand-up note", or "give me just the Naming rule from the Best Practices document". The agent calls `read_heading` with `target_mode: "specific"`, the vault display name, exactly one locator (`file` or `path`), and the heading path expressed as `H1::H2` (or deeper, e.g. `H1::H2::H3`). The tool returns the body text that lives under that heading — verbatim from disk, with byte-level structure preserved — and excludes everything that does not belong to the named heading.

**Why this priority**: This is the dominant use case and the one that justifies the feature's existence. Heading-targeted reads are one of the highest token savers available — agents that need to re-read a single rule from a long Best Practices document, a single ADR's Decision section, or a single meeting note's Action Items section pay 5–50k tokens on a full-file read where 100–500 tokens of actual content would suffice. Today the only path is a full-file read plus client-side Markdown parsing, which is brittle (heading boundaries, indentation, fenced code blocks) and expensive. A typed surface with a stable structural contract removes the parsing burden from every caller. Without specific-mode support, the typed surface offers no advantage over the existing read path; this story alone justifies the feature.

**Independent Test**: Construct a note in a real vault with a multi-level heading hierarchy (at minimum: an `H1`, a child `H2`, a grandchild `H3`, a sibling `H2`, and prose under each). Call `read_heading` once for a 2-segment path, once for a 3-segment nested path, once for a heading whose body is bounded by a sibling-level heading, and once for a heading whose body is bounded by a higher-level heading. Assert each call returns the correct section's body verbatim, with child-heading subtrees excluded. The story is fully testable in isolation; nothing in P2/P3 is required for it to deliver value.

**Acceptance Scenarios**:

1. **Given** a note in vault `Demo` at `notes/best-practices.md` with the heading hierarchy `# Best Practices` → `## Naming` (with prose `Use kebab-case.`) → `## Tests`, **When** the agent calls `read_heading({ target_mode: "specific", vault: "Demo", path: "notes/best-practices.md", heading: "Best Practices::Naming" })`, **Then** the response is `{ content: "Use kebab-case.\n" }` — only the Naming section's body, terminated before `## Tests`.
2. **Given** the same note with `## Naming` containing a child `### Casing` (with its own prose `Use lowercase letters and dashes.`), **When** the agent calls `read_heading({ ..., heading: "Best Practices::Naming" })`, **Then** the response carries only the prose directly beneath `## Naming` (the lines before `### Casing`); the `### Casing` heading line and its child subtree are NOT included.
3. **Given** the same note with `## Naming` → `### Casing` (prose `Use lowercase letters and dashes.`), **When** the agent calls `read_heading({ ..., heading: "Best Practices::Naming::Casing" })`, **Then** the response carries only the prose directly beneath `### Casing`, terminated before the next H3 sibling, the next H2 sibling-or-shallower, or any further child heading — whichever appears first in the document.
4. **Given** a note where the named heading's body is followed directly by a SIBLING-level heading (same depth) with no intervening prose, **When** the agent calls `read_heading` for the named heading, **Then** the response carries the body content (which may be the empty string if the heading has no prose at all), with the sibling-level heading correctly recognised as the terminator.
5. **Given** a note where the named heading's body runs up to a HIGHER-level heading (shallower depth — for example an `## H2` body terminated by the next `# H1`), **When** the agent calls `read_heading` for the named heading, **Then** the response carries the H2's body up to (and excluding) the H1 line — the higher-level heading is correctly recognised as the terminator.
6. **Given** a heading path that does NOT resolve to any heading in the file (typo, mis-cased segment, non-existent nesting), **When** the agent calls `read_heading`, **Then** the call fails with a structured error preserving the operation's context (the named vault, locator, and heading path).
7. **Given** a locator (`file` or `path`) that resolves to no file in the named vault, **When** the agent calls `read_heading`, **Then** the call fails with a structured error.
8. **Given** a vault display name that does not match any registered Obsidian vault, **When** the agent calls `read_heading`, **Then** the call fails with a structured error (the same reclassified-CLI-response shape that the existing typed tools already use for unknown vaults).

---

### User Story 2 — Active-mode heading-body read against the focused note (Priority: P1)

An agent operating in a session where Obsidian's editor has a specific note focused needs to read a heading's body from whichever note is currently focused, without naming a vault or locator. The agent calls `read_heading` with `target_mode: "active"` and just the heading path. The tool reads the focused note and returns the named heading's body, identical in shape to the specific-mode response.

**Why this priority**: Active mode is the standard target-mode discriminator across every typed tool in the project (`read_note`, `write_note`, `delete_note`, `read_property`). Omitting it would create an inconsistency in the typed surface and force agents to fall back to a different tool when the user is mid-editor. Pairs equally with US1 — together they cover the full target-mode discriminator contract.

**Independent Test**: Run Obsidian with a known note focused that contains a multi-level heading hierarchy. Call `read_heading({ target_mode: "active", heading: "<known H1>::<known H2>" })`. Assert the response carries the H2's body from the focused file. Independently testable from US1 because no specific-mode locator is exercised.

**Acceptance Scenarios**:

1. **Given** Obsidian has note `notes/x.md` focused in vault `Demo` with the heading hierarchy `# Top` → `## Section A` (prose `Hello.`), **When** the agent calls `read_heading({ target_mode: "active", heading: "Top::Section A" })`, **Then** the response is `{ content: "Hello.\n" }`.
2. **Given** active mode and a focused note where the requested heading path does NOT resolve, **When** the agent calls `read_heading`, **Then** the call fails with a structured error (parity with US1 scenario 6).
3. **Given** active mode and no note is focused (or no Obsidian instance is reachable), **When** the agent calls `read_heading`, **Then** the call fails with a structured error directing the caller to focus a note or switch to specific mode.

---

### User Story 3 — Validation rejects malformed inputs at the boundary (Priority: P1)

An agent (or a misbehaving caller) submits an input shape that violates the tool's contract. The tool MUST reject the call at the validation boundary, before any underlying CLI invocation occurs, and MUST surface a structured validation error that names the offending field. Heading-path validation is **structural-only**: the validator checks the path's shape (≥2 non-empty `::`-separated segments) but does NOT pre-resolve heading existence — semantic resolution happens at execution time and surfaces as a runtime structured error per US1 scenario 6.

**Why this priority**: Validation is the safety contract for every typed tool in this project, and it is a constitutional requirement (zod-as-source-of-truth). Without it, malformed callers reach the CLI and produce undefined or harmful behaviour. Independently testable because every validation case can be exercised with a mock/spy on the CLI dispatcher to assert the dispatcher was never called.

**Independent Test**: For each invalid input shape, call `read_heading` with a CLI dispatcher spy. Assert the call rejects with a structured validation error AND that the dispatcher was never invoked. No real CLI or vault required.

**Acceptance Scenarios**:

1. **Given** a heading path with only one segment (no `::` separator at all, e.g. `"Best Practices"`), **When** the agent calls `read_heading`, **Then** the call fails validation; no CLI call is made.
2. **Given** a heading path with a leading empty segment (e.g. `"::Foo"`) or a trailing empty segment (e.g. `"Bar::"`) or an interior empty segment (e.g. `"A::::B"`), **When** the agent calls `read_heading`, **Then** the call fails validation; no CLI call is made.
3. **Given** `target_mode: "specific"` with NO `file` and NO `path`, **When** the agent calls `read_heading`, **Then** the call fails validation; no CLI call is made.
4. **Given** `target_mode: "specific"` with BOTH `file` and `path` set, **When** the agent calls `read_heading`, **Then** the call fails validation; no CLI call is made.
5. **Given** `target_mode: "specific"` with no `vault`, **When** the agent calls `read_heading`, **Then** the call fails validation; no CLI call is made.
6. **Given** `heading` is the empty string `""` or omitted entirely, **When** the agent calls `read_heading`, **Then** the call fails validation; no CLI call is made.
7. **Given** `target_mode: "active"` with `vault` set, **When** the agent calls `read_heading`, **Then** the call fails validation; no CLI call is made.
8. **Given** `target_mode: "active"` with `file` set, **When** the agent calls `read_heading`, **Then** the call fails validation; no CLI call is made.
9. **Given** `target_mode: "active"` with `path` set, **When** the agent calls `read_heading`, **Then** the call fails validation; no CLI call is made.
10. **Given** any input with an unknown top-level key (for example `{ target_mode: "active", heading: "A::B", foo: "bar" }`), **When** the call is forwarded by an MCP client that does NOT strip unknown keys, **Then** the server-side validation fails; no CLI call is made.

---

### User Story 4 — Documentation surface for the typed tool (Priority: P2)

An operator or agent inspects the project's progressive-disclosure help facility to understand how `read_heading` works. The current placeholder stub for `read_heading` (or the absence of any entry) MUST be replaced with full documentation that covers the per-field input contract, the output shape, the failure-mode roster, and at least four worked examples — covering at least: a 2-segment specific-mode read, a 3+-segment nested specific-mode read, an active-mode read, and a documented-failure example (heading-not-found OR validation rejection).

**Why this priority**: The help facility is the primary discovery surface for tool consumers (the typed-tool surface contract mirrored from `read_note`/`write_note`/`delete_note`/`read_property`/`find_by_property`). The tool is callable without docs but un-discoverable without them. Should-pass for ship; not required for the read code path itself to function. Independently testable by loading the help facility output and asserting structural completeness.

**Independent Test**: Invoke the help facility for `read_heading`. Assert the doc carries: input contract per field, output shape, failure-mode roster, and at least four worked examples covering distinct usage modes. The registry-consistency test from `005-help-tool` already auto-asserts the file's existence once the tool is registered; this story expands that assertion to content completeness.

**Acceptance Scenarios**:

1. **Given** the help facility, **When** an operator queries `read_heading`, **Then** the response carries the full per-field input contract, the output shape, the failure-mode roster (including the structural-only heading-validation contract, the heading-not-found case, the file-not-found case, the unknown-vault case, and the active-mode-no-focus case), and at least four worked examples covering at least four distinct usage modes from {2-segment specific-mode read, 3+-segment nested specific-mode read, active-mode read, heading-not-found error, validation-rejection error}.
2. **Given** the help facility, **When** an operator queries `read_heading`, **Then** the doc explicitly names the documented fallback for out-of-reach heading paths (single-segment H1-only reads; heading text containing `::`): use `read_note` plus a client-side Markdown parse.

---

### User Story 5 — Body content preserves byte-level structure (Priority: P3)

An agent needs the body of a heading whose section contains formatting-rich content: fenced code blocks, tables, nested list structures, indented blockquotes. The tool MUST return the body with its original byte-level structure preserved — no re-formatting, no canonicalisation, no whitespace normalisation, no line-ending conversion.

**Why this priority**: This is an explicit P3 in the user input. The most common heading bodies are short prose; structurally rich bodies are uncommon but must not crash or silently mangle on the way out. Independently testable because it requires only one fixture file with one structurally-rich heading body.

**Independent Test**: Author a fixture note with a heading whose body contains a fenced code block, a Markdown table, and a nested list. Call `read_heading` for that heading. Assert the response is byte-identical to the corresponding bytes of the on-disk file (modulo the heading marker line at the top and the terminator line at the bottom).

**Acceptance Scenarios**:

1. **Given** a heading body containing a fenced code block, a Markdown table, and a nested list structure, **When** the agent calls `read_heading` for that heading, **Then** the response carries the body bytes verbatim — fence markers intact, table pipes intact, list indentation intact, no whitespace normalisation, no re-formatting.
2. **Given** a heading body whose fenced code block contains text that visually looks like a Markdown heading marker (for example a `## Example heading` line inside a `markdown` fence), **When** the agent calls `read_heading` for the enclosing heading, **Then** the fenced text is treated as opaque content (not as a body terminator), and the full fenced block is included in the returned body.

---

### Edge Cases

The implementation MUST handle, document, or explicitly defer each of the following observable shapes.

**CONCURRENCY**

- The note may be edited (heading renamed, deleted, re-ordered) between the validation step and the read. The read returns whatever is on disk at execution time. The contract is a point-in-time read with no transactional guarantee. Documented as a known limitation.

**CONTENT — duplicate heading paths**

- A note may contain two or more headings whose paths through the heading hierarchy are textually identical (for example two distinct `## H2` blocks both nested under the same `# H1`). The first match in document order MUST be returned by convention. The test suite locks the first-match convention so future re-implementations cannot silently change the choice.

**CONTENT — fenced code blocks as opaque regions**

- A heading body may contain a fenced code block (triple-backtick or triple-tilde) whose content visually resembles a Markdown heading marker (e.g. a Markdown-about-Markdown note containing `## Example` lines inside a fence). The boundary detector MUST treat fenced code blocks as opaque — heading-like text inside fences is content, not a boundary. Both ` ``` ` and `~~~` fence styles MUST be honoured. Fence markers MUST be matched in pairs (an opening fence stays opaque until its matching closing fence is encountered).

**CONTENT — body terminator at varying depths**

- A heading body MAY be terminated by (a) a sibling-level heading (same depth as the named heading), (b) a higher-level heading (shallower depth than the named heading), (c) a child-level heading (deeper depth than the named heading — terminating because child subtrees are excluded from the named heading's body per US1 scenario 2), or (d) the end of the file. The boundary detector MUST handle all four termination conditions correctly.

**CONTENT — Setext heading underlines are content, not boundaries**

- The boundary detector MUST NOT treat Setext underline-style headings (`====` for H1 or `----` for H2 lines immediately under a text line) as heading markers. Setext-underline lines pass through as ordinary content; they do not terminate a body, and the underlined text above them is not addressable as a heading-path segment. This eliminates the disambiguation surface between Setext H2 underlines, horizontal rules, and YAML frontmatter closing fences (all of which use `---`). Per the 2026-05-09 clarifications session.

**CONTENT — empty body**

- A heading whose body contains no prose at all (the heading is followed directly by another heading or by EOF) MUST return `{ content: "" }` — the empty string, not an error. This is structurally valid; an empty body is distinct from a non-existent heading path.

**CONTENT — line endings**

- CRLF and LF line endings in the on-disk file MUST round-trip verbatim through the read. A note saved with Windows-style CRLF endings MUST return body bytes containing CRLF; a note saved with Unix-style LF endings MUST return body bytes containing LF. Bridge-side normalisation is forbidden — the body is whatever bytes lived between the heading marker and the terminator on disk.

**CONTENT — very long bodies and the underlying execution layer's output cap**

- The underlying execution layer enforces a 10 MiB output cap on a single CLI invocation (inherited from feature 003). A heading whose body is unusually large may exceed this cap, producing a structured `CLI_NON_ZERO_EXIT` (output-cap kill) rather than a silent truncation. The practical ceiling MUST be documented in the published help facility so callers can choose to fall back to a full-file `read_note` when the target body is unusually large.

**UNDERLYING CLI — unknown vault**

- An unknown vault display name may produce a CLI response that the existing bridge classifier does not natively treat as an error (the same shape covered for `delete_note` / `write_note` / `read_property` / `find_by_property` via the 011-R5 inheritance). The implementation MUST handle this case explicitly: the response MUST be reclassified to a structured `CLI_REPORTED_ERROR`, not silently returned as a successful read.

**CLIENT-CLASS — unknown-key validation**

- The server-side validation behaviour for "unknown top-level keys" (US3 scenario 10) is directly observable only from MCP clients that forward unknown keys to the server. Strict-naive clients strip unknown keys client-side per the published JSON Schema's `additionalProperties: false`, in which case the server never sees the offending key and validation does not trigger. Both pathways MUST be documented; the test case MUST exercise the server-side path explicitly so the validation contract holds for the client class that does forward unknown keys.

**SECURITY — structural data-passing**

- The `heading` field is caller-supplied. Path-segment matching is structural — the implementation MUST split the heading path on `::` and compare each segment as data, never as text concatenated into a shell command, an `eval` payload, or any other text-based execution surface. The structural data-passing contract is the anti-injection guarantee; no per-field sanitisation of `heading` is required for that threat model. The structural-only validator (≥2 non-empty segments split on `::`) is a separate concern from the security contract — it governs path shape, not injection safety.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a typed MCP tool named `read_heading` that returns the body content of a single named heading from a vault note.
- **FR-002**: The tool MUST accept a `target_mode` discriminator with the values `"specific"` and `"active"`, mirroring the discriminator contract used by every other typed tool in the project (with the exception of `find_by_property`, which is vault-wide and has no discriminator).
- **FR-003**: In `target_mode: "specific"`, the tool MUST require a `vault` display name AND exactly one locator field — either `file` (wikilink form, no extension, no folder) or `path` (vault-relative path including the `.md` extension), never both, never neither.
- **FR-004**: In `target_mode: "active"`, the tool MUST forbid the keys `vault`, `file`, and `path`. Presence of any of those keys in active mode MUST produce a validation failure.
- **FR-005**: The tool MUST require a `heading` field (a non-empty string) in both modes. The empty string and the absence of `heading` MUST both produce validation failures.
- **FR-006**: The `heading` field MUST be validated structurally: split on the literal separator `::`, the resulting segment list MUST contain at least two segments, AND every segment (after the split) MUST be non-empty. Heading paths with only one segment, leading empty segments, trailing empty segments, or interior empty segments (consecutive `::` markers) MUST fail validation.
- **FR-007**: The structural heading-path validator MUST NOT attempt to verify heading existence — semantic resolution is performed at execution time against the on-disk file. A structurally-valid heading path that does not resolve to any heading in the file is a runtime failure (FR-013), not a validation failure.
- **FR-008**: The tool's input schema MUST forbid unknown top-level keys (`additionalProperties: false`).
- **FR-009**: The tool MUST return an output object with one field: `content` (the body text of the named heading, as a string).
- **FR-010**: The body of the named heading is defined as the contiguous bytes from the line **after** the matched heading marker up to (but not including) the **first subsequent ATX heading marker of any depth** — be it a child-level heading (deeper depth — terminator because child subtrees are excluded), a sibling-level heading (same depth — terminator because the named heading's section ends), or a higher-level heading (shallower depth — terminator because the parent section ends). End-of-file is also a valid terminator. The returned `content` is byte-identical to the corresponding bytes of the on-disk file across this span. ATX heading markers are lines beginning with one to six `#` characters followed by a space and at least one non-space character; Setext underline-style headings (`====` or `----` lines) are content, not heading markers (per the 2026-05-09 clarifications session).
- **FR-011**: A heading whose body is empty (the heading is followed directly by the next heading marker or by EOF) MUST return `{ content: "" }` — the empty string, not an error.
- **FR-012**: The body-boundary detector MUST treat fenced code blocks (triple-backtick `` ``` `` or triple-tilde `~~~`) as opaque regions. Heading-like text inside an open fence is content, not a boundary. Fence markers MUST be matched in pairs — an opening fence stays opaque until its matching closing fence (same fence character) is encountered.
- **FR-013**: The tool MUST surface a structured error when the heading path does not resolve to any heading in the file (typo, mis-cased segment, non-existent nesting). The error MUST preserve the operation's context (vault, locator, heading path).
- **FR-014**: The tool MUST surface a structured error when the locator (`file` or `path`) resolves to no file in the named vault.
- **FR-015**: The tool MUST surface a structured error when the named vault does not match any registered Obsidian vault. If the underlying CLI returns a non-error-shaped response for unknown vaults (the 011-R5 inherited shape), the implementation MUST reclassify that response to `CLI_REPORTED_ERROR` before returning to the caller.
- **FR-016**: The tool MUST surface a structured error in `target_mode: "active"` when no note is focused (or no Obsidian instance is reachable). The error message MUST direct the caller to focus a note or switch to specific mode.
- **FR-017**: When two or more headings in the same file share the same heading path (textually identical sequence of segments), the **first match in document order** MUST be returned. The first-match convention MUST be locked by a regression test so future re-implementations cannot silently change the choice.
- **FR-018**: All validation failures MUST occur strictly before any underlying CLI invocation. Tests MUST be able to assert a CLI dispatcher spy was never called for invalid inputs.
- **FR-019**: CRLF and LF line endings in the on-disk file MUST round-trip verbatim through the read. The returned `content` MUST contain whichever line-ending bytes lived between the heading marker and the terminator on disk; bridge-side normalisation is forbidden. (This is a specific case of FR-020's broader byte-level structure preservation contract; both are stated separately for emphasis given the Windows-host project context where CRLF/LF round-trip is the most common observable surface for byte-fidelity regressions.)
- **FR-020**: Heading body content MUST be returned with byte-level structure preserved. The implementation MUST NOT re-format, canonicalise, normalise whitespace, alter list indentation, alter table column alignment, alter fenced-block fence markers, or otherwise transform the body bytes. The contract is byte-faithful pass-through.
- **FR-021**: The `heading` field MUST be passed to the underlying CLI as **data**, not interpolated into a shell-evaluated string, an `eval` payload, or any other text-based execution surface. The structural data-passing contract is the anti-injection guarantee.
- **FR-022**: Errors MUST flow through the project's existing structured error codes — no new error codes MUST be introduced by this feature. Validation failures MUST surface as `VALIDATION_ERROR`; CLI failures MUST surface through the existing four CLI-failure codes; the heading-not-found case MUST surface through one of those existing codes (selected at planning time based on the underlying CLI's observable response shape).
- **FR-023**: The tool MUST be registered through the project's existing typed-tool registration factory. The progressive-disclosure help facility's documentation file for `read_heading` MUST be authored with the per-field input contract, the output shape, the failure-mode roster (including the structural-only heading-validation contract, the heading-not-found case, the file-not-found case, the unknown-vault case, the active-mode-no-focus case, and the documented practical ceiling for very large bodies), and at least four worked examples covering at least four distinct usage modes from {2-segment specific-mode read, 3+-segment nested specific-mode read, active-mode read, heading-not-found error, validation-rejection error}.
- **FR-024**: Each acceptance criterion across US1–US5 MUST be locked by at least one regression test that survives subsequent re-runs unchanged. The test count MUST be sufficient to cover schema validation, handler behaviour, and registration consistency.
- **FR-025**: The feature MUST run a live-CLI characterisation pass before ship that documents observable CLI behaviour for: 2-segment happy path; 3+-segment nested happy path; sibling-level body terminator; higher-level body terminator; child-level body terminator (child-subtree exclusion); end-of-file body terminator; empty-body case; fenced-code-block opacity (both `` ``` `` and `~~~`); fenced-block-with-heading-marker-inside case; Setext-underline-as-content (a fixture containing a Setext H2 underline within a heading body and confirming it does NOT terminate the body); duplicate heading path (first-match convention); closing-ATX-form heading match (`## Heading ##` is matched by segment `Heading`); surrounding-whitespace heading match (a heading line with trailing spaces is matched by the trimmed-text segment); inline-markdown-survives heading match (a heading containing `**bold**` or `[link](url)` is matched only when the caller's segment contains the same inline-markdown bytes verbatim); Obsidian-anchor-survives heading match (a heading containing `^anchor-id` is matched only when the caller's segment contains the anchor marker verbatim); CRLF round-trip; LF round-trip; very large body cap-boundary behaviour; non-existent heading path; non-existent file; unknown vault response shape; active-mode with focused note; active-mode with no focus. Findings MUST be persisted in the feature's research artefact.
- **FR-026**: The feature MUST NOT change the public surface of any existing typed tool (`read_note`, `write_note`, `delete_note`, `read_property`, `find_by_property`, `obsidian_exec`, the help tool). The only permitted edit to existing source is the addition of `read_heading` to the registration list.
- **FR-027**: All new source files introduced by this feature MUST carry the project's "Original — no upstream." attribution header per the project Constitution's originality principle.
- **FR-028**: Heading-path segment matching MUST follow the **minimal-normalisation, case-sensitive byte compare** rule (per the 2026-05-09 clarifications session). The implementation MUST extract heading text from each ATX heading line by: (a) stripping the leading `#`-run plus the required single following space; (b) stripping an optional trailing-space-plus-`#`-run (the closing-ATX form, e.g. `## Heading ##`); (c) stripping leading and trailing whitespace from the remainder. The remainder is the heading text. The caller's heading-path segment MUST be compared to that text with case-sensitive byte equality. Inline Markdown tokens (`**bold**`, `*italic*`, `_emphasis_`, ` `code` `, `[anchor](url)`) and Obsidian-style anchor markers (`^anchor-id`) MUST NOT be stripped — they are part of the heading text, and a caller targeting a heading that contains them MUST supply them verbatim in the path segment.

### Key Entities *(include if feature involves data)*

- **Heading**: An ATX-style line in a Markdown file beginning with one to six `#` characters followed by a space and the heading's text. Has a depth (1–6, where 1 is `#` and 6 is `######`) and a text payload (the rest of the line). The same heading text MAY appear multiple times in a single file at the same or different depths. Setext underline-style headings (`====` / `----` lines beneath text) are NOT addressable by this tool — they are treated as body content per the 2026-05-09 clarifications session.
- **Heading path**: A caller-supplied string identifying a target heading by its full traversal from the document root through the heading hierarchy. Composed of two or more non-empty segments separated by the literal `::` separator. The path is matched structurally — segments are split on `::` and each segment is compared to the file's heading text under the minimal-normalisation, case-sensitive byte-compare rule (FR-028) — not by depth marker (`#` count) or by rendered text. Paths with single segments, empty segments, or text-segments containing `::` literally are out of reach for this tool (validation rejection or out-of-scope per the documented fallback).
- **Heading body**: The contiguous bytes from the line after a matched heading marker up to (exclusive) the first subsequent heading marker of any depth, or up to end-of-file — whichever occurs first. Fenced code blocks within the body are treated as opaque regions: heading-like text inside open fences is content, not a body terminator. Empty bodies (heading followed directly by the next heading or EOF) are valid — they return `content: ""`.
- **Locator (specific mode)**: An ordered triple of (vault display name, choice of `file`-vs-`path`, locator value). The `file` form names a note by its wikilink (no extension, no folder); the `path` form names a note by its vault-relative path including the `.md` extension. Exactly one of `file` or `path` MUST be provided.
- **Focused-note reference (active mode)**: An implicit reference to whichever note Obsidian's editor currently has focused. Resolved by the underlying CLI at execution time; not addressable by the caller through any input field.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A 2-segment heading-path read against a known fixture returns the named heading's body verbatim with child-heading subtrees correctly excluded in 100% of test runs.
- **SC-002**: A 3+-segment nested heading-path read against a known fixture returns the deeply-nested heading's body verbatim in 100% of test runs.
- **SC-003**: A heading body bounded by a sibling-level heading AND a heading body bounded by a higher-level heading BOTH terminate at the correct boundary in 100% of test runs.
- **SC-004**: A heading body bounded by a child-level heading (child-subtree exclusion) terminates at the child heading in 100% of test runs.
- **SC-005**: A heading whose body contains a fenced code block with heading-like text inside returns the fenced text as opaque content in 100% of test runs (the fenced text is NOT mistaken for a body terminator).
- **SC-006**: A heading with no prose at all returns `{ content: "" }` (the empty string) with no error in 100% of test runs.
- **SC-007**: A note containing duplicate heading paths returns the first-document-order match deterministically across 100% of test runs.
- **SC-008**: CRLF-saved and LF-saved fixture files containing the same logical heading bodies return body bytes that contain the original line-ending bytes — CRLF for the Windows fixture, LF for the Unix fixture — in 100% of test runs.
- **SC-009**: A heading body containing a fenced code block, a Markdown table, and a nested list structure returns the body bytes verbatim — fence markers intact, table pipes intact, list indentation intact — in 100% of test runs.
- **SC-010**: Every invalid input shape rejected at the validation boundary (US3 scenarios 1–10) produces a structured error AND zero underlying CLI invocations across 100% of test runs.
- **SC-011**: A structurally-valid heading path that does not resolve to any heading in the file produces a structured error preserving the operation's context (vault, locator, heading path) in 100% of test runs.
- **SC-012**: A locator that resolves to no file in the named vault produces a structured error in 100% of test runs.
- **SC-013**: An unknown vault display name produces a structured `CLI_REPORTED_ERROR` (reclassified from the underlying CLI's non-error-shaped response per the 011-R5 inheritance) in 100% of test runs.
- **SC-014**: Active mode with a focused note returns the named heading's body from the focused file in 100% of test runs; active mode with no focus produces a structured error directing the caller to focus a note or switch to specific mode in 100% of test runs.
- **SC-015**: An agent reading a single named heading's body can do so in a single tool call returning the body bytes only — typically 100–500 characters for prose sections — replacing what previously required a full-file read (5–50k characters for long documents) plus client-side Markdown parsing. Token saving relative to a full-file read is observable from any tracing layer that records request/response payload sizes.
- **SC-016**: Every byte of the public output of the existing typed tools (`read_note`, `write_note`, `delete_note`, `read_property`, `find_by_property`, `obsidian_exec`, the help tool) is unchanged by this feature, except for the help facility growing one new `read_heading` entry.
- **SC-017**: The published documentation for `read_heading` covers the full per-field input contract, the output shape, the failure-mode roster, the practical ceiling for very large bodies, the documented fallback for out-of-reach heading paths (single-segment H1-only reads; heading text containing `::`), and at least four worked examples covering at least four distinct usage modes.
- **SC-018**: Every acceptance criterion across US1–US5 is locked by at least one regression test, totalling no fewer than 25 tests across schema, handler, and registration suites.
- **SC-019**: Zero new error codes are introduced by this feature; every failure flows through existing structured error codes.
- **SC-020**: The live-CLI characterisation pass (FR-025) documents observable behaviour for all 23 cases enumerated in FR-025 (the original 18 plan-stage cases, the Setext-underline-as-content case added by Q2 of the 2026-05-09 clarifications session, and the four segment-matching cases — closing-ATX-form, surrounding-whitespace, inline-markdown-survives, Obsidian-anchor-survives — added by Q3), persisted in the feature's research artefact and surfaceable from the published documentation. Of the 23 cases, 20 are deferred to T0 of `/speckit-implement` (require fixtures in TestVault); the remaining 3 (2-segment happy path, 3+-segment nested happy path, unknown-vault response shape) are plan-stage-verified per [research.md F1, F6, F7](research.md#live-cli-findings).
- **SC-021**: The `heading` input cannot reach a shell-evaluated context. The structural data-passing contract is verifiable by inspection of the dispatcher call shape (no shell, no `eval`-payload string interpolation of the heading text).
- **SC-022**: Heading-path segment matching follows the minimal-normalisation, case-sensitive byte compare rule (FR-028) in 100% of test runs: a heading written as `## Heading ##` matches segment `Heading`; a heading written as `## Heading   ` (trailing whitespace) matches segment `Heading`; a heading written as `## My **Bold** Heading` matches segment `My **Bold** Heading` AND does NOT match segment `My Bold Heading`; a heading written as `## Section ^my-id` matches segment `Section ^my-id` AND does NOT match segment `Section`.

## Assumptions

- The user input is exhaustive for ship-gating decisions outside the boundary-rule ambiguity, which was resolved in the 2026-05-09 clarifications session (see `## Clarifications`). 15 acceptance criteria across [P1] / [P2] / [P3], six adversarial categories (CONCURRENCY, CONTENT, UNDERLYING CLI, CLIENT-CLASS, SECURITY), and an explicit out-of-scope list cover the remaining spec surface.
- The first-subsequent-heading-marker-of-any-depth rule (FR-010) was confirmed in the 2026-05-09 clarifications session. The body terminates at whichever heading marker appears first — child, sibling, or shallower — or at EOF. Both phrasings in the original user input ("up to the next sibling-or-higher heading" AND "no child subtrees") collapse onto this single rule.
- The underlying Obsidian CLI does not necessarily expose a native heading-body subcommand. If no native subcommand exists, the implementation may compose against the bridge's `eval` primitive (the same approach feature 014 uses for `find_by_property`), passing the caller's `heading` input as **data** through a base64-encoded JSON payload — never as text concatenated into the eval source. The exact subcommand name and composition strategy are an implementation concern resolved during the planning phase against `obsidian help` and live probes against the authorised test vault.
- The bridge classifier's existing inheritance for unknown-vault response inspection (introduced in feature 011 and inherited unchanged by features 012, 013, and 014) is applicable to this feature's CLI subcommand. If the underlying response shape differs, the feature's planning phase will surface that as a delta and the unknown-vault classification will be addressed there.
- The post-010 flat-extension idiom for `target_mode` schemas (single `z.object().strict().superRefine(...)` plus `applyTargetModeRefinement`) and the post-011 module-layout convention (`index.ts` factory + co-located tests) are the conventions this feature consumes. No precedent feature's spec or plan is amended.
- The release impact is purely additive: no existing tool's public surface changes; no error codes are added; no ADRs are amended. The version bump policy (patch — `0.2.7 → 0.2.8`) is a planning-phase decision but the additive shape is a constraint set by this spec.
- Out of scope for this feature, recorded here so the planning phase does not silently absorb them: heading targets containing `::` literally (no escape syntax — documented fallback is `read_note` plus client-side parse); top-level H1-only reads (single-segment paths — documented fallback is the full-file read tool); Setext underline-style headings (`====` for H1, `----` for H2 — not addressable as heading-path segments and not recognised as body terminators per the 2026-05-09 clarifications session; documented fallback is `read_note` plus client-side parse); including child-heading bodies in the response (this tool returns the named heading's body only); re-formatting or canonicalising the returned body content (byte-faithful pass-through is the contract); reading multiple headings in one call (callers iterate today); writing or editing heading bodies (separate future feature `write_heading` if pursued).
