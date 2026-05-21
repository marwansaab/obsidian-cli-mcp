---

description: "Task list for Close Audit Findings (BI-042)"
---

# Tasks: Close Audit Findings

**Input**: Design documents from `/specs/042-close-audit-findings/`
**Prerequisites**: [plan.md](plan.md) (required), [spec.md](spec.md) (required for user stories), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Test tasks are included only for the Story 4 runtime change (per Constitution Principle II + FR-013). All other stories are documentation-only and require no new test tasks; the existing `_register-baseline.test.ts` round-trip continues to cover the help-doc + schema `.describe()` surfaces.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US8 per spec.md)
- File paths are absolute or repo-root-relative.

## Path Conventions

- **Single project**: `src/`, `docs/`, `specs/` at repository root (per [plan.md](plan.md) Project Structure).
- Tests are co-located `*.test.ts` next to their source module (Constitution Principle II).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Capture the binary version + test-vault scaffolding referenced by every probe-using story (Stories 3, 5, 6, 7).

- [ ] T001 Capture `obsidian --version` output and the authorised test-vault path; record both as the first line of [contracts/vault-probe-evidence.md](contracts/vault-probe-evidence.md) (the file is created here with only the header — per-tool records appended during Phase 5). Prerequisite read: [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None. Each user story is self-contained against the existing wrapper surface. The probe-evidence files are scaffolded per-story rather than upfront because each story owns its own probe domain.

**Checkpoint**: Foundation ready — user story implementation can begin in parallel.

---

## Phase 3: User Story 1 — `read_property` malformed-frontmatter spec/help-doc agreement (Priority: P1) 🎯 MVP

**Goal**: Retire the surviving "structured error" claim at [specs/013-read-property/spec.md](../013-read-property/spec.md) AC9 (User Story 1 acceptance scenario 9) so the feature spec agrees with the help-doc at [docs/tools/read_property.md](../../docs/tools/read_property.md) on the empty-value+`unknown` shape.

**Independent Test**: Re-read [specs/013-read-property/spec.md](../013-read-property/spec.md) AC9 and confirm it describes `{ value: null, type: "unknown" }` (no structured-error language). Cross-check against the help-doc.

- [ ] T002 [P] [US1] Edit [specs/013-read-property/spec.md](../013-read-property/spec.md) User Story 1 acceptance scenario 9 (line 35) per [contracts/predecessor-spec-retirements.md](contracts/predecessor-spec-retirements.md) §Story 1: replace the "fails with a structured error" text with the empty-value+`unknown` shape; add the BI-041 Principle IV authorisation cross-reference.
- [ ] T003 [P] [US1] Confirm [docs/tools/read_property.md](../../docs/tools/read_property.md) malformed-frontmatter description matches the empty-value+`unknown` shape (no edit expected — BI-041 landed this surface; record verification in commit message). If a residual contradiction is found, fix in this same task.

**Checkpoint**: User Story 1 ships; AC9 retirement closes the predecessor partial-ship for `read_property`.

---

## Phase 4: User Story 2 — `properties` dedup contract retirement (Priority: P1)

**Goal**: Retire the case-sensitive dedup promise and the byte-order tiebreak claim from [specs/024-list-properties/spec.md](../024-list-properties/spec.md); name upstream's case-insensitive collapse as the authoritative contract.

**Independent Test**: Re-read [specs/024-list-properties/spec.md](../024-list-properties/spec.md) and confirm no FR promises case-sensitive dedup. The byte-tiebreak is either removed or explicitly labelled structurally unobservable.

- [ ] T004 [P] [US2] Edit [specs/024-list-properties/spec.md](../024-list-properties/spec.md) per [contracts/predecessor-spec-retirements.md](contracts/predecessor-spec-retirements.md) §Story 2: drop every "case-sensitive" promise; promote the case-insensitive collapse rule to the authoritative contract; either remove the byte-tiebreak rule or label it "structurally unobservable — upstream collapses the very inputs the tiebreak was designed to disambiguate."
- [ ] T005 [P] [US2] Confirm [docs/tools/properties.md](../../docs/tools/properties.md) and [src/tools/properties/schema.ts](../../src/tools/properties/schema.ts) `.describe()` already align with the case-insensitive collapse contract (BI-041 surface; record verification in commit message). If a residual contradiction is found, fix in this same task.

**Checkpoint**: User Story 2 ships; dedup-FR retirement closes the predecessor partial-ship for `properties`.

---

## Phase 5: User Story 3 — `vault=` cohort empirical reconciliation (Priority: P1)

**Goal**: Probe each cohort tool's `vault=` empirical behaviour and reconcile every "silently honoured-as-noop" / "functionally ignored" framing in its docs to match (Branch A — retire; Branch B — anchor with date + binary version).

**Independent Test**: For each cohort tool, the per-tool surface (help-doc + feature spec if exists + schema `.describe()`) either describes the empirical surface AND names no surviving "silently honoured" phrasing, OR carries the existing phrasing followed immediately by an empirical anchor `(Empirical anchor: <date>, obsidian-cli v<version>)`. Mixed states are audit failures.

### Probes + per-tool reconciliations

> Each task below performs the three-invocation probe (A focused / B unfocused / C unregistered) per [contracts/vault-cohort-reconciliation.md](contracts/vault-cohort-reconciliation.md), classifies the result, records the probe payload to [contracts/vault-probe-evidence.md](contracts/vault-probe-evidence.md), AND edits the tool's per-tool surfaces per the classification's reconciliation rule.

- [ ] T006 [P] [US3] Probe + reconcile `outline` (touches [docs/tools/outline.md](../../docs/tools/outline.md) at minimum; conditionally touches [src/tools/outline/schema.ts](../../src/tools/outline/schema.ts) `.describe()` if Branch A retraction crosses the schema text).
- [ ] T007 [P] [US3] Probe + reconcile `properties` (touches [docs/tools/properties.md](../../docs/tools/properties.md); conditionally [src/tools/properties/schema.ts](../../src/tools/properties/schema.ts)).
- [ ] T008 [P] [US3] Probe + reconcile `files` (touches [docs/tools/files.md](../../docs/tools/files.md); conditionally [src/tools/files/schema.ts](../../src/tools/files/schema.ts)).
- [ ] T009 [P] [US3] Probe + reconcile `read_heading` (touches [docs/tools/read_heading.md](../../docs/tools/read_heading.md); conditionally [src/tools/read_heading/schema.ts](../../src/tools/read_heading/schema.ts)).
- [ ] T010 [P] [US3] Probe + reconcile `set_property` (touches [docs/tools/set_property.md](../../docs/tools/set_property.md); conditionally [src/tools/set_property/schema.ts](../../src/tools/set_property/schema.ts)).
- [ ] T011 [P] [US3] Probe + reconcile `find_by_property` (touches [docs/tools/find_by_property.md](../../docs/tools/find_by_property.md); conditionally [src/tools/find_by_property/schema.ts](../../src/tools/find_by_property/schema.ts)).
- [ ] T012 [P] [US3] Probe `backlinks` (control case — already classified as response-inspection-reclassification path per [docs/tools/backlinks.md](../../docs/tools/backlinks.md) line 330; deliverable is an empirical anchor on the existing correct text — touches [docs/tools/backlinks.md](../../docs/tools/backlinks.md) only).
- [ ] T013 [P] [US3] Probe + reconcile `read_property` (touches [docs/tools/read_property.md](../../docs/tools/read_property.md); conditionally [src/tools/read_property/schema.ts](../../src/tools/read_property/schema.ts)). Note: this task does NOT touch [specs/013-read-property/spec.md](../013-read-property/spec.md) — that AC9 retirement is owned by US1 (T002).
- [ ] T014 [P] [US3] Probe + reconcile `tag` (touches [docs/tools/tag.md](../../docs/tools/tag.md); conditionally [src/tools/tag/schema.ts](../../src/tools/tag/schema.ts)).

**Checkpoint**: User Story 3 ships; every cohort tool's per-tool surface either carries the empirical surface (Branch A) or the empirical anchor (Branch B). No mixed states.

---

## Phase 6: User Story 4 — `find_and_replace` symmetric sub-discriminator (Priority: P2) — RUNTIME CHANGE

**Goal**: Make the ENOENT-on-subfolder rejection envelope carry `details.reason: "not-found"` so the `(VALIDATION_ERROR, INVALID_SUBFOLDER)` sub-discriminator pair is symmetric with the existing path-traversal-shape rejection branch.

**Independent Test**: An invocation against a missing subfolder returns `details: { code: "INVALID_SUBFOLDER", reason: "not-found", ... }`. An invocation against a path-traversal-shaped subfolder returns `details: { code: "INVALID_SUBFOLDER", reason: "path-traversal", ... }`. Pattern-matching on `details.reason` runs uniformly across both branches without conditional present/absent handling.

### Tests for User Story 4 (Constitution Principle II + FR-013) ⚠️

> **Write/update these tests FIRST. T015 currently passes (asserts absence); after T015 lands the assertion will fail until T017 runtime change ships. T016 is a new test that fails until T017 ships.**

- [ ] T015 [US4] Update existing test at [src/tools/find_and_replace/handler.test.ts:720-733](../../src/tools/find_and_replace/handler.test.ts#L720-L733) — flip the assertion from `details.reason === undefined` to `details.reason === "not-found"`; rename the test description from "ENOENT on subfolder realpath → VALIDATION_ERROR/INVALID_SUBFOLDER (no path-traversal reason)" to "ENOENT on subfolder realpath → VALIDATION_ERROR/INVALID_SUBFOLDER (reason: not-found)". Verify the test now FAILS (the runtime still emits no `reason`).
- [ ] T016 [US4] Add a new symmetry test in [src/tools/find_and_replace/handler.test.ts](../../src/tools/find_and_replace/handler.test.ts) (or co-located in [src/tools/find_and_replace/index.test.ts](../../src/tools/find_and_replace/index.test.ts) alongside the existing path-traversal-reason test at lines 134-148) that triggers both rejection branches and asserts both envelopes carry a `details.reason` field narrowed to the closed union `"path-traversal" | "not-found"`. Verify the test FAILS for the ENOENT branch.

### Implementation for User Story 4

- [ ] T017 [US4] Runtime edit at [src/tools/find_and_replace/handler.ts:512-523](../../src/tools/find_and_replace/handler.ts#L512-L523) — add `reason: "not-found"` to the `details` object literal inside the `UpstreamError` instantiation in the ENOENT branch. After this edit, T015 + T016 both pass; the path-traversal regression test at [src/tools/find_and_replace/index.test.ts:134-148](../../src/tools/find_and_replace/index.test.ts#L134-L148) continues to pass.
- [ ] T018 [P] [US4] Header-comment update at [src/tools/find_and_replace/index.ts:1](../../src/tools/find_and_replace/index.ts#L1) — extend the `details.reason` enumeration from `empty / too-long / regex-syntax / path-traversal` to `empty / too-long / regex-syntax / path-traversal / not-found`.
- [ ] T019 [P] [US4] Doc update at [docs/tools/find_and_replace.md](../../docs/tools/find_and_replace.md) — error-roster row for `INVALID_SUBFOLDER` names both sub-discriminator values (`"path-traversal"`, `"not-found"`) per [contracts/find_and_replace-sub-discriminator.md](contracts/find_and_replace-sub-discriminator.md). The dual-envelope rows for this tool's other field-level constraints land in US5 (T024).

**Checkpoint**: User Story 4 ships; the `(VALIDATION_ERROR, INVALID_SUBFOLDER)` pair carries a symmetric `details.reason` sub-discriminator with closed union `{ "path-traversal", "not-found" }`. Quality gates: `npm run lint`, `npm run typecheck`, `npm run build`, `vitest run` all green.

---

## Phase 7: User Story 5 — Dual validation envelope acknowledgement per tool (Priority: P2)

**Goal**: For each cohort tool with a field-level numeric or length constraint, the error roster names both the wrapped envelope and the MCP transport error envelope side by side, identifying which validation rule produces which envelope.

**Independent Test**: An agent reads each cohort tool's roster, sees both envelope columns, and the probed envelope shape matches the documented shape from either client class.

### Per-tool dual-envelope probes + roster edits

> Each task below probes one tool against both client classes (Cowork-class + strict-rich), records the per-envelope wire shape to [contracts/dual-envelope-evidence.md](contracts/dual-envelope-evidence.md), and edits the per-tool error-roster section in [docs/tools/<name>.md](../../docs/tools/) per [contracts/dual-validation-envelope-roster.md](contracts/dual-validation-envelope-roster.md).

- [ ] T020 [P] [US5] Probe + reconcile dual envelope on `search` (touches [docs/tools/search.md](../../docs/tools/search.md)).
- [ ] T021 [P] [US5] Probe + reconcile dual envelope on `context_search` (touches [docs/tools/context_search.md](../../docs/tools/context_search.md)).
- [ ] T022 [P] [US5] Probe + reconcile dual envelope on `pattern_search` (touches [docs/tools/pattern_search.md](../../docs/tools/pattern_search.md)).
- [ ] T023 [P] [US5] Probe + reconcile dual envelope on `find_by_property` (touches [docs/tools/find_by_property.md](../../docs/tools/find_by_property.md)).
- [ ] T024 [US5] Probe + reconcile dual envelope on `find_and_replace` (touches [docs/tools/find_and_replace.md](../../docs/tools/find_and_replace.md)). NOT [P] — this task touches the same file as T019, so it MUST land after US4's doc edit OR be combined with T019 into a single multi-section doc edit. The probe records still go to [contracts/dual-envelope-evidence.md](contracts/dual-envelope-evidence.md).
- [ ] T025 [P] [US5] Probe + reconcile dual envelope on `backlinks` (touches [docs/tools/backlinks.md](../../docs/tools/backlinks.md)). Coordinates with T012 (US3 anchor on same doc), T031 (US6 truncation on same doc), and T033 (US7 cross-folder caveat on same doc) — see Dependencies section below.
- [ ] T026 [P] [US5] Probe + reconcile dual envelope on `query_base` (touches [docs/tools/query_base.md](../../docs/tools/query_base.md)).
- [ ] T027 [P] [US5] Probe + reconcile dual envelope on `tag` (touches [docs/tools/tag.md](../../docs/tools/tag.md)). Coordinates with T014 (US3 vault= reconciliation on same doc).

**Checkpoint**: User Story 5 ships; every cohort tool's error roster names both envelope shapes.

---

## Phase 8: User Story 6 — Truncation slice direction documented (Priority: P2)

**Goal**: Document the slice direction for each cohort tool emitting a `truncated` flag, plus a cross-tool divergence call-out where the cohort is non-uniform.

**Independent Test**: Each of `search`, `context_search`, `backlinks` documents its slice direction explicitly; any tool whose direction differs from a sibling carries a divergence call-out.

- [ ] T028 [US6] Probe `backlinks` slice direction against a fixture target with cross-folder source count > the `backlinks` cap; record direction (leading vs trailing) in [contracts/truncation-direction-evidence.md](contracts/truncation-direction-evidence.md). Search and context_search are LEADING per code read at [src/tools/search/handler.ts:125](../../src/tools/search/handler.ts#L125) and [src/tools/context_search/handler.ts:147](../../src/tools/context_search/handler.ts#L147); only `backlinks` requires the empirical capture.
- [ ] T029 [P] [US6] Doc edit at [docs/tools/search.md](../../docs/tools/search.md) — name LEADING slice direction in the output-contract section per [contracts/truncation-direction-roster.md](contracts/truncation-direction-roster.md). Divergence call-out included only if T028 returns TRAILING for backlinks (otherwise the cohort is uniform).
- [ ] T030 [P] [US6] Doc edit at [docs/tools/context_search.md](../../docs/tools/context_search.md) — same as T029.
- [ ] T031 [US6] Doc edit at [docs/tools/backlinks.md](../../docs/tools/backlinks.md) — name slice direction per T028 outcome; include divergence call-out if direction differs from search/context_search. NOT [P] with T025/T012/T033 (same file).

**Checkpoint**: User Story 6 ships; truncation slice direction documented per tool. Cross-tool divergence is either called out or proved absent.

---

## Phase 9: User Story 7 — `backlinks` cross-folder reach caveat (Priority: P3)

**Goal**: Add an explicit caveat to the `backlinks` docs naming the bare-basename vault-wide reach behaviour.

**Independent Test**: A fixture vault probe confirms cross-folder sources are returned; the help-doc carries the canonical caveat text from [contracts/backlinks-cross-folder-caveat.md](contracts/backlinks-cross-folder-caveat.md).

- [ ] T032 [US7] Probe `backlinks` against a fixture with `notes/target.md` (basename `target` unique vault-wide), `notes/local/source-a.md` carrying `[[target]]`, and `other/source-b.md` carrying `[[target]]`. Assert both sources appear in the response. Record in [contracts/backlinks-cross-folder-evidence.md](contracts/backlinks-cross-folder-evidence.md).
- [ ] T033 [US7] Doc edit at [docs/tools/backlinks.md](../../docs/tools/backlinks.md) — add the "Cross-folder reach" subsection per [contracts/backlinks-cross-folder-caveat.md](contracts/backlinks-cross-folder-caveat.md). NOT [P] with T012/T025/T031 (same file).

**Checkpoint**: User Story 7 ships; cross-folder reach caveat is in the help-doc.

---

## Phase 10: User Story 8 — Cohort audit re-run (Priority: P3) — VERIFICATION

**Goal**: Run the maintainer audit pass against the 13 cohort tools; record one row per tool clearing the 5 pass criteria from [research.md](research.md) Task 8.

**Independent Test**: [audit-pass-record.md](audit-pass-record.md) exists with one row per cohort tool and zero residual findings within the cohort scope.

- [ ] T034 [US8] Walk the cohort (`read_property`, `properties`, `outline`, `find_by_property`, `read_heading`, `files`, `search`, `context_search`, `pattern_search`, `find_and_replace`, `backlinks`, `query_base`, `tag`); for each, evaluate the five pass criteria:
  1. No rogue codes (grep `handler.ts` for `UpstreamError({ code:`; cross-check against the tool's error roster).
  2. No documented-but-never-produced codes (walk roster, attempt a probe per code, confirm production).
  3. No produced-but-never-documented codes (enumerate unique `code` instantiations; confirm in roster).
  4. No doc-vs-empirical-behaviour drift (spot-check the empirical claims this BI touches).
  5. No asymmetric sub-discriminator labelling (walk every `(top-level, details.code)` pair; confirm `details.reason` is present per ADR-015 where multi-state).
  Record one row per tool in [audit-pass-record.md](audit-pass-record.md). Residual findings within scope block this story; residual findings outside the named cohort surface as follow-up issues per Out-of-Scope.

**Checkpoint**: User Story 8 ships; the audit umbrella's open-findings ledger reaches zero entries within the scope of stories 1–7.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T035 [P] Run [quickstart.md](quickstart.md) verification walkthrough end-to-end for each user story; record pass/fail per block.
- [ ] T036 Run the merge-gating quality suite: `npm run lint`, `npm run typecheck`, `npm run build`, `npx vitest run`. All four MUST be green. Record outcomes in the final commit message of US4 (the only runtime-touching story).
- [ ] T037 [P] Confirm [CLAUDE.md](../../CLAUDE.md) SPECKIT marker block points at `specs/042-close-audit-findings/plan.md`. No edit expected — already done during /speckit-plan; verify only.
- [ ] T038 [P] Cross-check [audit-pass-record.md](audit-pass-record.md) against every story's checkpoint to confirm SC-001 / SC-002 / SC-003 / SC-004 / SC-005 / SC-006 are all satisfied.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 has no dependencies; runs immediately. Captures the binary version + test-vault scaffolding referenced by every probe.
- **Foundational (Phase 2)**: none — every user story is self-contained.
- **User Stories**: all can start after Setup (T001) completes. P1 stories (US1, US2, US3) take priority for MVP; P2 (US4, US5, US6) and P3 (US7, US8) follow.
- **Polish (Phase 11)**: depends on US1–US8 all complete.

### User Story Dependencies

- **US1 (P1)**: depends on T001 only (no probe required, but the BI-041 evidence anchor is read).
- **US2 (P1)**: depends on T001 only.
- **US3 (P1)**: depends on T001; probe records persist to [contracts/vault-probe-evidence.md](contracts/vault-probe-evidence.md).
- **US4 (P2)**: depends on T001; T015 → T016 (test additions) → T017 (runtime change) → T018 (header) → T019 (doc) within the story.
- **US5 (P2)**: depends on T001.
- **US6 (P2)**: depends on T001.
- **US7 (P3)**: depends on T001.
- **US8 (P3)**: depends on US1–US7 ALL complete — Story 8 is the verification pass and cannot return clear results before the other stories land.

### Cross-story file conflicts (sequential ordering required)

The following tasks touch the same file and MUST land in sequence (or be merged into a single doc edit task during /speckit-implement):
- [docs/tools/backlinks.md](../../docs/tools/backlinks.md): T012 (US3 anchor) → T025 (US5 dual envelope) → T031 (US6 truncation direction) → T033 (US7 cross-folder caveat). Recommended: bundle T012 + T025 + T031 + T033 into a single backlinks-doc-edit task when implementing, then split the commit per US for traceability if desired.
- [docs/tools/find_and_replace.md](../../docs/tools/find_and_replace.md): T019 (US4 sub-discriminator) → T024 (US5 dual envelope). T024 MUST land after T019 OR be combined.
- [docs/tools/tag.md](../../docs/tools/tag.md): T014 (US3 vault=) → T027 (US5 dual envelope). T027 MUST land after T014 OR be combined.

### Within Each User Story

- For US4: tests first (T015 + T016 fail) → implementation (T017) → both tests pass → header + docs (T018, T019).
- For US3 / US5 / US6 / US7: probes first → doc edits informed by probe outcomes.
- Quality gates fire at the end of US4 (the only runtime-touching story) and again as part of Phase 11 (T036).

### Parallel Opportunities

- US1 (T002, T003) and US2 (T004, T005) — both touch separate predecessor spec files; all four parallel.
- US3 probes (T006–T014) — 9 tools, all [P] (different files).
- US5 dual-envelope probes (T020–T027) — 8 tools, all [P] EXCEPT T024 (find_and_replace conflict with T019) and T025/T027 (backlinks/tag conflict with US3/US6/US7).
- US6 doc edits (T029, T030) — parallel (search, context_search); T031 sequential on backlinks.
- US4 tests (T015, T016) — same file in most cases; sequential within US4.
- Polish (T035, T037, T038) — parallel.

---

## Parallel Example: P1 wave (US1 + US2 + US3 probes)

After T001 lands, kick off in parallel:

```text
US1: T002 + T003          # specs/013-read-property/spec.md + docs/tools/read_property.md verify
US2: T004 + T005          # specs/024-list-properties/spec.md + docs/tools/properties.md + schema.ts verify
US3: T006 + T007 + T008 + T009 + T010 + T011 + T012 + T013 + T014   # 9 cohort probes
```

13 parallelisable tasks delivering all three P1 stories.

## Parallel Example: P2 runtime + docs (US4 + US5)

After P1 lands:

```text
US4: T015 → T016 → T017 → T018 + T019    # sequential within story
US5: T020 + T021 + T022 + T023 + T026     # parallel doc edits on tools not touched by other stories
US5 (sequenced): T024 after T019 ships    # find_and_replace conflict
```

---

## Implementation Strategy

### MVP First (User Stories 1, 2, 3)

The three P1 stories are the MVP: they close the predecessor partial-ship loose ends (US1 + US2) AND the largest cohort drift (US3 `vault=` reconciliation). Shipping this MVP alone closes most of the audit ledger.

1. Complete Phase 1 (T001).
2. Complete US1, US2, US3 in parallel.
3. STOP and validate: re-read the three sets of touched docs; run a spot-probe against one tool per story.
4. Deploy/demo if ready.

### Incremental Delivery

1. Phase 1 → US1 + US2 + US3 (P1 MVP) → Test independently → Deploy/Demo.
2. Add US4 (runtime change) → quality gates green → Deploy.
3. Add US5 (dual envelope cohort) → Deploy.
4. Add US6 (truncation direction) → Deploy.
5. Add US7 (cross-folder caveat) → Deploy.
6. Add US8 (audit verification) → Deploy.
7. Polish (Phase 11).

Each story adds value without breaking previous stories.

### Single-developer linear order

If implemented sequentially by one developer:

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025 → T026 → T027 → T028 → T029 → T030 → T031 → T032 → T033 → T034 → T035 → T036 → T037 → T038.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story (US1–US8).
- File conflicts between stories (`backlinks.md`, `find_and_replace.md`, `tag.md`) must be sequenced or bundled; see Cross-story file conflicts above.
- Commit boundary recommendation: one commit per user story (or per story-phase chunk for US3 / US5 which span many tools). This matches the `auto_commit.<event>` git-extension convention and keeps blame attribution scoped to each story's FRs.
- The single runtime change (US4) ships with co-located test additions in the same commit per Constitution Principle II.
- Per the project test-scope memory, no integration TC scaffolding under `specs/042-.../test-cases/` — manual probes are tracker-side. Probe-evidence files in `contracts/` capture the characterisation payloads.
