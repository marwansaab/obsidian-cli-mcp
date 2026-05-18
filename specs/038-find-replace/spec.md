# Feature Specification: Find Replace

**Feature Branch**: `038-find-replace`
**Created**: 2026-05-18
**Status**: Draft
**Input**: User description: "Add Find Replace — across a chosen scope of vault notes, the user can replace every occurrence of a chosen text pattern (a literal string or a regular expression) with a chosen replacement. Preview by default, commit only on explicit opt-in. Code blocks and HTML comments skipped by default, opt-in to include. Optional subfolder scope. Refuses to run when matches exceed a configured safe upper bound."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preview the replacement before any note changes (Priority: P1)

An agent issues a find-and-replace request against a vault — supplying the pattern, the replacement, and (optionally) a subfolder scope — without opting in to commit. The response lists every affected note together with the proposed change for that note and the per-note occurrence count, while no note on disk is modified. The agent can read the preview, confirm the scope is what it expected, and then re-issue the same call with the explicit commit opt-in to apply the rewrite. A preview that affects nothing returns a successful empty result rather than an error.

**Why this priority**: Bulk refactors against a vault are irreversible once committed; without a preview the agent cannot confirm the blast radius before mutation. Preview-then-commit is the safety contract that makes the whole feature usable — every other behaviour (skip-defaults, scope, upper-bound guard) builds on top of it. Without P1 there is no MVP; with only P1 the agent already gets a vault-wide refactor capability that is strictly safer than the manual read-rewrite loop it replaces.

**Independent Test**: Stand up a vault containing notes with a known occurrence count of the pattern across multiple notes. Issue the call without the commit opt-in. Verify the response lists every affected note with its proposed change, verify no file on disk is modified (compare mtimes and contents before/after), then re-issue the same call with the commit opt-in and verify the same set of notes is updated on disk with the same change shown in the preview. Separately, issue a pattern that matches nothing and verify the response is a successful empty result, not an error.

**Acceptance Scenarios**:

1. **Given** a vault with notes containing the pattern in prose, **When** the agent issues the operation without the commit opt-in, **Then** the response lists every affected note with the proposed change and the per-note occurrence count, and no note on disk is modified.
2. **Given** the agent has just received a preview, **When** the agent re-issues the same request with the explicit commit opt-in, **Then** the same set of notes is updated on disk and the response reports how many notes changed and how many occurrences were replaced overall.
3. **Given** the pattern matches no occurrence anywhere in scope, **When** the agent issues either a preview or a commit, **Then** the response is a successful empty result with zero affected notes and zero replacements, not an error.
4. **Given** the agent issues a request without specifying the commit opt-in, **When** the operation runs, **Then** it behaves identically to an explicit preview — no note on disk is modified — so that an accidental call cannot mutate the vault.

---

### User Story 2 - Skip code blocks and HTML comments by default; opt back in when needed (Priority: P2)

By default, occurrences inside fenced code blocks and inside HTML comments are left alone — code samples embedded in notes are not corrupted, and audit-trail comments embedded in notes are not silently rewritten. When the refactor genuinely targets those regions (e.g., a deliberate rename of a symbol that appears inside code samples), the agent can opt back in to either region — independently — and have occurrences inside that region replaced alongside the prose occurrences.

**Why this priority**: Without skip-by-default, every find-and-replace risks corrupting embedded code, command lines, examples, and the comment-based audit trail. The default is the safety contract that lets agents reach for this tool without hand-auditing every match. The opt-back-in is the escape hatch that prevents the safe default from blocking the legitimate "rename this symbol everywhere, including in code samples" case. P2 because P1 alone can already operate against a no-code-blocks vault, but most real vaults mix prose with fenced code and HTML comments — without P2, the tool would be unsafe for the common case.

**Independent Test**: With P1 in place, prepare a note where the pattern appears once in prose, once inside a fenced code block, and once inside an HTML comment. Run a preview with the default skip behaviour and verify only the prose occurrence is in the proposed change. Run a preview with the code-block opt-in and verify the prose and code-block occurrences both appear. Run a preview with the HTML-comment opt-in and verify the prose and comment occurrences both appear. Run with both opt-ins and verify all three appear.

**Acceptance Scenarios**:

1. **Given** a note where the pattern appears in prose and again inside a fenced code block, **When** the operation runs with the default skip behaviour, **Then** the prose occurrence is replaced and the code-block occurrence is left unchanged.
2. **Given** a note where the pattern appears inside an HTML comment, **When** the operation runs with the default skip behaviour, **Then** the comment is left unchanged.
3. **Given** the agent opts to include fenced code blocks, **When** a matching occurrence appears inside a fenced code block, **Then** that occurrence is included in the replacement.
4. **Given** the agent opts to include HTML comments, **When** a matching occurrence appears inside an HTML comment, **Then** that occurrence is included in the replacement.
5. **Given** the agent opts in to one region but not the other, **When** the operation runs, **Then** the opted-in region is included and the other region is still skipped — the two opt-ins are independent.

---

### User Story 3 - Scope the operation to a chosen subfolder (Priority: P3)

An agent that already knows the relevant area of the vault can pass a vault-relative subfolder so only notes under that subtree are examined. Folders that do not exist in the vault are rejected with a typed error, so the agent can distinguish "no matches under that folder" from "the folder name was wrong".

**Why this priority**: Subfolder scoping is a blast-radius control, not a correctness lever — P1 already runs against the whole vault correctly. Targeting a known area matters most for large vaults where the same pattern appears in unrelated regions; smaller vaults can ship value with whole-vault scope alone.

**Independent Test**: With P1 in place, prepare a vault where the pattern appears in two sibling subtrees. Issue the operation against one subtree and verify the response only references notes under that subtree (whether previewing or committing). Issue the operation against a folder that does not exist and verify a typed error names the unknown folder rather than returning an empty success.

**Acceptance Scenarios**:

1. **Given** the agent names a vault-relative subfolder as the scope, **When** the operation runs, **Then** only notes under that subtree are examined and the response reflects the narrowed scope.
2. **Given** the named subfolder does not exist in the vault, **When** the operation runs, **Then** the operation returns a typed error identifying the missing subfolder and no note is modified.

---

### User Story 4 - Refuse when the safe upper bound on occurrences is exceeded (Priority: P3)

When the pattern matches more occurrences than the configured safe upper bound across the chosen scope, the operation refuses to run — for both preview and commit — and returns a typed error indicating the bound was exceeded. The guard fires before any note is modified.

**Why this priority**: A too-broad pattern (an unescaped wildcard, a regex shorter than intended) can match thousands of occurrences across the vault. Without an upper-bound guard, a single careless call could silently rewrite the entire vault. The guard is a blast-radius cap that complements the preview default — preview tells you what will change, the guard prevents the over-broad request from running at all. P3 because the preview default (P1) already protects against accidental mutation; the guard adds protection against accidental enumeration of a vault-sized change set.

**Independent Test**: Configure the safe upper bound to a value below the known occurrence count of a pattern in the test vault. Issue a preview and verify a typed error names the upper bound and the offending occurrence count, with no note modified. Issue a commit and verify the same typed error is returned, with no note modified. Lower the occurrence count below the bound (or raise the bound) and verify the operation now succeeds.

**Acceptance Scenarios**:

1. **Given** the pattern matches more occurrences than the configured upper bound across the chosen scope, **When** the operation is invoked as a preview, **Then** it returns a typed error indicating the bound was exceeded and no note is modified.
2. **Given** the same too-broad pattern, **When** the operation is invoked as a commit, **Then** it returns the same typed error and no note is modified.
3. **Given** the occurrence count is exactly at or below the bound, **When** the operation runs, **Then** it succeeds normally.

---

### Edge Cases

- The pattern appears multiple times on the same line in the same note: each occurrence is counted and replaced independently; the per-note occurrence count in the preview reflects all of them.
- A note contains the pattern only inside a fenced code block (or only inside an HTML comment) and the corresponding region opt-in is not set: the note is not listed as affected; preview shows zero proposed change for it.
- A fenced code block is left open (no closing fence) at end-of-file: text from the unclosed fence to EOF is treated as code-block content for skip-by-default purposes; this is the safer interpretation when the markdown is malformed.
- The pattern matches text in the frontmatter block at the top of a note: the frontmatter content is treated as prose for matching — frontmatter is NOT separately skipped (out-of-scope clause in the user input). Dedicated frontmatter-key migration is a separate feature.
- The replacement is the empty string (deletion): occurrences are deleted in place. Preview shows the proposed change as a removal; commit removes the text from the note.
- The replacement contains text that itself matches the pattern: the operation makes one pass — replaced text is not re-scanned, so no infinite-loop risk.
- The pattern matches zero-width (e.g., `a*`, `^`, `$`, `\b`, lookarounds in regex mode): zero-width matches are skipped, parity with the sibling read-only `pattern_search` tool (BI-037 FR-016).
- The same note matches in both prose and an opted-out region (e.g., HTML comments off, but the pattern also appears in HTML comments): only the prose occurrences are counted, previewed, and replaced; the opted-out region occurrences do not appear in the per-note occurrence count.
- The chosen subfolder is valid but contains no notes that match: the response is a successful empty result with the narrowed-scope signal — same shape as a whole-vault call that matched nothing.
- A note is unreadable (e.g., transient file-system error) during the scan: the operation surfaces a typed error rather than silently skipping the note; partial commits are not initiated unless every targeted note can be read.
- The safe upper bound is exceeded during a commit retry after a successful preview: the bound is re-checked at commit time. If the vault changed between preview and commit and the new occurrence count exceeds the bound, the commit refuses with the bound-exceeded error, even though the preview succeeded.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept a find-pattern argument and an explicit pattern-mode argument with values `literal` or `regex`. Default mode MUST be `literal`. Literal mode MUST treat the pattern as exact text (no metacharacter interpretation). Regex mode MUST treat the pattern as an ECMAScript regular expression, parity with the sibling `pattern_search` tool (BI-037 FR-001).
- **FR-002**: System MUST accept a replacement-text argument. In `literal` mode the replacement MUST be inserted verbatim. In `regex` mode the replacement MUST support ECMAScript replacement-string semantics — `$1`–`$9` for capture groups, `$&` for the whole match, `$$` for a literal dollar sign — parity with the platform's standard string-replace behaviour.
- **FR-003**: System MUST accept an explicit commit-opt-in argument. When the commit opt-in is absent or false, the operation MUST run as a preview and MUST NOT modify any note on disk. When the commit opt-in is true, the operation MUST apply the replacement to every affected note on disk.
- **FR-004**: Preview responses MUST list every affected note with the proposed change for that note and the per-note occurrence count. The per-note proposed change MUST be sufficient for the caller to verify what will be written without re-reading the note from disk.
- **FR-005**: Commit responses MUST report the count of notes changed and the count of occurrences replaced overall. A commit that matched zero occurrences MUST return zero counts as a successful result, not as an error.
- **FR-006**: System MUST skip occurrences inside fenced markdown code blocks by default. The caller MUST be able to opt back in to including fenced-code-block occurrences via an explicit include-code-blocks argument.
- **FR-007**: System MUST skip occurrences inside HTML comments (`<!-- … -->`) by default. The caller MUST be able to opt back in to including HTML-comment occurrences via an explicit include-html-comments argument. The include-code-blocks and include-html-comments opt-ins MUST be independent — opting into one MUST NOT change the default of the other.
- **FR-008**: System MUST accept an optional vault-relative subfolder argument. When supplied, the operation MUST examine only notes whose path is under that subfolder. When absent, the operation MUST examine every note in the vault.
- **FR-009**: System MUST reject an unknown subfolder with a typed error that names the missing subfolder and MUST NOT silently return an empty result. No note MUST be modified when this error is raised.
- **FR-010**: System MUST reject a syntactically invalid regular expression (in `regex` mode) with a typed error that explains the pattern is invalid. No note MUST be modified when this error is raised. Literal-mode patterns MUST NOT be validated for regex syntax.
- **FR-011**: System MUST enforce a configured safe upper bound on the total number of occurrences across the chosen scope. When the total count exceeds the bound, the operation MUST return a typed error that names the bound and the offending count, for both preview and commit invocations, and no note MUST be modified.
- **FR-012**: The safe upper bound MUST be re-checked at commit time when the commit-opt-in is true, so that vault content that changed between a successful preview and the commit cannot exceed the bound silently.
- **FR-013**: System MUST search exactly one vault per invocation; callers that need rewrites across multiple vaults invoke the operation once per vault.
- **FR-014**: Preview responses MUST NOT mutate any note on disk under any circumstance, including when the response is later discarded due to a downstream error.
- **FR-015**: Commit responses MUST update notes on disk atomically per note — a note that is updated is updated in full; a note that fails to update mid-write does not leave a half-written file at its path. Cross-note transactional rollback is out of scope (the caller is responsible for taking a backup before committing).
- **FR-016**: System MUST scope each occurrence to the position within a single note where it was found; a single pattern match MUST NOT span notes.
- **FR-017**: System MUST skip zero-width regex matches (positions where the pattern matches the empty string) — parity with the sibling `pattern_search` tool (BI-037 FR-016). Zero-width matches MUST NOT contribute to the occurrence count and MUST NOT trigger the safe-upper-bound guard.
- **FR-018**: Frontmatter content at the top of a note MUST be treated as prose for matching purposes — frontmatter is NOT a separately-skipped region. Dedicated frontmatter-key migration is a separate feature outside this scope.

### Key Entities

- **Find request**: The pattern, the pattern mode (`literal` or `regex`), the replacement text, the optional subfolder scope, the include-code-blocks and include-html-comments opt-ins, and the commit opt-in. Defines what the agent asked for.
- **Affected note**: A single note whose content contains at least one non-skipped occurrence of the pattern under the current scope and opt-in settings. Carries the note locator, the per-note occurrence count, and the proposed change.
- **Proposed change**: The shape of the rewrite for a single affected note — sufficient for the caller to verify what would be written if the commit opt-in were set.
- **Preview result**: The list of affected notes with their proposed changes, plus the total-occurrences count across all affected notes and a signal indicating no note on disk was modified.
- **Commit result**: The notes-changed count and the total-replacements count for an executed commit, plus the locators of the notes that were updated.
- **Safe upper bound**: The configured ceiling on the total occurrence count across the chosen scope above which the operation refuses to run. A property of the tool's configured environment rather than of any single call.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can preview and then commit a vault-wide find-and-replace in exactly two tool calls (one preview, one commit) without re-authoring the request or copying the preview shape into a different argument schema. 100% of preview-then-commit pairs against an unchanged vault produce the same set of affected notes and the same per-note proposed changes.
- **SC-002**: 100% of preview invocations leave every note on disk unchanged — verifiable by comparing per-note content and mtime before and after the preview call.
- **SC-003**: When code-block and HTML-comment skip-by-default is in effect, 0% of returned proposed changes include an occurrence that lies inside a fenced code block or inside an HTML comment.
- **SC-004**: When the include-code-blocks or include-html-comments opt-ins are set, 100% of occurrences inside the corresponding region are included in the proposed changes.
- **SC-005**: When a subfolder scope is supplied, 0% of affected notes in the response come from outside that subfolder subtree.
- **SC-006**: Unknown subfolder, invalid regex (in `regex` mode), and safe-upper-bound-exceeded are surfaced as three distinct typed errors so an agent can branch on the error code without parsing human-readable error prose.
- **SC-007**: A pattern that matches nothing returns a successful empty result with zero affected notes and zero replacements 100% of the time, never as an error.
- **SC-008**: When the safe upper bound is exceeded, 100% of invocations — preview or commit — refuse to run, with no note modified.

## Assumptions

- **Regex dialect**: The `regex` mode uses ECMAScript (Node's built-in `RegExp`) and ECMAScript replacement-string semantics, parity with the sibling `pattern_search` tool (BI-037). The user input excluded regex-dialect negotiation from scope, so the dialect is fixed.
- **Pattern mode default**: When the caller does not declare a pattern mode, the operation runs in `literal` mode. Literal-as-default is the safer choice — a caller who pastes `foo.bar` and forgets to declare regex mode does not accidentally match `fooXbar` and corrupt unrelated notes.
- **Safe upper bound source**: The upper bound is a server-side configured value (read at server-startup or per-invocation from the tool's environment) rather than a per-call argument. A caller-supplied upper bound is a planning-phase consideration but is not required for the MVP. The bound is enforced uniformly across preview and commit.
- **Per-note atomicity, not cross-note transactionality**: Commit writes are atomic per note (a note is fully written or unchanged), but the operation does not transactionally roll back already-written notes if a later note fails to write. Cross-note rollback is out of scope per the user input; the caller is responsible for taking a backup before committing.
- **Eligible files**: Only markdown notes (the same set scanned by sibling read/list tools in this surface) are eligible. Other files in the vault (images, attachments, plugin data) are not scanned or modified.
- **Single-vault per invocation**: One vault per invocation, parity with the rest of this tool surface. Cross-vault aggregation is out of scope per the user input.
- **Fenced code block detection**: A "fenced code block" is identified by paired triple-backtick (` ``` `) or paired triple-tilde (`~~~`) fences in standard CommonMark style. Inline code spans (single backticks) are not skipped — only fenced blocks are. Detection is text-level, not full-CommonMark-parser-level — sufficient for the safe default in well-formed notes.
- **HTML comment detection**: An "HTML comment" is identified by `<!--` … `-->` pairs in the note's text, including multi-line comments.
- **Subfolder semantics**: "Subfolder of the vault" means a path interpreted relative to the vault root, consistent with sibling tools in this surface that take a folder argument.
- **Ordering of affected notes**: The default ordering of affected notes in preview responses is stable and predictable across calls with the same input (e.g., note path ascending). The exact ordering is a planning-phase decision but stability across calls is assumed.
- **No retry semantics**: A failed commit (e.g., due to a transient file-system error mid-batch) is not automatically retried by the operation. The caller decides whether to re-issue.
