# Feature Specification: Stabilise query ordering

**Feature Branch**: `085-stabilise-query-ordering`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Stabilise query ordering — when an agent runs a semantic query with a result limit, the results returned are always the first results of the full documented ordering, so a smaller limit always returns a leading slice of what a larger limit returns. Semantic query results are documented as ordered by relevance, with ties broken by note path. Today the result limit is applied before ties are broken, so when two notes score equally, asking for one result can return a different top note than asking for several. Out of scope: changing how relevance is scored or the score values; changing the default or maximum limit; the similar-notes capability (separate tool; verify separately if it shares the same ordering step)."

## Context

`smart_connections_query` is the semantic-search tool: an agent sends a free-text question and gets back the vault blocks nearest to it, each with a `path`, a `headingPath` and a relevance `score`. `smart_connections_similar` is its sibling: the agent names a source note and gets back the blocks most similar to it, in the same match shape. Both tools accept `limit` (1..100, default 20) to cap how many matches come back.

Each tool's published description and help reference (`docs/tools/smart_connections_query.md`, `docs/tools/smart_connections_similar.md`) promises one ordering: `score` descending, then `path` ascending, then `headingPath` ascending.

Both tools apply that ordering only to the matches the Smart Connections plugin has already handed back, and both ask the plugin for exactly `limit` matches: `smart_connections_query` through the plugin's lookup, `smart_connections_similar` through its connection finder. The plugin makes its own cut first. When two blocks have the same score and the cut falls between them, the plugin, not the documented tie-break, decides which one survives. So:

- a call with `limit: 1` can return block B as "the best match", while the same call with `limit: 2` returns A first and B second;
- the set of results an agent sees depends on the limit it chose, not only on the query or source note.

An agent that takes "the top match" therefore gets answers that disagree with each other. The returned page is still sorted correctly; what is wrong is which items make it onto the page.

## Clarifications

### Session 2026-11-02

- Q: How many candidate matches should `smart_connections_query` ask the Smart Connections plugin for on each call, now that the request must no longer depend on the agent's `limit`? → A: Option A. Always ask the plugin for 100 candidates, the maximum `limit`, whatever limit the agent sent. Sort them in the documented order, then cut to the agent's `limit`. Equal-score matches that fall exactly at the plugin's 100th place are ranked by the plugin, and the help reference documents this. Rationale: one fixed, fully sorted 100-candidate list makes every allowed limit (1..100) a leading slice of it, and puts equal-score results in tie-break order whatever the limit. The out-of-scope rule on the default and maximum limit keeps 100 as the ceiling. FEAT-015 confirms that the plugin's lookup is called with `filter:{limit}`, so that cut is what has to stop depending on the agent's limit.
- Q (analysis remediation): `smart_connections_similar` was listed as out of scope, "verify separately if it shares the same ordering step". The plan's research (F5) confirmed that it does: it passes the agent's `limit` to the plugin's connection finder, then sorts and slices. Should it be fixed in this feature? → A: Yes. BI-0167's out-of-scope note says to fix it together if it shares the same slice-before-sort step, and it does. The same Option A decision applies to it: always ask the connection finder for 100 candidates, then sort, then cut to `limit`. Self-exclusion of the source note is unchanged. Scoring, the default limit and the maximum limit stay unchanged for both tools.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A smaller limit returns a leading slice of a larger one (Priority: P1)

An agent runs the same semantic query, or asks for notes similar to the same source note, twice: once with a small limit and once with a larger one. The small-limit results are exactly the first results of the large-limit call, in the same order. "The top match" is the same whichever limit the agent uses.

**Why this priority**: This is the defect. Agents routinely ask for `limit: 1` to get the single best note and act on it. If that answer can differ from the head of a longer list, every downstream decision built on "the best match" is unreliable.

**Independent Test**: Use a vault, or a stubbed plugin answer, in which two blocks from different notes have exactly the same score and are the two highest-scoring blocks. Call `smart_connections_query` with `limit: 1`, then with `limit: 2`. Confirm the single result of the first call equals the first result of the second call. Repeat with other limit pairs N < M and confirm the N results equal the first N of the M results. Do the same for `smart_connections_similar` with one source note.

**Acceptance Scenarios**:

1. **Given** a query whose two best results come from two notes with exactly the same score, **When** the agent runs it with `limit: 1` and again with `limit: 2`, **Then** the single result of the first call is the first result of the second call.
2. **Given** any query, **When** the agent runs it with limits N and M where N < M (both within 1..100), **Then** the N results equal the first N of the M results, in the same order, with the same `path`, `headingPath` and `score` values.
3. **Given** a query where the plugin would have returned the tied blocks in reverse path order, **When** the agent runs it with `limit: 1`, **Then** the result is the block whose note path sorts first, not the one the plugin listed first.
4. **Given** a source note whose two most similar blocks, in two other notes, have exactly the same score, **When** the agent calls `smart_connections_similar` with `limit: 1` and again with `limit: 2`, **Then** the single result of the first call is the first result of the second call, and for any N < M the N results equal the first N of the M results.

---

### User Story 2 - Equal-relevance results follow the documented tie-break (Priority: P2)

An agent receives several results with equal relevance. They come back in the documented tie-break order (note path ascending, then heading path ascending), whatever limit was requested, so the same call gives the same result list every time.

**Why this priority**: Reproducibility depends on Story 1. Once the limit no longer decides which tied results survive, the documented tie-break fully decides their order. This story pins that down across every limit, including the ones where ties sit at the edge of the returned page.

**Independent Test**: Use a stubbed plugin answer with three or more blocks that share one score, delivered in an order that is not the documented one. Call with several limits, including one that cuts through the tied group. Confirm the returned tied blocks are always the documented-first ones, in documented order. Do this for both tools.

**Acceptance Scenarios**:

1. **Given** several results with equal relevance, **When** they are returned, **Then** they appear in path-ascending order, and blocks of the same note appear in heading-path-ascending order, regardless of the limit requested.
2. **Given** a tied group of K blocks and a limit that ends partway through that group, **When** the agent runs the call, **Then** the returned members of the group are the first ones in documented tie-break order, not whichever ones the plugin listed first.
3. **Given** the same query or source note and the same vault state, **When** the agent repeats a call with the same limit, **Then** it gets the same results in the same order.

---

### Edge Cases

- **All results tied**: every candidate has the same score. Order is fully decided by path, then heading path. Any limit returns the first N in that order.
- **Fewer candidates than the limit**: the plugin has fewer matches than `limit`. All of them are returned in documented order, `count` equals the number returned, and this is unchanged from today.
- **`total: true`**: the count-only mode still reports the same `count` as the matches mode for the same call and limit (the existing cross-mode count invariant), and that count is still capped by `limit`.
- **Non-finite scores**: matches with a missing, `NaN`, infinite or null score are still dropped before ordering and limiting, as today. Dropping them must not change which finite-score matches make the cut for a given limit.
- **Block-level ties within one note**: two blocks of the same note with the same score are ordered by heading path, and the `limit` cut honours that order.
- **Ties at the edge of the candidate set**: the plugin can only rank the candidates it returns. The candidate set is fixed at 100 (FR-002). Equal-score blocks that straddle the plugin's own 100th place are chosen by the plugin, not by the tie-break. This edge is the same at every requested limit, so it never breaks FR-003. Each tool's help reference documents it (FR-009).
- **Non-finite scores or self-matches shrinking the list**: if the plugin returns 100 candidates and some are dropped (non-finite scores in either tool; the source note's own blocks in `smart_connections_similar`), fewer than 100 remain. A request for a high limit may then return fewer than `limit` matches even though the plugin has more. The drop is the same for every limit, so smaller limits are still leading slices.
- **Plugin not installed, not ready, embed failure, source not indexed, file not found, not Markdown or no active file**: error behaviour is unchanged in both tools: the same codes, `details.reason` values and error precedence.

## Requirements *(mandatory)*

### Functional Requirements

"Both tools" below means `smart_connections_query` and `smart_connections_similar`.

- **FR-001**: For any call, both tools MUST return the first `limit` matches of the documented ordering (score descending, then `path` ascending, then `headingPath` ascending) over the candidate set, not the documented ordering of a set the plugin has already cut to `limit`.
- **FR-002**: Every call of either tool MUST ask the plugin for exactly 100 candidates, the maximum allowed limit, whatever `limit` the agent requested: `smart_connections_query` through the lookup's limit and `smart_connections_similar` through the connection finder's limit. The documented ordering is applied to those candidates, after the existing non-finite and self-exclusion filters, and the result is then cut to `limit`, so every allowed limit (1..100) is served from the same ordered list.
- **FR-003**: For any two calls with the same input apart from `limit`, the same vault state, and limits N < M, the N-limit matches MUST equal the first N of the M-limit matches, in the same order and with identical field values.
- **FR-004**: Equal-score matches MUST appear in documented tie-break order (`path` ascending, then `headingPath` ascending), whatever the limit and whatever order the plugin returned them in.
- **FR-005**: Relevance scores MUST be passed through unchanged: same values, and no clamping, normalising or rounding. How relevance is scored is not changed.
- **FR-006**: In both tools, the `limit` parameter's range (1..100), its default (20) and its meaning (it caps both `matches` and `count`) MUST stay unchanged. The input and output schemas MUST stay unchanged.
- **FR-007**: The `total: true` mode MUST keep reporting the same `count` as the matches mode for the same call and limit.
- **FR-008**: Error codes, `details.reason` sub-discriminators, error precedence, the non-finite-score filter and `smart_connections_similar`'s source-path self-exclusion MUST stay unchanged. No new top-level error code is introduced.
- **FR-009**: Each tool's published description and help reference MUST say that the limit is applied after the documented ordering, so a smaller limit returns a leading slice of a larger one. Each help reference MUST also document the candidate-set edge: equal-score matches at the plugin's 100th place are ranked by the plugin.
- **FR-010**: Automated tests MUST cover, for each tool, at least:
  - (a) two top results tied on score, delivered in reverse path order, checked at `limit: 1` against `limit: 2`;
  - (b) a limit that cuts through a tied group;
  - (c) a check that the request sent to the plugin always asks for 100 candidates, whatever the `limit`.

### Key Entities

- **Match**: one semantic result, a block of a note. It has a vault-relative note `path`, a `headingPath` locating the block within the note, and a relevance `score` supplied by the plugin.
- **Candidate set**: the up to 100 matches the plugin returns for one call, which the tool filters and sorts before applying `limit`. It is the same for a given input and vault state, whatever the limit.
- **Documented ordering**: the total order on matches published in each tool's description and help reference: score descending, then path ascending, then heading path ascending.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For each tool, on a fixture whose top results include equal-score ties, 100% of limit pairs N < M (N, M in 1..100) give an N-result list that is exactly the first N entries of the M-result list.
- **SC-002**: Across repeated calls with the same input and vault state, "the top match" (`limit: 1`) is the same note and block on every call, and equals the first result at every larger limit.
- **SC-003**: 0 changes to returned score values compared with today, for the same plugin answer.
- **SC-004**: 0 changes to either tool's published input schema, output schema or error codes. The only published text change per tool is the added statement that the limit is applied after ordering.
- **SC-005**: For the default limit, a typical call of either tool returns within the existing call timeout, with no new timeouts caused by this change. This is verified live where a vault with Smart Connections indexed is available; otherwise it is recorded as unverified. The fallback evidence is that `limit: 100` is already an allowed input, so a 100-candidate plugin request is a size both tools already make.

## Assumptions

- The Smart Connections plugin returns the same candidates and scores for the same input, vault state and request. Its own internal ranking among equal scores may be arbitrary; this feature removes the dependence on that ranking for every candidate the tool receives.
- Asking the plugin for a fixed 100 candidates is enough to meet FR-001 to FR-004 for every allowed limit (Clarifications, Session 2026-11-02). Asking for the plugin's full candidate set, or for more than 100, was considered and rejected.
- Asking the plugin for 100 candidates on every call, instead of `limit`, keeps response size and latency within the existing timeout. The output is still cut to `limit` before it leaves the eval, so the size of the transport payload is unchanged.
- No caller depends on today's limit-dependent results. The change only makes results agree with the ordering that is already documented.

## Out of Scope

- Changing how relevance is scored, or the score values themselves.
- Changing the default (20) or maximum (100) limit of either tool.
- Any other change to `smart_connections_similar`: its target resolution, self-exclusion, lifecycle checks and error codes stay as they are. It is in scope only for the shared slice-before-sort step (Clarifications, analysis remediation).
