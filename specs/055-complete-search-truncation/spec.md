# Feature Specification: Complete Search Truncation

**Feature Branch**: `055-complete-search-truncation`
**Created**: 2026-05-28
**Status**: Draft
**Input**: User description: "Complete Search Truncation — `search` and `context_search` `limit` parameter returns the leading N entries of the deterministic path-ascending ordering across the FULL match set, not the leading N of an arbitrary upstream-clipped subset. `count` invariant and `truncated` flag-firing behaviour unchanged."

## Background

BI-0084 (shipped in v0.7.11) added a wrapper-side sort-then-slice reorder so that `search` and `context_search` would return their `limit`-bounded subset in path-ascending order rather than upstream's opaque order. That reorder is correct, but it operates on whatever subset upstream returns — and the wrapper today forwards the caller's `limit` to upstream. Upstream strictly honours `limit=N` by returning the leading N of its own (opaque, non-path-ascending) pre-sort, so the wrapper-side sort-then-slice receives a non-representative subset. Entries that would be the leading N under path-ascending order across the full match set may not be in the upstream-returned subset at all, so callers using `limit` for pagination or top-N receive the wrong subset.

This was confirmed empirically by the 2026-05-28 T0 upstream-order probe, archived at `specs/053-fix-search-truncation/.scratch/t0-upstream-order-probe-2026-05-28/FINDINGS.md`. The probe established that:

- Upstream's pre-sort is opaque and not path-ascending.
- Upstream strictly honours `limit=N` by returning the leading N of its own order.
- The wrapper currently forwards the caller's `limit` to upstream verbatim.

This feature closes the gap between the BI-0084 sort-then-slice reorder (necessary) and the published `limit` contract (sufficient) by ensuring the wrapper-side sort-then-slice operates on the full match set rather than an upstream-clipped subset.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - `search` returns the leading N of the full match set (Priority: P1)

An agent caller invoking `search` with a `query` and `limit: N` receives the N entries that would sort first under path-ascending order across every note that matches the query — regardless of how upstream internally orders results. Pagination and top-N usage become predictable: the caller knows that as `limit` grows from 2 to 3, the third entry is the next entry in the documented ordering, not an unrelated entry that upstream happened to include.

**Why this priority**: `search` is the primary text-search surface, the most likely tool to be used in paginated or top-N flows, and the surface where the contract drift is most visible to callers. Fixing `search` alone delivers immediate correctness for the most exercised path and is independently shippable from the `context_search` fix.

**Independent Test**: With a vault containing five notes whose names sort `body-1 < body-2 < body-3 < body-4 < body-5` under path-ascending order and a query matching all five, invoke `search` with `limit: 2` and verify the response contains exactly `body-1` and `body-2`. Repeat with `limit: 3` and verify the response contains exactly `body-1`, `body-2`, and `body-3`.

**Acceptance Scenarios**:

1. **Given** a vault containing five notes whose names sort `body-1 < body-2 < body-3 < body-4 < body-5` under path-ascending order, **When** the caller invokes `search` with a query matching all five notes and `limit: 2`, **Then** the response includes exactly `body-1` and `body-2` (and excludes `body-3`, `body-4`, and `body-5`).
2. **Given** the same vault and query with `limit: 2`, **When** the response is returned, **Then** `count` equals 2 and `truncated` is true.
3. **Given** the same vault and query with `limit: 3`, **When** the response is returned, **Then** the response includes exactly `body-1`, `body-2`, and `body-3` (and excludes `body-4` and `body-5`).
4. **Given** a vault whose total matching notes is less than or equal to `limit`, **When** the response is returned, **Then** every match appears in path-ascending order and no entry is dropped.

---

### User Story 2 - `context_search` returns the leading N of the full match set (Priority: P2)

An agent caller invoking `context_search` with a `query` and `limit: N` receives matches covering the N notes that would sort first under path-ascending order across every note that matches the query. The caller's mental model — "give me the leading N" — matches runtime behaviour, and pagination / top-N flows over `context_search` become predictable in the same way as over `search`.

**Why this priority**: `context_search` carries the same contract drift as `search` and the same fix shape. Treated as P2 because (a) `search` traffic dominates `context_search` traffic in typical agent usage and (b) the two handlers are independent code paths — `context_search` can land in the same change set as `search` or follow it, but does not block the `search` fix from being demonstrable.

**Independent Test**: With the same five-note vault (`body-1` … `body-5`) and a query matching all five, invoke `context_search` with `limit: 2` and verify the response's matches cover exactly `body-1` and `body-2`.

**Acceptance Scenarios**:

1. **Given** a vault containing five notes whose names sort `body-1 < body-2 < body-3 < body-4 < body-5` under path-ascending order, **When** the caller invokes `context_search` with a query matching all five notes and `limit: 2`, **Then** the response's matches cover exactly `body-1` and `body-2` (and exclude `body-3`, `body-4`, and `body-5`).
2. **Given** the same vault and query with `limit: 2`, **When** the response is returned, **Then** the match count equals 2 and `truncated` is true.
3. **Given** a vault whose total matching notes is less than or equal to `limit`, **When** the response is returned, **Then** every match appears in path-ascending order and no entry is dropped.

---

### User Story 3 - Help-doc truncation direction matches runtime (Priority: P3)

An MCP integrator reading the `search` and `context_search` help docs can run the documented call against the documented fixture and observe a response that matches the documented truncation-direction description verbatim. The integrator does not need to re-probe runtime behaviour empirically to discover what `limit` actually does.

**Why this priority**: Documentation drift caused by BI-0110's truncation-direction sections is the surface that signalled the contract gap externally. Treated as P3 because the user-visible runtime fix (P1 + P2) must land first — rewriting the docs against a runtime that still has the bug would re-introduce the same drift in the opposite direction. However, the docs MUST be rewritten in the same change set as the runtime fix; they cannot remain stale once the runtime moves.

**Independent Test**: After the P1 and P2 runtime fixes are in place, follow the truncation-direction description in each tool's help doc literally — provision the documented fixture, run the documented call, compare the response against the documented description. The response must match the description verbatim with no editorial gloss required.

**Acceptance Scenarios**:

1. **Given** a reader following the truncation-direction description in the `search` help doc, **When** they run the documented call against the documented fixture, **Then** the returned subset matches the documented description verbatim.
2. **Given** a reader following the truncation-direction description in the `context_search` help doc, **When** they run the documented call against the documented fixture, **Then** the returned subset matches the documented description verbatim.

---

### Edge Cases

- **Zero matches**: a query that matches no notes returns an empty result set with `count: 0` and `truncated: false`, regardless of `limit`. This behaviour is unchanged.
- **Total matches less than `limit`**: every match appears in path-ascending order; no entry is dropped. The `truncated` flag follows the existing rule (see "Preserved invariants" below).
- **Total matches exactly equals `limit`**: the response contains every match in path-ascending order; `truncated` is `true` per the existing conservative rule (preserved — see Out of Scope).
- **Two matches with identical sort keys**: path-ascending order is a total order over vault paths, so identical sort keys do not arise in practice; if they did, the existing tiebreak rule applies (unchanged by this feature).
- **Very large match set**: see Assumptions A3 and A4 — the wrapper obtains the full match set so the leading-N contract holds. Performance/scale of fetching the full set under common-term queries is a planning-phase concern, not a spec-phase scope question; the contract is "leading N of the full set" regardless of set size.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `search` MUST return the leading N entries of the deterministic path-ascending ordering across the full match set, where N is the caller's `limit`.
- **FR-002**: `context_search` MUST return matches covering the leading N entries of the deterministic path-ascending ordering across the full match set, where N is the caller's `limit`.
- **FR-003**: `search` and `context_search` MUST NOT delegate truncation to upstream — the caller's `limit` is enforced wrapper-side after the full match set has been obtained and sorted.
- **FR-004**: The `count` field MUST continue to equal the number of entries actually returned to the caller (existing invariant, preserved).
- **FR-005**: The `truncated` flag MUST continue to follow the existing conservative rule, including firing when the returned count equals `limit` even if no entries were actually dropped (existing behaviour, preserved — see Out of Scope).
- **FR-006**: The `search` help doc's truncation-direction description MUST match runtime behaviour after this feature lands. A reader running the documented call against the documented fixture MUST see a response matching the documented description verbatim.
- **FR-007**: The `context_search` help doc's truncation-direction description MUST match runtime behaviour after this feature lands, under the same verbatim-match criterion as FR-006.
- **FR-008**: The wrapper MUST NOT introduce any caller-facing parameter that exposes alternative orderings (no `sort`, `order`, or `direction` parameter on `search` or `context_search`).
- **FR-009**: Path-ascending ordering on `search` and `context_search` MUST be the same ordering applied by BI-0084's sort-then-slice reorder — no new ordering is defined by this feature.

### Preserved invariants

The following pre-existing behaviours are explicitly preserved and MUST NOT change as part of this feature:

- The `count` field equals the length of the returned results/matches array (FR-004).
- The `truncated` flag's conservative firing rule, including the count-equals-limit case (FR-005).
- The path-ascending ordering definition from BI-0084 (FR-009).
- The absence of any caller-facing sort/order/direction parameter (FR-008).

### Key Entities

- **Match set**: the complete set of vault notes (for `search`) or note-match records (for `context_search`) whose contents satisfy the caller's query criteria, before any truncation is applied.
- **Path-ascending ordering**: the deterministic total order over a match set defined by note path in ascending lexicographic order, as established by BI-0084.
- **Leading N**: the first N entries of an ordering, where N is the caller-supplied `limit`. If the match set contains fewer than N entries, the leading N is the entire match set.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Against the five-note fixture (`body-1` … `body-5`) with a query matching all five, `search` with `limit: 2` returns exactly `body-1` and `body-2` in 100% of runs.
- **SC-002**: Against the same fixture and query, `context_search` with `limit: 2` returns matches covering exactly `body-1` and `body-2` in 100% of runs.
- **SC-003**: An MCP integrator following the `search` help-doc truncation-direction description observes a response matching the description verbatim 100% of the time when the documented fixture is in place.
- **SC-004**: An MCP integrator following the `context_search` help-doc truncation-direction description observes a response matching the description verbatim 100% of the time when the documented fixture is in place.
- **SC-005**: Existing assertions on the `count` field and the `truncated` flag in `search` and `context_search` continue to pass without modification — the preserved-invariant set is non-regressing.
- **SC-006**: No new top-level error codes are introduced as part of this feature (Constitution Principle IV check: zero-new-codes streak preserved).

## Assumptions

- **A1**: BI-0084's path-ascending ordering remains the canonical truncation ordering for `search` and `context_search`. No new ordering is introduced by this feature.
- **A2**: The existing `truncated`-flag firing rule (conservative; fires when returned count equals `limit` even with no drop) remains in place.
- **A3**: The wrapper can obtain the full match set from upstream for typical caller queries. The exact mechanism (omit `limit` on the upstream call, pass a sentinel "unlimited" value, paginate, etc.) is a planning-phase decision, not a spec-phase one. If at plan time it emerges that upstream caps the achievable universe (e.g., a hard server-side maximum), that constraint will be surfaced and either accepted as a documented contract narrowing or addressed via paginated retrieval; either resolution is consistent with this spec's contract, which defines "leading N of the full match set" as the goal and treats any plan-time concession to upstream limits as a constraint to document at that phase.
- **A4**: Vault-scale performance of fetching and sorting the full match set under common-term queries is acceptable for the typical caller. If at plan time it emerges that common-term queries produce unmanageably large match sets, the planning artifact will propose either (a) a documented effective-universe cap (with the contract narrowed accordingly) or (b) a streaming/paged retrieval strategy. The spec-level contract remains "leading N of the full match set".
- **A5**: The BI-0110 help-doc truncation-direction sections currently describe a now-stale contract. They will be rewritten — not reverted — in the same change set as this feature lands, per the user's explicit scope statement.
- **A6**: Test execution against the five-note fixture follows the project's existing destructive-probe and test-vault protocol (see `.memory/test-execution-instructions.md`); no new fixture provisioning convention is introduced.

## Out of Scope

- Changing upstream's pre-sort order or requesting any upstream change. Upstream is a black box and the fix is wrapper-internal.
- Adding a caller-facing `sort` / `order` / `direction` parameter that exposes alternative orderings on `search` or `context_search`.
- Reverting BI-0084's sort-then-slice reorder. That reorder is correct and is a prerequisite for the leading-N contract this feature establishes.
- Reverting BI-0110's help-doc truncation-direction sections without rewriting them. Those sections describe a now-stale contract; they MUST be rewritten in the same change set as this feature lands, not removed without replacement.
- Changing the conservative `truncated: true` flag-firing rule, including the case where the flag fires when the match count equals `limit` with no actual drop.
- Limit-related semantics on sibling tools outside `search` and `context_search`. In particular:
  - `backlinks` already sorts before slicing per BI-0110 and is unaffected by this feature.
  - `smart_connections_*` cap-by-score behaviour is a distinct semantic and is unaffected.
- Introducing pagination cursors, offset/skip parameters, or any other new pagination mechanism on `search` or `context_search`. The leading-N contract is established; richer pagination is a separate feature.
