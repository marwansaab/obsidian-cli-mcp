# Tasks: Fix Search Truncation

**Input**: Design documents from `specs/053-fix-search-truncation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests included — Constitution Principle II requires co-located tests for every public surface modification.

**Organization**: Tasks grouped by user story. US1 and US2 are both P1 and can execute in parallel (separate modules, no structural path between `executeSearch` and `executeContextSearch` per graph query). US3 is a derived verification with no code change.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: User Story 1 — `search` returns the leading N (Priority: P1) 🎯 MVP

**Goal**: Swap sort-before-slice in both default mode and line mode of `executeSearch` so `limit` returns the first N entries of the deterministic ordering.

**Independent Test**: Invoke `executeSearch` with a CLI stub returning unsorted paths and `limit` triggering truncation. Assert the returned entries are the first N of the deterministic sort, not the first N of the CLI's return order.

### Implementation for User Story 1

- [x] T001 [US1] Fix default-mode pipeline: swap sort and slice in `src/tools/search/handler.ts` (lines 144–148). Change from `mdOnly → slice → sort` to `mdOnly → sort → slice`. The sorted collection replaces `trimmed` as the sort target; `slice(0, appliedCap)` operates on the already-sorted array. Truncation detection (`mdOnly.length === appliedCap + 1`) remains before both operations and is unchanged.

- [x] T002 [US1] Fix line-mode pipeline: swap sort and slice in `src/tools/search/handler.ts` (lines 122–128). Change from `flat → slice → sort(path,line)` to `flat → sort(path,line) → slice`. Same pattern as T001: sort the full `flat` array, then slice the leading N. `cliFileCapFired` / `flatExceedsCap` detection is unchanged.

- [x] T003 [US1] Add leading-N identity test for default mode in `src/tools/search/handler.test.ts`. Construct a CLI stub returning 4 paths in reverse-sorted order (`["z.md", "m.md", "b.md", "a.md"]`). Invoke `executeSearch` with `limit: 2`. Assert `paths` is `["a.md", "b.md"]` (first 2 of UTF-16 ascending sort), `count` is 2, and `truncated` is true.

- [x] T004 [US1] Add leading-N identity test for line mode in `src/tools/search/handler.test.ts`. Construct a CLI stub returning 4 files with matches in reverse path order. Invoke `executeSearch` with `context_lines: true` and `limit: 3`. Assert `matches` contains only entries from the first 3 paths of the `(path asc, line asc)` sort, `count` matches the returned array length, and `truncated` is true.

- [x] T005 [US1] Run `npm run typecheck && npm run lint && npx vitest run src/tools/search/handler.test.ts` — confirm all search tests pass including existing Q-10..Q-14 truncation tests and the new leading-N identity tests.

**Checkpoint**: `search` returns leading-N in both modes. Existing tests still green.

---

## Phase 2: User Story 2 — `context_search` returns the leading N (Priority: P1)

**Goal**: Swap sort-before-slice in `executeContextSearch` so `limit` returns the first N entries of the deterministic ordering.

**Independent Test**: Invoke `executeContextSearch` with a CLI stub returning unsorted file-grouped results and `limit` triggering truncation. Assert the returned matches are the first N of the `(path asc, line asc)` sort.

### Implementation for User Story 2

- [x] T006 [P] [US2] Fix pipeline: swap sort and slice in `src/tools/context_search/handler.ts` (lines 135–150). Change from `flat → slice → sort(path,line)` to `flat → sort(path,line) → slice`. Same pattern as T001/T002.

- [x] T007 [P] [US2] Add leading-N identity test in `src/tools/context_search/handler.test.ts`. Construct a CLI stub returning 4 files with matches in reverse path order. Invoke `executeContextSearch` with `limit: 3`. Assert `matches` contains only entries from the first 3 paths of the `(path asc, line asc)` sort, `count` matches returned array length, and `truncated` is true.

- [x] T008 [US2] Run `npm run typecheck && npm run lint && npx vitest run src/tools/context_search/handler.test.ts` — confirm all context_search tests pass including existing truncation tests and the new leading-N identity test.

**Checkpoint**: `context_search` returns leading-N. Existing tests still green.

---

## Phase 3: User Story 3 — Help-doc examples match runtime (Priority: P2)

**Goal**: Verify that the worked examples in the help docs match the corrected runtime output. No code change expected — the docs already describe leading-N behaviour.

**Independent Test**: Read the worked examples in `docs/tools/search.md` (Example 4) and `docs/tools/context_search.md` (Example 3). Confirm the documented truncation subset is consistent with leading-N of the deterministic sort.

### Verification for User Story 3

- [x] T009 [US3] Verify help-doc consistency: read `docs/tools/search.md` Example 4 and `docs/tools/context_search.md` Example 3. Confirm the documented output subsets (`["a.md", "b.md", "c.md"]` for search; `Daily/2024-01-01.md`..`Worknotes/team.md` for context_search) are consistent with leading-N truncation of the stated sort orders. If any example contradicts the fixed runtime, update the example text. Document findings as a comment in this task.

**Checkpoint**: Help docs and runtime agree on truncation direction.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [x] T010 Run full test suite: `npm run typecheck && npm run lint && npx vitest run` — confirm zero regressions across all tools.
- [x] T011 Run quickstart.md manual verification scenario if a test vault is available per `.memory/test-execution-instructions.md`.
- [x] T012 Update the `Original — no upstream` header comments in both handler files if the comment text references the old pipeline order (e.g., R3 truncation description). Keep the comment accurate to the new sort-then-slice order.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)** and **Phase 2 (US2)**: Independent — no structural path between `executeSearch` and `executeContextSearch` (confirmed via `/graphify path`). Can execute in parallel.
- **Phase 3 (US3)**: Depends on Phase 1 + Phase 2 completion (runtime must be fixed before doc-consistency can be verified).
- **Phase 4 (Polish)**: Depends on Phase 1 + Phase 2 + Phase 3 completion.

### Within Each Phase

- T001 before T002 (same file, sequential edits avoid merge conflicts).
- T003 and T004 can run after T001+T002 respectively, or in parallel if T001+T002 are done.
- T005 after T001–T004.
- T006 and T007 can run in parallel (different files).
- T008 after T006+T007.

### Parallel Opportunities

- **US1 and US2 in parallel**: T001–T005 (search) and T006–T008 (context_search) touch different files with no cross-dependencies.
- **Within US1**: T003 and T004 (test files) can be written in parallel once T001+T002 land.
- **Within US2**: T006 and T007 can run in parallel.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001–T005 (search default + line mode fix + tests).
2. **STOP and VALIDATE**: `npx vitest run src/tools/search/handler.test.ts` — all green.
3. The `search` tool now returns leading-N. Ship if needed.

### Incremental Delivery

1. US1 (search) → test independently → ship.
2. US2 (context_search) → test independently → ship.
3. US3 (help-doc verification) → confirm docs match → ship.
4. Polish → full-suite regression → done.

### Parallel Strategy

1. T001–T005 and T006–T008 launch in parallel (separate files, separate modules).
2. Once both complete: T009 (doc verification).
3. T010–T012 (polish).

---

## Notes

- Graph path query confirms no structural path between `executeSearch` and `executeContextSearch` — parallel execution is safe.
- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- Constitution Principle II satisfied: each handler modification ships with co-located test additions in the same change.
- Test scope: vitest unit tests only (per project convention). Manual/integration TC-XXX cases are tracked elsewhere.
- FR-004 (count invariant), FR-005 (truncated flag), FR-006 (empty set), FR-007 (at-or-under-limit) have no dedicated new tasks because the pipeline reorder does not change these code paths. Existing tests cover them: Q-10..Q-14 / Q-3 / Q-11 (search), US3 truncation / H5 (context_search). The new leading-N identity tests (T003, T004, T007) additionally assert count and truncated values on every truncation-triggering invocation.
