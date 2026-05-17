# Feature Specification: Pattern Search

**Feature Branch**: `037-pattern-search`
**Created**: 2026-05-17
**Status**: Draft
**Input**: User description: "Add Pattern Search — agents search every markdown note in a vault for matches against a regular-expression pattern and receive each match together with the note it came from and the line on which it was found."

## Clarifications

### Session 2026-05-17

- Q: Regex dialect — which regular-expression flavour does the pattern argument speak? → A: **ECMAScript** (Node's built-in `RegExp`). Pattern validity, `\d` / `\b` / lookahead / lookbehind / named-capture semantics, and the `i` flag for case-insensitive matching all follow JavaScript `RegExp` rules. The invalid-pattern error (FR-010) is the typed envelope around `new RegExp(pattern)` throwing `SyntaxError`.
- Q: Long matched-line text — how is the full-line field bounded when the matched line is very large? → A: **Sibling parity with BI-033 FR-024.** The full-line field is capped at 500 UTF-16 code units; if the original line is longer, the field carries the first 500 code units followed by `…` (U+2026). The matched-substring field is NEVER capped — the predicate's hit is always returned in full, even when the surrounding line is clipped. A match whose substring starts after the 500th code unit of its line is still surfaced; the line field shows the clipped prefix + `…` and the match field shows the substring intact.
- Q: Zero-length matches — what happens when the pattern matches at a zero-width position (`^`, `$`, `a*`, `\b`, lookarounds)? → A: **Skip them.** A position where the pattern matches the empty string contributes no result entry. A line whose only matches are zero-length yields zero entries; a line that matches both zero-length AND non-empty positions yields one entry per non-empty match. Matches `grep`'s default behaviour and prevents zero-width predicates from saturating the truncation cap with empty-substring entries. Patterns themselves are NOT rejected at validation — `a*?`, `foo|bar*`, and similar predicates with both zero-width and non-empty branches remain valid; only the zero-width *matches* are dropped, not the patterns.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search vault for a regex pattern (Priority: P1)

An agent issues a regular-expression pattern against a vault and receives, for every markdown note in the vault, every line that matches the pattern. Each match identifies the note it came from, the line within that note, the full text of that line, and the substring that matched the pattern. A truncation signal accompanies the list so the agent can tell whether it has seen every match or only a prefix.

**Why this priority**: Cross-reference questions — "find every BI-NNNN reference across the vault", "find heading-anchor wikilinks regardless of file", "find frontmatter values that match a structural shape" — cannot be answered by keyword search. Without a typed regex search, agents fall back to a separate tool that this project is retiring, so this MVP unblocks completing that retirement. Locators and the truncation signal are part of the MVP because without them the result is unactionable.

**Independent Test**: Stand up a vault with notes that contain known matches (e.g., several "BI-NNNN" references across files) and zero-match cases for the same pattern. Issue `BI-\d{4}` against the vault. Verify every expected match appears with its note path, line number, full line, and matched substring; verify zero-match patterns return an empty list as a success rather than an error; verify a syntactically invalid pattern returns a typed error and reports no partial matches.

**Acceptance Scenarios**:

1. **Given** a vault with notes containing the text "BI-0042", **When** the agent searches for the pattern `BI-\d{4}`, **Then** the result contains a match for every note and line that contains a four-digit BI-token, and each match identifies the note path, the line number within that note, the full text of the line, and the matched substring.
2. **Given** the same note contains several matches on different lines (or several matches on the same line), **When** the result is returned, **Then** each occurrence is reported as a separate match rather than being collapsed into one.
3. **Given** a syntactically invalid pattern, **When** the agent runs the search, **Then** the search returns an error that explains the pattern is invalid and reports no partial matches.
4. **Given** a valid pattern with zero matches in the vault, **When** the agent runs the search, **Then** the search succeeds with an empty list of matches (not an error).
5. **Given** the full result fits within the result-size limit, **When** the agent reads the result, **Then** the agent can tell the list is complete.
6. **Given** the result would exceed the result-size limit, **When** the agent reads the result, **Then** the agent can tell more matches exist beyond what was returned.

---

### User Story 2 - Scope the search to a folder (Priority: P2)

An agent that already knows the relevant area of the vault can pass a sub-folder so only notes under that folder are scanned. Folders that do not exist in the vault are rejected with a typed error rather than silently returning an empty result, so the agent can distinguish "no matches" from "wrong folder".

**Why this priority**: Folder scoping is a cost-control lever, not a correctness lever — P1 already returns correct results across the whole vault. Targeting a known area cheaply matters for large vaults and is a strong second-priority capability, but agents can ship value with P1 alone.

**Independent Test**: With P1 in place, issue the same pattern with and without a folder scope against a vault where the pattern matches in multiple folders. Verify the folder-scoped call returns only matches under the named folder. Pass a folder that does not exist and verify a typed error names the unknown folder.

**Acceptance Scenarios**:

1. **Given** the agent passes a vault sub-folder, **When** the search runs, **Then** only notes under that folder are scanned for matches and no matches from sibling folders appear in the result.
2. **Given** the agent passes a folder that does not exist in the vault, **When** the search runs, **Then** the search returns an error naming the unknown folder rather than an empty success.

---

### User Story 3 - Control case sensitivity (Priority: P3)

An agent can request case-insensitive matching when the predicate should ignore letter case (e.g., looking for the word "TODO" regardless of how it was typed). By default — and when the agent explicitly requests case-sensitive matching — the search respects the case of the pattern exactly.

**Why this priority**: Case-insensitive matching is achievable today by writing the pattern with an inline case-insensitive group, but a first-class flag is cleaner for agents and aligns with industry-standard search ergonomics. Lower priority because the workaround exists.

**Independent Test**: Search for a pattern (e.g., `todo`) against a vault containing both "TODO" and "todo" on different lines. Verify case-sensitive (default) returns only the lowercase match; verify case-insensitive returns both.

**Acceptance Scenarios**:

1. **Given** the agent asks for case-insensitive matching, **When** the search runs, **Then** matches that differ from the pattern only in letter case are returned alongside exact-case matches.
2. **Given** the agent asks for case-sensitive matching (or does not specify), **When** the search runs, **Then** matches respect the case of the pattern exactly.

---

### Edge Cases

- A note exists but contains no lines matching the pattern: the note contributes zero entries; this is not an error.
- The pattern matches at a zero-width position (e.g., `a*`, `^`, `$`, `\b`, lookarounds): the zero-width hit is **skipped**, not emitted, per FR-016. The pattern itself is still valid; only the zero-width matches are dropped. A line whose only matches are zero-length contributes zero entries. The call still terminates within the result-size limit.
- The matched substring spans the entire line: the matched substring and the full line are equal; both fields are still populated.
- Several matches on the same line: each occurrence is a separate match entry that reports the same full-line text and may report a different matched substring.
- Pattern matches text inside a fenced code block, frontmatter block, or HTML comment: the match is returned. The vault is searched as plain text; markdown-aware exclusion is out of scope for this feature.
- Pattern includes a newline metacharacter (e.g., `\n`): matching is line-scoped, so the pattern cannot span lines; this is a deliberate limitation rather than an error.
- Vault contains notes with very long lines: the line field is clipped to the first 500 UTF-16 code units with a trailing `…` (FR-005), so the per-entry payload is bounded; the matched-substring field stays full, so the match itself is always faithful even when the surrounding line is clipped. The result-size truncation signal protects callers from unbounded payloads at the result level; per-line capping protects them from unbounded payloads at the entry level.
- Folder scope is valid but the named folder is empty: the result is an empty list with the "complete" signal — same shape as a whole-vault search that yielded no matches.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept a regular-expression pattern as the search predicate. The pattern dialect is ECMAScript (Node's built-in `RegExp`); `\d`, `\b`, lookahead, lookbehind, named captures, and the `i` flag for case-insensitive matching all follow JavaScript `RegExp` semantics.
- **FR-002**: System MUST scan every markdown note in the named vault (or every note under the named folder, when a folder scope is supplied) and report every line that contains at least one match for the pattern.
- **FR-003**: System MUST report each match as a separate entry, including when several matches occur within the same note or on the same line.
- **FR-004**: System MUST identify, for every match, the note it came from and the line within that note on which the match was found.
- **FR-005**: System MUST return, for every match, both the text of the matched line and the substring that matched the pattern. The full-line field MUST be capped at 500 UTF-16 code units; when the original line is longer, the field carries the first 500 code units followed by `…` (U+2026), parity with BI-033 FR-024. The matched-substring field MUST NOT be capped — the predicate's hit is always returned in full, even when the substring begins after the 500th code unit of its line and is therefore absent from the clipped line field.
- **FR-006**: System MUST accept an optional folder scope that restricts the search to notes under the named folder of the vault.
- **FR-007**: System MUST accept an optional case-sensitivity control. The default behaviour MUST be case-sensitive matching; an explicit case-insensitive request MUST cause the search to ignore letter case.
- **FR-008**: System MUST return a result that indicates, without ambiguity, whether the returned list of matches is complete or whether further matches exist beyond a result-size limit.
- **FR-009**: System MUST treat a valid pattern that yields zero matches as a successful empty result, not an error.
- **FR-010**: System MUST reject a syntactically invalid regular-expression pattern with a typed error that explains the pattern is invalid and MUST NOT return any partial matches alongside the error.
- **FR-011**: System MUST reject an unknown folder scope with a typed error that names the unknown folder and MUST NOT silently return an empty result.
- **FR-012**: System MUST scope matching to a single line of source text; patterns that span newline boundaries are not supported and MUST NOT match across lines.
- **FR-013**: System MUST treat vault content as plain text for the purpose of matching; matches inside fenced code blocks, frontmatter blocks, or HTML comments MUST be returned the same as matches in any other position.
- **FR-014**: System MUST search exactly one vault per invocation; callers that need results across multiple vaults invoke the search once per vault.
- **FR-015**: System MUST NOT mutate vault content; the search is read-only.
- **FR-016**: System MUST skip zero-length matches. A position where the pattern matches the empty string MUST NOT contribute a result entry; a line whose only matches are zero-length yields zero entries; a line that matches both zero-length AND non-empty positions yields one entry per non-empty match. Patterns that *can* produce zero-width matches (`a*`, `^`, `$`, `\b`, lookarounds) MUST NOT be rejected at validation; only their zero-width hits are dropped.

### Key Entities

- **Search predicate**: The regular-expression pattern plus the case-sensitivity flag the agent supplied. The predicate is the contract — what the agent asks for is what the search runs.
- **Search scope**: The vault, plus the optional folder under that vault. Defines the set of markdown notes that are eligible to be scanned.
- **Match**: A single occurrence of the pattern on a single line of a single note. Carries the note locator, the line number within that note, the full text of that line, and the substring that matched the pattern.
- **Search result**: The ordered list of matches plus a signal that says whether the list is complete or was truncated by the result-size limit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent can find every line matching a regular-expression pattern across a vault in a single tool call, with no fall-back to the retiring keyword-only tool required for any cross-reference question the project tracks today.
- **SC-002**: 100% of returned matches identify the note and line they came from without the agent needing to issue a follow-up read against the note.
- **SC-003**: An agent can distinguish a complete result from a truncated one 100% of the time by reading a single signal in the result, with no need to infer truncation from result size or count.
- **SC-004**: When a folder scope is supplied, 0% of returned matches come from notes outside that folder.
- **SC-005**: An invalid pattern and an unknown folder are surfaced as two distinct typed errors so an agent can branch on the error code without parsing human-readable error prose.
- **SC-006**: A zero-match search against a valid pattern returns within the same result-shape as a non-empty search and is never reported as an error.

## Assumptions

- Only markdown notes (the same set scanned by sibling read/list tools in this surface) are eligible for matching. Other files in the vault (images, attachments, plugin data) are not scanned.
- The result-size limit is set by the broader tool-surface convention rather than this feature; the truncation signal is the contract surfaced to callers, and the specific cap is a planning-phase decision driven by existing limits in sibling tools.
- The default ordering of matches is stable and predictable across calls (e.g., note path ascending, then line number ascending within a note). The exact ordering is a planning-phase decision but stability across calls with the same input is assumed.
- One vault per invocation is the granularity that matches the rest of this tool surface; agents iterate per vault for multi-vault questions.
- "Folder under the vault" means a path interpreted relative to the vault root, consistent with how sibling tools in this surface scope folder arguments.
- The search is read-only; the existence of a future find-and-replace capability is out of scope for this feature and would be a separate tool.
