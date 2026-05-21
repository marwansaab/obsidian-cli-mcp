# Feature Specification: Patch Heading

**Feature Branch**: `040-patch-heading`
**Created**: 2026-05-21
**Status**: Draft
**Input**: User description: "Add Patch Heading — a typed capability that lets a vault author surgically insert, prepend, or replace content under a specific heading inside a note, where the heading is identified by its full path through the note's heading hierarchy, without rewriting any other part of the note. Three placement modes (append, prepend, replace). Heading-path locator only — no block reference, no line offset. First-match-wins on duplicate sibling heading text. Targets either an explicit note (vault + vault-relative path) or the note currently focused in the user's editor. Fails loud on unresolvable headings, malformed heading paths, heading-text race conditions, and missing focused notes — never silently patches the wrong place and never leaves the file half-written. Frontmatter is out of scope (handled by the frontmatter-write capability). Backup-on-replace is out of scope — replace is destructive by design; callers needing a backup take one before submitting. Top-level-only heading paths (a single segment with no ancestor) are out of scope; headings whose literal text contains the path-separator character are out of scope."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Surgical placement under a named heading (Priority: P1)

A vault author issues a request naming a note (either explicitly via vault + vault-relative path, or implicitly via the focused-note locator), a heading inside that note identified by its full hierarchical path (a sequence of segments running from a top-level heading down to the target), one of three placement modes (`append`, `prepend`, `replace`), and the content to write. The operation rewrites only the targeted heading's reach — all other content in the note is byte-stable — and confirms the write. With one operation an author can extend a checklist, add a row to a tracking table, or refresh an out-of-date paragraph without re-uploading the surrounding note.

**Why this priority**: The whole feature exists to give authors a surgical write surface over the body of a single heading. Without P1 there is no MVP. The three placement modes are the contract — each maps to a distinct, common authoring intent (extend, lead-in, refresh) that today forces a full-note rewrite. P1 stands alone as a viable shipped slice: an author who can append, prepend, or replace under a named heading already has every authoring shape this feature aims to deliver.

**Independent Test**: Stand up a vault with a note containing a nested heading hierarchy whose body is known by inspection (text under each heading is identifiable, and each heading has at least one sibling and at least one child). Issue `append` against a leaf heading with a known body and verify the new content lands at the end of that heading's reach (immediately before the next heading of equal-or-higher rank, or end-of-file if none follows) and that no other section of the note changed by even one byte. Repeat for `prepend` against a heading whose marker is immediately followed by a child heading marker and verify the new content lands between the two markers. Repeat for `replace` against a heading whose body contains a child-heading subtree and verify the direct body content is swapped while the child subtree is preserved.

**Acceptance Scenarios**:

1. **Given** a note containing the target heading with content beneath it, **When** the author submits an `append` request with new text, **Then** the new text appears at the end of that heading's reach — immediately before the next heading of equal-or-higher rank (or end-of-file if none follows) — and no other section is altered.
2. **Given** a heading whose body is empty (no content between the heading marker and the next heading of equal-or-higher rank), **When** the author submits an `append` request, **Then** the new text becomes the heading's body and no surrounding content is altered.
3. **Given** the target heading is the last heading in the note, **When** the author submits an `append` request, **Then** the new text lands at end-of-file and the note's existing trailing-newline convention is preserved (a note that ended with `\n` still ends with `\n`; a note that did not, still does not).
4. **Given** a heading marker immediately followed by content, **When** the author submits a `prepend` request, **Then** the new text appears immediately after the heading marker line and before the existing body, and the existing body remains intact.
5. **Given** a heading marker immediately followed by another heading marker (no body between them), **When** the author submits a `prepend` request, **Then** the new text is inserted between the two markers and no other section is altered.
6. **Given** a heading whose direct body content is followed by a child-heading subtree, **When** the author submits a `replace` request, **Then** the heading marker line is preserved, the direct body content is swapped wholesale for the new text, and the child-heading subtree is preserved unchanged.
7. **Given** a heading whose body contains a fenced code block that itself contains heading-marker characters (e.g. lines beginning with `#` inside a `` ``` `` fence), **When** the author submits a `replace` request, **Then** the content inside the fence is treated as opaque body and is replaced wholesale; the fence is not interpreted as a section boundary.

---

### User Story 2 - Distinguish unresolvable-target failures through typed errors (Priority: P2)

A vault author who supplies a heading path that does not resolve to any heading in the note, a heading path that is structurally malformed, or who races a concurrent rename of the target heading, receives a typed, structured error identifying which of the three failure modes occurred. The file on disk is not modified. The caller can switch on the failure mode directly — no prose parsing.

**Why this priority**: P1 gives the happy path. Without P2, an author whose heading path is one character off (or whose path is structurally invalid, or whose target was renamed mid-flight) has no way to learn which problem they hit other than reading the note and the path side-by-side. Worse, an undetected race could land a patch on the wrong heading silently. P2 is the diagnostic contract that makes failure self-describing — "heading not found", "heading path malformed", and "heading-text race" are three programmatically distinguishable states. With P1+P2 the caller has both the operation and the feedback loop needed to use it reliably.

**Independent Test**: With P1 in place, issue the operation naming a heading path that does not resolve to any heading in the target note and verify the response is a typed error programmatically distinguishable as "heading not found" — and that the file on disk is byte-identical to its pre-call state. Issue the operation with a structurally invalid heading path (empty path, a segment containing the path-separator character, or a path beginning with a separator) and verify the response is a typed error programmatically distinguishable as "heading path malformed" — and that no filesystem access occurred. Simulate a heading-text race by renaming the resolved heading between path-resolution and write (or by an analogous test-fixture injection) and verify the operation fails loud with a "heading-text race" typed error rather than writing to whichever heading now sits at the resolved location.

**Acceptance Scenarios**:

1. **Given** a heading path that does not resolve to any heading in the target note, **When** the author submits the request, **Then** the operation fails with a typed error programmatically identifying the failure as "heading not found" and the file on disk is not modified.
2. **Given** the same literal heading text appears more than once at the same rank under the same parent, **When** the author submits the request, **Then** the first such occurrence in document order is patched and this first-match-wins convention is part of the published contract; the operation does not fail.
3. **Given** a structurally invalid heading path (empty, contains an empty segment, or contains a segment with the path-separator character), **When** the author submits the request, **Then** the request is rejected at the input-validation boundary before any filesystem access or write, and the typed error names the malformed input.
4. **Given** the heading text at the resolved path changes between the time the operation is submitted and the time it would be applied, **When** the patch would otherwise land on a heading other than the one the author named, **Then** the operation fails loud with a typed "heading-text race" error rather than silently writing to the wrong place.

---

### User Story 3 - Operate on the focused note (Priority: P3)

A vault author working with a note focused in their editor patches a heading inside that note without restating its location. The edit lands on the focused note's named heading. When no note is focused, the operation fails with a message directing the author to focus a note or to supply an explicit note locator.

**Why this priority**: P1 already accepts an explicit note locator (vault + vault-relative path), so the feature is shippable without P3. P3 layers a convenience surface on top: an author who is already working in a note does not need to restate its path on every patch. This is parity with the active-mode surface across the rest of the read-and-write toolset (cohort precedent: every typed tool that accepts a note locator also accepts a focused-note variant). P3 stands independently — it can be added after P1+P2 without disturbing them, and P1 callers who always pass an explicit locator are unaffected.

**Independent Test**: With P1+P2 in place, focus a known note in the user's editor (the test fixture writes the focused-note state directly), issue the operation using the focused-note locator (no explicit vault/path supplied), and verify the edit lands on the focused note's named heading. Clear the focused-note state and issue the same request, and verify the operation fails with a typed error directing the author to focus a note or to supply an explicit locator — and that no filesystem access occurred.

**Acceptance Scenarios**:

1. **Given** a note is focused in the author's editor, **When** the author submits a focused-note patch request, **Then** the edit is applied to that focused note's named heading.
2. **Given** no note is focused, **When** the author submits a focused-note patch request, **Then** the operation fails with a typed error directing the author to focus a note or to supply an explicit locator; no filesystem access is performed and no write occurs.

---

### User Story 4 - Survive concurrent and external edits without corruption (Priority: P4)

When two patch requests target the same note at the same time, both edits land cleanly or one fails loud — neither is silently lost and the file is never left half-written. When the note is open in an external editor with unsaved changes, the operation's behaviour is documented and observable to the caller: either the edit succeeds and the editor reloads, or the operation fails loud.

**Why this priority**: P1–P3 give the operation. P4 is the durability contract that lets authors trust it inside concurrent and multi-editor workflows. Without P4 the operation is still usable for a single author working in isolation; with P4 it is safe to call from automation, from multiple concurrent agents, and against notes that may be open elsewhere. The contract here is mostly about observable, predictable behaviour rather than novel atomicity guarantees — the wrapper inherits whatever guarantees the underlying read-modify-write substrate already provides (see Assumptions).

**Independent Test**: With P1 in place, issue two concurrent patch requests to the same note (different headings, or same heading with different content) and verify both succeed with both edits applied OR one succeeds and the other fails with a typed error — never both succeed with one edit silently lost, and never a half-written file. Open the target note in an external editor with unsaved changes, issue a patch request, and verify the behaviour matches the documented contract: either the edit lands and the editor reloads, or the operation fails loud with a typed error.

**Acceptance Scenarios**:

1. **Given** two patch requests for the same note arrive concurrently, **When** both complete, **Then** both edits land cleanly OR one fails loud — no edit is silently lost and the file is never observed in a half-written state.
2. **Given** the note is open in an external editor with unsaved changes, **When** a patch request is applied, **Then** the behaviour matches the documented contract — either the edit succeeds and the editor reloads, or the operation fails loud with a typed error naming the unsaved-changes condition.

---

### Edge Cases

- **Heading body containing fenced code with heading-marker characters**: lines beginning with `#` inside a `` ``` `` fence MUST NOT be treated as section boundaries (covered by Story 1 scenario 7).
- **Heading body containing indented code or HTML comments with heading-marker characters**: same rule as fenced code — opaque body, not section boundaries.
- **Note with no trailing newline appended to its last heading**: append to that heading preserves the absent trailing newline (covered by Story 1 scenario 3).
- **Heading marker on the very first line of the note (no frontmatter, no preamble)**: resolves normally; prepend lands immediately after the marker line.
- **Heading marker immediately preceded by a fenced code block that does not close**: the malformed source is upstream's concern; the wrapper surfaces whatever error the substrate reports without silently "healing" the file.
- **Heading path whose final segment matches a heading at the named rank but whose ancestor segments do not match the target heading's actual ancestors**: this is a "heading not found" failure (Story 2), not a silent first-match — the full path must resolve segment-by-segment.
- **Heading-text race where the rename leaves a heading with identical text at a different rank or under a different parent**: still a race — the operation fails loud (Story 2 scenario 4), it does not "find another match".
- **Replace request supplying empty content**: the heading's direct body is emptied; the heading marker and child subtrees are preserved. (This is a legitimate use — clearing a section ahead of repopulating it.)
- **Append/prepend request supplying empty content**: succeeds as a no-op write (the file is byte-stable, the write is confirmed). Alternative — reject as malformed — is left for the clarification pass.
- **Note with carriage-return line endings (CRLF)**: the operation preserves the note's existing line-ending convention.

## Requirements *(mandatory)*

### Functional Requirements

#### Locator and addressing

- **FR-001**: System MUST accept a heading-path locator addressing a target heading by an ordered sequence of segments, where the first segment names a top-level heading (rank 1) and each subsequent segment names a descendant heading directly under the previously-named heading. The path identifies a single target heading by walking the note's heading hierarchy in order.
- **FR-002**: System MUST require a heading path of at least two segments (one ancestor + the target). A path consisting of a single segment that would address a top-level heading directly is out of scope and MUST be rejected at the input-validation boundary as a malformed path.
- **FR-003**: System MUST match each heading-path segment against the literal text of the heading marker line (excluding the marker characters and any leading/trailing whitespace on the marker line as defined by the underlying markdown convention) — exact comparison, case-sensitive, no whitespace trimming on the segment itself, no fuzzy matching.
- **FR-004**: System MUST use a single, fixed path-separator character to delimit segments [NEEDS CLARIFICATION: which character — `#` (matches Obsidian wikilink anchor convention `[[note#Top#Sub]]`), `/` (filesystem-style hierarchy), or `>` (visual hierarchy indicator)? The choice constrains FR-005 — any heading whose literal text contains this character is permanently unreachable through this tool].
- **FR-005**: System MUST reject any heading path containing a segment whose literal text contains the path-separator character. Such headings are out of scope per the published contract — callers seeking to address them must use an alternative tool.
- **FR-006**: When the same literal heading text appears more than once at the same rank under the same parent, System MUST resolve the path to the first such occurrence in document order. This first-match-wins rule is part of the published contract.
- **FR-007**: System MUST accept either an explicit note locator (vault + vault-relative path) or a focused-note locator referencing the note currently open in the author's editor. The two locator shapes are exclusive — the caller supplies one or the other, not both.
- **FR-008**: When the focused-note locator is supplied but no note is focused, System MUST fail with a typed error directing the caller to focus a note or to supply an explicit locator. No filesystem access MUST occur and no write MUST be performed.

#### Placement modes and body semantics

- **FR-009**: System MUST support three placement modes — `append`, `prepend`, and `replace`. The mode is part of the request payload and is required.
- **FR-010**: For `append` mode, System MUST insert the supplied content at the end of the target heading's *reach* — the position immediately preceding the next heading of equal-or-higher rank than the target (or end-of-file when no such heading follows). The target heading's existing body, including any child-heading subtree, MUST be preserved.
- **FR-011**: For `prepend` mode, System MUST insert the supplied content immediately after the target heading's marker line and before any existing content (including before any child heading marker that follows directly). The target heading's existing body, including any child-heading subtree, MUST be preserved.
- **FR-012**: For `replace` mode, System MUST swap the target heading's *direct body* — the content between the heading marker and the first child heading (or, if no child heading exists within the heading's reach, the next heading of equal-or-higher rank, or end-of-file) — for the supplied content. The heading marker line MUST be preserved. Any child-heading subtree beneath the target heading MUST be preserved unchanged.
- **FR-013**: System MUST treat content inside a fenced code block as opaque body. Lines beginning with heading-marker characters that appear inside a fence MUST NOT be interpreted as headings or as section boundaries.
- **FR-014**: System MUST preserve the note's existing trailing-newline convention. A note that ended with a trailing newline before the operation MUST still end with one after; a note that did not, MUST still not.
- **FR-015**: System MUST preserve the note's existing line-ending convention (LF, CRLF, or other) when applying the patch.
- **FR-016**: System MUST NOT modify YAML frontmatter under any placement mode. The frontmatter-write capability handles frontmatter; this operation targets heading bodies only.

#### Failure modes and atomicity

- **FR-017**: When the heading path does not resolve to any heading in the target note, System MUST fail with a typed error identifying the failure as a missing heading. The error MUST be programmatically distinguishable from other failure modes. The file on disk MUST NOT be modified.
- **FR-018**: When the heading path is structurally invalid (empty, contains an empty segment, contains a segment with the path-separator character, or violates FR-002 by being a single segment), System MUST reject the request at the input-validation boundary, before any filesystem access or subprocess invocation. The typed error MUST name the malformed input.
- **FR-019**: When the heading text at the resolved path changes between the time path-resolution completes and the time the write would be applied, such that the patch would land on a heading other than the one the caller named, System MUST fail loud with a typed "heading-text race" error rather than silently writing. The file on disk MUST NOT be modified.
- **FR-020**: When two patch requests for the same note arrive concurrently, both MUST land cleanly OR one MUST fail loud with a typed error. The file on disk MUST NOT be left in a half-written or otherwise inconsistent state at any observable instant. The wrapper inherits its concurrency primitive from the underlying read-modify-write substrate (see Assumptions); the contract here is observable behaviour, not a novel locking implementation.
- **FR-021**: When the target note is open in an external editor with unsaved changes, System MUST behave per a documented and observable contract — either the edit succeeds and the editor reloads, or the operation fails loud with a typed error naming the unsaved-changes condition. The choice between these two behaviours is part of the published contract.
- **FR-022**: For every failure mode in FR-017 through FR-021, System MUST NOT modify the file on disk. "Failed loud" means the typed error is the only side effect visible to the caller and the filesystem.

#### Out of scope at the contract boundary

- **FR-023**: System MUST NOT accept locators other than the heading-path locator defined in FR-001. Block references, line offsets, character offsets, and CSS-selector-style locators are out of scope.
- **FR-024**: System MUST NOT take a backup of the note's original content before a `replace` operation. Replace is destructive by design; callers needing a backup take one before submitting.
- **FR-025**: System MUST NOT implement streaming or chunked rewrites. The operation reads and writes the note's full content in one pass; the practical size ceiling is whatever the underlying read-modify-write substrate accepts.

### Key Entities

- **Note**: A markdown file inside the vault, addressed by vault + vault-relative path (or via the focused-note locator). Contains an optional YAML frontmatter block followed by a body composed of headings, body text, fenced code blocks, and other markdown constructs. Has a line-ending convention (LF / CRLF) and a trailing-newline convention (present / absent) that the operation preserves.
- **Heading**: A line beginning with the markdown heading marker (one or more `#` characters), defining a section whose *reach* extends from the marker line to the next heading of equal-or-higher rank (or end-of-file). Has a rank (number of `#` characters) and a text (the marker-line content excluding the marker characters and any convention-defined whitespace).
- **Heading path**: An ordered sequence of heading-text segments, joined by the chosen path-separator character (per FR-004), identifying a unique target heading by walking the note's heading hierarchy from a top-level heading down to the target. Must have at least two segments (per FR-002). Subject to first-match-wins on duplicate sibling text (per FR-006).
- **Heading body — placement-mode-dependent**: The portion of the note rewritten under a given placement mode.
  - For `append`: the position immediately preceding the next equal-or-higher-rank heading (or EOF). Content is inserted; existing reach is preserved.
  - For `prepend`: the position immediately after the heading marker line. Content is inserted; existing reach is preserved.
  - For `replace`: the *direct body* — content between the heading marker and the first child heading (or next equal-or-higher-rank heading, or EOF). Content is swapped; child-heading subtree is preserved.
- **Placement mode**: One of `append`, `prepend`, `replace`. Selects which body semantics from above govern the write.
- **Focused note**: The note the user currently has open in their editor. Resolved at request time; failure to resolve (no note focused) surfaces a typed error per FR-008.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A vault author can extend a section of a note (`append`), introduce a lead paragraph under a section (`prepend`), or refresh a section's body (`replace`) with a single request, without restating any part of the note outside the targeted section.
- **SC-002**: For every patch operation that succeeds, the note's bytes outside the targeted region — every other heading's body, every other section's content, the frontmatter, the line-ending convention, and the trailing-newline convention — are unchanged from the pre-call state.
- **SC-003**: Every failure mode (heading not found, malformed heading path, heading-text race, no focused note, concurrent-edit loss, external-editor conflict) surfaces as a typed, programmatically distinguishable error. No failure mode produces a silently-empty success, a silently-wrong write, or a half-written file.
- **SC-004**: Repeat invocations of the same request against an unchanged vault produce identical outcomes (same write, same response) — the operation is deterministic given a fixed input and a fixed vault state.
- **SC-005**: An author's payload size for a single patch is bounded by the size of the new content plus the locator metadata — *not* by the size of the surrounding note. A 5-byte append to a 50,000-byte note moves 5 bytes of new content plus the locator, not 50,005 bytes.
- **SC-006**: First-match-wins on duplicate sibling heading text is documented in the tool's published contract such that a caller reading the tool documentation can predict the resolution without inspecting the note source.

## Assumptions

- **Reliable-writer substrate**: The underlying read-modify-write substrate (per BI-016 "reliable writer") provides whichever atomicity / concurrency primitive the wrapper inherits for FR-020 (concurrent writes) and FR-021 (external-editor conflict). This specification does not invent new atomicity guarantees; it describes the observable contract the wrapper publishes given that substrate.
- **Locator schema cohort parity**: The "explicit locator vs. focused-note locator" duality (FR-007, FR-008) follows the locator-shape conventions established by the existing typed-tool cohort (cf. ADR-004 / ADR-013 — `target_mode`, `vault`, `path`, and the active-mode TOCTOU concerns documented across the active-mode tool family). The plan phase confirms the exact schema shape; the spec describes the contract.
- **Error code cohort parity**: Typed errors surface under the existing top-level error codes per Constitution Principle IV (e.g. `CLI_REPORTED_ERROR` for "heading not found" parity with `VAULT_NOT_FOUND` / `NOTE_NOT_FOUND` / `VIEW_NOT_FOUND`; `VALIDATION_ERROR` for malformed-path parity with `INVALID_BASE_PATH` / `INVALID_VIEW_NAME`). No new top-level error codes are introduced. Exact `details.code` discriminators (e.g. `HEADING_NOT_FOUND`, `HEADING_PATH_MALFORMED`, `HEADING_RACE`) are settled in the clarification pass.
- **Markdown convention**: The note's heading-marker syntax is the standard ATX heading form (`#`, `##`, `###`, …). Setext headings (underline-style `===` / `---`) are out of scope for this BI; the clarification pass may revise.
- **Path-separator availability in heading text**: Whichever character is chosen for FR-004 will appear in some real-world heading text. The exclusion in FR-005 is acknowledged as a permanent contract trade-off, not a defect to be patched later.
- **Focused-note resolution mechanism**: The mechanism by which the wrapper learns which note is "focused" is whatever the existing focused-note locator surface (per ADR-004 / ADR-013 active-mode tools) already provides. No new focus-detection mechanism is introduced for this BI.
- **Empty-content writes**: An `append` or `prepend` with empty content is provisionally accepted as a no-op-equivalent success (the file is byte-stable, the write is confirmed); the clarification pass may instead reject such requests as malformed. The corresponding edge case is noted in Edge Cases above.
- **Size ceiling**: There is no wrapper-imposed maximum on note size or content size beyond what the input-validation-boundary input-length caps require for the locator strings (cohort parity with BI-033, BI-038, BI-039 — 1000 UTF-16 code units per string at the boundary, but body content and full-note size are governed by the substrate, not by this BI).
