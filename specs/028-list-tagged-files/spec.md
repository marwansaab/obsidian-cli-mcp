# Feature Specification: List Tagged Files

**Feature Branch**: `028-list-tagged-files`  
**Created**: 2026-05-15  
**Status**: Draft  
**Input**: User description: "List tagged files — vault-wide typed tool that returns all notes carrying a given Obsidian tag. The caller supplies a tag name; the tool returns a count and a list of vault-relative paths for every note that bears that tag, including notes that carry any child tag of the supplied parent."

## Clarifications

### Session 2026-05-15

- Q: When the queried tag and the stored tag differ only in letter-case, should they match? → A: Yes — defer to upstream CLI behaviour. The wrapper does NOT lower-fold either side; the upstream tag index is already case-insensitive (mirrors Obsidian's tag pane). Plan-stage live probe MUST confirm the upstream observable behaviour; no wrapper-side normalisation is added. **→ SUPERSEDED by Amendment 1 below** — plan-stage live probe F2 contradicted the premise; resolution is wrapper-side ASCII lower-fold inside the eval JS template. This Q1 bullet is retained for Q&A history; FR-008 / SC-009 reflect the current contract.
- Q: Should the wrapper enforce a charset regex on the input tag, or pass non-empty post-strip strings through? → A: Pass-through after structural validation only. Wrapper enforces non-empty post-trim/post-#-strip, no empty hierarchical segments, and a max-length cap (≤200 chars). It does NOT police Obsidian's tag charset rules — charset-invalid inputs (spaces, punctuation, characters Obsidian rejects) naturally produce `count=0` from the upstream. Mirrors BI-019 / BI-023 / BI-024 / BI-025 defer-to-upstream pattern.
- Q: Which frontmatter shapes count as carrying a tag? → A: Defer entirely to upstream metadata cache. Whatever Obsidian's tag index treats as a frontmatter tag (canonical `tags:` list-of-strings, singular `tag:`, comma-separated scalars, YAML sequence dashes, etc.) the wrapper inherits unchanged. No wrapper-side YAML interpretation. Pattern parity with FR-005's code-block exclusion deferral.
- Q: How should the wrapper handle a leading `#` on the input tag? → A: Silent strip of a single leading `#` post-whitespace-trim. Inputs `foo`, `#foo`, `  #foo  ` are equivalent. Inputs `##foo` strip once → `#foo`, which is charset-invalid and naturally yields `count=0` from the upstream (no wrapper-side rejection on charset grounds — see Q2). FR-009 / SC-008 are unchanged.
- Q: How should `paths` be ordered in the response? → A: Wrapper-side byte-ascending sort post-fetch. Deterministic, environment-independent, parity with BI-026 / BI-027 sort conventions. Wrapper sorts regardless of upstream emission order — provides reproducibility on top of upstream (which may be insertion-order, mtime-order, or unspecified across Obsidian / CLI versions). FR-013 / SC-005 are unchanged.

### Plan-stage live-probe amendments (2026-05-15)

The /speckit-plan phase ran a live-CLI probe against `TestVault-Obsidian-CLI-MCP` and surfaced TWO findings that contradict Q1's premise and adjust the architecture from "wrap upstream `tag` subcommand" to "wrap via `eval` with wrapper-side normalisation":

- **Amendment 1 (FR-008 / SC-009 / Edge Case "Case variation" / Assumptions case bullet)**: Live probe F2 confirmed `obsidian vault=… tag name=Alpha` returns `Error: Tag "#Alpha" not found.` against a vault containing `#alpha`, AND `app.metadataCache.getTags()` returns case-PRESERVED keys (`["#bi-005","#fixture","#alpha","#beta","#gamma"]`). The Obsidian CLI's `tag` subcommand AND the in-memory metadataCache.getTags() index are both case-SENSITIVE. Obsidian's own tag-pane UI groups case-variants together (case-insensitive display) — observable divergence between CLI-layer and UI-layer. Q1's explicit conditional ("Wrapper-side normalisation is only warranted if a live-probe at plan stage shows the CLI is case-sensitive while Obsidian's own tag pane is not") FIRES. Resolution: wrapper applies ASCII lower-fold to BOTH the query input AND every stored tag value inside the eval JS template, delivering case-insensitive matching that aligns with the tag-pane UX. FR-008 rewritten: "MUST apply ASCII lower-fold to both the input tag and every stored tag value inside the eval JS template, producing case-insensitive matching consistent with Obsidian's tag-pane UX. Lower-fold is ASCII-only (`String.prototype.toLowerCase()`) — Unicode case-folding is out of scope at v1 per the project's case-handling trend." SC-009 rewritten as a wrapper-layer test rather than a plan-stage probe expectation: "Tag input with case variation against stored tags (`Foo` query vs `foo` stored, or vice versa) produces identical matches — wrapper applies ASCII lower-fold inside the eval JS template; live-probe finding F2 documented in research.md."
- **Amendment 2 (architectural pivot, FR-019..FR-021 new)**: Live probe F3 confirmed the native `obsidian tag` subcommand has THREE additional contract mismatches with the spec: (a) plain-text-only output (no `format=json` flag), (b) returns `Error: Tag "#X" not found.` exit 0 for zero-match queries instead of empty result (would violate FR-012 if surfaced as `CLI_REPORTED_ERROR`), (c) no child-tag subsumption — `tag name=foo` returns only files tagged exactly `foo`, NOT files tagged `foo/bar`. With case-fold + zero-match-to-empty + child-subsumption all needing wrapper-side overrides, switching architecture from "wrap `tag` subcommand" to "wrap `eval` with metadataCache walk" delivers all three with a single eval call (parity with BI-014 / BI-015 / BI-025 / BI-026 / BI-027 — sixth member of the eval-driven cohort, the only one NOT wrapping a plugin). Three new FRs added: FR-019 "MUST invoke the upstream `eval` subcommand with a frozen JS template; MUST NOT invoke the native `tag` subcommand"; FR-020 "MUST encode user-supplied tag input via base64-JSON payload (anti-injection parity with BI-014 / BI-015 / BI-025 / BI-026 / BI-027)"; FR-021 "MUST consume the shared `_eval-vault-closed-detection` module introduced by BI-026 / consolidated by BI-027 for closed-but-registered-vault detection (parity with the eval-driven cohort)".

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Retrieve notes by tag (Priority: P1)

A caller supplies an exact tag and receives the set of vault-relative paths of notes carrying that tag, plus the count of those notes.

**Why this priority**: Single-tag retrieval is the dominant case and the MVP. Without it the feature delivers no value; with it alone the feature is already useful.

**Independent Test**: Populate a vault with two notes tagged `alpha` and one note tagged `beta`. Call the tool with `tag=alpha`. Assert the response has `count=2` and the `paths` array contains exactly the two `alpha`-tagged note paths.

**Acceptance Scenarios**:

1. **Given** a vault with one or more notes carrying tag `T`, **When** the tool is called with `tag=T`, **Then** the response contains the count and vault-relative paths of every matching note.
2. **Given** a vault where no note carries tag `T`, **When** the tool is called with `tag=T`, **Then** the response is `count=0` with an empty `paths` array — no error.
3. **Given** a note where the only occurrence of tag `T` is inside a fenced code block, **When** the tool is called with `tag=T`, **Then** that note is excluded from `paths`.

---

### User Story 2 — Hierarchical child-tag inclusion (Priority: P2)

A parent-tag query returns notes carrying the parent tag AND notes carrying any descendant of that parent in the tag tree.

**Why this priority**: Hierarchical tags (e.g. `project/alpha`, `project/beta`) are an Obsidian-idiomatic organisation pattern. Without subtree subsumption the caller is forced to enumerate every child, defeating the typed-tool's whole-subtree retrieval purpose.

**Independent Test**: Populate a vault with notes tagged `foo`, `foo/bar`, `foo/bar/baz`, and `unrelated`. Call with `tag=foo`. Assert exactly the first three paths appear; the fourth is excluded.

**Acceptance Scenarios**:

1. **Given** a vault with notes carrying `foo`, `foo/bar`, and `foo/bar/baz`, **When** the tool is called with `tag=foo`, **Then** all three notes appear in `paths`.
2. **Given** the same vault, **When** the tool is called with `tag=foo`, **Then** parent-only-tagged and child-tagged notes both appear in `paths`.

---

### User Story 3 — Leaf-tag precision (Priority: P2)

A query for a child tag (`foo/bar`) returns the child's subtree only — notes tagged with just the parent (`foo`) are excluded.

**Why this priority**: Without segment-boundary precision the hierarchical-inclusion rule becomes unsafe — querying `foo/bar` would pull in every note tagged just `foo`, polluting the result set.

**Independent Test**: Populate a vault with notes tagged `foo`, `foo/bar`, and `foo/bar/baz`. Call with `tag=foo/bar`. Assert the `foo/bar` and `foo/bar/baz` notes appear; the parent-only `foo` note is excluded.

**Acceptance Scenarios**:

1. **Given** a vault with notes carrying `foo`, `foo/bar`, and `foo/bar/baz`, **When** the tool is called with `tag=foo/bar`, **Then** only the `foo/bar` and `foo/bar/baz` notes appear in `paths`.

---

### User Story 4 — Count-only mode (Priority: P3)

A caller requests just the integer count and receives the count without the full path list.

**Why this priority**: Branching/heuristic decisions ("skip if zero, warn if too large") are a common upstream pattern; an integer-only return avoids transferring potentially large path arrays when only size matters.

**Independent Test**: Populate a vault with N>0 notes tagged `T`. Call with `tag=T` and the count-only flag. Assert the response is the integer N. Then call with a tag that no note carries and the count-only flag — assert the response is `0` without error.

**Acceptance Scenarios**:

1. **Given** a valid tag carried by N notes (N≥0), **When** the tool is called with the count-only flag, **Then** the response is the integer N with no `paths` array surfaced.
2. **Given** a tag carried by zero notes and the count-only flag, **When** the tool is called, **Then** the response is `0` with no error.

---

### Edge Cases

- Tag input with a leading `#` (e.g. `#foo`) — stripped silently before matching; `foo` and `#foo` are equivalent.
- Tag input with surrounding whitespace — trimmed before validation.
- Empty / whitespace-only tag input — surfaces a structured validation error.
- Tag input with empty hierarchical segments (`foo//bar`, `/foo`, `foo/`) — surfaces a structured validation error.
- Tag input exceeding 200 characters post-trim/post-#-strip — surfaces a structured validation error.
- Tag input containing characters Obsidian's tag parser rejects (e.g. spaces inside segments `foo bar`, punctuation `foo!`, emoji where unsupported) — passes wrapper-side structural validation and reaches the upstream, which returns `count=0` because no note's stored tag set contains that string. Wrapper does NOT pre-reject on charset grounds (defer-to-upstream).
- Tag that exists only inside fenced code blocks across the entire vault — count 0, empty `paths`.
- Note carrying the same tag in multiple places (e.g. `#foo` in body twice plus in `tags:` frontmatter) — appears exactly once in `paths` (de-duplicated by vault-relative path).
- Tag carried via any frontmatter shape the upstream cache recognises (canonical `tags:` list, singular `tag:`, comma-separated scalar, YAML sequence dashes, etc.) AND/OR inline body `#tag` syntax — all contribute equally; any one source is enough for the note to match.
- Case variation between query and stored tag (query `foo` vs stored `Foo`, or vice versa) — matches because the wrapper applies ASCII lower-fold inside the eval JS template against both sides. The native Obsidian CLI is case-sensitive (live-probe finding F2); the wrapper-side fold restores the case-insensitive matching that Obsidian's own tag-pane UX delivers.
- Segment-boundary precision — query `foo` MUST NOT match a stored tag `foobar`; only stored tags `foo` or `foo/<anything>` match.
- Unknown vault — surfaces a structured error consistent with the project-wide vault-routing convention.
- Large result set (≥1000 matching notes) — returned in full; no pagination at v1.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST accept a single tag query as input and return either a path list (default) or an integer count (count-only mode) of vault notes carrying that tag.
- **FR-002**: The default return shape MUST be a structured object containing a non-negative integer `count` and an array `paths` of vault-relative path strings; `count` MUST equal `paths.length`.
- **FR-003**: The count-only return MUST be a single non-negative integer with no `paths` array surfaced.
- **FR-004**: The tool MUST match a note when its stored tag set contains either the queried tag exactly OR any descendant tag prefixed by the queried tag plus `/` (segment-bounded child match).
- **FR-005**: The tool MUST exclude notes whose only carrier of the queried tag is inside a fenced code block — by deferring to the upstream tag-cache's existing code-block exclusion behaviour rather than reimplementing it.
- **FR-006**: The tool MUST defer the set of "tag carriers" entirely to the upstream metadata cache. Every frontmatter shape that Obsidian's tag index treats as a tag (canonical `tags:` list-of-strings, singular `tag:`, comma-separated scalars, YAML sequence dashes, etc.) AND every body inline `#tag` occurrence contributes equally to a note's tag set. The wrapper MUST NOT perform its own YAML-shape interpretation; whatever the upstream cache surfaces is the authoritative tag set.
- **FR-007**: When a single vault-relative path matches via multiple tag occurrences (body twice, body + frontmatter, etc.) the tool MUST return that path exactly once.
- **FR-008**: The tool MUST apply ASCII lower-fold (`String.prototype.toLowerCase()`) to BOTH the input tag AND every stored tag value INSIDE the eval JS template, producing case-insensitive matching consistent with Obsidian's tag-pane UX. Lower-fold is ASCII-only — Unicode case-folding is out of scope at v1. The input-schema layer (zod) PRESERVES the caller-provided case in the base64 payload (Q-9 round-trip preserves input case verbatim); folding happens only at the cache-walk comparison step. (Amendment driver: plan-stage live probe F2 / Q1's explicit conditional fired; see Clarifications "Plan-stage live-probe amendments" block.)
- **FR-009**: The tool MUST strip a single leading `#` from the input tag if present before matching; inputs `foo` and `#foo` MUST yield identical results.
- **FR-010**: The tool MUST trim surrounding whitespace from the input tag before validation and matching.
- **FR-011**: The tool MUST reject inputs that are empty, whitespace-only, OR contain empty hierarchical segments (`/foo`, `foo/`, `foo//bar`), OR exceed the structural maximum length of 200 characters post-trim/post-#-strip, with a structured `VALIDATION_ERROR` BEFORE any vault scan. (The input schema applies an OUTER cap of ~220 characters on the raw input string to accommodate leading `#` + surrounding whitespace before normalisation; the canonical post-strip cap remains 200.) The wrapper MUST NOT enforce a charset regex beyond these structural rules; charset-invalid inputs (whitespace inside segments, punctuation, characters Obsidian rejects in its own tag parser) flow through to the upstream CLI and naturally surface as `count=0` from a no-match scan.
- **FR-012**: When the tag matches zero notes, the tool MUST return `count=0` with an empty `paths` array (default mode) OR the integer `0` (count-only mode) — never an error.
- **FR-013**: The `paths` array MUST be returned in a deterministic order (UTF-16 code-unit ascending — equivalent to byte-asc for ASCII paths, which is the overwhelming majority of Obsidian path content; non-ASCII paths order by `Array.prototype.sort()`'s default code-unit comparator) so that repeated calls with identical inputs and stable vault state yield identical responses.
- **FR-014**: The tool MUST operate against a single vault per call; unknown-vault inputs MUST surface a structured error consistent with the project-wide vault-routing convention.
- **FR-015**: Returned path strings MUST be vault-relative and use forward-slash separators (`/`).
- **FR-016**: The tool MUST enforce segment-boundary matching on the parent-prefix rule — a stored tag `foobar` MUST NOT match a query for `foo`.
- **FR-017**: The tool MUST follow the project-wide error-envelope conventions; the v1 surface introduces zero new top-level error codes.
- **FR-018**: The count-only mode MUST be exposed through the project-wide `total: true` boolean flag convention (parity with BI-019 `files`, BI-023 `outline`, BI-024 `properties`, BI-025 `links`, BI-026 `smart_connections_similar`, BI-027 `smart_connections_query`).
- **FR-019**: The tool MUST invoke the upstream `eval` subcommand with a frozen JS template that walks `app.metadataCache.fileCache` × `app.metadataCache.metadataCache` to compute the matching path set; the wrapper MUST NOT invoke the native `obsidian tag` subcommand (plan-stage live probe F3 surfaced three native-subcommand mismatches: plain-text-only output, `Error: ... not found.` on zero-match, no child-subsumption). Sixth member of the eval-driven typed-tool cohort (BI-014 / BI-015 / BI-025 / BI-026 / BI-027 precedents).
- **FR-020**: The tool MUST encode all user-supplied data into the JS template via a base64-JSON payload substituted into a single `__PAYLOAD_B64__` placeholder; user text MUST NOT reach the JS source as raw template-interpolated text (anti-injection parity with BI-014 / BI-015 / BI-025 / BI-026 / BI-027).
- **FR-021**: The handler MUST consume the shared `src/tools/_eval-vault-closed-detection/` module (introduced by BI-026, lifted to cross-cutting by BI-027) for closed-but-registered-vault detection at stage 0 of response parsing, so a `vault=<closed-but-registered>` invocation surfaces `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "not-open")` consistently with the eval-driven cohort. Behaviour-preserving consumption — zero new top-level error codes, zero new `details.code` strings.

### Key Entities *(include if feature involves data)*

- **Tag query**: a non-empty string representing the tag the caller wants to look up. May be entered with or without a leading `#`; hierarchical (`/`-separated) segments allowed. Case-equivalence is delivered by wrapper-side ASCII lower-fold inside the eval JS template; live-probe F2 showed the upstream CLI is case-sensitive against the case-preserved `metadataCache.getTags()` keys.
- **Tag match**: a vault note whose declared tag set contains the query as an exact tag OR any descendant tag prefixed by `<query>/`. The declared tag set is whatever the upstream metadata cache surfaces — any frontmatter shape Obsidian's tag index ingests plus body inline `#tags`. Wrapper does not interpret YAML shapes itself.
- **Vault-relative path**: a forward-slash path string locating the note within the vault root (the shape used by every other vault-wide typed tool in the project).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent retrieves all paths of vault notes carrying a known tag in a single call without enumerating individual notes.
- **SC-002**: A parent-tag query against a vault containing both parent-tagged and child-tagged notes returns 100% of the child-tagged paths in addition to the parent-tagged paths.
- **SC-003**: A leaf-tag query against the same vault excludes 100% of parent-only-tagged notes from the result.
- **SC-004**: A query for a tag with no carriers returns `count=0` (or `0` in count-only mode) successfully, with no error, against a vault of at least 10 000 notes in under 1 second.
- **SC-005**: Repeated calls with the same tag and stable vault state return byte-identical responses (deterministic ordering).
- **SC-006**: Count-only mode returns the integer count without the `paths` array, allowing branching logic without transferring potentially large arrays.
- **SC-007**: A note carrying a tag only inside a fenced code block is excluded from results (no false positives from code samples or documentation).
- **SC-008**: Tag input forms `foo`, `#foo`, and `  #foo  ` produce identical results.
- **SC-009**: Tag input with case variation against stored tags (`Foo` query vs `foo` stored, or vice versa) produces identical matches — wrapper applies ASCII lower-fold inside the eval JS template against both the input and every stored tag value. (Driver: live-probe F2 documented in research.md; upstream CLI is case-sensitive against Obsidian's case-PRESERVED metadataCache.getTags() keys.)
- **SC-010**: A note tagged with the same tag in multiple places (body twice + frontmatter) appears exactly once in `paths`.
- **SC-011**: An invalid input (empty, whitespace-only, malformed hierarchical segments, or longer than 200 characters post-trim/post-#-strip) is rejected before any vault scan with a structured `VALIDATION_ERROR`. Charset-invalid inputs (e.g. `foo bar`, `foo!`) bypass wrapper rejection and produce a natural `count=0` from the upstream.
- **SC-012**: A query against an unknown vault surfaces a structured error consistent with the project's vault-routing convention rather than a silent empty response.
- **SC-013**: Segment-boundary precision: a stored tag `foobar` is never returned for a query of `foo`; only stored tags `foo` or `foo/<descendant>` match.

## Assumptions

- The registered tool name is `tag` per ADR-010 single-word-verbatim-from-upstream (matches the upstream `obsidian tag` subcommand). Locked at plan-stage R15 / research.md F1. Source module lives at `src/tools/tag/`; factory function `createTagTool`.
- The project's existing vault-wide error envelopes and structured-error patterns apply unchanged; this BI introduces zero new top-level error codes (Constitution Principle IV; preserves the fourteen-tool zero-new-top-level-codes streak that continues through BI-028).
- The count-only flag uses the project-wide `total: true` convention adopted by BI-019, BI-023, BI-024, BI-025, BI-026, BI-027.
- Tag-storage semantics are inherited from the underlying note-store's pre-parsed metadata cache: fenced-code-block exclusion, frontmatter `tags:` ingestion, and body inline-tag detection are deferred to upstream rather than reimplemented in the wrapper.
- Case-equivalence is delivered by wrapper-side ASCII lower-fold inside the eval JS template (FR-008). Plan-stage live probe F2 contradicted the Q1 premise: Obsidian's in-memory `app.metadataCache.getTags()` returns case-PRESERVED keys (e.g. `["#alpha","#beta"]`), and the native `obsidian tag name=Alpha` returns `Error: Tag "#Alpha" not found.` against a vault carrying `#alpha`. Q1's explicit conditional fired, justifying the wrapper-side fold to restore the case-insensitive matching that Obsidian's own tag-pane UX shows the user. Unicode case-folding is out of scope at v1 — ASCII `String.prototype.toLowerCase()` only.
- Multi-vault routing: plan-stage live probe F4 confirmed `vault=<name>` routes correctly via the `eval` subcommand to the named vault's `app` instance (parity with BI-026 / BI-027 post-test findings). Multi-vault basename ambiguity remains an inherited limitation — collisions across registered vaults route to the first match per the project-wide convention.
- Result-path ordering is alphabetical ascending (byte order) for determinism; alternative orderings (source-order, frequency-of-occurrence, modify-time) are out of scope at v1.
- Surface is intentionally narrow at v1: no pagination, no path-prefix `folder=` filter, no combined `tag + property` filter, no multi-tag query. Each is a candidate for a sibling BI if demand emerges.
- Behavioural parity with Obsidian's own tag pane (which subsumes child tags when the parent is selected) is intentional — the tool is meant to match the user's mental model formed by the Obsidian UI.

## Out of scope

- Writing, renaming, or removing tags on notes (a write-side typed tool is a separate BI).
- Returning note content alongside paths (paths only).
- Combined-criteria filtering (tag + frontmatter property in one call).
- Vault-wide tag inventory listing all tags with counts (sibling BI — different output shape).
- Cross-vault tag queries (single vault per call by convention).
- Pagination, `limit`, or `offset` parameters at v1.
- Folder/path-prefix filter combined with tag query at v1.
- Multi-tag boolean queries (`AND` / `OR` over multiple tags) at v1.
- Returning per-note tag-occurrence counts or per-note tag-location metadata (line numbers, body-vs-frontmatter source) at v1.
