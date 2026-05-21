# Feature Specification: Reconcile Cohort-Wide Tool Doc and Classifier Drift

**Feature Branch**: `041-reconcile-cohort-doc-drift`
**Created**: 2026-05-21
**Status**: Draft
**Input**: User description: "Reconcile Cohort Wide Tool Doc And Classifier Drift" — close two systemic drift classes (Dimension B doc-vs-emission, Dimension C classifier-vs-doc-emit) across seven cli-mcp tools (`delete`, `rename`, `outline`, `query_base`, `search`, `read_property`, `properties`) in a single coordinated pass so a fresh BI-0027 audit clears cohort-wide.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Typed `ERR_NO_ACTIVE_FILE` sub-discriminator fires across `delete`, `rename`, `outline` in active mode (Priority: P1)

An agent invokes `delete`, `rename`, or `outline` in active mode against a vault with no focused file. Today the response carries `code: CLI_REPORTED_ERROR` but no `details.code`, even though the wrapper-doc promises `ERR_NO_ACTIVE_FILE` as a typed sub-discriminator. The agent has to parse stdout/stderr text to distinguish "no active file" from other CLI failures, which is exactly what the typed sub-discriminator was meant to eliminate. The classifier silently drops the match because the canonical phrase emitted by the upstream CLI uses capital-N ("Error: No active file.") while the classifier matches lowercase. This story restores the promised typed surface so the documented recovery path ("open a file or supply `path=` / `file=`") becomes machine-actionable.

**Why this priority**: Three tools are silently failing the doc contract today. The fix is a single classifier-ladder amendment shared across all three. Agents already build recovery logic against the documented `ERR_NO_ACTIVE_FILE` code, so the gap turns documented recovery into dead code. Highest impact, lowest blast radius — case-insensitive match against the canonical phrase.

**Independent Test**: Spawn each tool against an active vault with no focused file; assert the response carries `code: CLI_REPORTED_ERROR` AND `details.code: ERR_NO_ACTIVE_FILE` AND the documented recovery message. Independently verify (regression guard) that the same `details.code` continues to fire on eval-composed tools (`read_heading`, `find_by_property`) where it already works today.

**Acceptance Scenarios**:

1. **Given** the active vault has no focused file, **When** the agent invokes `delete` in active mode, **Then** the response carries `code: CLI_REPORTED_ERROR` AND `details.code: ERR_NO_ACTIVE_FILE` AND the documented recovery message.
2. **Given** the active vault has no focused file, **When** the agent invokes `rename` in active mode, **Then** the response carries `code: CLI_REPORTED_ERROR` AND `details.code: ERR_NO_ACTIVE_FILE` AND the documented recovery message.
3. **Given** the active vault has no focused file, **When** the agent invokes `outline` in active mode, **Then** the response carries `code: CLI_REPORTED_ERROR` AND `details.code: ERR_NO_ACTIVE_FILE` AND the documented recovery message.
4. **Given** the upstream CLI emits "Error: No active file." with capital-N, **When** the classifier processes the emit, **Then** the classification succeeds against the canonical phrase regardless of case.
5. **Given** the same no-active-file failure path on `read_heading` or `find_by_property` (eval-composed tools that classify correctly today), **When** the agent invokes them in active mode, **Then** `details.code: ERR_NO_ACTIVE_FILE` continues to fire — the widening does not regress eval-composed callers.

---

### User Story 2 - Typed `VIEW_NOT_FOUND` sub-discriminator fires on `query_base` (Priority: P1)

An agent invokes `query_base` against a `.base` file that exists but declares no view of the requested name. Today the response surfaces a `CLI_REPORTED_ERROR` without a `details.code`, even though the wrapper-doc promises `VIEW_NOT_FOUND` as the typed discriminator for this branch. The classifier scans only stderr; the upstream CLI emits "Error: View not found: <name>" to stdout with `exitCode: 0`, so the classifier never sees the emit. The agent ends up unable to distinguish "wrong view name" from "wrong base file" without channel-dependent inspection of raw output. This story widens the classifier to scan both channels and carry the requested view name and resolved base path on the typed surface.

**Why this priority**: Bundled with Story 1 because it is the same class of fix (classifier ladder, promised-but-not-firing sub-discriminator) and lands in the same module — sequential shipping forces two audit re-runs. Same agent-impact pattern: documented recovery is currently dead code.

**Independent Test**: Construct a fixture `.base` file with a declared view, invoke `query_base` against it with a view name that is NOT declared, assert `details.code: VIEW_NOT_FOUND` AND `details.view_name` equals the supplied view name AND `details.base_path` equals the resolved base path. Independently verify (regression guard) that invoking against a `.base` path that does NOT exist still surfaces `details.code: BASE_NOT_FOUND`, distinct from missing-view.

**Acceptance Scenarios**:

1. **Given** a `.base` file exists at the supplied path AND no view of the supplied name is declared in it, **When** the agent invokes `query_base`, **Then** the response carries `code: CLI_REPORTED_ERROR` AND `details.code: VIEW_NOT_FOUND` AND `details.view_name` equal to the supplied view name AND `details.base_path` equal to the supplied base path.
2. **Given** the upstream CLI emits "Error: View not found: <name>" to stdout with `exitCode: 0`, **When** the classifier processes the emit, **Then** the classification succeeds — the classifier scans both stdout AND stderr.
3. **Given** a `.base` file does not exist at the supplied path, **When** the agent invokes `query_base`, **Then** the response continues to carry `details.code: BASE_NOT_FOUND` — the missing-base-file branch remains distinct from missing-view and is not regressed by the widening.

---

### User Story 3 - `query_base` response-shape docs match live emission (Priority: P2)

An agent reads the `query_base` schema description and rendered help doc to plan a Bases retrieval call. Three documented claims about response shape do not match the live upstream behaviour: (a) the doc implies that empty results still carry the view-declared columns, but upstream emits only the reserved `path` in `columns` when the row count is zero; (b) the doc implies that integer/boolean YAML frontmatter values round-trip as native JSON types, but upstream stringifies them; (c) the doc implies that `file.X` source-properties strip uniformly to `X` in column names, but `file.path` becomes the reserved `path` injection while `file.name` becomes the upstream display label `"file name"` (embedded space). Agents writing row-parsing code against the doc silently break on these edge cases. This story corrects the doc text — empirically, no runtime behaviour change.

**Why this priority**: Doc-only correction; high-impact for agents writing parsers but lower urgency than the classifier fixes because the response shape is reproducible and discoverable from the data. Bundled in the same pass to avoid a second BI-0027 audit re-run.

**Independent Test**: Read the updated `query_base` schema description and help doc; for each of the three claims, contrast the documented shape against an empirical capture from the live CLI against a fixture; assert no divergence remains.

**Acceptance Scenarios**:

1. **Given** an empty view (zero matching rows), **When** the agent reads the wrapper's help doc or schema description, **Then** the documented `columns` claim acknowledges that an empty-row response carries only the reserved `path` in `columns`, and view-declared columns appear only when at least one row matches.
2. **Given** a row carries a frontmatter property declared as integer in YAML, **When** the agent reads the wrapper's help doc or schema description on type preservation, **Then** the doc acknowledges that upstream stringifies frontmatter values regardless of declared YAML type, and the wrapper is passthrough — not a type-coercion layer.
3. **Given** the view declares columns using `file.path` and `file.name`, **When** the agent reads the wrapper's help doc or schema description on column-name emission, **Then** the doc acknowledges the non-uniform stripping — `file.path` → `path` (reserved injection); `file.name` → `"file name"` (upstream display label with embedded space, NOT the segment `name`).

---

### User Story 4 - `search` help-doc error roster matches reality (Priority: P2)

An agent reads the `search` help doc's error roster to plan recovery code. The roster contains entries that do not fire on the Cowork pathway, and the surface emits codes that do not appear in the roster. The agent writes recovery code for codes that will never be returned and is blindsided by codes it was never told about. This story performs a doc-only reconciliation: every documented code must be empirically reachable on the Cowork pathway, and every empirically-reachable code must be documented.

**Why this priority**: Doc-only; affects only `search`. Bundled to consolidate the audit re-run.

**Independent Test**: Enumerate `search` invocations that cover every documented code path; assert each documented code is produced by at least one invocation, and each produced code appears in the doc roster.

**Acceptance Scenarios**:

1. **Given** an invocation of `search` that produces a documented error code on the Cowork pathway, **When** the agent compares to the doc, **Then** the surface code matches the doc's roster entry exactly.
2. **Given** any error code documented in the roster, **When** the cohort is exercised, **Then** at least one reachable invocation of `search` produces it (no documented-but-never-produced codes).
3. **Given** any error code empirically reachable via the `search` surface on the Cowork pathway, **When** the cohort is exercised, **Then** it appears in the documented roster (no produced-but-never-documented codes).

---

### User Story 5 - `read_property` malformed-frontmatter spec and help doc agree (Priority: P2)

An agent reads the `read_property` spec and help doc on what surfaces when a note has malformed YAML frontmatter. The two artefacts currently disagree: one says the wrapper returns an empty value with `type: "unknown"`, the other says a typed error code. The agent who reads the spec writes one fallback shape; the agent who reads the help doc writes another; one of them is wrong. This story unifies the two artefacts so both describe the same observable surface behaviour — whichever shape the live wrapper currently emits is the single source of truth.

**Why this priority**: Doc-only; low ambiguity once the live behaviour is captured. Bundled with the cohort pass.

**Independent Test**: Capture the live wrapper's response for a note with malformed YAML frontmatter; assert the spec and help doc both describe that captured shape verbatim.

**Acceptance Scenarios**:

1. **Given** the wrapper handles a note with malformed YAML frontmatter, **When** the agent reads the spec AND the help doc, **Then** both describe the same observable surface behaviour — the surface is one of empty-value-with-`type: "unknown"`, or a typed error code, but never both depending on whose doc is read.

---

### User Story 6 - `properties` dedup contract matches upstream (Priority: P3)

An agent invokes `properties` against a vault holding two notes whose frontmatter property names differ only in case (e.g. `AaTest` vs `aatest`). The help doc currently asserts case-sensitive dedup with byte-tiebreak ordering — promising two separate entries. Live behaviour collapses them under upstream's case-insensitive convention into one entry with `noteCount: 2`. The agent writing iteration code against the doc misses notes; the spec asserting the wrong contract becomes drift bait for future maintainers. This story corrects the spec and help doc to match upstream's collapse rule.

**Why this priority**: Doc-only; narrower agent impact than queries that touch many properties. Bundled to consolidate the audit re-run.

**Independent Test**: Construct fixture notes with case-variant property names; invoke `properties`; assert one entry with `noteCount: 2`; assert the help doc and spec describe this collapse rule.

**Acceptance Scenarios**:

1. **Given** two fixture notes carrying frontmatter property names that differ only in case (e.g. `AaTest` vs `aatest`), **When** the agent invokes `properties`, **Then** the response collapses them under the case-insensitive convention upstream applies — one entry with `noteCount: 2` — AND the help doc describes the collapse rule.
2. **Given** the wrapper's spec previously asserted case-sensitive dedup with byte-tiebreak ordering, **When** the reconciliation ships, **Then** the spec is retired or amended so the asserted contract matches the observed shape.

---

### Edge Cases

- **ERR_NO_ACTIVE_FILE case spectrum**: Upstream phrasing might appear with leading/trailing punctuation variants ("error: no active file", "Error: No active file.", "ERROR: NO ACTIVE FILE!"); the case-insensitive match must accept observed variants without over-matching unrelated emits that happen to contain the phrase as a substring of a longer unrelated message.
- **VIEW_NOT_FOUND with similarly-named views**: A `.base` declaring views `notes` and `notes_archive` queried with `view=notes_arch` — the emit names the requested view; `details.view_name` must reflect the supplied input (not a fuzzy-match suggestion).
- **`query_base` view declaring both `file.path` and `file.name`**: collision on the reserved `path` injection — only `file.path` strips to `path`; `file.name` retains `"file name"`. Doc must address this collision explicitly so agents do not assume mutual exclusivity.
- **`properties` three-way case variants (`AaTest`, `aaTEST`, `AATEST`)**: all collapse under upstream's case-insensitive rule; doc must specify which casing is reported in the merged entry (upstream's choice, not an alphabetical or first-seen rule the wrapper invents).
- **`search` deprecated-but-still-emitted codes**: if any code is emitted by older CLI versions but not the supported floor, the doc roster scope tracks the supported floor — out-of-floor emits are not in scope.
- **Eval-composed tools surfacing equivalent failures via a different channel**: classifier widening for `ERR_NO_ACTIVE_FILE` must remain compatible with the eval-channel emit shape that `read_heading` / `find_by_property` rely on today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The wrapper's classifier ladder MUST match the canonical no-active-file emit ("Error: No active file.") case-insensitively, so that `delete`, `rename`, and `outline` invoked in active mode against a vault with no focused file surface `code: CLI_REPORTED_ERROR` with `details.code: ERR_NO_ACTIVE_FILE` and the documented recovery message.
- **FR-002**: The widening in FR-001 MUST NOT regress eval-composed tools (`read_heading`, `find_by_property`) — their existing path to `details.code: ERR_NO_ACTIVE_FILE` continues to fire under their canonical failure conditions.
- **FR-003**: The classifier ladder MUST scan both stdout AND stderr (not stderr alone) when classifying `query_base` failures, so the upstream "Error: View not found: <name>" emit on stdout with `exitCode: 0` is recognised.
- **FR-004**: When `query_base` is invoked against an existing `.base` file lacking the requested view, the response MUST carry `code: CLI_REPORTED_ERROR`, `details.code: VIEW_NOT_FOUND`, `details.view_name` equal to the supplied view name, and `details.base_path` equal to the supplied base path.
- **FR-005**: The widening in FR-003/FR-004 MUST NOT regress the missing-base-file branch — `query_base` invoked against a non-existent `.base` path continues to carry `details.code: BASE_NOT_FOUND`, distinct from `VIEW_NOT_FOUND`.
- **FR-006**: The `query_base` schema description and rendered help doc MUST acknowledge that an empty-row response carries only the reserved `path` in `columns`, and that view-declared columns appear only when at least one row matches.
- **FR-007**: The `query_base` schema description and rendered help doc MUST acknowledge that upstream stringifies frontmatter values regardless of declared YAML type — the wrapper is passthrough, not a type-coercion layer.
- **FR-008**: The `query_base` schema description and rendered help doc MUST acknowledge the non-uniform `file.*` column-name emission: `file.path` → `path` (reserved injection); `file.name` → `"file name"` (upstream display label with embedded space, NOT the segment `name`).
- **FR-009**: The `search` rendered help doc's error roster MUST contain every error code reachable via the `search` surface on the Cowork pathway AND MUST NOT contain any code that no reachable invocation produces. Documented = produced.
- **FR-010**: The `read_property` spec and rendered help doc MUST describe the same observable surface behaviour for malformed YAML frontmatter — both must refer to the live wrapper's emitted shape (empty-value-with-`type: "unknown"`, or a typed error code) consistently. The choice between the two is whichever the live wrapper emits today (per Assumption A4).
- **FR-011**: The `properties` rendered help doc MUST describe the case-insensitive frontmatter property-name collapse upstream applies. The `properties` spec, where it previously asserted case-sensitive dedup with byte-tiebreak ordering, MUST be retired or amended to assert the observed case-insensitive collapse.
- **FR-012**: A fresh BI-0027 audit pass run after the reconciliation ships MUST report zero Dimension B failures for `search`, `read_property`, `properties`, `query_base` AND zero Dimension C failures for `delete`, `rename`, `outline`, `query_base` — no rogue codes, no documented-but-never-produced codes, no produced-but-never-documented codes, no classifier-vs-doc-emit divergence.
- **FR-013**: The reconciliation MUST be delivered as a single coordinated pass across the seven listed tools — not as six sequential per-tool BIs — so the BI-0027 audit re-runs once cohort-wide post-ship rather than six times.

### Key Entities

- **Classifier ladder**: The single shared module that inspects upstream CLI output (stdout + stderr + exit code) and classifies failures into `code` / `details.code` discriminators. Owns the runtime side of the "doc IS the contract" invariant; widening here affects all seven cohort tools simultaneously.
- **Wrapper help doc / schema description**: The two doc artefacts an agent reads to plan a tool call. Each tool publishes both. Where they describe empirical CLI behaviour, they must match the live emission (Dimension B).
- **Sub-discriminator code**: A `details.code` value (e.g. `ERR_NO_ACTIVE_FILE`, `VIEW_NOT_FOUND`, `BASE_NOT_FOUND`) that refines a top-level `code` (e.g. `CLI_REPORTED_ERROR`) into a machine-actionable recovery target.
- **Drift dimension**: Dimension B = wrapper doc claims empirical CLI behaviour the live binary does not produce; Dimension C = wrapper classifier ladder promises a typed sub-discriminator that does not fire on the live surface. The two dimensions are the audit's pass/fail axes.
- **BI-0027 audit**: The cohort-wide verification pass that grades each tool against both Dimensions. Passing all listed tools in a single audit run after the reconciliation ships is the feature's terminal acceptance gate.
- **Native CLI subcommand vs eval-composed tool**: `delete`, `rename`, `outline`, `query_base`, `search`, `read_property`, `properties` invoke a native upstream CLI subcommand directly. `read_heading`, `find_by_property` compose behaviour via `obsidian eval`. The classifier widening must serve the native path without regressing the eval path.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh BI-0027 audit pass executed after the reconciliation ships reports 100% clearance on Dimension B pass criteria for the four listed tools (`search`, `read_property`, `properties`, `query_base`) AND 100% clearance on Dimension C pass criteria for the four listed tools (`delete`, `rename`, `outline`, `query_base`), in a single audit run.
- **SC-002**: Zero regression on eval-composed tools: every test that passed before the reconciliation against `read_heading` and `find_by_property` continues to pass, including those that assert `details.code: ERR_NO_ACTIVE_FILE` on their canonical failure paths.
- **SC-003**: Classifier match rate against canonical-phrase emits reaches 100% on the two widened branches: every "Error: No active file." emit (any casing) from `delete` / `rename` / `outline` is classified as `ERR_NO_ACTIVE_FILE`; every "Error: View not found: <name>" emit (any channel) from `query_base` is classified as `VIEW_NOT_FOUND`. Baseline today: 0% on both branches.
- **SC-004**: The `search` help-doc roster has zero documented-but-never-produced codes AND zero produced-but-never-documented codes, measured against an enumeration of reachable invocations on the Cowork pathway.
- **SC-005**: The `read_property` spec and rendered help doc agree on the malformed-frontmatter surface — a textual diff of the two artefacts on this contract yields zero conflicting claims.
- **SC-006**: A fixture vault carrying case-variant frontmatter property names (e.g. `AaTest` + `aatest`) returns exactly one merged `properties` entry with `noteCount: 2`, and the help doc describes this collapse rule.
- **SC-007**: For each of the three `query_base` response-shape claims (empty-view `columns`, type-preservation passthrough, `file.*` column-name emission), the rendered help doc and schema description match an empirical capture from the live CLI against a fixture verbatim on the documented detail.
- **SC-008**: Cycle cost: one reconciliation lands, one BI-0027 audit re-runs cohort-wide post-ship — total of one audit re-run rather than six sequential per-tool re-runs.

## Assumptions

- **A1**: The upstream CLI's no-active-file emit on `delete`, `rename`, `outline` uses the canonical phrase "Error: No active file." (capital N, period terminator). The classifier widens to case-insensitive match against this phrase; if a future upstream version reshapes the phrase, that is a new BI.
- **A2**: The upstream CLI's view-not-found emit on `query_base` uses the canonical phrase "Error: View not found: <name>" on stdout with `exitCode: 0`. The classifier widens to scan both stdout and stderr; if a future upstream version reshapes the phrase or channel, that is a new BI.
- **A3**: Upstream stringifies all frontmatter values regardless of declared YAML type and applies case-insensitive dedup on property names. These observations are stable as of the supported CLI floor; the doc reconciles to them.
- **A4**: For `read_property` malformed-frontmatter (Story 5) AND `properties` dedup (Story 6), the live wrapper's current emission is the source of truth — both the spec and the help doc reconcile to it. No runtime behaviour change is in scope. This matches the Story 6 acceptance criterion ("the spec is retired or amended so the asserted contract matches the observed shape") applied uniformly to Story 5.
- **A5**: The BI-0027 audit framework — its pass criteria and Dimension framing — does not change mid-cycle. This feature satisfies the existing audit; it does not redefine it.
- **A6**: The seven tools listed are the complete cohort scope for this reconciliation. Drift findings on tools outside the list (`links`, `set_property`, `find_and_replace`, `pattern_search`, `context_search`, `paths`, `files`, `tag`, `backlinks`, `move`, `obsidian_exec`, `read`, `read_heading`, `find_by_property`, `write_note`) escape via separate per-tool BIs surfaced by future BI-0027 passes.
- **A7**: Only two unrealised sub-discriminator promises are widened in this BI (`ERR_NO_ACTIVE_FILE`, `VIEW_NOT_FOUND`). If the audit surfaces a third unrealised promise, a follow-up BI captures it rather than expanding scope.
- **A8**: Help-doc and spec wording style edits outside the empirical-claim accuracy boundary are out of scope; copy-edit cleanups bundle into a separate change.
- **A9**: Mid-cycle per-tool audit re-runs are not part of the cycle — the audit re-runs once cohort-wide post-ship.

## Out of Scope

- Runtime behaviour changes outside the classifier-ladder widening for `ERR_NO_ACTIVE_FILE` (FR-001) and `VIEW_NOT_FOUND` (FR-003/FR-004). The wrapper does NOT begin coercing types, parsing `.base` YAML client-side to enumerate columns on empty results, or remapping upstream display labels back to YAML segment names. Type-coercion, YAML-parse, and label-remap are contra-design per the originating per-tool BIs.
- New typed sub-discriminator codes beyond the two named (`ERR_NO_ACTIVE_FILE`, `VIEW_NOT_FOUND`). A third unrealised promise discovered by the post-ship audit escapes via a follow-up BI.
- Cohort tools not listed (per Assumption A6). Reconciliation for any of those tools is scoped via separate per-tool BIs surfaced by future BI-0027 passes.
- Audit framework changes to BI-0027 itself. The pass criteria and Dimension framing remain stable.
- Help-doc and spec wording style edits unrelated to drift findings. Reconciliation is empirical-claim accuracy only.
- Mid-cycle audit re-runs. The reconciliation lands once, the audit re-runs once cohort-wide post-ship.
