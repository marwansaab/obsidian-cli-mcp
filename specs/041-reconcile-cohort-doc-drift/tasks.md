---

description: "Task list for BI-041: Reconcile Cohort-Wide Tool Doc and Classifier Drift"
---

# Tasks: Reconcile Cohort-Wide Tool Doc and Classifier Drift

**Input**: Design documents from `/specs/041-reconcile-cohort-doc-drift/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: REQUIRED per Constitution Principle II (NON-NEGOTIABLE). Every public-surface change ships co-located `*.test.ts` covering happy-path + failure-or-boundary. Tests are written FIRST per the project's TDD discipline.

**Organization**: Tasks are grouped by the six user stories in the spec, ordered by priority (P1 → P2 → P3). Independent-test criteria match the spec's `**Independent Test**` lines.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US6)
- Include exact file paths in descriptions

## Path Conventions

Single TypeScript project rooted at `src/`. Tests co-located as `*.test.ts` per the source module they cover. Help-doc artefacts under `docs/tools/`. No new directories created by this BI.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm pre-BI baseline so post-BI regression delta is verifiable.

- [ ] T001 Run `npm test` to capture pre-BI baseline (vitest pass count + aggregate coverage threshold per `vitest.config.ts`). Record results — used as the regression reference for the final cohort-wide green-gate (T046).
- [ ] T002 Read `.memory/test-execution-instructions.md` and confirm the authorised test vault + scratch subdirectory are reachable. T0 probes in later phases run there.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: T0 probe sweep against the live `obsidian` binary capturing every empirical anchor downstream stories cite. Bundling the captures into one live-CLI session reduces upstream-version-drift risk mid-cycle and lets all six stories proceed in parallel afterwards.

**⚠️ CRITICAL**: No user-story work can begin until Phase 2 completes.

- [ ] T003 [P] T0 probe — capture verbatim stdout bytes + exit code for `delete` / `rename` / `outline` invoked in active mode with no focused file. Confirm spec A1: leading line is `"Error: No active file."` (capital N, period). Record per-subcommand result in a working notes file under the test vault scratch subdir (cleaned up after Phase 9).
- [ ] T004 [P] T0 probe — capture verbatim stdout + stderr + exit code for `query_base` invoked against a fixture `.base` declaring view `Open` with `view_name=NonExistentView`. Confirm spec A2: stdout = `"Error: View not found: NonExistentView\n"`, stderr = empty, exit code = 0.
- [ ] T005 [P] T0 probe — capture verbatim wire response for `read_property` invoked against fixture note with malformed YAML frontmatter (body per `contracts/read_property-malformed-frontmatter.md`). Determine Branch A (empty-value-`type:"unknown"`) vs Branch B (typed-code). Record in research.md as a captured-shape addendum.
- [ ] T006 [P] T0 probe — capture three `query_base` response-shape anchors per `research.md` Task 5: (a) empty-view → `{ columns: ["path"], rows: [] }`; (b) integer YAML `count: 42` → row carries `count: "42"` string; (c) `file.path` + `file.name` columns → `columns: ["path", "file name"]` (embedded space).
- [ ] T007 [P] T0 probe — capture two `properties` reachability anchors per `contracts/properties-dedup.md`: two case-variant fixture notes (`AaTest.md` + `aatest.md`) yield exactly one merged entry with `noteCount: 2`. Record which casing upstream emits in the merged entry (asserted with case-insensitive regex in T034).
- [ ] T008 [P] T0 probe — enumerate `search` codes reachable on the Cowork pathway (post-strip-and-coerce). Record each, plus confirm the two BI-0086 carve-out codes (`VALIDATION_ERROR(unrecognized_keys)`, out-of-range `limit`) are Cowork-unreachable AND strict-rich-reachable. Strict-rich verification via MCP Inspector.

**Checkpoint**: All empirical anchors captured. User-story phases can now proceed in parallel.

---

## Phase 3: User Story 1 - Typed `ERR_NO_ACTIVE_FILE` on `delete` / `rename` / `outline` (Priority: P1) 🎯 MVP

**Goal**: Restore the typed `details.code: ERR_NO_ACTIVE_FILE` sub-discriminator on the three native CLI subcommands by widening the dispatch-layer classifier to case-insensitive match against the upstream's canonical phrase.

**Independent Test**: Spawn each tool against an active vault with no focused file; assert response carries `code: CLI_REPORTED_ERROR` AND `details.code: ERR_NO_ACTIVE_FILE` AND the verbatim recovery message. Plus regression-guard: same `details.code` continues to fire on `read_heading` / `find_by_property` (eval-composed).

### Tests for User Story 1 (write FIRST, ensure FAIL before implementation)

- [ ] T009 [P] [US1] Add 5 cases to `src/cli-adapter/_dispatch.test.ts` per `contracts/cli-adapter-classification.md` "Test additions": (1) capital-N classifies; (2) period-terminator + capital-N classifies; (3) mixed-case variants classify; (4) lowercase regression-guard; (5) substring-of-longer-unrelated-message guard (must NOT classify). Run vitest — assert (1), (2), (3) FAIL on current code; (4), (5) pass.
- [ ] T010 [P] [US1] Mirror cases (1), (2), (3), (4) in `src/cli-adapter/cli-adapter.test.ts` (integration-through-test-stub path). Run vitest — assert (1), (2), (3) FAIL on current code.

### Implementation for User Story 1

- [ ] T011 [US1] Edit `src/cli-adapter/_dispatch.ts:294` — replace case-sensitive `trimmedHead.startsWith("Error: no active file")` with case-insensitive equivalent: `trimmedHead.toLowerCase().startsWith("error: no active file")`. Preserve all surrounding body lines (UpstreamError construction, recovery message, details payload). See `contracts/cli-adapter-classification.md` "After" block.
- [ ] T012 [US1] Re-run vitest on `src/cli-adapter/` — assert all 5 new cases pass; all pre-existing tests pass (monotonic-widening invariant).
- [ ] T013 [US1] Regression-guard verification — re-run vitest on `src/tools/read_heading/handler.test.ts` and `src/tools/find_by_property/handler.test.ts`. Assert all pre-existing assertions on `details.code: "ERR_NO_ACTIVE_FILE"` continue to pass (FR-002 / SC-002).

**Checkpoint**: User Story 1 ships. `delete` / `rename` / `outline` now surface the typed sub-discriminator on the upstream's capital-N canonical emit.

---

## Phase 4: User Story 2 - Typed `VIEW_NOT_FOUND` on `query_base` (Priority: P1)

**Goal**: Restore the typed `details.code: VIEW_NOT_FOUND` sub-discriminator on `query_base` by widening the handler-layer classifier to scan both stdout AND stderr (not stderr-only with stdout fallback).

**Independent Test**: Construct a fixture `.base` with declared view `Open`; invoke with `view_name=NonExistentView`; assert `details.code: VIEW_NOT_FOUND` + `details.view_name` + `details.base_path`. Plus regression-guard: BASE_NOT_FOUND fires on non-existent `.base` path (unchanged).

### Tests for User Story 2 (write FIRST, ensure FAIL before implementation)

- [ ] T014 [P] [US2] Add 5 cases to `src/tools/query_base/handler.test.ts` per `contracts/query_base-classification.md` "Test additions": (1) stdout-only VIEW_NOT_FOUND emit classifies; (2) stdout VIEW_NOT_FOUND + incidental stderr classifies (bug-fix anchor); (3) stderr-only VIEW_NOT_FOUND emit classifies (regression-guard, pre-existing); (4) BASE_NOT_FOUND on non-existent `.base` path (regression-guard); (5) JSON-array short-circuit preserved (stdout `[]\n` + warn stderr → empty-result envelope). Run vitest — assert (2) FAILS on current code; (1), (3), (4), (5) pass.

### Implementation for User Story 2

- [ ] T015 [US2] Edit `src/tools/query_base/handler.ts:387-389` — replace prefer-stderr-fallback ternary with both-channel concatenation per `contracts/query_base-classification.md` "After" block. Preserve the `[`-prefix short-circuit guard on `stdoutTrimmed` directly so successful row responses are not misclassified.
- [ ] T016 [US2] Re-run vitest on `src/tools/query_base/` — assert all 5 cases pass; all pre-existing tests pass.

**Checkpoint**: User Story 2 ships. `query_base` now surfaces VIEW_NOT_FOUND on stdout-only emits with incidental stderr.

---

## Phase 5: User Story 3 - `query_base` response-shape docs match live emission (Priority: P2)

**Goal**: Three help-doc + schema-description edits acknowledging the live behaviour for empty-view columns, type-preservation passthrough, and `file.*` column-name emission.

**Independent Test**: Read the updated `query_base` schema description and help doc; for each of the three claims, contrast the documented shape against the empirical capture from T006; assert no divergence remains.

### Tests for User Story 3 (write FIRST, ensure FAIL before implementation)

- [ ] T017 [P] [US3] Add 3 brittle-string assertions to `src/tools/query_base/schema.test.ts` per `contracts/query_base-doc-shape.md` "Test additions": (1) empty-view columns claim present; (2) type-preservation passthrough claim present; (3) `file.*` non-uniform emission claim present. Run vitest — all 3 FAIL on current code.

### Implementation for User Story 3

- [ ] T018 [US3] Edit `src/tools/query_base/schema.ts` `.describe()` — append the empty-view columns claim text per `contracts/query_base-doc-shape.md` "Edit 1 — After" block (FR-006). Use the verbatim T006 (a) capture as the empirical anchor citation.
- [ ] T019 [US3] Edit `src/tools/query_base/schema.ts` `.describe()` — append the type-preservation passthrough claim text per `contracts/query_base-doc-shape.md` "Edit 2 — After" block (FR-007). Use the verbatim T006 (b) capture as the empirical anchor citation.
- [ ] T020 [US3] Edit `src/tools/query_base/schema.ts` `.describe()` — append the `file.*` column-name emission claim text per `contracts/query_base-doc-shape.md` "Edit 3 — After" block (FR-008). Use the verbatim T006 (c) capture as the empirical anchor citation.
- [ ] T021 [P] [US3] Mirror all three claim edits to `docs/tools/query_base.md` (longer-form rendering of the same claims; help-doc text reviewed by inspection during PR review per Principle III: schema `.describe()` is the canonical text).
- [ ] T022 [US3] Re-run vitest on `src/tools/query_base/` — assert all 3 new schema-test cases pass; all pre-existing tests pass.

**Checkpoint**: User Story 3 ships. Agents reading `query_base` doc / schema receive empirically-accurate shape descriptions.

---

## Phase 6: User Story 4 - `search` help-doc error roster matches reality on the Cowork pathway (Priority: P2)

**Goal**: Reconcile the `search` error roster against the Cowork pathway (post-client-side-strip-and-coerce reachability), with explicit BI-0086 carve-out flags for the two strict-rich-pathway-only codes.

**Independent Test**: Enumerate `search` invocations on the Cowork pathway (per T008); assert each produced code appears in the roster; assert each unflagged roster entry is Cowork-produced; assert the two BI-0086 carve-outs are roster-flagged AND fire on strict-rich (MCP Inspector) but NOT on Cowork.

### Tests for User Story 4 (write FIRST, ensure FAIL before implementation)

- [ ] T023 [P] [US4] Add 3 brittle-string assertions to `src/tools/search/schema.test.ts` per `contracts/search-roster.md` "Test additions": (1) carve-out flag pattern present exactly twice; (2) `VALIDATION_ERROR(unrecognized_keys)` flagged; (3) out-of-range `limit` flagged. Run vitest — all 3 FAIL on current code.

### Implementation for User Story 4

- [ ] T024 [US4] Edit `src/tools/search/schema.ts` `.describe()` — reconcile the error roster per `contracts/search-roster.md` reconciliation principle. Apply FR-009 (a)/(b)/(c): every Cowork-reachable code present and unflagged; the two BI-0086 carve-outs present with the inline italic suffix `*(strict-rich pathway only, per BI-0086 — <reason>)*`; no documented-but-never-produced codes (delete unreachables identified by T008).
- [ ] T025 [P] [US4] Mirror the reconciled roster to `docs/tools/search.md`. Same content, longer prose form.
- [ ] T026 [US4] Re-run vitest on `src/tools/search/` — assert all 3 new schema-test cases pass; all pre-existing tests pass.

**Checkpoint**: User Story 4 ships. `search` roster honest about Cowork pathway reachability; carve-outs flagged + auditable by grep.

---

## Phase 7: User Story 5 - `read_property` malformed-frontmatter spec + help doc agree (Priority: P2)

**Goal**: Unify `read_property` spec and help doc to the live malformed-YAML-frontmatter shape captured by T005. No runtime change.

**Independent Test**: Capture the live wrapper's response for a note with malformed YAML frontmatter (from T005); assert the spec and help doc both describe that captured shape verbatim.

### Tests for User Story 5 (write FIRST, ensure FAIL before implementation)

- [ ] T027 [P] [US5] Add 1-2 assertions to `src/tools/read_property/schema.test.ts` per `contracts/read_property-malformed-frontmatter.md` "Test additions": malformed-frontmatter contract text present (matching captured shape from T005), AND spec↔help-doc agreement (substring search both files). Run vitest — assertion FAILS on current code (artefacts disagree).

### Implementation for User Story 5

- [ ] T028 [US5] Decision: T005 capture is Branch A (empty-value-`type:"unknown"`) or Branch B (typed-code). Record the branch + verbatim captured shape in `contracts/read_property-malformed-frontmatter.md` "Pre-edit state" → "Captured live shape" addendum.
- [ ] T029 [US5] Edit `src/tools/read_property/schema.ts` `.describe()` — adopt the captured Branch's text per `contracts/read_property-malformed-frontmatter.md` "Branch A" or "Branch B" "Edit" block. Substitute the verbatim T005 capture for placeholder fields.
- [ ] T030 [P] [US5] Mirror the unified text to `docs/tools/read_property.md`.
- [ ] T031 [US5] Re-run vitest on `src/tools/read_property/` — assert new schema-test case passes; all pre-existing tests pass.
- [ ] T032 [US5] **Conditional**: if Branch A captured, mark the conditional Complexity Tracking row in `plan.md` as pending /speckit-analyze ruling. If Branch B captured, remove the conditional row entirely (no Principle IV gate trigger).

**Checkpoint**: User Story 5 ships. `read_property` spec ↔ help doc agree on the malformed-frontmatter shape. /speckit-analyze handles the Principle IV gate at audit time if Branch A.

---

## Phase 8: User Story 6 - `properties` dedup contract matches upstream (Priority: P3)

**Goal**: Promote the live case-insensitive collapse rule from spec assertion to documented contract. Retire the byte-tiebreak-ordering claim. No runtime change.

**Independent Test**: Construct fixture notes with case-variant property names; invoke `properties`; assert one entry with `noteCount: 2`; assert the help doc and schema describe the collapse rule.

### Tests for User Story 6 (write FIRST, ensure FAIL before implementation)

- [ ] T033 [P] [US6] Add case-variant collapse fixture to `src/tools/properties/handler.test.ts` per `contracts/properties-dedup.md` "Test additions" #3. Mock upstream emission representing two notes (`AaTest.md` + `aatest.md`); assert one entry with `noteCount: 2` + case-insensitive regex on the reported casing. Run vitest — assertion passes on current code (the runtime is correct; only the doc was wrong) but documents the expected behaviour going forward.
- [ ] T034 [P] [US6] Add 2 brittle-string assertions to `src/tools/properties/schema.test.ts` per `contracts/properties-dedup.md` "Test additions" #1, #2: (1) `"case-insensitive"` + `"collapse"` (or `"merge"`) present; (2) `"byte-tiebreak"` NOT present. Run vitest — both FAIL on current code (the schema description still asserts byte-tiebreak).

### Implementation for User Story 6

- [ ] T035 [US6] Edit `src/tools/properties/schema.ts` `.describe()` — replace the byte-tiebreak-ordering claim with the case-insensitive collapse rule text per `contracts/properties-dedup.md` "Edit" block.
- [ ] T036 [P] [US6] Mirror to `docs/tools/properties.md`.
- [ ] T037 [P] [US6] Add the retraction note to `specs/024-list-properties/spec.md` per `contracts/properties-dedup.md` "Spec retirement" block. Preserve the original claim text; append the inline retraction note pointing at this BI's contract file.
- [ ] T038 [US6] Re-run vitest on `src/tools/properties/` — assert all new cases pass; all pre-existing tests pass.

**Checkpoint**: User Story 6 ships. `properties` doc/schema describe the live case-insensitive collapse; older spec carries the retraction note.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates, structural verification, cohort-wide audit submission.

- [ ] T039 Run `npm run lint` — confirm zero warnings per Constitution gate 1.
- [ ] T040 Run `npm run typecheck` — confirm clean per Constitution gate 2.
- [ ] T041 Run `npm run build` — confirm dist artefacts emit per Constitution gate 3.
- [ ] T042 Run `npm test` (vitest run --coverage) — confirm full suite green per Constitution gate 4; aggregate-statements threshold from `vitest.config.ts` holds per Constitution gate 5.
- [ ] T043 Run `/graphify --update` to refresh semantic graph nodes after prose/spec/handler-comment changes. Then verify per CLAUDE.md "Graph consultation during Spec Kit phases" /speckit-analyze checklist:
  - (a) No new top-level error code nodes outside the `errors.ts` community.
  - (b) `src/cli-adapter/_dispatch.ts` and `src/tools/query_base/handler.ts` stay in their current communities (no surprise relocations from the two runtime edits).
  - (c) `UpstreamError` star degree count unchanged (no new error-class imports).
  - (d) `createLogger` / `createQueue` god-node degrees stable (no DI changes).
- [ ] T044 **Conditional** (only if T028 captured Branch A AND /speckit-analyze rules Principle IV deviation): populate the Complexity Tracking row in `plan.md` with the captured-shape evidence and the discharge rationale. Cite spec Clarifications Q2 as the authorising decision.
- [ ] T045 Draft PR description with Constitution Compliance checklist filled in (Y / N / N/A per Principle I-V + ADR-010 / ADR-013 / ADR-014 / ADR-015). Expected verdict: all Y or N/A; one conditional Complexity Tracking row per T044.
- [ ] T046 Run quickstart.md sections §1–§6 end-to-end against the test vault as the merge-gate validation. Confirm every section's pass condition holds. (§7 — cohort-wide BI-0027 audit re-run — is the external deliverable, submitted post-merge per FR-013 / SC-008.)
- [ ] T047 Clean up the test vault scratch subdirectory per `.memory/test-execution-instructions.md` cleanup protocol. Remove the fixture files created in T003–T008 plus the working notes file.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately.
- **Phase 2 (Foundational T0 probes)**: Depends on Phase 1 — BLOCKS all user-story phases.
- **Phase 3 (US1) / Phase 4 (US2)**: Both depend on Phase 2; both touch independent files (`src/cli-adapter/` vs `src/tools/query_base/`) — can proceed in parallel.
- **Phase 5 (US3) / Phase 6 (US4) / Phase 7 (US5) / Phase 8 (US6)**: All depend on Phase 2; each touches an independent tool dir (`src/tools/query_base/`, `src/tools/search/`, `src/tools/read_property/`, `src/tools/properties/`) — can proceed in parallel. Phase 5 also touches `query_base/schema.ts` while Phase 4 touches `query_base/handler.ts` — independent files within the same tool dir, can proceed in parallel.
- **Phase 9 (Polish)**: Depends on Phases 3–8 complete.

### User Story Independence

Each user story is independently testable per its **Independent Test** criterion (spec.md), and each can ship as an isolated PR if cohort-wide commitment (FR-013) is relaxed. The cohort bundling is justified by the single-audit-re-run cycle commitment, not by code-level coupling — code-level the six stories are independent.

### Within Each User Story

- Tests are written FIRST per the project's TDD discipline and Principle II (NON-NEGOTIABLE). Tests must FAIL on current code; the FR's pass condition is the test going green after implementation.
- Schema `.describe()` edits AND `docs/tools/*.md` edits land together (the "doc IS the contract" invariant — E4 ↔ E5 pair-wise per data-model.md).
- Runtime edits land with their co-located test additions in the same commit per Principle II.

### Parallel Opportunities

**Within Phase 2** (T0 probes): T003, T004, T005, T006, T007, T008 all run against the live binary in independent invocations — all [P]. Single live-CLI session executes them serially for cost reasons, but logically independent.

**Within Phase 3 (US1)**: T009 + T010 are independent test files — both [P].

**Within Phase 5 (US3)**: T017 (schema-test) + T021 (help-doc) are independent files — both [P]. T018, T019, T020 are sequential within `schema.ts` (same file).

**Within Phase 6 (US4)**: T023 (schema-test) + T025 (help-doc) — both [P]. T024 is the schema edit itself, sequential.

**Within Phase 7 (US5)**: T027 (schema-test) + T030 (help-doc) — both [P].

**Within Phase 8 (US6)**: T033, T034, T036, T037 are independent files — all [P]. T035 is the schema edit, sequential.

**Across Phases 3–8** (after Phase 2): all six user-story phases can run in parallel by different developers per the spec's independent-test discipline. Sequencing is required only by the cohort-wide single-PR commitment, not by code-level coupling.

---

## Parallel Example: User Story 1

```bash
# Launch the two test-file additions in parallel:
Task: "Add 5 cases to src/cli-adapter/_dispatch.test.ts per contracts/cli-adapter-classification.md Test additions"
Task: "Mirror cases 1-4 in src/cli-adapter/cli-adapter.test.ts"

# After both red (failing) — single sequential edit:
Task: "Edit src/cli-adapter/_dispatch.ts:294 case-insensitive widening"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 — Setup.
2. Phase 2 — T003 (T0 probe for US1 only; other probes can defer).
3. Phase 3 — US1 (typed ERR_NO_ACTIVE_FILE on delete/rename/outline).
4. **STOP and VALIDATE** — run quickstart.md §1.
5. Demo or ship.

MVP at this point: three tools regain their typed sub-discriminator. Half of Dimension C cleared. BI-0027 audit re-run would clear Dimension C on three of four listed tools.

### Incremental Delivery

1. Phase 1 + 2 — captures everything upfront.
2. Phase 3 (US1) → quickstart.md §1 → demo (P1 MVP).
3. Phase 4 (US2) → quickstart.md §2 → demo (P1 complete — Dimension C cleared on all four listed tools).
4. Phase 5 (US3) → quickstart.md §3 → demo (P2 starts — Dimension B begins clearing on `query_base`).
5. Phase 6 (US4) → quickstart.md §4 → demo (`search` roster reconciled).
6. Phase 7 (US5) → quickstart.md §5 → demo (`read_property` unified; Principle IV gate may surface).
7. Phase 8 (US6) → quickstart.md §6 → demo (P3 complete; `properties` collapse documented).
8. Phase 9 — quality gates + cohort-wide BI-0027 audit submission (FR-013 / SC-008).

### Parallel Team Strategy (cohort-wide single PR)

With multiple developers:

1. Team completes Phase 1 + 2 together (T0 probes in one live-CLI session).
2. Once Phase 2 done:
   - Developer A: Phase 3 (US1) → Phase 4 (US2) — runtime-code edits in `src/cli-adapter/` + `src/tools/query_base/handler.ts`.
   - Developer B: Phase 5 (US3) — `query_base/schema.ts` + `docs/tools/query_base.md`.
   - Developer C: Phase 6 (US4) — `search/schema.ts` + `docs/tools/search.md`.
   - Developer D: Phase 7 (US5) — `read_property/schema.ts` + `docs/tools/read_property.md` + Branch decision.
   - Developer E: Phase 8 (US6) — `properties/schema.ts` + `docs/tools/properties.md` + older-spec retraction.
3. All six stories ship in a single cohort-wide PR per FR-013.
4. Phase 9 runs after merge gates.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [Story] label maps task to user story for traceability through the spec's FR/SC matrix.
- Every public-surface change ships with its co-located `*.test.ts` per Principle II (NON-NEGOTIABLE).
- Schema `.describe()` is the canonical contract text per Principle III; help-doc is its rendered companion — both updated together (E4 ↔ E5 pair-wise per data-model.md).
- The conditional Complexity Tracking row in `plan.md` (per Clarifications Q2 / Assumption A11) is populated or removed at T032 / T044 based on the T005 capture.
- Single-pass delivery discipline (FR-013): one PR, one cohort-wide BI-0027 audit re-run post-merge.
- Avoid: vague tasks, same-file conflicts (already mitigated by sequential ordering within each schema.ts edit), cross-story dependencies that break independence.
