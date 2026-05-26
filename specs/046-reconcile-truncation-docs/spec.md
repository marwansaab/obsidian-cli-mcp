# Feature Specification: Reconcile Truncation Docs

**Feature Branch**: `046-reconcile-truncation-docs`
**Created**: 2026-05-26
**Status**: Draft
**Input**: User description: "Reconcile the published reference documentation for two specific vault search tools (`search` and `context_search`) so that what the documentation says about the response under result-limit truncation matches what those tools actually return on the current shipped version."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agent picks a correct narrowing strategy from the docs (Priority: P1)

An MCP agent reads the truncation section of the `search` or `context_search` reference documentation, treats it as a behavioural contract, and chooses a follow-up narrowing strategy (tighter `query`, `folder` scoping, smaller `limit`) on the first attempt — without first having to discover empirically that the response under truncation is neither the leading nor the trailing slice of the sorted result set the doc claims.

**Why this priority**: This is the failing contract. Today, both docs assert the visible subset is the **leading** entries of the sorted result set AND that the truncation behaviour is **uniform across the search-tool cohort**. Both claims are empirically false for the two tools, so any agent that follows the doc literally narrows in the wrong direction. Every other story in this feature is downstream of fixing this.

**Independent Test**: A reader (human or agent) opens `docs/tools/search.md` and `docs/tools/context_search.md`, reads the truncation section, and the section's description of the visible subset matches what the live tool returns against a reproducible probe. Independently testable against either doc alone — fixing only one still delivers value for that one tool's readers.

**Acceptance Scenarios**:

1. **Given** the corrected `search` reference documentation, **When** an agent reads the truncation section, **Then** the section no longer asserts that the truncated response carries the leading subset of the sorted result set.
2. **Given** the corrected `search` reference documentation, **When** an agent reads the truncation section, **Then** the section no longer asserts that truncation behaviour is uniform across the search-tool cohort.
3. **Given** the corrected `search` reference documentation, **When** an agent reads the truncation section, **Then** the section describes the actual visible-subset behaviour by stating: (a) the visible subset is drawn from the response order produced by the search engine that backs the tool, before any wrapper-side sort for output; (b) the slice direction taken within that engine-pre-sort response; (c) the engine's natural sort order for that pre-sort response; (d) that the visible subset is then re-sorted before being returned to the caller.
4. **Given** the corrected `context_search` reference documentation, **When** an agent reads the truncation section, **Then** the three assertions in scenarios 1–3 hold for `context_search` as well, stated in that doc on its own terms (no cross-doc inclusion).

---

### User Story 2 - Human reader gets a contract matching live behaviour (Priority: P2)

A human reader of `docs/tools/search.md` or `docs/tools/context_search.md` who suspects the truncation description is wrong reaches for the empirical anchor cited in the doc, runs the documented probe against the current shipped version, and the probe reproduces the documented behaviour — so the reader does not waste time diagnosing a behaviour that contradicts the spec.

**Why this priority**: Without a reproducible anchor, the next reader has to re-derive the truth empirically and the doc rots back to the current broken state on the next behavioural drift. This story is what makes the fix durable rather than a one-shot correction.

**Independent Test**: A reader follows the empirical-anchor probe inputs recorded alongside the corrected description, runs the probe against the current shipped version, and confirms the observed visible subset matches the documented description and the documented full sorted result set.

**Acceptance Scenarios**:

1. **Given** the corrected `search` documentation with its empirical anchor, **When** a reader reproduces the documented probe against the current shipped version, **Then** the probe's visible subset matches the documented description.
2. **Given** the corrected `context_search` documentation with its empirical anchor, **When** a reader reproduces the documented probe against the current shipped version, **Then** the probe's visible subset matches the documented description.
3. **Given** the corrected documentation, **When** a reader looks for verifying evidence, **Then** the anchor records (a) the probe inputs — the BI-0011 fixture set and `limit: 2`; (b) the observed visible subset; (c) the full sorted result set against which that subset was observed.

---

### User Story 3 - Backlinks docs are preserved (Priority: P3)

A reader of `docs/tools/backlinks.md` opens the truncation description after this feature lands and finds it unchanged — because that description already matches the `backlinks` tool's shipped behaviour, and the correction work for the other two tools does not collaterally rewrite a sentence that is currently true for `backlinks`.

**Why this priority**: This is a guardrail, not a feature delivery. Without it, a naïve "fix the cohort-uniformity sentence everywhere" pass would damage a true claim while fixing two false ones. Listed P3 because it constrains scope rather than producing reader value of its own.

**Independent Test**: After the feature lands, the diff against `docs/tools/backlinks.md` for the truncation section is empty (no byte changes inside that section).

**Acceptance Scenarios**:

1. **Given** `backlinks` truncation documentation that matches its current shipped behaviour, **When** this feature lands, **Then** the `backlinks` truncation section is unchanged byte-for-byte from the pre-feature state.

---

### Edge Cases

- **Cohort-uniformity claim inside `backlinks.md` is itself false.** The current `backlinks` truncation description asserts that `search` and `context_search` also slice the leading subset — once those two tools are documented as diverging, this in-line cohort claim becomes false from `backlinks`'s side too. The user has explicitly scoped this BI to not edit `backlinks.md`; the residual inconsistency is acknowledged here and is out of scope. It folds into the separate cohort-uniformity backlog item.
- **Cross-reference rot to BI-042 evidence file.** Both `search.md` and `context_search.md` currently cite `specs/042-close-audit-findings/contracts/truncation-direction-evidence.md` as the empirical anchor for the now-false leading-subset claim. That linked artifact does not anchor the corrected claim. The corrected sections must either supersede the link with a new BI-046 evidence reference or annotate the existing link as historically scoped.
- **Two tools may diverge from each other.** The acceptance criteria require each doc to describe the actual visible-subset behaviour on its own terms. If `search` and `context_search` produce different pre-sort response orderings or slice in different directions, each doc states its own — no cross-doc "see search" shortcut.
- **Short shelf life if the runtime BI re-converges.** The separately-tracked runtime BI may bring `search` and `context_search` back into alignment with `backlinks` (and with the now-historic leading-subset claim). The corrected text should be written so a future doc-pass after that BI can replace the divergence description without rewriting the surrounding section structure.
- **`backlinks` is out of scope but its existing cohort sentence is the cited reason the BI was opened.** The acceptance criterion that holds `backlinks.md` unchanged is intentional and overrides the consistency pull to also fix the cohort sentence there.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `docs/tools/search.md` truncation section MUST NOT assert that the truncated response carries the leading subset of the sorted result set.
- **FR-002**: The `docs/tools/search.md` truncation section MUST NOT assert that truncation behaviour is uniform across the search-tool cohort.
- **FR-003**: The `docs/tools/search.md` truncation section MUST describe the actual visible-subset behaviour for `search` by stating, on its own terms: (a) that the visible subset is drawn from the response order produced by the search engine that backs the tool, before any wrapper-side sort for output; (b) the slice direction taken within that engine-pre-sort response; (c) the engine's natural sort order for that pre-sort response; (d) that the visible subset is then re-sorted before being returned to the caller.
- **FR-004**: The `docs/tools/context_search.md` truncation section MUST NOT assert that the truncated response carries the leading subset of the sorted result set.
- **FR-005**: The `docs/tools/context_search.md` truncation section MUST NOT assert that truncation behaviour is uniform across the search-tool cohort.
- **FR-006**: The `docs/tools/context_search.md` truncation section MUST describe the actual visible-subset behaviour for `context_search` by stating, on its own terms, the same four facts enumerated in FR-003.
- **FR-007**: Each corrected truncation section MUST record an empirical anchor comprising: (a) the probe inputs — the BI-0011 fixture set and `limit: 2`; (b) the observed visible subset on the current shipped version; (c) the full sorted result set against which that subset was observed.
- **FR-008**: The `docs/tools/backlinks.md` truncation section MUST remain byte-identical to its pre-feature state. No edits inside that section, including no edits to the cohort-uniformity sentence it currently contains.
- **FR-009**: No runtime change to the wrapper or to the tools `search`, `context_search`, or `backlinks` MUST ship under this feature. The diff is bounded to documentation files (and the empirical-anchor evidence artifact, if recorded as a separate file).
- **FR-010**: The corrected text MUST be reproducible by a future reader: the probe inputs and observed outputs MUST be sufficient to re-run the probe against the current shipped version and confirm the documented description, with no out-of-band knowledge required.
- **FR-011**: Where the existing truncation sections cite `specs/042-close-audit-findings/contracts/truncation-direction-evidence.md` as the empirical anchor for the (now-false) leading-subset claim, the corrected sections MUST either supersede that link with a BI-046 evidence reference or annotate the existing link as historically scoped to the pre-correction claim.

### Key Entities *(include if feature involves data)*

- **Truncation section**: The named subsection of a tool's reference doc that describes the response under cap-clip — `### Truncation slice direction (...)` in `search.md` and `context_search.md`, and the `truncated` row of the output-shape table in `backlinks.md`.
- **Visible subset**: The subset of the underlying result set that actually appears in the response when `truncated: true`. The current docs claim this is the leading slice of the sorted result set; the corrected docs describe what it actually is.
- **Sorted result set**: The full collection of would-be matches, sorted by the wrapper's output-sort key (`path` ascending, then `line` ascending for `search`/`context_search`; `source` UTF-16 ascending for `backlinks`).
- **Engine pre-sort response**: The ordering of results produced by the underlying search engine before the wrapper applies its output sort. The visible subset under truncation is drawn from this ordering; only after slicing is the wrapper's output sort applied to the visible subset.
- **BI-0011 fixture set**: The named fixture vault and query inputs (paired with `limit: 2` per the user's acceptance criteria) used as the reproducible probe for the empirical anchor.
- **Empirical anchor**: The probe-inputs / observed-subset / full-sorted-set triple recorded alongside the corrected description, sufficient for a future reader to re-run the probe and confirm the description against the current shipped version.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 of the truncation-section claims about the visible subset in `search.md` and `context_search.md` are empirically false on the current shipped version (down from 2 — one per tool — under the leading-subset claim, plus 2 more cohort-uniformity assertions).
- **SC-002**: A reader who runs the documented probe inputs against the current shipped version of `search` and of `context_search` observes a visible subset that matches the documented description, with no out-of-band reasoning needed.
- **SC-003**: The `backlinks.md` truncation section diff against the pre-feature state has 0 byte changes inside the section.
- **SC-004**: 0 runtime behavioural changes ship under this feature — diff scope confined to documentation and the empirical-anchor evidence artifact.
- **SC-005**: An agent following the corrected truncation section selects a correct narrowing strategy on the first attempt — no second-attempt re-narrowing needed solely because the doc's described slice direction contradicted the live response.

## Assumptions

- **Two docs, two descriptions.** `search` and `context_search` may produce different engine-pre-sort orderings and/or different slice directions within them; the corrected sections describe each tool on its own terms rather than introducing a shared cohort claim.
- **BI-0011 fixture is reproducible.** The fixture set named in the user's acceptance criteria exists in a stable, re-runnable form (consistent with the project's `.memory/test-execution-instructions.md` discipline for live-CLI probes), and `limit: 2` against it is sufficient to demonstrate the divergence from the leading-subset claim.
- **Empirical anchor goes alongside the corrected description.** "Alongside" is interpreted as either inline in the doc body or in a linked evidence file under `specs/046-reconcile-truncation-docs/contracts/` — parallel to BI-042's pattern. The plan phase picks one.
- **Runtime divergence is stable for the doc's expected shelf life.** No imminent shipping change to `search` / `context_search` truncation runtime is expected before this doc fix lands. If the runtime reconciliation BI ships first, this feature is re-evaluated.
- **The cohort-uniformity sentence inside `backlinks.md` is knowingly left in place.** It is now technically false (because `search` and `context_search` will no longer slice the leading subset), but the user has scoped this BI to not edit `backlinks.md`. The residual inconsistency is tracked separately, not absorbed here.
- **No constitution-impacting changes.** Doc-only feature; Principle II (test coverage) and Principle IV (error propagation) do not apply; Principle I (module organisation) only applies if a new evidence artifact is added under `specs/`.
