# Feature Specification: Add List Tags

**Feature Branch**: `068-add-list-tags`
**Created**: 2026-10-25
**Status**: Draft
**Input**: User description: "Add List Tags — A typed MCP tool that returns the vault's tag index (or a single file's tag set) with optional per-tag occurrence counts. Tool surface `tags`: inputs `target_mode` (specific | active), `vault`, `file`, `path`, `activeOnly`, `sortByCount`, `includeCounts`; at most one of `file` / `path` / `activeOnly`; outputs `{ total, tags: { name, count? }[] }`. Sixteen prioritised acceptance criteria (P1 1–13, P2 14–15, P3 16) plus adversarial edge cases across concurrency, content, limits, underlying-surface, client-class, and security. Out of scope: tag mutation, files-by-tag listing, cross-vault aggregation, hierarchical-tag rollup."

## Clarifications

### Session 2026-10-25

- Q: How should `target_mode` combine with the scope fields (`file` / `path` / `activeOnly`)? → A: **Option A — keep `target_mode`; active mode forbids only `vault`.** `file`, `path`, and `activeOnly` are each allowed in both modes, at most one at a time; none means vault-wide. In active mode a supplied `file` / `path` resolves inside the focused vault. In specific mode `activeOnly: true` means the focused note of the named vault, and fails with the no-focused-note error if that vault has none. Neither existing target-mode refinement fits: the standard per-file one forbids `file` / `path` in active mode and requires one of them in specific mode, and the folder-scoped one rejects `file` / `path` in both modes. So the rule is tool-local. It is recorded as the feature-specific **ADR-038**, written in the style of ADR-032 (Find And Replace File Scope via Sibling Locators). ADR-003 (Enforce Target Mode in Typed Tools) is left unamended.
- Q: In what form does `tags[].name` come back? → A: **Option A — strip one leading `#`; names come back bare (`project/alpha`) whatever the source (frontmatter or inline).** Rationale from the owner: the `tag` feature page (FEAT-018) treats the bare form as the canonical tag form. Its input contract trims the value and then strips one leading `#` (locked by TC-00273), and it treats frontmatter and inline tags alike through `metadataCache`. Bare names give `tags` one form whatever the source and make the FR-007 round trip into `tag` exact.
- Q: What sort order defines "alphabetical by name" (the default ordering and the tie-break under `sortByCount`)? → A: **Option A — the primary key is an ASCII lower-fold of the name, and ties break by UTF-8 byte order.** One comparator serves as the default order and breaks count ties under `sortByCount`. Non-ASCII characters are not folded; they compare by bytes. An AC 5 case-variant fixture locks it (`Aardvark, aardvark, Banana`). Rationale from the owner: this is the `properties` convention (feature page Q1/A1, TC-00197). On `properties` the tie-break can't be observed, because upstream merges case variants first. `tags` does not merge them (FR-008), so here the tie-break shows and must be tested. The ASCII-only fold matches the `tag` tool's lower-fold (FEAT-018, TC-00272).
- Q: When a tag exists only as part of a hierarchical tag (`#parent/child` with no bare `#parent` anywhere), must `parent` appear as its own entry? → A: **Option A — no synthesis.** `tags` lists exactly the tags the underlying index reports, and the wrapper invents no entry, count or rollup. ~~An implied-only parent is absent. "Both forms appear" holds when both forms are actually written in the vault. The help document says implied parents are not listed and stay reachable through the `tag` tool's segment-bounded child subsumption.~~ *(Struck sentences superseded by the plan-stage note below: the vault-wide scope does list implied parents, which upstream supplies. The no-synthesis decision stands.)* The hierarchical fixture asserts the upstream behaviour observed live at T0.
  - *Plan-stage note (2026-10-25, [research.md](./research.md) F9).* A live probe falsified the factual premise behind "an implied-only parent is absent". The **decision is unchanged**: the wrapper synthesises nothing and passes upstream through. The observed upstream behaviour differs by scope:
    - **Vault-wide**: upstream itself lists implied ancestors with rolled-up counts. `#solo/leaf` alone yields `solo` (1) and `solo/leaf` (1).
    - **File, path and focused-note scopes**: upstream lists only the tags actually written, with no ancestors.

    So the vault-wide listing does include implied parents (supplied by upstream, not the wrapper). The help document describes both behaviours.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover the vault-wide tag index with counts (Priority: P1)

An agent auditing tag quality, planning a tag rename, or exploring how a vault is organised asks for every tag in use across a named vault, together with how often each tag occurs. The agent receives a structured list — one entry per tag, each with its name and occurrence count — plus the number of tags returned, and can act on it directly without parsing plain text. Tag-shaped tokens that appear only inside fenced code blocks (for example a `#hashtag` in a code sample) are not part of the index. A vault with no tags at all returns an empty list, not an error.

**Why this priority**: This is the core value of the feature. Today an agent that wants the tag inventory must route through the generic escape hatch and parse plain-text lines itself, which is brittle and error-prone. With only this story shipped, the feature already replaces that parsing with a typed, count-bearing result for the most common question ("what tags are in use, and how often?").

**Independent Test**: Stand up a fixture vault containing notes with inline tags, frontmatter `tags:` lists, hierarchical tags, and a fenced code block holding a tag-shaped token that appears nowhere else. Request the vault-wide index and verify every real tag appears with its count, the code-block-only token does not appear, and `total` equals the number of entries. Separately, request the index for a vault with no tags and verify `{ total: 0, tags: [] }`.

**Acceptance Scenarios**:

1. **Given** a named vault containing tagged notes, **When** the caller requests the tag index in specific mode with no file, path, or active-file scoping, **Then** the response lists every tag in the vault's index, each with its occurrence count, and `total` equals the number of entries. *(AC 1)*
2. **Given** a vault whose only occurrence of a tag-shaped token is inside a fenced code block, **When** the caller requests the vault-wide index, **Then** that token does not appear in the result and contributes to no count. *(AC 8)*
3. **Given** a vault that contains no tags, **When** the caller requests the vault-wide index, **Then** the response is `{ total: 0, tags: [] }` and no error is raised. *(AC 7)*
4. **Given** a vault with tags in both frontmatter `tags:` lists and inline `#tag` markers, **When** the caller requests the vault-wide index, **Then** tags from both sources appear in the result.
5. **Given** a vault containing tags whose names resemble Obsidian built-in or reserved patterns, **When** the caller requests the index, **Then** those tags are returned exactly like user-defined tags, with no special casing. *(AC 16)*
6. **Given** active target mode with no vault supplied, **When** the caller requests the vault-wide index, **Then** the result reflects the vault Obsidian currently has focused.

---

### User Story 2 - List the tags of a single note (Priority: P1)

An agent working on one note asks which tags that note carries — naming the note by its link-style name, by its vault-relative path, or by asking for whichever note Obsidian's editor currently has focused. The response contains only that note's tags, in the same structured shape as the vault-wide index. When the caller asks for the focused note but no note is focused, the caller receives a clear, structured error telling them to focus a note or name one explicitly.

**Why this priority**: Per-note tag inspection is the second half of the inventory question and is required for tag clean-up work on individual notes. It shares the output shape with Story 1, so callers learn one contract for both scopes.

**Independent Test**: In a fixture vault, request the tags of a known note by name, then by vault-relative path, and verify both return exactly that note's tags and nothing from other notes. Focus a note in Obsidian and request the focused note's tags; verify the result. Close all notes and repeat; verify the structured no-focused-note error.

**Acceptance Scenarios**:

1. **Given** a vault where several notes carry different tags, **When** the caller scopes the request to one note by name, **Then** the response contains only that note's tags. *(AC 2)*
2. **Given** the same vault, **When** the caller scopes the request to the same note by vault-relative path, **Then** the response is identical to the by-name result. *(AC 3)*
3. **Given** a note is focused in Obsidian's editor, **When** the caller requests the focused note's tags, **Then** the response contains only that note's tags. *(AC 4)*
4. **Given** no note is focused, **When** the caller requests the focused note's tags, **Then** the call fails with a structured error that directs the caller to focus a note or switch to naming the note by file or path. *(AC 13)*
5. **Given** a named note that exists but carries no tags, **When** the caller scopes the request to it, **Then** the response is `{ total: 0, tags: [] }` and no error is raised.
6. **Given** a named note or path that does not exist in the vault, **When** the caller scopes the request to it, **Then** the call fails with a structured not-found error rather than returning an empty list.

---

### User Story 3 - Shape the result: ordering and counts on or off (Priority: P1)

An agent chooses how the list comes back: alphabetically by tag name (the default) or most-used first, and with per-tag counts (the default) or names only when counts are not needed and a smaller response is preferred.

**Why this priority**: "Most-used first" is the shape a tag audit actually wants, and names-only is the economical shape for rename planning and autocomplete-style use. Both are part of the must-ship contract.

**Independent Test**: Against a fixture vault with tags of distinct and tied frequencies, request the index with default options, with count ordering, and with counts switched off; verify the ordering and the presence or absence of the count field in each response.

**Acceptance Scenarios**:

1. **Given** a vault with tags of differing frequencies, **When** the caller requests the index with no ordering option, **Then** entries are ordered alphabetically by tag name: ASCII case-insensitive first, then UTF-8 byte order for case variants. A note-scoped fixture whose note carries `Banana`, `aardvark`, `Aardvark` returns `Aardvark, aardvark, Banana`. The fixture is note-scoped because the vault-wide scope merges case variants upstream (research F8). *(AC 5)*
2. **Given** the same vault, **When** the caller requests count ordering, **Then** entries are ordered by count descending, and entries with equal counts are ordered by the same name comparator. *(AC 5)*
3. **Given** any scope, **When** the caller switches counts off, **Then** every entry carries a name and no entry carries a count field. *(AC 6)*
4. **Given** counts switched off and count ordering requested together, **When** the call is made, **Then** the entries are still ordered by count descending even though counts are not returned.

---

### User Story 4 - Malformed requests are rejected before touching the vault (Priority: P1)

An agent that sends a malformed request — two scopes at once, a missing vault in specific mode, a vault in active mode, an unknown field, or a path that tries to escape the vault — receives an immediate, structured validation error naming the offending fields, and no call is made to Obsidian.

**Why this priority**: Validation at the boundary is a project-wide non-negotiable and protects callers from silently wrong results (for example, an unknown field being ignored and a vault-wide listing returned when a scoped one was intended).

**Independent Test**: Issue each malformed request with the underlying CLI replaced by a recorder; verify each fails with a structured validation error naming the offending field(s) and that the recorder saw zero invocations.

**Acceptance Scenarios**:

1. **Given** any two (or all three) of file, path, and active-file scoping supplied together, **When** the call is made, **Then** it fails validation and no underlying call occurs. *(AC 9)*
2. **Given** specific mode with no vault, **When** the call is made, **Then** it fails validation naming the missing vault. *(AC 10)*
3. **Given** an input containing a top-level key the contract does not define, **When** the call is made, **Then** it fails validation naming the unknown key and no underlying call occurs. *(AC 11)*
4. **Given** active mode with a vault supplied, **When** the call is made, **Then** it fails validation naming the vault field. *(AC 12)*
5. **Given** a path that is absolute or contains a parent-directory traversal segment, **When** the call is made, **Then** it fails validation and no underlying call occurs.

---

### User Story 5 - Self-serve documentation through the help facility (Priority: P2)

An agent unfamiliar with the tool asks the project's progressive-disclosure help facility about `tags` and receives full documentation: every input field with its constraints, the output shape, the complete error roster, the documented edge-case behaviours, and at least four worked examples (vault-wide; file-scoped; count-ordered; focused-note).

**Why this priority**: Documentation makes the tool discoverable and correctly usable without trial and error, but the tool is functional without it.

**Independent Test**: Request help for `tags` and verify the returned document contains each required section and the four named examples, and that the help catalogue lists `tags`.

**Acceptance Scenarios**:

1. **Given** the tool ships, **When** the caller requests help for `tags`, **Then** the response provides the per-field input contract, output shape, error roster, and at least four worked examples covering vault-wide, file-scoped, count-ordered, and focused-note use. *(AC 14)*
2. **Given** the help catalogue is requested, **When** it is returned, **Then** it lists `tags` with a one-line description that distinguishes it from the existing single-tag lookup tool `tag`.

---

### Edge Cases

**Concurrency**

- Notes may be added, removed, or have their tags edited while a listing is produced. The result reflects whatever the underlying tag index contained at the moment it was read; edits Obsidian has not yet indexed are not visible. The tool documentation states this staleness window and that the tool performs no retry or reconciliation.

**Content**

- Tag-shaped tokens inside fenced code blocks do not appear and do not contribute to counts (AC 8). This is inherited from the underlying tag index, which excludes code blocks natively; it closes a fidelity gap that text-search-based approaches have. Behaviour for tag-shaped tokens inside inline code spans is captured against a fixture and documented.
- Tags containing non-ASCII or non-Latin characters (accented Latin, Cyrillic, CJK, emoji) are captured against a fixture: whether the underlying index treats them the same as ASCII tags is recorded and documented. The wrapper does not filter or rewrite them. *(Plan-stage probe, research F6: `#café` and `#日本語` are listed and counted like ASCII tags.)*
- Hierarchical tags (`#parent/child`): exactly the entries the underlying index reports are returned, and the wrapper synthesises, rolls up or splits nothing. The observed upstream behaviour (plan-stage probe, research F9) differs by scope:
  - **Vault-wide**: upstream lists every ancestor of a written hierarchical tag, including implied-only ones, and an ancestor's count includes its descendants' occurrences.
  - **Per-note scopes**: upstream lists only the tags written in that note.

  Both behaviours are documented, along with the pointer to `tag` for querying a parent across notes.
- Case variants of the same tag (`#Project` vs `#project`): whether the underlying index merges or separates them is captured and documented; the wrapper does not merge or split entries. *(Plan-stage probe, research F8: the vault-wide scope merges them into one entry under the first-encountered casing, and per-note scopes keep them separate. So the Q3 byte-order tie-break can only be observed in per-note scopes.)*
- Tags in frontmatter `tags:` lists and inline `#tag` markers both surface in the index by default.
- The meaning of a count (total occurrences versus number of notes carrying the tag) is whatever the underlying index reports; the observed meaning is captured against a fixture and documented, including any difference from the count reported by the existing `tag` tool. *(Plan-stage probe, research F7: a count is the total number of occurrences, inline and frontmatter alike, with no per-note de-duplication. The `tag` tool's `count` is the number of distinct notes.)*
- A named note that exists but has no tags returns an empty list; a named note that does not exist returns a structured not-found error. The two are never conflated.

**Limits**

- A vault with thousands of unique tags: the project's existing per-call response-size cap applies. If the underlying response exceeds the cap, the call fails with the existing structured output-too-large error — never a silently truncated list. The documentation states the practical ceiling, meaning the approximate number of unique tags that fit under the cap, measured against a generated fixture. It recommends `file` / `path` scoping as the mitigation. *(Plan-stage note, research R2/R11: names-only mode does not raise the ceiling, because counts are always fetched so that count ordering works.)*

**Underlying surface**

- An unknown vault display name may produce an underlying response that the bridge's generic classifier does not treat as an error (for example, an empty or plain-text reply). The tool MUST detect this case explicitly and fail with a structured error naming the vault; it MUST NOT return `{ total: 0, tags: [] }` for a vault that does not exist.
- An underlying response that cannot be interpreted as a tag list fails with a structured error carrying the raw response context, not an empty result.

**Client class**

- Rejection of unknown top-level keys (AC 11) is directly observable only from MCP clients that forward unknown keys to the server. Clients that pre-validate against the published input schema reject the call client-side before it reaches the server. The regression test for AC 11 exercises the server-side pathway directly and documents both pathways.

**Security**

- `vault`, `file`, and `path` are caller-supplied. A `path` that is absolute or contains a parent-directory traversal segment is rejected at the validation boundary before any underlying call. Values are passed to the underlying layer as discrete arguments, never interpolated into executable text.

**Targeting**

- Active-file scoping in specific mode is resolved by the underlying surface's vault routing. The expectation is the note focused in the named vault, and the behaviour observed at T0 (quickstart L-9) is documented in the help document. If no focused note is found, the same structured no-focused-note error as AC 13 is raised. If T0 cannot reproduce the case (for example, only one vault is open), the documentation says it was not verified rather than asserting the behaviour.
- File or path scoping in active mode resolves the named note within the focused vault.

## Requirements *(mandatory)*

### Functional Requirements

**Surface and targeting**

- **FR-001**: The system MUST expose a typed tool named `tags` (mirroring the underlying CLI subcommand name) that returns a tag index for a vault or for a single note.
- **FR-002**: The tool MUST require a `target_mode` of `specific` or `active`. In specific mode `vault` MUST be supplied; in active mode `vault` MUST NOT be supplied and the focused vault is used. `vault` is the only field whose presence depends on the target mode.
- **FR-003**: The tool MUST accept optional scoping by `file` (link-style note name), `path` (vault-relative path with extension), or `activeOnly: true` (the note focused in the editor). At most one of the three MAY be supplied; supplying none yields the vault-wide index. All three are permitted in both target modes. In active mode, `file` / `path` resolve inside the focused vault. In specific mode, `activeOnly: true` is passed to the underlying surface together with the named vault. Which note it resolves to (expected: the named vault's focused note) is the underlying surface's vault routing. The wrapper does not reshape it. The behaviour observed at T0 is documented, and a missing focused note always surfaces as the FR-014 error (ADR-038, Consequences / Neutral).
- **FR-003a**: The scope rule in FR-002 / FR-003 is tool-local. It does not reuse or modify the shared target-mode refinements, and it is recorded as the feature-specific ADR-038. ADR-003 is not amended.
- **FR-004**: The tool MUST accept an optional `sortByCount` flag (default `false`). Both orderings use one name comparator: the primary key is the name with ASCII `A`–`Z` lower-folded (non-ASCII characters are not folded), and ties break by UTF-8 byte order of the unmodified name. When `false`, entries are ordered by that comparator alone (for example `Aardvark, aardvark, Banana`). When `true`, entries are ordered by count descending, with equal counts ordered by the same comparator. The order is fully deterministic: no two distinct names compare equal.
- **FR-005**: The tool MUST accept an optional `includeCounts` flag (default `true`). When `false`, no entry carries a `count` field. Ordering per FR-004 still applies.

**Output**

- **FR-006**: The tool MUST return `{ total, tags }`, where `tags` is an array of `{ name, count? }` entries and `total` equals the number of entries in `tags`.
- **FR-007**: Tag names MUST be returned in the bare canonical form: exactly one leading `#` stripped, no other rewriting (for example `project/alpha`, never `#project/alpha`). The form is the same across all scopes, both target modes, and both tag sources (frontmatter `tags:` lists and inline markers). Any `name` from this tool, passed unchanged to the existing `tag` tool, MUST resolve to that same tag.
- **FR-008**: Counts and tag membership MUST reflect the underlying tag index without wrapper-side reshaping: no hierarchical rollup, no synthesised entries for implied-only parent tags, no case merging, no special casing of built-in-looking tags, no filtering of non-ASCII names.
- **FR-009**: Tag-shaped tokens inside fenced code blocks MUST NOT appear in the result or contribute to any count.
- **FR-010**: A vault or note with no tags MUST return `{ total: 0, tags: [] }` without error.

**Validation (all before any underlying call)**

- **FR-011**: The tool MUST reject, with a structured validation error naming the offending field paths and without invoking the underlying CLI: more than one of `file` / `path` / `activeOnly`; specific mode without `vault`; active mode with `vault`; any unknown top-level key; wrong field types.
- **FR-012**: The tool MUST reject a `path` that is absolute or contains a parent-directory traversal segment at the validation boundary, without invoking the underlying CLI.
- **FR-013**: The input contract MUST be defined once and serve as the single source of truth for the published input shape, runtime validation, and downstream types.

**Errors**

- **FR-014**: When `activeOnly` is `true` and no note is focused, the tool MUST fail with the project's existing no-focused-note error code. Its original cause and details are preserved, and its message is tool-specific: it directs the caller to focus a note or use `file` / `path` (research R9).
- **FR-015**: When the named vault does not exist or is not reachable, the tool MUST fail with a structured error identifying the vault, even if the underlying surface's reply would not otherwise be classified as an error.
- **FR-016**: When a named `file` or `path` does not resolve to a note, the tool MUST fail with a structured not-found error, distinct from the empty-result case.
- **FR-017**: All failures MUST surface through the project's existing structured error type and existing top-level error codes; no new top-level error code is introduced. Any finer distinction uses the existing sub-discriminator convention.
- **FR-018**: When the underlying response exceeds the per-call response-size cap, the tool MUST fail with the existing output-too-large error and MUST NOT return a truncated list.

**Documentation and tests**

- **FR-019**: The tool's help document MUST provide the full per-field input contract, output shape, error roster, documented edge-case behaviours (staleness window, hierarchical tags, case variants, non-ASCII tags, count meaning, practical size ceiling, client-class pathways), and at least four worked examples: vault-wide, file-scoped, count-ordered, and focused-note. The help catalogue MUST list the tool.
- **FR-020**: Every acceptance criterion (AC 1–16) MUST be locked by at least one regression test that passes unchanged on re-run; each test MUST name the criterion it locks.
- **FR-021**: The tool MUST ship with at least one happy-path test and at least one failure-or-boundary test co-located with its source, and every new source file MUST carry the project's attribution or original-contribution header.

### Key Entities

- **Tag listing request**: target mode, optional vault, at most one scope (file, path, or focused note), ordering choice, counts on/off.
- **Tag entry**: a tag name in the bare canonical form (no leading `#`), and — when counts are on — the occurrence count reported by the underlying index for the requested scope.
- **Tag listing result**: the ordered list of tag entries plus `total`, the number of entries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent obtains a vault's full tag inventory with counts in a single call, with zero text parsing on the agent's side.
- **SC-002**: 100% of the sixteen acceptance criteria are covered by named regression tests, and the full suite passes on two consecutive runs with no test changes.
- **SC-003**: 100% of malformed requests in the validation roster (two-scope combinations, missing vault, vault in active mode, unknown key, traversal path) are rejected with zero calls reaching Obsidian.
- **SC-004**: On a fixture with a tag-shaped token present only inside a fenced code block, the token appears in 0% of results across all scopes.
- **SC-005**: An unknown vault name produces a structured error in 100% of attempts and never an empty-list success.
- **SC-006**: For a vault with at least 1,000 unique tags, the vault-wide listing completes successfully. The average response size per unique tag is measured on that fixture, and the documented practical ceiling equals the response-size cap divided by that measured per-tag size, within 10%. The ceiling is derived from the measurement, not observed directly, and the documentation states this.
- **SC-007**: An agent with no prior knowledge of the tool can form a correct call for each of the four documented scenarios using only the help document.

## Assumptions

- **Tool name**: `tags`, mirroring the underlying `obsidian tags` subcommand per the project's typed-tool naming convention (ADR-010). It sits beside the existing `tag` tool, which answers "which notes carry tag X"; the two are complementary.
- **Underlying surface**: the underlying CLI's tag-listing subcommand already supports file, path, focused-note scoping, counts, count ordering, and structured output; the tool is a typed wrapper over it rather than a reimplementation. Fenced-code-block exclusion is inherited from it.
- **Tag name form** (settled in Clarifications, 2026-10-25): names are returned bare, with one leading `#` stripped. This is the canonical form of the `tag` feature (FEAT-018, TC-00273); see FR-007.
- **Name ordering** (settled in Clarifications, 2026-10-25): the primary key is an ASCII lower-fold, and ties break by UTF-8 byte order. This follows the `properties` convention (TC-00197) and the `tag` tool's ASCII-only fold (TC-00272); see FR-004.
- **Target-mode semantics** (settled in Clarifications, 2026-10-25): active mode forbids only `vault`, and scoping fields remain available in both modes. This differs from both shared target-mode refinements, so it is a tool-local rule recorded as ADR-038 (ADR-032 style). ADR-003 is unamended.
- **Defaults**: `activeOnly` defaults to `false`, `sortByCount` to `false`, `includeCounts` to `true`.
- **Help document**: there is currently no `tags` document in the help facility. The "placeholder stub" named in the feature description is treated as absent; a full document is created.
- **Test vault**: live characterisation (code-block exclusion, non-ASCII tags, hierarchical tags, case variants, count meaning, size ceiling, unknown-vault reply) runs against the project's authorised test vault under the existing test-execution protocol.
- **Out of scope**: tag mutation (rename, add, remove); files-by-tag listing (covered by the existing `tag` tool); cross-vault aggregation (callers iterate per vault); hierarchical-tag rollup; pagination or limit/offset; folder-prefix filtering.
