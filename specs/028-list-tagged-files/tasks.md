---
description: "Task list for BI-028 list-tagged-files implementation"
---

# Tasks: List Tagged Files (BI-028)

**Input**: Design documents from `/specs/028-list-tagged-files/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED — co-located vitest cases ship in the same change as their surface per Constitution Principle II. 53 cases total (16 schema / 32 handler / 5 registration) per the data-model.md inventory. Test scope is unit-only (per project memory); integration / TC-XXX cases live in the user's external tracker.

**Organization**: Tasks grouped by user story (US1..US4 from spec.md). Note that BI-028's four user stories share a single implementation module — the per-story grouping primarily partitions TEST coverage; the JS template / handler code is shared. Implementation effort is dominantly foundational + US1; US2..US4 are largely test-coverage tasks plus one wire-up edit each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1..US4)
- File paths absolute from repo root

## Path Conventions

Single-project TypeScript layout. All new source under `src/tools/tag/`; all new tests co-located in the same directory (Principle II). Docs at `docs/tools/tag.md`. Registration edits in `src/server.ts` and `src/tools/_register.test.ts`. Baseline at `src/tools/_register-baseline.json`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No-op for BI-028 — repo already initialized; build pipeline, vitest config, eslint, prettier, tsconfig all in place. The shared cross-cutting module `src/tools/_eval-vault-closed-detection/` is already shipped (BI-027). This phase is intentionally empty.

(No tasks in Phase 1.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Module skeleton + schemas + frozen JS template + handler scaffolding. MUST complete before any user story implementation tasks. All four user stories depend on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T001 [P] Create `src/tools/tag/` directory.
- [ ] T002 Create `src/tools/tag/schema.ts` — declare `tagInputSchema` (per data-model.md), `tagDefaultOutputSchema`, `tagCountOnlyOutputSchema`, `tagEvalEnvelopeSchema` (discriminated union), and exported types (`TagInput`, `TagDefaultOutput`, `TagCountOnlyOutput`). Carry `// Original — no upstream.` header (Principle V).
- [ ] T003 Create `src/tools/tag/schema.test.ts` — 16 schema-level cases per data-model.md test inventory (rows 1-16): valid minimal, valid full, empty-tag, whitespace-only, empty-segment × 3, length-cap × 2, leading-#-strip, whitespace-trim, both, charset-permissive, Unicode, unknown-key strict, wrong-type total. Tests must FAIL before T002 lands (TDD order — T003 first, then T002 wires schema to pass; in practice run T002+T003 as a pair).
- [ ] T004 Create `src/tools/tag/handler.ts` — declare `FROZEN_TEMPLATE` constant (the ~40-LOC JS template from data-model.md), `tagHandler` factory function signature with `HandlerDeps`-typed `invokeCli` dependency, and skeleton five-stage parse (stages 0-5 with placeholder logic). Import the shared `detectClosedVault` from `src/tools/_eval-vault-closed-detection/`. Import `UpstreamError` from project-wide `src/upstream-error/`. Carry Original-no-upstream header.
- [ ] T005 [P] Verify the shared closed-vault detector module exists at `src/tools/_eval-vault-closed-detection/index.ts` and its public API exposes a single function whose signature accepts the `invokeCli` result shape. (No edit — verification step. If the import surface differs, this task documents what to import and how.)

**Checkpoint**: Foundation ready — module skeleton compiles, schemas parse, frozen template is byte-stable, handler is a stub that throws "not implemented" at every story branch.

---

## Phase 3: User Story 1 — Retrieve notes by tag (Priority: P1) 🎯 MVP

**Goal**: A caller supplies an exact tag and receives the count and vault-relative paths of all notes carrying that tag.

**Independent Test**: Q-1 (CI, default-mode happy path mock) + Q-22 (T0 live against TestVault with seeded fixture). MVP is shippable when these pass.

### Tests for User Story 1

- [ ] T006 [P] [US1] Add to `src/tools/tag/handler.test.ts` — Q-1 default-mode happy path: mock `invokeCli` returns `{stdout: '=> {"ok":true,"mode":"default","count":2,"paths":["a.md","b.md"]}', stderr: "", exitCode: 0}`; assert handler returns `{count: 2, paths: ["a.md", "b.md"]}` and `invokeCli` called exactly once.
- [ ] T007 [P] [US1] Add to `src/tools/tag/handler.test.ts` — Q-4 zero-match: mock stdout `=> {"ok":true,"mode":"default","count":0,"paths":[]}`; assert returns `{count: 0, paths: []}` — never throws.
- [ ] T008 [P] [US1] Add to `src/tools/tag/handler.test.ts` — single-spawn invariant Q-14: assert `invokeCli` spy called exactly once for any successful call.
- [ ] T009 [P] [US1] Add to `src/tools/tag/handler.test.ts` — Q-11 (a-e) validation-error-before-spawn: assert spy NEVER called for empty/whitespace/empty-segment/length>200/unknown-key inputs.
- [ ] T010 [P] [US1] Add to `src/tools/tag/handler.test.ts` — Q-15 stage-0 closed-vault: mock empty stdout exit-0, assert handler throws `CLI_REPORTED_ERROR(VAULT_NOT_FOUND, reason: "not-open")`.
- [ ] T011 [P] [US1] Add to `src/tools/tag/handler.test.ts` — Q-16 stage-2 json-parse failure: mock stdout `=> not-json`, assert throws `CLI_REPORTED_ERROR(stage: "json-parse")`.
- [ ] T012 [P] [US1] Add to `src/tools/tag/handler.test.ts` — Q-17 stage-3 envelope-parse failure: mock stdout `=> {"ok":true,"bogus":1}`, assert throws `CLI_REPORTED_ERROR(stage: "envelope-parse")`.
- [ ] T013 [P] [US1] Add to `src/tools/tag/handler.test.ts` — Q-18 stage-4 envelope-error branch: mock stdout `=> {"ok":false,"code":"CACHE_NOT_READY"}`, assert throws `CLI_REPORTED_ERROR(stage: "envelope-error", code: "CACHE_NOT_READY")`.
- [ ] T014 [P] [US1] Add to `src/tools/tag/handler.test.ts` — Q-19 / Q-41..Q-43 anti-injection: three adversarial inputs (`\"); evil(); (`, newlines, backticks); assert rendered `code` parameter is byte-stable except for substituted base64 region; round-trip base64 decode preserves input.
- [ ] T015 [P] [US1] Add to `src/tools/tag/handler.test.ts` — Q-20 vault flow-through: assert `invokeCli` args lack `vault` key when input.vault is undefined; assert `vault: "X"` flows through verbatim when input.vault === "X".
- [ ] T016 [P] [US1] Add to `src/tools/tag/handler.test.ts` — Q-5 deterministic ordering: paired calls with identical inputs produce byte-identical responses (handler does NOT re-sort — JS template owns the ordering).

### Implementation for User Story 1

- [ ] T017 [US1] Implement `tagHandler` body in `src/tools/tag/handler.ts`: validation (zod parse → throws ZodError on failure → SDK serialises VALIDATION_ERROR); base64 payload assembly (`{query, total: !!input.total}` → JSON.stringify → Buffer.toString("base64") → replace `__PAYLOAD_B64__` placeholder); single `invokeCli` call with `subcommand: "eval"`, `parameters.code: <rendered>`, optional `vault` flow-through; stage-0 closed-vault detector consumption; stages 1-5 multi-stage parse with `UpstreamError` propagation per the handler contract.
- [ ] T018 [US1] Implement the FROZEN_TEMPLATE constant body in `src/tools/tag/handler.ts` — the ~40-LOC JS template from data-model.md verbatim. Verify byte-stability across calls (T014 anti-injection tests cover this structurally). Template must include: base64 payload decode via `atob` + `JSON.parse`; query normalisation `q = String(payload.query).toLowerCase()`; cache walk over `app.metadataCache.fileCache`; `.md`-only filter; per-path Set with body inline tags AND frontmatter tags both normalised (strip leading `#`, lower-fold); `isMatch` returning `tagLower === q || tagLower.startsWith(q + "/")`; collect matching paths; `out.sort()` byte-asc; envelope emit branched on `wantTotal`.

**Checkpoint**: US1 fully functional. MVP shippable at this point. Tests T006-T016 pass. Handler returns `{count, paths}` for valid inputs; throws structured `UpstreamError` for every failure mode; never silent-fails.

---

## Phase 4: User Story 2 — Hierarchical child-tag inclusion (Priority: P2)

**Goal**: A parent-tag query (`foo`) returns notes carrying the parent AND any descendant (`foo/bar`, `foo/bar/baz`).

**Independent Test**: Q-2 (CI mock proving handler parses the envelope correctly) + Q-22 (T0 live against the seeded `Sandbox/BI-028/hierarchical.md` fixture).

### Tests for User Story 2

- [ ] T019 [P] [US2] Add to `src/tools/tag/handler.test.ts` — Q-2 hierarchical subsumption: mock stdout from a JS-template-walk-simulation envelope where `paths` contains the parent, child, and grandchild paths; assert handler returns all three.

### Implementation for User Story 2

- [ ] T020 [US2] Verify the JS template's `isMatch` from T018 correctly enforces `tagLower.startsWith(q + "/")` — the implementation is shared with US1; this task is a CODE REVIEW / inspection task to confirm the implementation matches the contract. If `isMatch` was incorrectly written (e.g., `startsWith(q)` without the trailing slash), it would conflate this story with US3's segment-boundary precision violation. T021 below verifies the negative case.

**Checkpoint**: US2 fully functional. Parent-tag queries return the full subtree of matching notes via the eval JS template's `isMatch` predicate. Q-2 passes.

---

## Phase 5: User Story 3 — Leaf-tag precision (Priority: P2)

**Goal**: A leaf-tag query (`foo/bar`) returns only the leaf and its descendants (`foo/bar`, `foo/bar/baz`) — NOT parent-only (`foo`) notes.

**Independent Test**: Q-3 (CI mock) + Q-13 (segment-boundary precision — `foobar` MUST NOT match `foo`) + Q-23 (T0 live).

### Tests for User Story 3

- [ ] T021 [P] [US3] Add to `src/tools/tag/handler.test.ts` — Q-3 leaf-precision: mock stdout where `paths` contains only `foo/bar` and `foo/bar/baz` paths (NOT the parent-only `foo` path); assert handler returns exactly those two.
- [ ] T022 [P] [US3] Add to `src/tools/tag/handler.test.ts` — Q-13 segment-boundary precision: mock stdout where `paths` is `[]` because the only candidate tag was `foobar` (which must NOT match query `foo`); assert handler returns `{count: 0, paths: []}`.

### Implementation for User Story 3

- [ ] T023 [US3] Verify the JS template's `isMatch` correctly rejects substring-prefix matches like `foobar` for query `foo`. The `tagLower.startsWith(q + "/")` check (with the trailing slash) already enforces this; this task is a code-review confirmation that the trailing slash is present in the implementation from T018. No code edit unless T021/T022 fail.

**Checkpoint**: US3 fully functional. Leaf queries return only the leaf subtree; substring-prefix matches are excluded. Q-3 and Q-13 pass.

---

## Phase 6: User Story 4 — Count-only mode (Priority: P3)

**Goal**: A caller supplying `total: true` receives the bare integer count without the `paths` array.

**Independent Test**: Q-6 (CI mock returning count-only envelope) + Q-21 (cross-mode count invariant — `count-only` result equals `default-mode paths.length`).

### Tests for User Story 4

- [ ] T024 [P] [US4] Add to `src/tools/tag/handler.test.ts` — Q-6 count-only happy path: mock stdout `=> {"ok":true,"mode":"count-only","total":5}`; input `{tag: "alpha", total: true}`; assert returns `5` (bare integer, no paths surfaced).
- [ ] T025 [P] [US4] Add to `src/tools/tag/handler.test.ts` — count-only zero-match: mock stdout `=> {"ok":true,"mode":"count-only","total":0}`; input `{tag: "nonexistent", total: true}`; assert returns `0` (no error).
- [ ] T026 [P] [US4] Add to `src/tools/tag/handler.test.ts` — Q-21 cross-mode count invariant: paired calls with same input differing only in `total`; assert count-only result === default-mode paths.length.
- [ ] T027 [P] [US4] Add to `src/tools/tag/handler.test.ts` — mode mismatch: when input.total=true but envelope says `mode: "default"`, assert envelope-parse error (the discriminated union safeParse catches it). And vice versa.

### Implementation for User Story 4

- [ ] T028 [US4] Verify `tagHandler` stage-5 dispatches correctly between `tagDefaultOutputSchema` and `tagCountOnlyOutputSchema` based on `envelope.mode`. The implementation is from T017; this task confirms the cross-mode dispatch matches the contract. T024-T027 are the regression suite.

**Checkpoint**: US4 fully functional. Count-only mode returns bare integer; cross-mode count invariant holds. Q-6 and Q-21 pass.

---

## Phase 7: Polish & Cross-Cutting (Registration, Docs, Release)

**Purpose**: Wire the new tool into the registry, regenerate the FR-018 baseline fingerprint, publish docs, bump version, run quality gates, execute T0 manual scenarios against TestVault.

- [ ] T029 [P] Create `src/tools/tag/index.ts` — export `createTagTool(deps: RegisterDeps)` factory returning `{name: "tag", description, inputSchema, handler}`. Carry Original-no-upstream header.
- [ ] T030 [P] Create `src/tools/tag/index.test.ts` — 5 registration cases (Q-49 factory returns correct shape; tool name === "tag"; description fingerprint matches baseline; schema fingerprint matches baseline; docs/tools/tag.md existence asserted by server registry test).
- [ ] T031 Edit `src/server.ts` — add `createTagTool` import + tools-array entry. Place alphabetically between existing entries (likely between `read_property` and `read_heading` — verify at implementation time by inspecting the current order). Re-sort the tools array if needed.
- [ ] T032 Edit `src/tools/_register.test.ts` — add a per-tool-invariants-map row for `tag`. The post-010 consolidated drift detector's `it.each` walk auto-covers the new tool once registered.
- [ ] T033 Run `npm run baseline:write` to regenerate `src/tools/_register-baseline.json` — captures the new `tag` entry's description+schema fingerprints. Commit the baseline change in the same change set as T031/T032.
- [ ] T034 [P] Create `docs/tools/tag.md` — published tool documentation. Include: tool description; input schema fields (`tag`, `vault?`, `total?`); output shapes (default `{count, paths}` and count-only bare integer); 6 documented inherited limitations from research.md (multi-vault basename ambiguity; Unicode case-folding NOT supported at v1; stale metadataCache; output cap inherited from cli-adapter; no pagination at v1; tag-cache filetype scope `.md`-only); 11-row failure roster from contracts/tag-input.contract.md; 8 worked examples (A-H).
- [ ] T035 Edit `CHANGELOG.md` — new `## [0.5.6]` entry. Include: tool announcement (`tag` typed tool, BI-028); the two plan-stage spec amendments (case-insensitive via wrapper-side ASCII lower-fold; architecture pivot from native `tag` subcommand to eval); the six-entry failure roster (zero new top-level codes); the inherited limitations list; the third-consumer status of the shared closed-vault detector module.
- [ ] T036 Edit `package.json` — version bump `0.5.5` → `0.5.6`.
- [ ] T037 [P] Run quality gates: `npm run lint` (zero warnings), `npm run typecheck` (zero errors), `npm run build` (success), `vitest run` (all 53 new + existing tests pass with coverage threshold met). Capture results for the PR description's Constitution Compliance checklist.
- [ ] T038 T0 manual fixture seeding under `Sandbox/BI-028/` against `TestVault-Obsidian-CLI-MCP` per data-model.md "Test fixture seeding plan": (1) `body-inline.md` with body `#projecta #projectb`; (2) `hierarchical.md` with frontmatter `tags: [project/alpha, project/alpha/v1, project/beta]`; (3) `case-variant.md` with frontmatter `tags: [CaseTest]`; (4) `code-block-only.md` with fenced code block containing `#projectcode` (negative case); (5) `dup-sources.md` with body `#dup #dup` AND frontmatter `tags: [dup]`. Use unique-per-run names where applicable per the destructive-probe protocol (read `.memory/test-execution-instructions.md` before running).
- [ ] T039 T0 manual scenarios Q-22 through Q-26 against live `TestVault-Obsidian-CLI-MCP` via the built MCP server (Q-22 hierarchical subsumption; Q-23 leaf precision + segment boundary; Q-24 fenced code-block exclusion; Q-25 case-variant match via wrapper-side lower-fold; Q-26 multi-source dedup). Report each case's pass/fail status; quote stdout/stderr verbatim for any failure.
- [ ] T040 T0 cleanup — remove all `Sandbox/BI-028/*` fixtures created in T038. Verify `Sandbox/` is empty (or in its pre-run state); verify `Welcome.md` tripwire untouched.
- [ ] T041 [P] Run `quickstart.md` Q-27 through Q-30 inspection / structural cases: ADR-010 naming check (tool name `tag`); registry baseline fingerprint roll-forward verified; Original-no-upstream attribution on every new source file; `docs/tools/tag.md` existence auto-asserted by server registry test.

**Checkpoint**: BI-028 complete. Registered tool surface adds `tag`; 53 new co-located vitest cases pass; baseline rolled forward; docs published; CHANGELOG entry; version bumped; quality gates clean; T0 manual verification passed against TestVault.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Empty — no dependencies.
- **Phase 2 (Foundational)**: T001-T005 — BLOCKS all user-story phases. Schema + frozen template + handler skeleton must exist before any test can pass.
- **Phase 3 (US1, P1, MVP)**: Depends on Phase 2. T006-T016 (tests) can run [P] with each other (different test cases in the same file — sequential within the file but the cases themselves are independent); T017+T018 (implementation) must complete BEFORE tests pass.
- **Phase 4 (US2, P2)**: Depends on Phase 3 (shares the `isMatch` predicate from T018). T019 [P] test + T020 inspection-only.
- **Phase 5 (US3, P2)**: Depends on Phase 3 (shares `isMatch`). T021-T022 [P] tests + T023 inspection-only.
- **Phase 6 (US4, P3)**: Depends on Phase 3 (handler dispatch stage 5). T024-T027 [P] tests + T028 inspection-only.
- **Phase 7 (Polish)**: Depends on Phases 3-6 completion. T029-T032 [P] (different files); T033 (baseline) must run AFTER T031+T032; T037 (quality gates) runs after all implementation; T038-T040 (T0 manual) runs against built artefact; T041 inspection [P].

### User Story Dependencies

- **US1 (P1)**: Independent — MVP shippable after Phase 3.
- **US2 (P2)**: Depends on US1 implementation (shares JS template `isMatch`).
- **US3 (P2)**: Depends on US1 implementation (shares JS template `isMatch`).
- **US4 (P3)**: Depends on US1 implementation (shares handler stage-5 dispatch).

Note: BI-028's four stories are NOT independent at the code level — they share a single eval JS template and a single handler. The story-grouping partitions TEST coverage to mirror the spec's contract slicing. The implementation effort is dominantly Phase 2 + US1 (T001-T018); US2..US4 add ~10 test cases + verification.

### Within Each Phase

- Foundational: T002 (schema) and T003 (schema tests) pair (TDD ordering — schema tests before schema body, run-fail-then-pass). T004 (handler skeleton) and T005 (shared module verification) are sequential prereqs for any handler test.
- US1: T006-T016 all [P] (different test cases, same file edited sequentially but cases are independent in content). T017+T018 must complete to make all US1 tests pass.
- Polish: T029-T030 [P] (different files); T031+T032+T033 sequential (registry edit → invariants test → baseline regen).

### Parallel Opportunities

- All test-case-additions within a story can be drafted in parallel (each one is a small self-contained `it("...", () => {})` block; appending to the same file requires sequential writes but the content is parallelisable).
- Documentation (T034) is fully independent of source-code work — can drift to any phase after schema is locked.
- T0 manual cases (T039) can run after T037 quality gates; cleanup (T040) follows T039.

---

## Parallel Example: User Story 1 test suite

```bash
# All US1 test-case additions can be drafted in parallel:
Task: "Add Q-1 default-mode happy path test in src/tools/tag/handler.test.ts" (T006)
Task: "Add Q-4 zero-match test in src/tools/tag/handler.test.ts" (T007)
Task: "Add Q-14 single-spawn invariant test in src/tools/tag/handler.test.ts" (T008)
Task: "Add Q-11 validation-error-before-spawn tests in src/tools/tag/handler.test.ts" (T009)
Task: "Add Q-15 stage-0 closed-vault test in src/tools/tag/handler.test.ts" (T010)
# ...

# Then implementation:
Task: "Implement tagHandler body in src/tools/tag/handler.ts" (T017)
Task: "Implement FROZEN_TEMPLATE body in src/tools/tag/handler.ts" (T018)
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1: Setup (empty — already done).
2. Complete Phase 2: Foundational (T001-T005). Run schema tests — pass after T002+T003 pair.
3. Complete Phase 3: US1 (T006-T018). Run handler tests — pass after T017+T018.
4. **STOP and VALIDATE**: US1 works in isolation. The MVP is a functional `tag` typed tool that handles default-mode happy path + all parse failure modes + closed-vault detection + anti-injection.
5. The MVP could be shipped here if US2-US4 were deferred. BUT — since US2 + US3 are "free" (already handled by US1's `isMatch` predicate), there's no cost reason to defer them.

### Incremental Delivery

1. Complete Setup + Foundational + US1 (T001-T018) → MVP shippable (tag tool with default mode, no count-only, no live hierarchical-subsumption verification).
2. Add US2 test verification (T019-T020) → Independently test → Confirm parent-tag returns subtree.
3. Add US3 test verification (T021-T023) → Independently test → Confirm leaf precision + segment-boundary.
4. Add US4 count-only mode wire-up (T024-T028) → Independently test → Bare integer return.
5. Add Polish phase (T029-T041) → Register + docs + baseline + version + quality gates + T0 → Release-ready.

### Parallel Team Strategy

For BI-028 the work is small enough for one developer; the parallelism is largely "add multiple test cases at once" rather than "split work across stories". A second developer could draft `docs/tools/tag.md` (T034) and `CHANGELOG.md` (T035) in parallel with implementation.

---

## Notes

- All new source files MUST carry `// Original — no upstream. <one-line description>.` header (Principle V).
- All tests MUST be co-located in `src/tools/tag/*.test.ts` (Principle II).
- ZERO new top-level error codes, ZERO new `details.code` strings, ZERO new ADRs, ZERO Constitution amendment (preserves fourteen-tool zero-new-codes streak).
- The shared `_eval-vault-closed-detection/` module is consumed READ-ONLY — no edits to that module's source. BI-028 is its third consumer and the rule-of-three confirmation point.
- The cli-adapter is FROZEN per 008-refactor surface invariant — handler talks to `invokeCli` only.
- Run `.memory/test-execution-instructions.md` before T038 to confirm TestVault location, sandbox subdir, destructive-probe protocol, and cleanup expectations.
- Tag count summary: 41 tasks total. Phase 2: 5. US1: 13. US2: 2. US3: 3. US4: 5. Polish: 13.
