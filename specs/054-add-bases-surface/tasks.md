# Tasks: Add Bases Surface

**Input**: Design documents from `specs/054-add-bases-surface/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Required per Constitution Principle II — every MCP tool ships with happy-path + failure-or-boundary tests co-located as `*.test.ts`.

**Organization**: Tasks are grouped by tool (= user story) to enable independent implementation, testing, and shipping. Each tool maps 1:1 to a backlog item: `bases` → BI-0049, `views_base` → BI-0082, `create_base` → BI-0083.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = `bases`, US2 = `views_base`, US3 = `create_base`)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No project setup needed — existing project infrastructure (cli-adapter, _register.ts, errors.ts, server.ts) is already in place. This phase creates the three empty module directories.

- [ ] T001 [P] Create tool module directory `src/tools/bases/`
- [ ] T002 [P] Create tool module directory `src/tools/views_base/`
- [ ] T003 [P] Create tool module directory `src/tools/create_base/`

---

## Phase 2: User Story 1 — `bases` tool (Priority: P1) 🎯 MVP

**Goal**: Vault-wide enumeration of `.base` files. Agent calls `bases({})` and receives a sorted list of vault-relative paths with a count.

**Independent Test**: Call `bases({})` with mocked CLI output containing multiple `.base` paths → verify response has sorted `bases[]` and matching `count`. Call with empty CLI output → verify `{ bases: [], count: 0 }`. Call with malformed input → verify `VALIDATION_ERROR`.

**BI**: BI-0049

### Schema (US1)

- [ ] T004 [P] [US1] Create input schema (`basesInputSchema`) with optional `vault` field, `.strict()` mode, in `src/tools/bases/schema.ts` — FR-007, FR-024
- [ ] T005 [P] [US1] Create output schema (`basesOutputSchema`) with `bases: z.array(z.string())` and `count: z.number().int().min(0)` with refinement `count === bases.length`, in `src/tools/bases/schema.ts` — FR-001, FR-002, FR-003
- [ ] T006 [P] [US1] Create schema tests in `src/tools/bases/schema.test.ts`: strict-mode rejection of unknown keys, vault min-length validation, output invariant (count === bases.length), empty-list acceptance

### Handler (US1)

- [ ] T007 [US1] Implement `executeBases()` handler in `src/tools/bases/handler.ts`: vault resolution → `invokeCli({ command: "bases", target_mode: "active" })` → split stdout by newlines → filter empty → sort lexicographically (FR-005) → construct `{ bases, count }` envelope → defence-in-depth output parse — FR-001 through FR-006
- [ ] T008 [US1] Create handler tests in `src/tools/bases/handler.test.ts`: happy-path (multi-base sorted output), empty-vault (count=0), deterministic sort order assertion, upstream CLI failure classification under `CLI_REPORTED_ERROR`, vault parameter passthrough (accepted but silently ignored per R-001)

### Registration (US1)

- [ ] T009 [US1] Implement `createBasesTool()` factory and 400+ char description in `src/tools/bases/index.ts`: description names error states, cross-references Bases-family cohort, includes worked example — FR-028, FR-030
- [ ] T010 [US1] Create registration tests in `src/tools/bases/index.test.ts`: tool name is `"bases"` (ADR-010), description length ≥ 400, descriptor shape matches MCP SDK expectations

**Checkpoint**: `bases` tool fully functional and independently testable. Can ship without US2 or US3.

---

## Phase 3: User Story 2 — `views_base` tool (Priority: P1)

**Goal**: View enumeration within the currently focused `.base` file (active-mode-only per R-003). Agent calls `views_base({})` and receives view names with a count.

**Independent Test**: Call `views_base({})` with mocked CLI output containing view names → verify response has `views[]` and matching `count`. Call with "Active file is not a base file" CLI error → verify structured error classification. Call with empty CLI output → verify `{ views: [], count: 0 }`.

**BI**: BI-0082

### Schema (US2)

- [ ] T011 [P] [US2] Create input schema (`viewsBaseInputSchema`) with optional `vault` field only (no `path` — active-mode-only per R-003), `.strict()` mode, in `src/tools/views_base/schema.ts` — FR-024
- [ ] T012 [P] [US2] Create output schema (`viewsBaseOutputSchema`) with `views: z.array(z.string())` and `count: z.number().int().min(0)` with refinement `count === views.length`, in `src/tools/views_base/schema.ts` — FR-008, FR-009, FR-010
- [ ] T013 [P] [US2] Create schema tests in `src/tools/views_base/schema.test.ts`: strict-mode rejection, vault min-length, output invariant (count === views.length), empty-list acceptance, no `path` field accepted

### Handler (US2)

- [ ] T014 [US2] Implement `executeViewsBase()` handler in `src/tools/views_base/handler.ts`: vault resolution → `invokeCli({ command: "base:views", target_mode: "active" })` → split stdout by newlines → filter empty → construct `{ views, count }` envelope → error classification for "Active file is not a base file" pattern — FR-008 through FR-012
- [ ] T015 [US2] Create handler tests in `src/tools/views_base/handler.test.ts`: happy-path (multi-view output), zero-views (count=0), "not a base file" error classification under `CLI_REPORTED_ERROR`, upstream CLI failure, vault parameter passthrough (accepted but silently ignored per R-003)

### Registration (US2)

- [ ] T016 [US2] Implement `createViewsBaseTool()` factory and 400+ char description in `src/tools/views_base/index.ts`: description MUST prominently state active-mode-only limitation (R-003), name error states, cross-reference Bases-family cohort — FR-028, FR-030
- [ ] T017 [US2] Create registration tests in `src/tools/views_base/index.test.ts`: tool name is `"views_base"` (ADR-010 from `base:views`), description length ≥ 400, description contains "active" limitation text

**Checkpoint**: `views_base` tool fully functional and independently testable. Can ship without US1 or US3.

---

## Phase 4: User Story 3 — `create_base` tool (Priority: P2)

**Goal**: Create a new item (Markdown note) within a specified `.base` file. Agent calls `create_base({ path, name })` and receives the created item's vault-relative path.

**Independent Test**: Call `create_base({ path: "Tasks.base", name: "New item" })` with mocked CLI returning `Created: New item.md` → verify response has constructed vault-relative path and actual filename. Call with content exceeding size limit → verify `VALIDATION_ERROR` / `CONTENT_TOO_LARGE` pre-CLI. Call with nonexistent base → verify `CLI_REPORTED_ERROR` / `BASE_NOT_FOUND`.

**BI**: BI-0083

### Schema (US3)

- [ ] T018 [P] [US3] Create input schema (`createBaseInputSchema`) with required `path` (base-path validation: 1–1000 chars, `.base` extension, path-traversal rejection), required `name` (1–1000 chars, non-empty), optional `content`, optional `view`, optional `vault`, `.strict()` mode, sub-discriminated `superRefine` validations, in `src/tools/create_base/schema.ts` — FR-014 through FR-018, FR-022, FR-024, FR-026
- [ ] T019 [P] [US3] Create output schema (`createBaseOutputSchema`) with `path: z.string()` and `name: z.string()`, in `src/tools/create_base/schema.ts` — FR-019
- [ ] T020 [P] [US3] Create schema tests in `src/tools/create_base/schema.test.ts`: path validation (empty → `INVALID_BASE_PATH/empty`, too-long → `too-long`, traversal → `path-traversal`, wrong extension → `wrong-extension`), name validation (empty → `INVALID_NAME/empty`, too-long → `too-long`), content size limit validation (`CONTENT_TOO_LARGE`), strict-mode rejection, vault min-length, optional fields acceptance

### Handler (US3)

- [ ] T021 [US3] Implement `executeCreateBase()` handler in `src/tools/create_base/handler.ts`: content size pre-check (platform argv ceiling) → vault resolution → `invokeCli({ command: "base:create", parameters: { path, name, content?, view? }, target_mode: "specific" })` → parse `Created: <filename>.md` response → construct vault-relative path from base directory + returned filename → output envelope `{ path, name }` — FR-014 through FR-023
- [ ] T022 [US3] Create handler tests in `src/tools/create_base/handler.test.ts`: happy-path (parsed filename + constructed path), name collision auto-increment (R-005: CLI returns `name 1.md`), content parameter passthrough, view parameter passthrough (not validated per R-006), `BASE_NOT_FOUND` error classification ("Base file not found:" pattern), content size limit pre-check rejection, upstream CLI failure classification, vault parameter passthrough (accepted but silently ignored per R-004)

### Registration (US3)

- [ ] T023 [US3] Implement `createCreateBaseTool()` factory and 400+ char description in `src/tools/create_base/index.ts`: description names error states, documents auto-increment collision behaviour (R-005), cross-references Bases-family cohort — FR-028, FR-030
- [ ] T024 [US3] Create registration tests in `src/tools/create_base/index.test.ts`: tool name is `"create_base"` (ADR-010 from `base:create`), description length ≥ 400, descriptor shape matches MCP SDK expectations

**Checkpoint**: `create_base` tool fully functional and independently testable. Can ship without US1 or US2.

---

## Phase 5: Integration & Polish

**Purpose**: Wire all three tools into the server boot spine, update the tool registry baseline, and create help documentation.

### Server Wiring

- [ ] T025 Wire `createBasesTool(deps)` import and registration call in `src/server.ts`
- [ ] T026 Wire `createViewsBaseTool(deps)` import and registration call in `src/server.ts`
- [ ] T027 Wire `createCreateBaseTool(deps)` import and registration call in `src/server.ts`
- [ ] T028 Update `src/tools/_register-baseline.json` with three new tool entries (`bases`, `views_base`, `create_base`)

### Documentation

- [ ] T029 [P] Create tool help doc `docs/tools/bases.md`: worked examples, error roster, vault-routing limitation (R-001), no-cap rationale, cohort cross-references
- [ ] T030 [P] Create tool help doc `docs/tools/views_base.md`: worked examples, error roster, active-mode-only limitation (R-003), vault-routing limitation, cohort cross-references
- [ ] T031 [P] Create tool help doc `docs/tools/create_base.md`: worked examples, error roster, auto-increment collision (R-005), content= undocumented caveat (R-007), vault-routing limitation (R-004), cohort cross-references

### Validation

- [ ] T032 Run full test suite (`vitest run`) — all three tools pass independently
- [ ] T033 Run `npm run typecheck` — zero errors
- [ ] T034 Run `npm run lint` — zero warnings
- [ ] T035 Validate quickstart.md scenarios against mocked handler output

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — create directories immediately
- **Phase 2 (US1 bases)**: Depends on T001 directory creation only
- **Phase 3 (US2 views_base)**: Depends on T002 directory creation only
- **Phase 4 (US3 create_base)**: Depends on T003 directory creation only
- **Phase 5 (Integration)**: Depends on at least one tool phase completing (T025–T027 can be added incrementally as each tool lands)

### User Story Dependencies

- **US1 (`bases`)**: Independent — no dependency on US2 or US3
- **US2 (`views_base`)**: Independent — no dependency on US1 or US3
- **US3 (`create_base`)**: Independent — no dependency on US1 or US2
- All three tools share only existing infrastructure (`cli-adapter`, `_register.ts`, `errors.ts`) which is unchanged

### Within Each User Story

Schema tasks (T004–T006, T011–T013, T018–T020) are parallelizable [P] — different files, no deps.
Handler depends on schema (T007 after T004–T005, T014 after T011–T012, T021 after T018–T019).
Registration depends on schema (T009 after T004–T005, T016 after T011–T012, T023 after T018–T019).
Handler tests depend on handler (T008 after T007, T015 after T014, T022 after T021).
Registration tests depend on registration (T010 after T009, T017 after T016, T024 after T023).

### Parallel Opportunities

- T001, T002, T003 — all directory creation in parallel
- T004, T005, T006 — all US1 schema tasks in parallel
- T011, T012, T013 — all US2 schema tasks in parallel
- T018, T019, T020 — all US3 schema tasks in parallel
- US1, US2, US3 — all three tool phases can run in parallel (independent modules, different files)
- T025, T026, T027 — server wiring can be done per-tool as each lands
- T029, T030, T031 — all docs in parallel

---

## Parallel Example: All Three Tools

```text
# After Phase 1 (directory creation), launch all three tools in parallel:

Agent A (US1 - bases):
  T004, T005, T006 (schema, parallel)
  T007 (handler)
  T008 (handler tests)
  T009 (registration)
  T010 (registration tests)

Agent B (US2 - views_base):
  T011, T012, T013 (schema, parallel)
  T014 (handler)
  T015 (handler tests)
  T016 (registration)
  T017 (registration tests)

Agent C (US3 - create_base):
  T018, T019, T020 (schema, parallel)
  T021 (handler)
  T022 (handler tests)
  T023 (registration)
  T024 (registration tests)
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Directory creation (T001)
2. Complete Phase 2: `bases` tool (T004–T010)
3. Wire into server (T025) + baseline update (T028)
4. **STOP and VALIDATE**: `vitest run` — `bases` passes independently
5. Ship `bases` — agents can discover `.base` files

### Incremental Delivery

1. Ship `bases` (US1) → agents gain discovery capability
2. Ship `views_base` (US2) → agents gain view enumeration (active-mode-only)
3. Ship `create_base` (US3) → agents gain write capability
4. Each tool adds value without breaking previous tools
5. Polish phase after all three ship

### Single-Agent Sequential

1. T001–T003 (directories)
2. T004–T010 (bases complete)
3. T025, T028 partial (wire bases)
4. T011–T017 (views_base complete)
5. T026 (wire views_base)
6. T018–T024 (create_base complete)
7. T027 (wire create_base)
8. T029–T035 (docs + validation)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific tool/BI for traceability
- Each tool is independently completable, testable, and shippable
- Constitution Principle II: tests are mandatory, not optional — every tool ships with happy-path + failure tests
- Cross-module graphify path check: N/A — the three tools are independent modules touching no shared symbols beyond the existing `registerTool()` and `invokeCli()` patterns. The only cross-module touch is `server.ts` boot-spine wiring (Phase 5), which is additive and follows the 16-tool precedent.
- `query_base` handler.ts is the reference implementation for handler pipeline patterns (9-stage pipeline, error classifier regex patterns, defence-in-depth output parse)
