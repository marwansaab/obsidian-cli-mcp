# Feature Specification: Search Vault Content

**Feature Branch**: `033-search-vault-content`
**Created**: 2026-05-16
**Status**: Draft
**Input**: User description: "A `search` tool that accepts a keyword and returns structured matches from a vault — either as a list of matching file paths, or optionally as per-line matches including the line number and the matching line text."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Keyword to file paths (Priority: P1)

A caller supplies a non-empty keyword and a vault target; the tool returns a structured list of vault-relative paths for every file containing that keyword, plus the count of those files.

**Why this priority**: File-level keyword retrieval is the MVP and the dominant cross-reference-chasing case. Without it the feature delivers no value; with it alone the tool already replaces brittle parsing of the upstream CLI's plain-text output.

**Independent Test**: Populate a vault with two notes containing the word `alpha` and one note containing the word `beta`. Call the tool with `query=alpha` against that vault in default mode. Assert `count=2` and `paths` contains exactly the two `alpha`-bearing note paths.

**Acceptance Scenarios**:

1. **Given** a vault with one or more files containing keyword `K`, **When** the tool is called with `query=K`, **Then** the response contains the count and vault-relative paths of every matching file.
2. **Given** a vault where no file contains keyword `K`, **When** the tool is called with `query=K`, **Then** the response is `count=0` with an empty `paths` array — no error.
3. **Given** an empty query string (or whitespace-only), **When** the request is submitted, **Then** validation fails with a structured error before any search is performed.

---

### User Story 2 — Line-level context mode (Priority: P2)

A caller enables line-level mode and receives, for every match, the file path, the 1-based line number, and the matching line's text — enough to judge relevance without opening every file.

**Why this priority**: Without line context, the caller must open every candidate file to evaluate relevance, defeating the cross-reference-chasing use-case for large result sets. With line context the caller can rank, filter, or short-circuit at the agent layer.

**Independent Test**: Populate a vault with one note whose text spans multiple lines and contains the keyword on lines 2 and 5. Call the tool with `query=K` and the line-level flag enabled. Assert the response contains two entries — `{path, line: 2, text: "<line 2 text>"}` and `{path, line: 5, text: "<line 5 text>"}`.

**Acceptance Scenarios**:

1. **Given** line-level mode is enabled and matches are found, **When** the tool returns, **Then** each entry contains `path`, a 1-based `line`, and the matching line `text`.
2. **Given** line-level mode is omitted (the default), **When** matches are found, **Then** each entry contains only the file path.

---

### User Story 3 — Folder scoping (Priority: P2)

A caller restricts a search to a specific vault-relative folder prefix; only files under that prefix are searched.

**Why this priority**: A large vault produces a noisy result set for common keywords. Folder scoping is the lowest-friction way to target a relevant section without composing post-call filters, and it doubles as a workaround for the output-too-large failure mode.

**Independent Test**: Populate a vault with `Projects/alpha.md` (contains `K`), `Projects/beta.md` (contains `K`), and `Archive/old.md` (contains `K`). Call with `query=K` and `folder=Projects`. Assert the response contains only the two `Projects/...` paths; `Archive/old.md` is excluded.

**Acceptance Scenarios**:

1. **Given** a folder prefix is supplied, **When** the tool searches, **Then** only files under that vault-relative folder appear in the results.
2. **Given** a folder prefix that contains no matching files, **When** the tool searches, **Then** the response is empty (`count=0`) — no error.

---

### User Story 4 — Result cap (Priority: P3)

A caller supplies a positive-integer `limit`; the response contains at most that many results, protecting the caller's context window from large result sets.

**Why this priority**: Large vaults plus broad keywords (e.g. `the`) can produce thousands of matches. A caller-supplied cap is the simplest defence; the structured output-too-large error remains the fallback when no cap is supplied.

**Independent Test**: Populate a vault with 10 files containing keyword `K`. Call with `query=K` and `limit=3`. Assert the response contains exactly 3 results. Then call without `limit` and verify all 10 results are returned (or a structured output-too-large error if the response would exceed the tool's output capacity).

**Acceptance Scenarios**:

1. **Given** a `limit` of N is supplied and matches exceed N, **When** the tool returns, **Then** at most N results appear in the response.
2. **Given** the search produces a response that would exceed the tool's output capacity AND no `limit` was supplied, **When** the tool returns, **Then** a structured output-too-large error is returned — the error message names `folder` and `limit` as the two ways to narrow the call.
3. **Given** a non-positive `limit` (zero or negative), **When** the request is submitted, **Then** validation fails with a structured error before any search is performed.

---

### User Story 5 — Case sensitivity toggle (Priority: P3)

A caller controls whether matching is case-sensitive; the default is case-insensitive.

**Why this priority**: Case-insensitive matching is the dominant agent expectation (mirrors most search UIs); case-sensitive matching is essential for code-symbol-style queries (`getUser` vs `getuser`) where capitalisation carries meaning. A toggle covers both without forcing the caller to fall back to a separate tool.

**Independent Test**: Populate a vault with `note-a.md` containing `Foo` and `note-b.md` containing `foo`. Call with `query=Foo` and `case_sensitive=true` — assert only `note-a.md` is returned. Call with `query=Foo` and `case_sensitive=false` (or omitted) — assert both notes are returned.

**Acceptance Scenarios**:

1. **Given** `case_sensitive=true`, **When** the tool searches, **Then** only results whose text matches the query's exact capitalisation are returned.
2. **Given** `case_sensitive` is omitted or set to `false`, **When** the tool searches, **Then** results with any capitalisation of the query are returned.

---

### Edge Cases

- Empty / whitespace-only `query` — surfaces a structured `VALIDATION_ERROR`.
- Unknown parameter included in the request — surfaces a structured `VALIDATION_ERROR`.
- Non-positive `limit` (zero or negative) — surfaces a structured `VALIDATION_ERROR`.
- `folder` prefix containing no matching files — empty result set, no error.
- `folder` prefix that does not exist in the vault — empty result set, no error (defers to upstream behaviour; matches the agent-facing "no matching files" semantic).
- `folder` prefix with leading or trailing `/` — normalised before matching (`/Projects/`, `Projects/`, and `Projects` are equivalent).
- Vault targeting via active mode without naming a vault — currently focused vault is searched.
- Vault targeting via active mode WITH a `vault` name also supplied — surfaces a structured `VALIDATION_ERROR` (mode/vault contract violation).
- Unknown vault name supplied — surfaces a structured `CLI_REPORTED_ERROR` consistent with the project-wide vault-routing convention.
- A single file containing the keyword on multiple lines AND line-level mode enabled — each matching line produces its own entry (no per-file dedupe).
- A single file containing the keyword on multiple lines AND default mode — file appears exactly once in `paths`.
- Same line contains the keyword multiple times AND line-level mode enabled — the line appears exactly once (line-level entries are keyed by `{path, line}`, not by per-occurrence).
- Result set fits within the tool's output capacity AND no `limit` supplied — full result set is returned without truncation.
- Result set would exceed the tool's output capacity AND no `limit` supplied — structured output-too-large error is returned naming `folder` and `limit` as the two ways to narrow.
- `limit` supplied AND result set exceeds capacity even after capping — the cap takes precedence; the output-too-large error does NOT fire on the capped response.
- Match inside a fenced code block — included (the underlying CLI is keyword-only over file text; code-block exclusion is out of scope at v1).
- Match inside frontmatter YAML — included (whole-file text search; frontmatter-targeted lookups remain the responsibility of `find_by_property`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST accept a non-empty `query` string and return structured matches from a single vault target.
- **FR-002**: In default mode (line-level disabled) the return shape MUST be a structured object containing a non-negative integer `count` and an array `paths` of vault-relative path strings; `count` MUST equal `paths.length`.
- **FR-003**: In line-level mode the return shape MUST be a structured object containing a non-negative integer `count` and an array `matches` of entries shaped `{ path: string, line: integer (1-based, ≥1), text: string }`; `count` MUST equal `matches.length`.
- **FR-004**: The tool MUST expose line-level mode through a single boolean input flag, default `false`. When the flag is `false` or omitted the response uses the default-mode shape (FR-002); when `true` it uses the line-level shape (FR-003).
- **FR-005**: The tool MUST accept an optional `folder` parameter (vault-relative path prefix). When supplied, only files whose vault-relative path begins with that prefix MUST be searched; matching MUST be at folder-segment boundaries (a `folder=Proj` MUST NOT match a file under `Projects/`).
- **FR-006**: The tool MUST normalise the `folder` parameter by stripping a single leading `/` and a single trailing `/` before matching; inputs `Projects`, `Projects/`, `/Projects`, and `/Projects/` MUST be equivalent.
- **FR-007**: The tool MUST accept an optional `limit` parameter (positive integer). When supplied, at most that many results MUST appear in the response array (`paths` in default mode, `matches` in line-level mode).
- **FR-008**: The tool MUST reject a `limit` of zero or a negative integer with a structured `VALIDATION_ERROR` BEFORE any vault scan.
- **FR-009**: The tool MUST accept an optional `case_sensitive` boolean (default `false`). When `false` or omitted the keyword match MUST be case-insensitive (`Foo` query matches `foo`, `FOO`, `Foo` in file text). When `true` the match MUST be case-exact (`Foo` matches only `Foo`).
- **FR-010**: The tool MUST reject an empty or whitespace-only `query` with a structured `VALIDATION_ERROR` BEFORE any vault scan.
- **FR-011**: The tool MUST reject any unknown input parameter with a structured `VALIDATION_ERROR` BEFORE any vault scan (strict input schema — parity with every typed tool in the project).
- **FR-012**: When the query matches zero files, the tool MUST return `count=0` with an empty results array (in either mode) — never an error.
- **FR-013**: Returned path strings MUST be vault-relative and use forward-slash separators (`/`); the response MUST NOT echo the locator (`vault`, `mode`, `query`, `folder`, `limit`, `case_sensitive`) — read-tool convention.
- **FR-014**: In default mode, a file containing the keyword on multiple lines MUST appear exactly once in `paths` (path-level dedupe).
- **FR-015**: In line-level mode, each matching line in a file MUST produce its own entry in `matches`; a single line containing the keyword multiple times MUST appear exactly once (entries are keyed by `{path, line}`).
- **FR-016**: The tool MUST follow the project-wide vault-targeting convention (`mode: 'active'` uses the currently focused vault; `mode: 'specific'` requires a `vault` name; `mode: 'active'` with a `vault` name supplied surfaces a `VALIDATION_ERROR`; an unknown `vault` surfaces a `CLI_REPORTED_ERROR(VAULT_NOT_FOUND)`).
- **FR-017**: The tool MUST follow the project-wide error-envelope conventions; the v1 surface MUST introduce zero new top-level error codes (Constitution Principle IV).
- **FR-018**: When no `limit` is supplied AND the full result set would exceed the tool's output capacity, the tool MUST return a structured output-too-large error that explicitly names `folder` and `limit` as the two ways to narrow the call. When `limit` IS supplied, the cap MUST be applied; the output-too-large error MUST NOT fire on the capped response.
- **FR-019**: The results array MUST be returned in a deterministic order so that repeated calls with identical inputs and stable vault state yield identical responses. Default-mode `paths` MUST be sorted vault-relative-path ascending (UTF-16 code-unit order, parity with BI-028). Line-level-mode `matches` MUST be sorted by `path` ascending, then `line` ascending.
- **FR-020**: The tool's progressive-disclosure help surface MUST document the full input contract, both output shapes (file-level and line-level), the error roster, and at least four worked examples.

### Key Entities *(include if feature involves data)*

- **Keyword query**: a non-empty string the caller wants to find in file text. Treated as a substring (not a regex, not a structured expression). Case-folding governed by the `case_sensitive` flag.
- **File-match (default mode)**: a vault-relative path string locating a file whose text contains at least one occurrence of the keyword.
- **Line-match (line-level mode)**: a tuple `{path, line, text}` locating a single line containing at least one occurrence of the keyword. `line` is 1-based.
- **Folder prefix**: a vault-relative folder path (no leading/trailing `/` after normalisation) restricting the search to files under that subtree.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent retrieves the set of vault-relative paths containing a keyword in a single call, without parsing plain-text CLI output.
- **SC-002**: An agent retrieves per-line context (path + 1-based line number + line text) for every match in a single call, sufficient to rank candidates before opening any file.
- **SC-003**: A folder-scoped query returns 100% of matches under the named folder and 0% of matches outside it.
- **SC-004**: A query with `limit=N` returns at most N entries even when the underlying match set is larger.
- **SC-005**: A `case_sensitive=true` query returns only capitalisation-exact matches; a `case_sensitive=false` (or omitted) query returns capitalisation-insensitive matches.
- **SC-006**: A query that yields zero matches returns `count=0` and an empty results array, with no error.
- **SC-007**: Repeated calls with identical inputs and stable vault state return byte-identical responses (deterministic ordering).
- **SC-008**: A query whose full response would exceed the tool's output capacity AND has no `limit` returns a structured output-too-large error whose message names both `folder` and `limit` as remediation knobs.
- **SC-009**: Invalid inputs (empty query, non-positive limit, unknown parameter, `mode: 'active'` + `vault` name) are rejected before any vault scan with a structured `VALIDATION_ERROR`.
- **SC-010**: A query against an unknown vault surfaces a structured error consistent with the project-wide vault-routing convention rather than a silent empty response.
- **SC-011**: The progressive-disclosure help surface, when queried, returns the full input contract, both output shapes, the error roster, and at least four worked examples.

## Assumptions

- The registered tool name is `search` per ADR-010 single-word-verbatim-from-upstream (matches the upstream `obsidian search` subcommand). Source module is expected at `src/tools/search/`; factory function `createSearchTool`.
- The project's existing vault-wide error envelopes and structured-error patterns apply unchanged; this BI introduces zero new top-level error codes (Constitution Principle IV; preserves the fifteen-tool zero-new-top-level-codes streak continuing through BI-032).
- Vault targeting uses the project-wide `mode: 'active' | 'specific'` + `vault` discriminator convention (FR-016). Active-mode TOCTOU is handled uniformly by the project-wide ADR-applied approach noted in the assistant's memory; this tool does not retrofit per-tool active-mode protection.
- The read-tool response convention applies: the tool returns data only; locator inputs (`vault`, `mode`, `query`, `folder`, `limit`, `case_sensitive`) are NOT echoed in the response (FR-013).
- The underlying CLI is keyword-only (substring containment); regex and structured/logic-expression queries are explicitly out of scope at v1.
- Match semantics defer to the underlying CLI's interpretation of "file text" — frontmatter and code blocks are searched as ordinary text. Frontmatter-targeted lookups remain the responsibility of `find_by_property`.
- The output-too-large detector (FR-018) reuses the project's existing output-budget infrastructure rather than introducing a new threshold; the exact byte/match cap is a plan-stage decision and may surface as a `/speckit-clarify` question. The user-facing contract — structured error naming `folder` and `limit` — is fixed regardless of detector implementation.
- Result-ordering is alphabetical ascending (UTF-16 code-unit) on `path` (default mode) and on `path` then `line` (line-level mode), for determinism. Alternative orderings (relevance ranking, recency, frequency-of-occurrence within a file) are out of scope at v1.
- Surface is intentionally narrow at v1: no regex, no logic-expression queries, no cross-vault aggregation, no file-level locator parameters (`file`, `path`), no multi-keyword boolean queries, no surrounding-context-lines (only the matching line itself in line-level mode).

## Out of scope

- Regex queries — the underlying CLI is keyword-only; regex is a separate future BI.
- Structured or logic-expression queries (JsonLogic, OData-style filters, etc.) — separate future BI.
- Cross-vault aggregation in a single call — callers iterate per vault as needed.
- Frontmatter-targeted lookups — handled by `find_by_property`; this tool searches whole-file text.
- File-level locator parameters (`file`, `path`) — this tool is vault-scoped, not file-scoped.
- Surrounding-context-lines (returning lines N±k around each match) — v1 returns only the matching line itself.
- Relevance ranking / scoring — v1 orders results alphabetically for determinism.
- Multi-keyword boolean queries (`foo AND bar`, `foo OR bar`) — single keyword per call at v1.
- Replace-in-vault (write-side counterpart) — separate BI when demand emerges.
- Pagination (`offset` parameter) — `limit` only at v1.
