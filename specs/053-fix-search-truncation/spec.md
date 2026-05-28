# Feature Specification: Fix Search Truncation

**Feature Branch**: `053-fix-search-truncation`
**Created**: 2026-05-27
**Status**: Draft
**Input**: User description: "Fix Search Truncation — the `search` and `context_search` tools' `limit` parameter must return the first N entries of the deterministic result ordering (leading N), not the last N (trailing N). The `count` invariant and the `truncated` flag-firing behaviour remain unchanged."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - `search` returns the leading N (Priority: P1)

An agent caller invokes the `search` tool with a `limit` argument expecting pagination / top-N semantics — the first N entries of the tool's deterministic result ordering. Today the tool drops the leading entries and returns the trailing N, contradicting the documented behaviour. This story restores the expected leading-N semantics so callers can rely on `limit` for predictable top-N usage.

**Why this priority**: `search` is the primary content-discovery surface on the MCP server. Callers that rely on `limit` for pagination or top-N retrieval currently receive the *wrong* subset, which silently corrupts downstream agent reasoning. Fixing the leading-edge truncation direction restores trust in the most-used search entry point and is independently shippable.

**Independent Test**: Run the `search` tool against a fixture vault containing five matching notes whose names sort `body-1 < body-2 < body-3 < body-4 < body-5` under the deterministic ordering with `limit: 2`. The returned entries must be `body-1` and `body-2`, the returned `count` must equal 2, and `truncated` must be true. No other tool needs to change for this story to demonstrate value.

**Acceptance Scenarios**:

1. **Given** a vault containing five notes whose names sort `body-1 < body-2 < body-3 < body-4 < body-5` under the deterministic ordering, **When** the caller invokes `search` with a query matching all five notes and `limit: 2`, **Then** the response includes `body-1` and `body-2` (and excludes `body-4` and `body-5`).
2. **Given** the same vault and query with `limit: 2`, **When** the response is returned, **Then** the returned `count` equals 2 and `truncated` is true.
3. **Given** a vault whose total matching notes is less than or equal to `limit`, **When** the response is returned, **Then** every match appears in deterministic order and no entry is dropped.

---

### User Story 2 - `context_search` returns the leading N (Priority: P1)

An agent caller invokes the `context_search` tool with a `limit` argument expecting the first N matches of the tool's deterministic ordering, paired with their surrounding context. Today the tool drops the leading matches and returns the trailing N, which both surprises callers and prevents stable pagination over context-rich result sets.

**Why this priority**: `context_search` is the partner surface to `search` and shares the same `limit` contract from the caller's perspective. Fixing one tool without the other would leave a confusing asymmetry across the search cohort, so this story ships in lockstep with Story 1. It is independently testable: a fixture vault and a query that matches five notes is sufficient to demonstrate the corrected truncation direction without exercising any other tool.

**Independent Test**: Run the `context_search` tool against a fixture vault containing five matching notes whose names sort `body-1 < body-2 < body-3 < body-4 < body-5` under the deterministic ordering with `limit: 2`. The returned matches must cover `body-1` and `body-2`, the match count must equal 2, and `truncated` must be true.

**Acceptance Scenarios**:

1. **Given** a vault containing five notes whose names sort `body-1 < body-2 < body-3 < body-4 < body-5` under the deterministic ordering, **When** the caller invokes `context_search` with a query matching all five notes and `limit: 2`, **Then** the returned matches cover `body-1` and `body-2` (and exclude `body-4` and `body-5`).
2. **Given** the same vault and query with `limit: 2`, **When** the response is returned, **Then** the match count equals 2 and `truncated` is true.
3. **Given** a vault whose total matching notes is less than or equal to `limit`, **When** the response is returned, **Then** every match appears in deterministic order and no entry is dropped.

---

### User Story 3 - Help-doc examples match runtime (Priority: P2)

An MCP integrator reads the worked example in either tool's help doc and runs the documented call against the documented fixture. Today the help docs already describe leading-N truncation while the runtime ships trailing-N, so the example output the integrator sees does not match the doc. This story is the doc-side completion of the contract change: after Stories 1 and 2 land, the runtime output and the documented output coincide.

**Why this priority**: Help-doc trust is the long-tail integrator pain. The functional bug in Stories 1 and 2 is what affects callers in real-time; this story is the durable correctness check that the docs and runtime now agree. It is P2 because it is satisfied as a derived consequence once Stories 1 and 2 land — the worked examples in the existing help docs already match the leading-N behaviour described in those stories.

**Independent Test**: Reproduce the worked example in `search`'s help doc and in `context_search`'s help doc against their documented fixtures. The returned subset must match the documented output without any spec-side edits to the worked examples.

**Acceptance Scenarios**:

1. **Given** a reader following the worked example in the `search` help doc, **When** they run the documented call against the documented fixture, **Then** the returned subset matches the doc.
2. **Given** a reader following the worked example in the `context_search` help doc, **When** they run the documented call against the documented fixture, **Then** the returned subset matches the doc.

---

### Edge Cases

- **Match count strictly less than `limit`**: Every match is returned in deterministic order and `truncated` is false. No entries are dropped.
- **Match count exactly equal to `limit`**: Every match is returned in deterministic order. Per the existing conservative flag-firing rule, `truncated` remains true in this case (the rule is explicitly out of scope to change). The set of returned entries is identical to the leading-N slice; only the boolean differs from the strictly-less case.
- **Match count exactly one greater than `limit`**: The leading `limit` entries are returned. The single dropped entry is the trailing-most under the deterministic ordering.
- **Empty result set**: An empty match set is returned with `count` of 0 and `truncated` false. The truncation direction has no observable effect.
- **`limit` parameter omitted**: Behaviour is governed by whatever default the tool already applies. This feature does not change the default value, only the direction in which truncation occurs when truncation does occur.
- **Ties under the deterministic ordering**: The deterministic ordering is itself out of scope to change. Whatever tiebreaker the existing ordering applies continues to apply; this feature only changes which edge (leading vs. trailing) is preserved when the ordered list is truncated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `search` tool MUST, when a `limit` argument is supplied and the underlying match set exceeds `limit`, return the leading `limit` entries of the tool's deterministic result ordering and drop the trailing entries.
- **FR-002**: The `context_search` tool MUST, when a `limit` argument is supplied and the underlying match set exceeds `limit`, return the leading `limit` matches of the tool's deterministic result ordering and drop the trailing matches.
- **FR-003**: Both tools MUST preserve the deterministic result ordering of returned entries — the order in which entries appear in the response MUST match the order they occupy in the underlying deterministic sort.
- **FR-004**: Both tools MUST preserve the existing `count` invariant — the `count` field MUST equal the number of entries actually returned in the response after truncation.
- **FR-005**: Both tools MUST preserve the existing `truncated` flag-firing rule unchanged — including the conservative case where the flag fires when the returned count equals `limit` with no actual entry dropped. This feature changes only which entries are kept when truncation occurs, not when the flag fires.
- **FR-006**: When the underlying match set is empty, both tools MUST return an empty result with `count` of 0 and `truncated` false. The truncation direction MUST have no observable effect in this case.
- **FR-007**: When the underlying match set size is less than or equal to `limit`, both tools MUST return every match in deterministic order with no entry dropped (the `truncated` value in the boundary `equal-to-limit` case continues to be governed by FR-005).
- **FR-008**: The worked example outputs in the `search` and `context_search` help docs MUST match the runtime output after this feature lands, against the fixture each example documents. Spec-side edits to the worked-example text are out of scope; the docs already describe leading-N behaviour.

### Key Entities

- **`search` result set**: The ordered list of notes the `search` tool matches for a given query under its existing deterministic ordering. Attributes relevant to this feature: the ordering itself (out of scope to change) and the `limit`-driven truncation point (in scope).
- **`context_search` result set**: The ordered list of context-rich matches the `context_search` tool produces for a given query under its existing deterministic ordering. Attributes relevant to this feature: the ordering itself (out of scope to change), the `limit`-driven truncation point (in scope), and the match-count value returned to the caller.
- **`truncated` flag**: A boolean value on the response indicating whether truncation may have occurred. Its firing rule (including the conservative `equal-to-limit` case) is out of scope to change; this feature only changes the direction in which the dropped entries are selected.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For both `search` and `context_search`, when invoked with `limit: N` against a fixture vault whose deterministic ordering produces at least `N + 1` matches, the returned entries are exactly the first `N` entries of that ordering, with zero entries from positions `N + 1` onward.
- **SC-002**: When the fixture's match count is less than or equal to `N`, every match is returned in deterministic order with no entry dropped, for both tools.
- **SC-003**: The worked-example output in each tool's help doc matches the runtime output verbatim when the documented call is run against the documented fixture, with no spec-side edit to the worked-example text required.
- **SC-004**: After this feature lands, the `count` field on every truncated response equals the number of entries returned, and the `truncated` flag fires under exactly the same conditions it does today — confirming this feature changed only the truncation direction, nothing else.

## Assumptions

- The deterministic result ordering used by `search` and `context_search` is sufficiently stable that "leading N" and "trailing N" are well-defined under it. Investigating or changing that ordering is out of scope.
- The worked examples in the existing `search` and `context_search` help docs already describe leading-N truncation, so this feature's expected output for SC-003 is whatever those examples already say. If post-implementation inspection reveals the worked examples do not in fact describe leading-N, the help docs are corrected in a separate change rather than as part of this feature.
- The fixture-vault note-naming scheme `body-1 < body-2 < body-3 < body-4 < body-5` is illustrative of the deterministic ordering's leading edge. Tests realising the acceptance scenarios may use any fixture whose ordering produces a comparable leading/trailing split; the specific names are not load-bearing.
- The `truncated` flag-firing behaviour, including the conservative case where the flag fires when the returned count equals `limit` with no actual drop, is explicitly preserved. The flag's semantics are documented elsewhere and are out of scope to revisit here.
- No new caller-facing parameter (e.g. `sort`, `order`, `direction`) is added by this feature. The truncation direction is fixed at leading-N for both tools.
- Sibling tools outside the `search` / `context_search` pair (notably the `smart_connections_*` family, which caps by score) are out of scope. Their limit-related semantics remain whatever they are today; any divergence between them and the search cohort is documented behaviour, not a defect this feature addresses.
- The upstream Obsidian Integrated CLI's own result ordering is treated as a black box. This feature is wrapper-internal — the truncation direction is corrected on the wrapper side without requesting any upstream change.
