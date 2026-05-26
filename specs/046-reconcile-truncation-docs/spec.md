# Feature Specification: Reconcile Truncation Docs

**Feature Branch**: `046-reconcile-truncation-docs`
**Created**: 2026-05-26
**Status**: Draft
**Input**: User description: "Reconcile the published reference documentation for two specific vault search tools (`search` and `context_search`) so that what the documentation says about the response under result-limit truncation matches what those tools actually return on the current shipped version."

## Clarifications

### Session 2026-05-26

- Q: Where does the empirical anchor live — separate evidence file, inline in the doc body, or hybrid? → A: Hybrid (C) — inline one-line summary per anchor (probe inputs + observed visible subset only); full sorted result set lives in a separate evidence file under `specs/046-reconcile-truncation-docs/contracts/`. That contracts file MUST back-link to `[[TC-00306]]` and `[[TC-00328]]` as the canonical re-runnable evidence, and is treated as a **wrapper-repo mirror** (for cloners without vault access), not a parallel source of truth. Mirror-discipline rule applies — the canonical evidence lives on the TC pages in the user's test tracker, never in this repo.
- Q: How are the existing BI-042 evidence-link citations in `search.md` and `context_search.md` disposed of? → A: Replace-in-doc + forward-pointer-in-source (B). The doc truncation sections drop the BI-042 link entirely and carry only the new BI-046 anchor (inline summary + mirror-file link). A one-line "superseded by BI-046 — current truth at `<BI-046 mirror path>`" pointer is added inside `specs/042-close-audit-findings/contracts/truncation-direction-evidence.md` itself so anyone arriving at the historical evidence file via an external citation finds a signpost to current truth.
- Q: How is the empirical anchor's version-pinning split between the inline doc summary and the mirror file? → A: Date inline, full triple in mirror (B + refinement). Inline summary records only the capture date (Q1's one-line budget rules out three version strings inline). The mirror file under `specs/046-reconcile-truncation-docs/contracts/` records the full triple: (i) wrapper package version, PR-time, in `@marwansaab/obsidian-cli-mcp@x.y.z` form; (ii) Obsidian Integrated CLI plugin version, probe-time host fact; (iii) Obsidian desktop app version, probe-time host fact. Same triple appears on the canonical TC pages per Test Case Page Template convention. If any of the three is unknown at probe time, the mirror file records `unknown` explicitly — degraded-reproducibility signal beats silent omission.
- Q: How does `search.md` handle its dual-mode response shape (default mode `paths[]` vs line mode `matches[]`) under truncation correction? → A: Single-block structure conditional on dual-mode empirical evidence (B + implementation gate). Implementation MUST probe BOTH modes against the BI-0011 corpus at wrapper version `v0.7.1`: default mode via upstream `obsidian search` (paths[] response) AND line mode via upstream `obsidian search:context` (matches[] response — the SAME upstream subcommand the `context_search` tool routes through, where the divergence was already observed per BI-0110 filing). Same finding across both modes → single block in the truncation section + explicit "applies to both modes" sentence. Divergent findings → per-mode subsections, each carrying its own one-line inline anchor and its own pointer into the mirror file. Implementation gate: extend `[[TC-00306]]` with a `v0.7.1` line-mode row OR add a new TC for the line-mode probe BEFORE locking the doc structure. Rationale: the `obsidian search` subcommand has not been independently probed at `v0.7.1` in BI-0110's filing evidence; generalising single-block across both modes without a dual-mode probe risks the same false-precision shape BI-0110 was filed to fix. This is the probe-then-write discipline (cf. the connector Best Practices "explicit `vault=<unfocused>` probe before locking a routing claim" rule) applied to a different surface.
- Q: Should each corrected truncation section explicitly call out the cohort divergence from `backlinks`? → A: Explicit call-out, no forward-pointer to the runtime BI (C). Each corrected truncation section in `search.md` and `context_search.md` carries one sentence naming the divergence: that `backlinks` slices the leading subset of the sorted result set while this tool does not (see inline summary for the actual behaviour). No forward-pointer to the adjacent runtime-reconciliation BI — that BI may shift scope, be renumbered, or fold into another, and a stale forward-pointer is worse than no pointer. An agent or human reader who reads the docs as a contract gets a clear "this is a known cohort divergence, not your misreading" signal at the doc-cohort level without coupling the doc to a moving BI identifier.

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
- **FR-007**: Each corrected truncation section MUST record an empirical anchor split across two locations per the 2026-05-26 Q1 + Q3 clarifications: (a) **inline in the doc body** — a one-line summary per anchor giving the probe inputs (BI-0011 fixture set + `limit: 2`), the observed visible subset, and the capture date; no full sorted result set inline, no version triple inline; (b) **in a wrapper-repo mirror file** under `specs/046-reconcile-truncation-docs/contracts/` — the full sorted result set against which the visible subset was observed, the version triple (wrapper package version at PR time as `@marwansaab/obsidian-cli-mcp@x.y.z`, Obsidian Integrated CLI plugin version at probe time, Obsidian desktop app version at probe time; any unknown component recorded as `unknown` rather than omitted), plus back-links to `[[TC-00306]]` (canonical evidence for the `search` truncation probe) and `[[TC-00328]]` (canonical evidence for the `context_search` truncation probe). The TC pages in the user's test tracker are the canonical source of truth; the contracts/ file exists solely to give wrapper-repo cloners (without vault access) an offline mirror, and is held to mirror-discipline — no divergence from the TC pages, no facts not present on the TC pages.
- **FR-008**: The `docs/tools/backlinks.md` truncation section MUST remain byte-identical to its pre-feature state. No edits inside that section, including no edits to the cohort-uniformity sentence it currently contains.
- **FR-009**: No runtime change to the wrapper or to the tools `search`, `context_search`, or `backlinks` MUST ship under this feature. The diff is bounded to: (a) `docs/tools/search.md` and `docs/tools/context_search.md` (truncation-section corrections); (b) the BI-046 wrapper-repo mirror file under `specs/046-reconcile-truncation-docs/contracts/`; (c) a one-line forward-pointer added inside `specs/042-close-audit-findings/contracts/truncation-direction-evidence.md` per the 2026-05-26 Q2 clarification.
- **FR-010**: The corrected text MUST be reproducible by a future reader: the probe inputs and observed outputs MUST be sufficient to re-run the probe against the current shipped version and confirm the documented description, with no out-of-band knowledge required.
- **FR-011**: The existing BI-042 evidence-link citations are disposed of per the 2026-05-26 Q2 clarification: (a) `docs/tools/search.md` and `docs/tools/context_search.md` drop the BI-042 reference entirely from their truncation sections and carry only the new BI-046 anchor (inline summary + mirror-file link); (b) `specs/042-close-audit-findings/contracts/truncation-direction-evidence.md` gains exactly one forward-pointer line: "superseded by BI-046 — current truth at `<BI-046 mirror path>`" so a reader landing on the historical evidence file via external citation has a signpost to current truth.
- **FR-012**: The `search.md` truncation correction MUST be preceded by a dual-mode empirical probe at wrapper version `v0.7.1` per the 2026-05-26 Q4 clarification, covering both default mode (upstream `obsidian search`, `paths[]` response) AND line mode (upstream `obsidian search:context`, `matches[]` response). The probe evidence MUST be recorded on `[[TC-00306]]` (extended with a `v0.7.1` line-mode row) OR on a new TC for the line-mode probe, BEFORE the `search.md` truncation section is restructured. If the two modes produce matching findings, the corrected section is a single block with an explicit "applies to both modes" sentence; if they diverge, the corrected section splits into per-mode subsections, each with its own inline anchor and its own mirror-file pointer.
- **FR-013**: Each corrected truncation section in `docs/tools/search.md` and `docs/tools/context_search.md` MUST carry one sentence explicitly naming the cohort divergence from `backlinks` per the 2026-05-26 Q5 clarification — stating that `backlinks` slices the leading subset of the sorted result set while this tool does not, and pointing the reader to the inline summary for the actual behaviour. The sentence MUST NOT carry a forward-pointer to the adjacent runtime-reconciliation BI (stale forward-pointer risk on BI renumbering or scope shift).

### Key Entities *(include if feature involves data)*

- **Truncation section**: The named subsection of a tool's reference doc that describes the response under cap-clip — `### Truncation slice direction (...)` in `search.md` and `context_search.md`, and the `truncated` row of the output-shape table in `backlinks.md`.
- **Visible subset**: The subset of the underlying result set that actually appears in the response when `truncated: true`. The current docs claim this is the leading slice of the sorted result set; the corrected docs describe what it actually is.
- **Sorted result set**: The full collection of would-be matches, sorted by the wrapper's output-sort key (`path` ascending, then `line` ascending for `search`/`context_search`; `source` UTF-16 ascending for `backlinks`).
- **Engine pre-sort response**: The ordering of results produced by the underlying search engine before the wrapper applies its output sort. The visible subset under truncation is drawn from this ordering; only after slicing is the wrapper's output sort applied to the visible subset.
- **BI-0011 fixture set**: The named fixture vault and query inputs (paired with `limit: 2` per the user's acceptance criteria) used as the reproducible probe for the empirical anchor.
- **Empirical anchor**: The probe-inputs / observed-subset / full-sorted-set triple recorded alongside the corrected description, sufficient for a future reader to re-run the probe and confirm the description against the current shipped version. Per the 2026-05-26 Q1 clarification, the anchor is split: inline summary (probe inputs + observed visible subset) lives in the doc body; the full sorted result set lives in a wrapper-repo mirror file under `specs/046-reconcile-truncation-docs/contracts/`, which back-links to the canonical TC pages.
- **Canonical evidence (TC pages)**: The Test Case pages `[[TC-00306]]` (for `search`) and `[[TC-00328]]` (for `context_search`) in the user's external test tracker. These hold the full empirical evidence + execution log per the Test Case Page Template convention and are the canonical source of truth for the truncation behaviour described in this BI.
- **Wrapper-repo mirror file**: An evidence artifact under `specs/046-reconcile-truncation-docs/contracts/` that mirrors the relevant TC-page data for cloners of this repo without vault access. Held to mirror discipline — no divergence from, and no facts not present on, the TC pages. Analogous to the connector Architecture mirror-discipline rule.

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
- **Empirical anchor placement is resolved** per the 2026-05-26 Q1 clarification: hybrid — inline summary in the doc body, separate mirror file under `specs/046-reconcile-truncation-docs/contracts/` back-linked to canonical TC pages `[[TC-00306]]` and `[[TC-00328]]`. Mirror-discipline rule applies: contracts/ file holds nothing the TC pages don't already carry.
- **Runtime divergence is stable for the doc's expected shelf life.** No imminent shipping change to `search` / `context_search` truncation runtime is expected before this doc fix lands. If the runtime reconciliation BI ships first, this feature is re-evaluated.
- **The cohort-uniformity sentence inside `backlinks.md` is knowingly left in place.** It is now technically false (because `search` and `context_search` will no longer slice the leading subset), but the user has scoped this BI to not edit `backlinks.md`. The residual inconsistency is tracked separately, not absorbed here.
- **No constitution-impacting changes.** Doc-only feature; Principle II (test coverage) and Principle IV (error propagation) do not apply; Principle I (module organisation) only applies if a new evidence artifact is added under `specs/`.
