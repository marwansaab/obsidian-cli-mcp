---
description: "Task list for Complete Search Truncation"
---

# Tasks: Complete Search Truncation

**Input**: Design documents from `specs/055-complete-search-truncation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/leading-n-truncation.md, quickstart.md

**Tests**: REQUIRED. Both `search` and `context_search` are modified public surfaces; Constitution Principle II mandates happy-path + boundary tests in the same change. Tasks follow red-green: add failing tests first, then the fix.

**Organization**: Tasks grouped by user story (US1 = `search`, US2 = `context_search`, US3 = help docs) from spec.md priorities.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 maps to the spec's user stories

## Path Conventions

Single project. Source under `src/tools/<surface>/`, co-located tests as `*.test.ts`, help docs under `docs/tools/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a clean baseline so any regression is attributable to this BI.

- [X] T001 Confirm baseline green on branch `055-complete-search-truncation` before edits: run `npm run lint`, `npm run typecheck`, `npm run build`, `npx vitest run`. Record that the existing `search` / `context_search` suites pass pre-change. **Result**: lint/typecheck/build clean; `search` + `context_search` suites 146/146 pass pre-change.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared code that must change before any story.

**N/A** — there is no shared foundational code change. Each story edits its own per-surface handler + co-located test file; no helper extraction or shared-module change is planned (deliberately avoiding premature abstraction — the path-ascending comparator and truncated rule are applied per-site). `context_search/handler.ts` imports `stripBoundarySlashes` (from `search/handler.ts`) and `searchContextWireSchema` (from `search/schema.ts`), but neither symbol is modified by this BI, so US1 and US2 are independent. No tasks in this phase.

**Checkpoint**: After T001, US1 and US2 may proceed in parallel.

---

## Phase 3: User Story 1 - `search` returns the leading N of the full match set (Priority: P1) 🎯 MVP

**Goal**: `search` (default + line modes) returns the path-ascending leading N across the full match set, independent of upstream's opaque order.

**Independent Test**: Stub `invokeCli` to return matches in non-path-ascending order (`body-3, body-5, body-2, body-4, body-1`); `search` with `limit: 2` returns exactly `body-1, body-2`; `limit: 3` returns `body-1, body-2, body-3`.

### Tests for User Story 1 ⚠️ (write first, confirm FAIL)

- [X] T002 [P] [US1] Add failing unit tests in `src/tools/search/handler.test.ts` for BOTH modes: (a) default-mode leading-N over scrambled upstream order — `limit: 2` → `paths: ["body-1.md","body-2.md"]`, `limit: 3` → `["body-1.md","body-2.md","body-3.md"]`; (b) default-mode truncated: `S > cap` → `truncated: true`, `count === cap`; `S === cap` → `truncated` absent (default mode is **precise** per FR-005); `S < cap` → all path-asc, no `truncated`; (c) line-mode leading-N over scrambled order; (d) line-mode conservative truncated: `S > cap` → true & `count === cap`, `S === cap` no-drop → `truncated: true`, `S < cap` → absent; (e) line-mode conservative-fire edge (reviewer flag) — a single file producing exactly `cap` matching lines (file count `1 < cap`, flattened match count `=== cap`) → `truncated: true`, confirming the rule keys on flattened match count, not file count. Run `npx vitest run src/tools/search` and confirm the new assertions FAIL against current code.

### Implementation for User Story 1

- [X] T003 [US1] Fix `src/tools/search/handler.ts`: (1) remove the upstream limit forward — delete `parameters.limit = String(useLines ? appliedCap : appliedCap + 1)` (L66) so neither mode sends a result-set `limit` to `invokeCli`; (2) default mode — `const truncated = mdOnly.length > appliedCap;` then `const trimmed = truncated ? sorted.slice(0, appliedCap) : sorted;` (sort unchanged, drop the `appliedCap + 1` probe); (3) line mode — replace `cliFileCapFired`/`flatExceedsCap` with `const truncated = flat.length >= appliedCap;` and `const trimmed = sorted.slice(0, appliedCap);` (sort by path asc then line asc unchanged); (4) update the `Original — no upstream` header prose to describe full-set fetch (no upstream limit) → sort → slice. Run `npx vitest run src/tools/search`; confirm GREEN.

**Checkpoint**: `search` default + line modes return leading-N of the full set; T002 passes.

---

## Phase 4: User Story 2 - `context_search` returns the leading N of the full match set (Priority: P2)

**Goal**: `context_search` returns matches covering the path-ascending leading N across the full match set.

**Independent Test**: Stub `invokeCli` to return file-grouped matches in non-path-ascending order; `context_search` with `limit: 2` returns matches covering exactly `body-1, body-2`, `count === 2`, `truncated: true`.

### Tests for User Story 2 ⚠️ (write first, confirm FAIL)

- [X] T004 [P] [US2] Add failing unit tests in `src/tools/context_search/handler.test.ts`: (a) leading-N over scrambled upstream order — with one matching line per note (Assumption A7), `limit: 2` → matches cover exactly `["body-1.md","body-2.md"]`, `count === 2`; (b) conservative truncated — `S > cap` → `truncated: true` & `count === cap`, `S === cap` no-drop → `truncated: true`, `S < cap` → `truncated` absent, all path-asc, no drop; (c) conservative-fire edge (reviewer flag) — a single file with exactly `cap` matching lines (file count `1 < cap`, flattened match count `=== cap`) → `truncated: true`, confirming the rule keys on flattened match count, not file count. Run `npx vitest run src/tools/context_search`; confirm the new assertions FAIL.

### Implementation for User Story 2

- [X] T005 [US2] Fix `src/tools/context_search/handler.ts`: (1) remove the upstream limit forward — delete `parameters.limit = String(appliedCap)` (L69) from the `search:context` invocation (leave the FR-013 zero-match folder-existence probe untouched — it invokes the `folder` command, carries no search limit); (2) replace `cliFileCapFired`/`flatExceedsCap` with `const truncated = flat.length >= appliedCap;` and `const trimmed = sorted.slice(0, appliedCap);` (sort by path asc then line asc unchanged); (3) update the `Original — no upstream` header prose to describe full-set fetch → sort → slice. Run `npx vitest run src/tools/context_search`; confirm GREEN.

**Checkpoint**: `search` AND `context_search` both return leading-N of the full set independently.

---

## Phase 5: User Story 3 - Help-doc truncation direction matches runtime (Priority: P3)

**Goal**: The `search` and `context_search` help-doc truncation-direction descriptions match post-fix runtime verbatim.

**Independent Test**: Follow each doc's documented call against the documented fixture; the returned subset matches the documented description verbatim.

**Depends on**: US1 (T003) and US2 (T005) landed — docs describe the fixed runtime.

### Implementation for User Story 3

- [X] T006 [P] [US3] Rewrite `docs/tools/search.md` "Truncation slice direction" (L102–104) and "Conservative truncation in line mode" (L234–236): state the wrapper fetches the **full match set** (no upstream `limit`), sorts (UTF-16 asc default; `(path asc, line asc)` line mode), then slices to `limit`, so the visible subset is the leading N of the deterministic ordering across the full match set. Verify Example 4 (`limit: 3`) text agrees with post-fix runtime; tighten the "Inherited limitations" output-cap note to reflect the full set always crossing the pipe.
- [X] T007 [P] [US3] Rewrite `docs/tools/context_search.md` "Truncation slice direction" (L81–83) and "Conservative truncation" (L278–280) with the same full-set-fetch framing; verify Example 3 (`limit: 50`) and the "identical sort order" cross-reference to `search` line mode remain accurate.
- [X] T008 [P] [US3] Check `docs/tools/search_vault.md` (deprecated alias doc) for any BI-0110 truncation-direction prose; rewrite to the full-set framing if present, otherwise record in the BI notes that no truncation-direction section exists there (no change needed). **Result**: grep for `truncat|slice|limit|full collection|deterministic sort|leading` returned no matches — no truncation-direction section exists in `search_vault.md`. No change needed.

**Checkpoint**: Both live docs describe full-set fetch and match runtime verbatim.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature gates and structural verification.

- [X] T009 Run the full merge gate: `npm run lint` (zero warnings), `npm run typecheck`, `npm run build`, `npx vitest run` — all green; statements-coverage floor holds. **Result**: lint/typecheck/build clean; `npx vitest run` 2371 passed / 6 skipped; `npm test` coverage summary statements 92.21% — floor holds.
- [X] T010 [P] Confirm SC-006: no new top-level error code or `details.code` introduced — `src/errors.ts` is unchanged in this BI; both handlers still classify only through existing `UpstreamError` codes. **Result**: `git diff` confirms `src/errors.ts` is not in the change set; handler diffs add no new `UpstreamError` code or `details.code`.
- [X] T011 Run `/graphify --update`, then verify post-implement structural checks (plan §"Post-implement verification target"): no new error-class node outside the `src/errors.ts` community; neither handler imports the boot-time DI factories; the new test assertions land in the existing search / context_search communities; production code stays connected. **Result**: AST graph refreshed via `graphify update .` (no-LLM-cost path: 16384 nodes, 21625 edges, 1053 communities). All four checks pass — verified directly from the handler diffs: (1) `src/errors.ts` untouched → no new error-class node; (2) handler import blocks unchanged → no DI-factory (`createLogger`/`createQueue`) imports; (3) no new production symbols (only removed locals `cliFileCapFired`/`flatExceedsCap`), test additions in existing `*.test.ts` → no surprise community; (4) no new production files → no orphans. Semantic `/graphify --update` (LLM-cost) skipped: per CLAUDE.md the semantic layer derives from ADRs/specs/CLAUDE.md/constitution, none of which this code+docs BI changed.
- [ ] T012 [P] (Manual, gated) Optional live-CLI T0 re-validation per quickstart.md "Live-CLI re-validation" against the `body-{1..5}` fixture — gated by `.memory/test-execution-instructions.md`. NOT part of the merge gate. **Status**: not run — optional manual step, requires the authorised test vault; out of scope for the automated merge gate.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1 / T001)**: no dependencies.
- **Foundational (Phase 2)**: N/A (empty).
- **US1 (Phase 3)** and **US2 (Phase 4)**: each depends only on T001; mutually independent (different files; the `context_search → search` imports are unmodified).
- **US3 (Phase 5)**: depends on T003 (US1) + T005 (US2) landing — docs describe the fixed runtime.
- **Polish (Phase 6)**: depends on US1 + US2 + US3 complete.

### Within Each User Story

- Tests (T002 / T004) MUST be written and FAIL before the fix (T003 / T005).
- US1 default-mode and line-mode changes both live in `search/handler.ts` (one task, T003) — sequential within the file.

### Parallel Opportunities

- T002 (US1 tests) ∥ T004 (US2 tests) — different test files.
- After tests, T003 (US1 fix) ∥ T005 (US2 fix) — different handler files; US1 and US2 are independent streams.
- T006 ∥ T007 ∥ T008 — three different doc files.
- T010 ∥ T012 in polish.

---

## Parallel Example: US1 and US2 streams

```bash
# After T001, two independent streams (different files):
# Stream A (US1):  T002 → T003   (src/tools/search/*)
# Stream B (US2):  T004 → T005   (src/tools/context_search/*)
# Then converge:   T006 ∥ T007 ∥ T008 (docs)  →  T009 → T011
```

---

## Implementation Strategy

### MVP First (US1 only)

1. T001 baseline.
2. T002 → T003 — `search` leading-N fix.
3. STOP and VALIDATE: `search` returns leading-N of the full set independently. Demo-able MVP.

### Incremental Delivery

1. Setup → US1 (`search` fixed, MVP).
2. US2 (`context_search` fixed) — sibling surface, independent.
3. US3 (docs) — rewrite against the now-fixed runtime.
4. Polish — gates + `/graphify --update` structural verification.

---

## Notes

- **Graphify path check (CLAUDE.md /speckit-tasks rule)**: the task list crosses two source modules (`search`, `context_search`). The structural path `context_search/handler.ts → search/handler.ts` (`stripBoundarySlashes`) and `→ search/schema.ts` (`searchContextWireSchema`) is known from the plan-time structural read; neither imported symbol is modified by this BI, so no hidden cross-story dependency exists and US1/US2 remain independently completable. (Relied on the plan-time finding rather than re-running the query; the path is stable.)
- [P] = different files, no dependency on an incomplete task.
- Verify new tests FAIL before implementing (red-green proves the fix).
- Commit after each story or logical group.
- Reviewer flag (from plan / research Decision 2): the line/context `truncated = flat.length >= appliedCap` rule shifts one narrow edge case (multi-match-per-file, fileCount < cap but matchCount === cap now fires) toward the spec's stated conservative rule. Confirm a test covers it.
