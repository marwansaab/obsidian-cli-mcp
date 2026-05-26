---

description: "Tasks for BI-047 Fix Prepend Reliability"
---

# Tasks: Fix Prepend Reliability

**Input**: Design documents from [specs/047-fix-prepend-reliability/](./)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)
**Branch**: `047-fix-prepend-reliability`

**Tests**: Required. Constitution Principle II (Public Surface Test Coverage) is non-negotiable — every modified surface ships with happy-path + failure-or-boundary tests in the same change. Test scope per the user's project convention is unit-only ([MEMORY.md](../../C:/Users/sirzi/.claude/projects/c--Github-obsidian-cli-mcp/memory/MEMORY.md) `feedback_test_scope`); manual / integration TC-XXX cases live in the user's external tracker and are NOT scaffolded under `specs/047-fix-prepend-reliability/test-cases/`.

**Organization**: Tasks are grouped by user story per the spec.md priority ladder (P1 → P4). Each story is independently testable; US1 alone is the MVP increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **[Story]**: Story label (US1 / US2 / US3 / US4) for tasks inside user-story phases.
- File paths are relative to repo root.

## Path Conventions

Single-project layout per [plan.md](plan.md) `## Project Structure`. Per-surface modules under `src/tools/<tool>/{schema, tool, handler}.ts` with co-located `*.test.ts`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing project baseline supports the BI's work; no new project bootstrap required (the wrapper is shipped v0.7.4).

- [ ] T001 Verify branch state is clean and on `047-fix-prepend-reliability` (`git status --short` returns empty; `git rev-parse --abbrev-ref HEAD` returns the branch name).
- [ ] T002 [P] Verify the authorised test vault is registered with the Obsidian CLI (`obsidian vaults verbose` lists `TestVault-Obsidian-CLI-MCP`) per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). The vault is the scratch surface for T0 probes (T004 / T005); a registered, reachable vault is a hard prerequisite.
- [ ] T003 [P] Confirm the baseline quality gates pass on the fix branch BEFORE any change lands: `npm run lint`, `npm run typecheck`, `npm run build`, `npx vitest run`. If any gate fails on the unchanged branch, fix the regression as a separate concern before proceeding (the fix MUST land on a green baseline).

**Checkpoint**: Project baseline green; authorised test vault available. T0 probes (Phase 2) can now run.

---

## Phase 2: Foundational (Blocking Prerequisites — T0 Empirical Probes)

**Purpose**: Confirm the [research.md](research.md) R1 hypothesis (the wrapper-side root cause is the handler's post-stat byte-delta against an exit-0 upstream) and the R2 hypothesis (BI-0017 active-mode root cause is distinct from R1) empirically against the authorised test vault. The probes use the same dependency-injection pattern that produced the BI-0017 bisect file (Probe 6) — a spying `spawnFn` that captures emitted argv + child stdout/stderr/exit, paired with a primed pre-call stat and an unprimed post-call stat.

**⚠️ CRITICAL**: No user-story implementation begins until T0 probes confirm or refute the R1 hypothesis. If R1 is refuted, [plan.md](plan.md) is amended at the affected sections before US1 implementation begins.

- [ ] T004 [P] T0-R1 empirical probe — content-size bisect against the wrapper. Drive `executePrepend` with content sizes 1 KB / 5 KB / 9 KB / 10 KB / 12 KB / 16 KB / 24 KB against the authorised test vault under `Sandbox/BI-047/t0-r1-bisect/`. Capture per-call: emitted argv, child stdout / stderr / exitCode, pre-call stat, post-call stat, wall-clock latency. Compare against direct-CLI invocations of the upstream `obsidian prepend` at the same sizes (positive control). Identify the smallest content size at which the wrapper-vs-direct-CLI delta appears. Record raw probe outputs at `specs/047-fix-prepend-reliability/scratch/t0-r1-bisect/`. Document conclusions in `specs/047-fix-prepend-reliability/scratch/t0-r1-bisect/README.md` — confirms or refutes R1's "handler post-stat byte-delta against exit-0 upstream" hypothesis.
- [ ] T005 [P] T0-R2 empirical probe — active-mode shared-root-cause confirmation. Drive `executePrepend` with `target_mode: "active"` at a 10 KB payload against the BI-0017 fixture (`Sandbox/BI-0017/cli-active-probes/tc-active-target.md`), with the wrapper's vault-registry cache (a) primed via a prior specific-mode call and (b) cold. Compare emitted argv against the T0-R1 specific-mode probe at the same payload size. Record observations at `specs/047-fix-prepend-reliability/scratch/t0-r2-activemode/README.md` — confirms R2's "distinct root causes" decision or surfaces a shared mechanism that would re-scope this BI to include the active-mode fix.
- [ ] T006 T0 plan-amendment gate. If T004 or T005 contradicts the research.md hypothesis, amend [plan.md](plan.md) (and [research.md](research.md)) at the affected sections BEFORE proceeding. Record the amendment in a separate commit (`docs(047-fix-prepend-reliability): amend plan after T0 probe findings`). If both probes confirm the existing hypotheses, this task is a one-line confirmation note in the BI's PR description.

**Checkpoint**: T0 probes have either (a) confirmed the R1 + R2 hypotheses (proceed to Phase 3), or (b) surfaced contradictions (amend plan/research and re-evaluate before proceeding). Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 — Reliable success within the documented cap (Priority: P1) 🎯 MVP

**Goal**: An agent calling `prepend` with content from 1 byte up to 24576 UTF-16 code units against a target note in a registered vault receives a structured success envelope with the correct bytes-written delta and byte-correct post-state. No silent no-ops. No 10-second wrapper timeouts. No Obsidian crash modals.

**Independent Test**: 50 consecutive prepend calls against 50 different target notes, each with a payload of exactly 10240 ASCII characters per call, complete with a structured success envelope per call AND byte-correct post-state per call AND zero silent no-ops / timeouts / crashes across the sequence. The unit test that exercises this story uses a dependency-injected `spawnFn` + `fs` so it runs without a real Obsidian process; the wall-clock latency assertion (p95 ≤ 500 ms — FR-009 / SC-007) is part of the same test.

### Tests for User Story 1 (Principle II — REQUIRED)

> **NOTE**: Write the tests FIRST (red), then implement the guard (green), then refactor if needed. Tests are co-located per Principle II.

- [ ] T007 [P] [US1] Add unit test `executePrepend > raises FS_WRITE_FAILED.post-stat-byte-delta-zero when upstream returns exit 0 but on-disk byte count is unchanged` in `src/tools/prepend/handler.test.ts`. Setup: DI `spawnFn` returns `{stdout: "Prepended to: ...\n", stderr: "", exitCode: 0}`; DI `fs.stat` returns identical pre-call and post-call sizes (the silent-no-op shape). Assert: `executePrepend` throws `UpstreamError` with `code: "FS_WRITE_FAILED"`, `details.reason: "post-stat-byte-delta-zero"`, `details.preCallSize` / `details.postCallSize` populated, descriptive `message`. Per [contracts/prepend-error.contract.md](contracts/prepend-error.contract.md) row 21.
- [ ] T008 [P] [US1] Add unit test `executePrepend > 50-call regression cohort at 10240 ASCII chars produces structured success envelope per call with byte-correct delta` in `src/tools/prepend/handler.test.ts`. Setup: parameterised cohort over 50 target paths; DI `spawnFn` returns success exit 0; DI `fs.stat` returns pre-call = 0 and post-call = 10241 (10240 content + 1 byte separator) per call. Assert: 50 calls × structured success envelope × `bytes_written === 10241` × no thrown errors. Per [spec.md](spec.md) SC-002 (the count-50 unit-test mapping documented in [quickstart.md](quickstart.md) §3).
- [ ] T009 [P] [US1] Add unit test `executePrepend > in-cap success at 1 byte / midcap / 24575 / 24576 chars produces structured success envelope with positive bytes_written` in `src/tools/prepend/handler.test.ts`. Setup: parameterised over four boundary content sizes; DI `spawnFn` returns success exit 0; DI `fs.stat` returns pre-call / post-call sizes consistent with content + separator length per platform. Assert: structured success envelope per case; `bytes_written` equals expected delta. Per [spec.md](spec.md) US1 AC1 + FR-001.
- [ ] T010 [P] [US1] Add unit test `executePrepend > p95 wall-clock latency across 50-call cohort ≤ 500 ms` in `src/tools/prepend/handler.test.ts`. Setup: extend the T008 cohort with `performance.now()` brackets per call; sort observations; assert `observations[Math.floor(50*0.95)] <= 500`. The DI'd spawnFn returns synchronously, so this is a wrapper-overhead bound, not an upstream-latency bound — the test confirms the wrapper does not introduce latency that would consume the entire 500 ms p95 envelope. Per [spec.md](spec.md) FR-009 / SC-007.

### Implementation for User Story 1

- [ ] T011 [US1] Implement the post-stat byte-delta guard at `src/tools/prepend/handler.ts` lines 306-314. Insert (between the existing `const postCallSize = (await fs.stat(absPath)).size;` and `const bytesWritten = postCallSize - preCallSize;` lines OR immediately after the bytesWritten calculation): a guard that, when `bytesWritten <= 0`, raises a typed `UpstreamError` per the shape documented in [contracts/prepend-output.contract.md](contracts/prepend-output.contract.md) §"FR-003 structural enforcement" — `code: "FS_WRITE_FAILED"`, `cause: null`, `details: {reason: "post-stat-byte-delta-zero", path: relPath, vault: vaultDisplayName, preCallSize, postCallSize}`, descriptive `message`. The guard runs BEFORE the success envelope is constructed. Preserves the existing attribution header (`// Original — no upstream.`) byte-stable.
- [ ] T012 [US1] Run `npx vitest run src/tools/prepend/handler.test.ts` and confirm T007 / T008 / T009 / T010 all pass green (red→green transition completed). If any test fails, debug the guard implementation against the test setup — do NOT weaken the test assertions. Capture the run output in a PR-description-ready summary.

**Checkpoint**: User Story 1 fully functional and testable independently. MVP delivered: prepend is reliable for in-cap payloads against registered vaults; silent no-ops surface as structured `FS_WRITE_FAILED.post-stat-byte-delta-zero` envelopes. Stop here if scope-limited.

---

## Phase 4: User Story 2 — Structured failure surfacing, no silent no-ops (Priority: P2)

**Goal**: Every failure mode the wrapper detects surfaces as a structured `UpstreamError` envelope drawn from the existing code surface (per [contracts/prepend-error.contract.md](contracts/prepend-error.contract.md)). No new top-level codes. No success envelope when the on-disk byte count is unchanged.

**Independent Test**: For each of the enumerated failure modes (FR-005 / [contracts/prepend-error.contract.md](contracts/prepend-error.contract.md) rows 1-21), drive `executePrepend` through the failure path with DI'd `spawnFn` / `fs` / `vaultRegistry` and assert: the response is a structured `UpstreamError` envelope with the expected `(code, details.code, details.reason)` triple. None of the failure paths produces a success envelope.

### Tests for User Story 2 (Principle II — REQUIRED)

Note: T013 / T014 cover discriminator surfaces NOT exercised by US1's tests (T007 covers row 21; US1's regression cohort indirectly covers the happy path that would otherwise mask discriminator behaviour). The existing `handler.test.ts` already has coverage for several discriminators from BI-045 (NOTE_NOT_FOUND, EXTERNAL_EDITOR_CONFLICT, PATH_ESCAPES_VAULT, ERR_NO_ACTIVE_FILE, CONTENT_TOO_LARGE via schema.test.ts). The US2 tasks ADD coverage for the discriminator surfaces that this BI's fix expands or formalises.

- [ ] T013 [P] [US2] Add unit test `executePrepend > forbidden anti-pattern: success envelope with positive bytes_written but unchanged on-disk count is impossible` in `src/tools/prepend/handler.test.ts`. Setup: DI `spawnFn` returns success exit 0; DI `fs.stat` returns identical pre/post sizes; assert that the code path that previously could return `{bytes_written: <any value>}` against an unchanged on-disk count now raises `FS_WRITE_FAILED.post-stat-byte-delta-zero` instead. This is the broadened FR-003 enforcement test — covers BOTH the zero-bytes-written shape AND the positive-bytes-written shape against an unchanged disk count.
- [ ] T014 [P] [US2] Audit and (where missing) add unit tests in `src/tools/prepend/handler.test.ts` for any discriminator row in [contracts/prepend-error.contract.md](contracts/prepend-error.contract.md) (rows 1-20) that lacks an existing test. Each missing row gets a happy-path failure-injection test that asserts the expected `(code, details.code, details.reason)` triple. The Constitution Principle II co-location convention requires the test to live in `handler.test.ts` (the surface this BI modifies) — not in a parallel cohort fixture file.
- [ ] T015 [P] [US2] Confirm the existing `src/tools/prepend/schema.test.ts` covers `CONTENT_EMPTY` (Zod `too_small`) and `CONTENT_TOO_LARGE` (Zod `too_big`) cases. If either is missing, add the test in the same file. Each test asserts the Zod issue's `code` value (`too_small` / `too_big`) and the wrapper-boundary mapping to `VALIDATION_ERROR` with the documented `details.code` sub-state.

### Implementation for User Story 2

- [ ] T016 [US2] No production-code change is required beyond US1's T011 guard. US2's structured-failure surface is satisfied by (a) T011 (the new FS_WRITE_FAILED discriminator), (b) the existing handler classifier at `src/tools/prepend/handler.ts:116-165` (which already surfaces NOTE_NOT_FOUND / EXTERNAL_EDITOR_CONFLICT), and (c) the existing dispatch / adapter classifiers (per [contracts/prepend-error.contract.md](contracts/prepend-error.contract.md) rows 1-20). This task is a confirmation pass: trace every discriminator row to its construction site and confirm the file:line citation in the contract still holds at HEAD. If any citation has drifted, update the contract file in a small docs commit — but production code does not change.
- [ ] T017 [US2] **Conditional (gated on T004 outcome)**: if T0-R1 surfaces a CLI-adapter-layer signal that the inspector at `src/cli-adapter/cli-adapter.ts:88-97` misclassifies (e.g., a silent-no-op stdout shape the inspector mis-identifies as `CLI_REPORTED_ERROR`), add a defensive amendment at that inspector site that surfaces the wrapper's emitted argv inside `details` for any wrapper-detected failure originating from the adapter layer. Paired with co-located test additions in `src/cli-adapter/cli-adapter.test.ts`. **If T004 confirms R1 (handler is the sole fix surface), this task is N/A — record the N/A explicitly in the PR description.**

**Checkpoint**: User Stories 1 AND 2 both work independently. The silent-no-op anti-pattern is structurally impossible; every failure mode surfaces a recognisable discriminator. Stop here for incremental delivery if US3 / US4 deferred.

---

## Phase 5: User Story 3 — Host-process stability (Priority: P3)

**Goal**: Obsidian's main process remains responsive across every payload-size bucket; no crash modal appears; subsequent prepend calls do not exhibit recent-crash recovery latency.

**Independent Test**: The unit-test surface asserts that every payload-size bucket (well-under-cap / at-cap-boundary / exactly-at-cap / above-cap) produces a structured response via DI'd spawnFn returning crafted exit codes / stdout / stderr that simulate each failure-state surface. Manual host-process stability verification against a real Obsidian process is required at PR review time (per [quickstart.md](quickstart.md) §5) and recorded in the PR description's Test plan section.

### Tests for User Story 3 (Principle II — REQUIRED for the unit-testable surface)

- [ ] T018 [P] [US3] Add unit test `executePrepend > payload-size bucket coverage at well-under-cap, at-cap-boundary, exactly-at-cap, above-cap` in `src/tools/prepend/handler.test.ts`. Setup: parameterised over four buckets (1 KB, 24575 chars, 24576 chars, 24577 chars). For the in-cap buckets, DI `spawnFn` returns success exit 0 + DI `fs.stat` returns byte-correct deltas — assert structured success envelope. For the over-cap bucket, assert Zod's `.max(24576)` rejection fires at the schema boundary BEFORE `executePrepend` is reached (parsed via `prependInputSchema.parse(...)` directly). Per [spec.md](spec.md) FR-004 / SC-004 unit-testable surface.
- [ ] T019 [P] [US3] Add unit test `executePrepend > simulated host-process abnormal exit produces structured CLI_NON_ZERO_EXIT envelope` in `src/tools/prepend/handler.test.ts`. Setup: DI `spawnFn` returns `{stdout: "", stderr: "<abnormal-output>", exitCode: 4294967295}` (the `obsidian.exe` GUI crash exit code per BI-0017 Probe 5b). Assert: `executePrepend` throws `UpstreamError` with `code: "CLI_NON_ZERO_EXIT"`, no silent no-op produced. The simulated host-process crash through the spawn channel surfaces as a structured envelope; the actual GUI crash dialog is the upstream's responsibility (out of scope per the spec).

### Implementation for User Story 3

- [ ] T020 [US3] No production-code change required — the structured-failure surfacing from US2 + the handler guard from US1 + the existing dispatch-layer CLI_NON_ZERO_EXIT classifier (`src/cli-adapter/_dispatch.ts:283`) already satisfy the unit-testable surface. This task is the manual host-process stability verification preparation: write the manual-verification protocol section for the PR description per [quickstart.md](quickstart.md) §5. The protocol enumerates the payload-size buckets to test against a real Obsidian process and the observations the reviewer records (Obsidian remains responsive: Y/N per bucket; crash modal appears: Y/N per bucket; subsequent prepend latency within normal envelope: Y/N).

**Checkpoint**: User Story 3 covered for the unit-testable surface. The manual host-process stability verification is queued for PR review time. Stop here if US4 deferred.

---

## Phase 6: User Story 4 — Over-cap rejection at the schema boundary (Priority: P4)

**Goal**: Content exceeding 24576 UTF-16 code units is rejected with a structured `VALIDATION_ERROR` carrying `details.code: CONTENT_TOO_LARGE` within 1 second; no file is modified; no Obsidian dialog appears.

**Independent Test**: A payload of exactly 24577 ASCII characters (one over the cap) fails `prependInputSchema.parse(...)` with a Zod `too_big` issue; the wrapper boundary re-emits it as `VALIDATION_ERROR` with `details.code: CONTENT_TOO_LARGE`; no `spawnFn` invocation occurs (verified via a spying `spawnFn` that throws if invoked); the end-to-end assertion completes well under 1 second.

### Tests for User Story 4 (Principle II — REQUIRED)

- [ ] T021 [P] [US4] Add (or extend existing) unit test `prependInputSchema > rejects 24577-character content with too_big issue mapped to VALIDATION_ERROR.CONTENT_TOO_LARGE within 1 second` in `src/tools/prepend/schema.test.ts`. Setup: construct a 24577-character ASCII string; call `prependInputSchema.parse({...inputs, content: ...})`; assert the Zod issue's `code === "too_big"` and the wrapper-boundary re-emission carries `code: "VALIDATION_ERROR"`, `details.code: "CONTENT_TOO_LARGE"`; assert wall-clock latency ≤ 1 second (vitest's per-test timeout). Per [spec.md](spec.md) US4 / SC-003.
- [ ] T022 [P] [US4] Add unit test `executePrepend > rejects over-cap content before any spawnFn invocation` in `src/tools/prepend/handler.test.ts`. Setup: spying `spawnFn` that throws on any invocation; drive `executePrepend` with a 24577-char content via the SDK-style parsed input path; assert the spawnFn spy was NEVER invoked; assert the rejection surfaces at the schema boundary before reaching the handler's runtime code. Per [spec.md](spec.md) FR-002.

### Implementation for User Story 4

- [ ] T023 [US4] No production-code change required — the over-cap rejection is already in place via `MAX_CONTENT_LENGTH = 24576` in `src/tools/prepend/schema.ts:16` and the `z.string().min(1).max(MAX_CONTENT_LENGTH)` schema at line 52. This task is a confirmation pass: trace the cap value through the schema's `.max()` call, through the tool's `inputSchema` registration, through the published MCP `inputSchema` JSON (run `npx tsc && node -e "..."` to extract the JSON if needed), and confirm the cap value is byte-stable with v0.7.4 (SC-006). Record the confirmation in the PR description.

**Checkpoint**: All four user stories complete. The full FR / SC surface is covered.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates, coverage threshold, post-implement structural verification, manual host verification record.

- [ ] T024 [P] Run `npm run lint` and confirm zero warnings (Constitution gate 1).
- [ ] T025 [P] Run `npm run typecheck` and confirm zero errors (Constitution gate 2).
- [ ] T026 [P] Run `npm run build` and confirm success (Constitution gate 3).
- [ ] T027 Run `npx vitest run` and confirm the full test suite passes, including the 50-call regression cohort + all new tests added under US1 / US2 / US3 / US4 (Constitution gate 4 + Principle II).
- [ ] T028 Confirm the aggregate statements coverage threshold in `vitest.config.ts` is met (Constitution gate 5). If the new tests have pushed coverage above the floor, optionally ratchet the threshold upward in a one-line visible edit (separate commit per the project convention).
- [ ] T029 Run `/graphify --update` to refresh the semantic nodes after the prose / code changes land. The refresh has token cost; this is the single batch refresh for the BI per the CLAUDE.md graphify rule "batch at phase boundaries". Confirm: (a) no new error-class nodes outside the `src/errors.ts` community, (b) no production handler imports `createLogger()` / `createQueue()` directly, (c) the new code lands in the expected `prepend` tool community, (d) the new `FS_WRITE_FAILED.post-stat-byte-delta-zero` discriminator surface is structurally connected (the guard site is one statement in an existing function; connectivity is trivially preserved). Record findings in the PR description's `Graphify post-implement` section.
- [ ] T030 [P] Update the BI-047 entry in [Decision Log](../../.decisions/Decision%20Log.md) if any decision warrants a new ADR. The current research-confirmed sub-discriminator (`FS_WRITE_FAILED.post-stat-byte-delta-zero`) is a sub-state under an existing top-level code — it does NOT require a new ADR (ADR-015 already covers the sub-discriminator pattern). If T004 / T005 surface a structural decision worth a new ADR (e.g., the wrapper's spawn substrate's behaviour under non-ASCII argv expansion warrants its own decision), draft the ADR in `.decisions/ADR-NNN - <title>.md` and register it in the Decision Log mirror. **Default expectation: no new ADR.**
- [ ] T031 Manual host-process stability verification per [quickstart.md](quickstart.md) §5. Drive the wrapper through the MCP server against the authorised test vault at each payload-size bucket (well-under-cap / at-cap / exactly-at-cap / above-cap). Confirm: Obsidian remains responsive, no crash modal appears, subsequent prepend latency falls within the normal envelope. Record per-bucket observations in the PR description's Test plan section. **This task is the maintainer's responsibility at PR review time, not an AFK-agent-completable task.**
- [ ] T032 Compose the PR description per the project convention: WHY paragraph, Constitution Compliance checklist (Y/N/N/A per Principle + ADR-010 / ADR-013 / ADR-014 / ADR-015), Test plan (including T031's manual verification observations), Graphify post-implement section (T029's findings), FR / SC reference list, BI-0017 cross-reference for the active-mode bug that remains out of scope for this BI.

**Checkpoint**: The fix is ready for merge. All Constitution gates pass; the manual host verification is recorded; the post-implement structural verification confirms no architectural drift.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — runs first.
- **Phase 2 (Foundational / T0 probes)**: Depends on Phase 1 — BLOCKS all user stories.
- **Phase 3 (US1 P1)**: Depends on Phase 2 completion.
- **Phase 4 (US2 P2)**: Depends on Phase 3 (T011 guard is the production surface US2 tests assert against; T017 is conditionally gated on T004's outcome).
- **Phase 5 (US3 P3)**: Depends on Phase 4 (US3's tests assert structured envelopes that US1 + US2 produce).
- **Phase 6 (US4 P4)**: Depends on Phase 1 only (over-cap rejection is already in the v0.7.4 schema; US4 is verification, not implementation).
- **Phase 7 (Polish)**: Depends on all desired user stories being complete (per the project's quality-gate convention).

### User Story Dependencies

- **US1 (P1)**: MVP. Independent. Delivers the primary success-path repair and the FR-003 anti-pattern elimination.
- **US2 (P2)**: Depends on US1 (T011 is the production surface; T013-T015 are tests against it).
- **US3 (P3)**: Depends on US1 + US2 (the structured envelopes US3's tests assert against are produced by US1 + US2).
- **US4 (P4)**: Independent of US1 / US2 / US3 — verifies an existing v0.7.4 surface (the schema cap).

### Within Each User Story

- Tests are written FIRST (per Constitution Principle II co-location convention + the project's red-green-refactor discipline).
- Implementation lands after tests are red.
- Tests re-run green to confirm the implementation closes the assertion.

### Parallel Opportunities

- T002 + T003 (Setup): independent, can run in parallel.
- T004 + T005 (T0 probes): independent target shapes; can run in parallel.
- T007 + T008 + T009 + T010 (US1 tests): different test cases in the same file; can be authored in parallel commits but lint may surface conflicts — author sequentially in the same file is safer.
- T013 + T014 + T015 (US2 tests): same file + spread across handler.test.ts and schema.test.ts; T015 lives in a different file from T013 / T014.
- T018 + T019 (US3 tests): same file.
- T021 + T022 (US4 tests): different files (schema.test.ts vs handler.test.ts) — can run in parallel.
- T024 + T025 + T026 (Polish quality gates): independent commands; can run in parallel.

### Cross-Story Parallelism

Once Phase 2 (T0 probes) confirms R1, US1 / US4 can be staffed in parallel (US4 has no production-code change, only test verification). US2 and US3 strictly depend on US1's T011 guard; they serialise after US1's checkpoint.

---

## Parallel Example: User Story 1

```bash
# Author all four US1 tests in `src/tools/prepend/handler.test.ts` in sequence (same file):
Task: "T007 — silent no-op test"
Task: "T008 — 50-call regression cohort test"
Task: "T009 — boundary success test"
Task: "T010 — p95 latency assertion"

# Then implement the guard:
Task: "T011 — post-stat byte-delta guard in handler.ts"

# Then re-run the tests:
Task: "T012 — npx vitest run handler.test.ts; confirm green"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup (T001-T003).
2. Complete Phase 2: T0 probes (T004-T006). If R1 is refuted, amend plan + research before proceeding.
3. Complete Phase 3: US1 (T007-T012). Red → green → refactor.
4. **STOP and VALIDATE**: run `npx vitest run src/tools/prepend/` and confirm the regression cohort + new tests pass. The fix is shippable at this point — silent no-ops are eliminated; the in-cap success contract holds.
5. Demo / deploy if scope-bounded to US1.

### Incremental Delivery

1. Setup + Foundational → baseline + T0 probes confirmed.
2. Add US1 → MVP shipped (silent no-ops eliminated, success-path reliable).
3. Add US2 → structured failure surface formalised (every discriminator tested).
4. Add US3 → host-process stability unit-testable surface covered.
5. Add US4 → over-cap rejection latency + no-spawn guarantees verified.
6. Polish → quality gates + post-implement structural check + manual host verification.

### Parallel Team Strategy

For a single AFK agent: sequential phases, parallel within a phase where dependencies allow.

For a multi-developer team:

1. Team completes Phases 1 + 2 together.
2. Once Phase 2 is done:
   - Developer A: US1 (T007-T012). Blocks B and C.
   - Developer B: US4 (T021-T023) — independent of US1, can run in parallel with A.
3. When A finishes US1's checkpoint:
   - Developer C: US2 (T013-T017).
   - Developer A: US3 (T018-T020) — depends on US2's confirmation pass.
4. Polish (Phase 7) runs after all stories are complete.

---

## Notes

- **Test scope is unit-only** per the user's project convention. Manual / integration / TC-XXX cases live in the user's external tracker and are not scaffolded under this BI's directory.
- **The 50-call regression cohort is a unit test**, not an integration probe. The DI'd `spawnFn` + `fs` replay the wrapper's failure surface without a real Obsidian process; the manual host verification (T031) is the integration safety net.
- **T0 probes (T004 / T005) run against the authorised test vault** per [.memory/test-execution-instructions.md](../../.memory/test-execution-instructions.md). The scratch outputs under `specs/047-fix-prepend-reliability/scratch/` are gitignore-naked (per the project's `scratch/` convention — see also the prior `scratch/probe-file-input.cjs` artifact from commit 7065578).
- **Conditional task T017 is gated on T004's outcome**. If T0-R1 confirms the handler is the sole fix surface, T017 is N/A. If T0-R1 surfaces a CLI-adapter signal that the inspector misclassifies, T017 lands as paired-with-tests production code at `src/cli-adapter/cli-adapter.ts`.
- **No new top-level UpstreamError codes** land in this BI. The project's zero-new-top-level-codes streak (Principle IV) is preserved. The one new sub-discriminator (`FS_WRITE_FAILED.details.reason: "post-stat-byte-delta-zero"`) is the canonical ADR-015 pattern application.
- **Cohort cross-reference**: the active-mode BI-0017 fix is out of scope for this BI per spec.md and confirmed by T005's expected outcome. The cross-evidence in `specs/045-prepend-note/active-mode-bisect-2026-05-26.md` and `specs/045-prepend-note/upstream-file-input-probe-2026-05-26.md` is the durable record for the cohort follow-up.
- **Commit cadence**: per the project convention, commit after each phase checkpoint (Setup → Foundational → US1 → US2 → US3 → US4 → Polish). Use `/speckit-git-commit` at each checkpoint; the skill drafts the conventional message and commits directly.
