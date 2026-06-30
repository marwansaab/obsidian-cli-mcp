---
description: "Task list for 065-fix-empty-bases implementation"
---

# Tasks: Fix Empty Bases

**Input**: Design documents from `specs/065-fix-empty-bases/`
**Prerequisites**: [plan.md](plan.md) (required), [spec.md](spec.md) (user stories), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: INCLUDED and MANDATORY. Constitution Principle II requires every modified public surface to ship co-located happy-path + failure/boundary tests in the same change. The unit suite mocks `invokeCli`; the only live-CLI step is the T0 verification probe (Phase 2).

**Organization**: Tasks are grouped by user story. The single production change (one membership predicate in `handler.ts`) is the US1 deliverable; US2 and US3 are preserved-by-design and add guard tests only (no further production code).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files / independent resources, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (user-story phase tasks only)
- Exact file paths included.

## Path Conventions

Single project — MCP server. Production: `src/tools/bases/handler.ts`. Co-located test: `src/tools/bases/handler.test.ts`. No other source file is touched.

---

## Phase 1: Setup

**Purpose**: Establish the pre-change baseline and the live-CLI gate. No project init needed — the `bases` module and `vitest` harness already exist.

- [ ] T001 [P] Read `.memory/test-execution-instructions.md` and confirm the authorised TestVault, the scratch subdirectory, and the destructive-probe/cleanup protocol for the Phase 2 live-CLI probe (gate per CLAUDE.md "Test Execution"). Drive `Obsidian.com`, never the GUI `Obsidian.exe`.
- [ ] T002 Establish the pre-change unit baseline: run `npx vitest run src/tools/bases` and record results. Confirm the existing "happy: empty vault returns count=0" test passes despite the live defect (it feeds `stdout: ""`, which never reproduced the bug — research D6). This documents the coverage gap this BI closes.

---

## Phase 2: Foundational (T0 verification — BLOCKS fixture-accurate tests)

**Purpose**: Confirm the empty-vault emission channel the fix rests on (exit-0 + informational line on stdout) and capture the real stdout shapes that become the unit-test fixtures. Per [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md).

**⚠️ CRITICAL**: Per research D7, if a probe returns the surprise outcome (message on stderr and/or non-zero exit), STOP and re-verify the reproduction with the user before coding — that outcome would contradict the count=1 defect symptom.

- [ ] T003 T0 **P1 — empty-vault channel**: in a scratch context with zero `.base` files, invoke the native `bases` subcommand (`command:"bases"`, `target_mode:"active"`) via `Obsidian.com`; capture exit code + stdout + stderr. Confirm exit `0`, the informational line on stdout (record exact wording), and no line ending in `.base`. Per contracts/t0-probe-plan.md §P1.
- [ ] T004 T0 **P2 — populated baseline + casing**: in a scratch context with a known set of `.base` files (include one with internal spaces/punctuation, e.g. `Backlog (Base).base`), run the same invocation; capture stdout (expect one `.base` path per line, no informational text) and record the on-disk extension casing. This capture becomes the populated regression fixture. Per contracts/t0-probe-plan.md §P2.
- [ ] T005 Record P1/P2 evidence (exit/stdout/stderr, exact empty-message wording, extension casing) in the implement-phase notes; finalize the unit fixtures (empty = the real message line; populated = the captured multi-base stdout). Clean up all scratch `.base` files / scratch subfolders per the cleanup protocol.

**Checkpoint**: empty-channel confirmed exit-0-on-stdout → the positive-`.base`-filter mechanism is validated; fixture-accurate tests can be written.

---

## Phase 3: User Story 1 - Empty vault returns an honest empty result (Priority: P1) 🎯 MVP

**Goal**: A vault with zero `.base` files lists as `{ bases: [], count: 0 }` — no fake entry built from the informational message.

**Independent Test**: Drive `bases` against a zero-`.base` context (real, or the mocked `"No base files found in vault\n"` stdout) → empty list, count 0.

> TDD: write the failing empty-vault test (T006) FIRST, confirm it is red on the current handler, then make it green with the predicate change (T007).

- [ ] T006 [US1] **(red)** Correct the stale empty-vault test in `src/tools/bases/handler.test.ts`: replace the `{ stdout: "" }` fixture in "happy: empty vault returns count=0" with the real empty emission `{ stdout: "No base files found in vault\n" }` (exit 0); assert `result.bases` is `[]` and `result.count` is `0`. Confirm this test FAILS against the current handler (it yields count 1) — the genuine regression guard (research D6).
- [ ] T007 [US1] **(green)** In `src/tools/bases/handler.ts`, change the membership predicate from `.filter((line) => line.length > 0)` to `.filter((line) => line.toLowerCase().endsWith(".base"))` (keep the preceding `split`/`trim` and the following `sort`/`basesOutputSchema.parse` unchanged). Update the `// Original — no upstream.` header's one-line intent to note the `.base` membership filter. Confirm T006 now passes.
- [ ] T008 [US1] Add a whitespace/blank-output boundary test in `src/tools/bases/handler.test.ts`: fixture `{ stdout: "   \n\n" }` → `{ bases: [], count: 0 }` (FR-002 / edge case).

**Checkpoint**: Empty vault is honest. US1 independently demonstrable.

---

## Phase 4: User Story 2 - Populated vault listing is unchanged (Priority: P1)

**Goal**: Any non-empty vault returns the same sorted, names-only list and count as before the fix; a single real Base still counts 1. No production change — guard tests only.

**Independent Test**: Drive `bases` against a known `.base` set → membership and order byte-identical to pre-fix output.

- [ ] T009 [US2] Confirm/extend the populated regression coverage in `src/tools/bases/handler.test.ts`: ensure the existing "happy: multi-base sorted output" and "happy: deterministic sort order" cases assert the exact pre-fix sorted list and count; if the T0 P2 capture differs from the current fixture, add a case using the captured multi-base stdout. Result must be byte-identical to the pre-fix output (FR-004 / SC-003).
- [ ] T010 [US2] Add a single-real-Base boundary test in `src/tools/bases/handler.test.ts`: fixture `{ stdout: "Only One.base\n" }` → `{ bases: ["Only One.base"], count: 1 }` — the filter never mistakes a real single Base for the empty signal (FR-005).
- [ ] T011 [US2] Add a message-mixed-with-paths defensive test in `src/tools/bases/handler.test.ts`: fixture `{ stdout: "No base files found in vault\nReal One.base\n" }` → `{ bases: ["Real One.base"], count: 1 }` — only the `.base` path survives (FR-002 / edge case).
- [ ] T012 [US2] Add a case-insensitive-extension test in `src/tools/bases/handler.test.ts`: fixture with a `.Base`/`.BASE` line (e.g. `{ stdout: "Mixed.Base\n" }`) → that line is kept (`count: 1`) — confirms the `toLowerCase().endsWith(".base")` predicate (FR-002 / research D5).

**Checkpoint**: US1 + US2 both pass; no populated-path regression.

---

## Phase 5: User Story 3 - Genuine failures stay distinguishable from empty (Priority: P2)

**Goal**: A real failure surfaces as `UpstreamError`, never as `{ bases: [], count: 0 }`. No production change — the error path is owned by `invokeCli` and runs before the filter.

**Independent Test**: Drive `bases` into a non-zero CLI exit → rejects with `UpstreamError`, observably different from the empty result.

- [ ] T013 [US3] Verify and retain the existing upstream-failure boundary test in `src/tools/bases/handler.test.ts` ("upstream CLI failure surfaces as UpstreamError": non-zero exit + stderr → rejects with `UpstreamError`). Confirm it still passes unchanged after T007, and that the empty case (T006) and this failure case produce observably different outcomes — a clean empty envelope vs a thrown typed error (FR-006 / SC-004). Add a brief comment tying the case to Story 3 if not already clear.

**Checkpoint**: All three stories validated; empty ≠ failure.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Merge-gate, frozen-surface confirmation, and post-implement structural verification.

- [ ] T014 Run the full merge gate, all green: `npm run lint` (zero warnings), `npm run typecheck`, `npm run build`, and the coverage suite. On Windows use the reliable invocation: `mkdir -p coverage/.tmp` then `npx vitest run --coverage --pool=forks --no-file-parallelism` (per the project coverage-flakiness note). Confirm the aggregate statements threshold still passes.
- [ ] T015 [P] Confirm `src/tools/_register-baseline.json` `bases` fingerprints (`descriptionFingerprint` / `schemaFingerprint`) are UNCHANGED — the published surface is frozen, so the FR-018 baseline-stability test passes without regeneration. If they moved, an unintended description/schema edit leaked in — revert it.
- [ ] T016 [P] Post-implement structural verification: run `/graphify --update`, then confirm per plan §"Graphify structural check": (1) no new error-class node outside `src/errors.ts` and no new `details.*` literal (the empty case is a success); (2) `executeBases`'s edge set is unchanged — `{ invokeCli, handler.test.ts, handler.ts, index.ts }`, no new `UpstreamError`/kernel/sibling-tool edge; (3) `bases` stays in the native-CLI-wrapper Bases-family community (no surprise migration); (4) `handler.ts` remains structurally connected.
- [ ] T017 Run the [quickstart.md](quickstart.md) scenarios A (empty), B (populated + single-Base), C (failure) against the authorised TestVault for final manual confirmation; clean up any scratch artifacts per the test-execution protocol.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately. T002 establishes the baseline.
- **Foundational (Phase 2)**: depends on T001 (the live-CLI gate doc). T003 → T004 → T005 are sequential (they reshape the same TestVault state: zero-`.base` for P1, then populated for P2). **Blocks** the fixture-accurate tests in Phases 3–5.
- **US1 (Phase 3)**: depends on Phase 2. T006 (red) → T007 (green) → T008. This is the MVP and the only phase with production code.
- **US2 (Phase 4)**: depends on T007 (the predicate must exist for the guard tests to pass). T009–T012 all edit `handler.test.ts` → sequential among themselves.
- **US3 (Phase 5)**: depends on T007. T013 edits `handler.test.ts` → sequential after Phase 4's edits to the same file.
- **Polish (Phase 6)**: depends on all edits complete. T014 runs the gate; T015/T016 are independent checks; T017 is the manual pass.

### Within / across user stories

- The single production edit is T007. US2 and US3 add **no** production code — their tasks are guard tests proving the one change preserved the populated path and the failure distinction.
- All test tasks (T006, T008, T009–T012, T013) edit the **same file** `handler.test.ts`, so they are **not** parallelizable with each other (same-file conflict) and run in listed order.

### Parallel Opportunities

- T001 [P] (read gate doc) can run alongside T002 (baseline run) — different actions, no shared resource.
- T015 [P] (baseline-fingerprint check) and T016 [P] (graphify structural verification) are independent and can run together after T014.
- The T0 probes (T003/T004) are **NOT** parallel — they require contradictory vault states (zero `.base` vs populated) on the same TestVault.
- No cross-file production parallelism exists — this BI changes one production file.

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 (Setup) → Phase 2 (T0 verification) → confirm exit-0-on-stdout.
2. Phase 3: T006 (red) → T007 (predicate) → T008. **STOP and VALIDATE**: empty vault now returns `{ bases: [], count: 0 }`.
3. This is shippable on its own — the defect is fixed and, by construction, the populated path is untouched.

### Incremental Delivery

1. US1 → empty-vault honesty (MVP).
2. US2 → add the no-regression guard tests (populated, single-Base, message-mixed, case-insensitive).
3. US3 → confirm the failure-distinctness guard test still holds.
4. Polish → gate green, frozen surface confirmed, structural verification clean.

---

## Notes

- **Graphify cross-module path check (CLAUDE.md `/speckit-tasks` rule): N/A.** This BI touches a single source file (`src/tools/bases/handler.ts`) plus its co-located test; there is no two-source-module pair to run `/graphify path` over. The single-file structural surface is verified instead by the plan's §"Graphify structural check" (grounded by `/graphify explain executeBases`) and the post-implement check T016.
- **Test scope is unit-only** for this repo (per the project's test-scope note): the `*.test.ts` cases mock `invokeCli`; manual scenarios live in quickstart.md (T017), not as scaffolded TC files. The only real-CLI step is the Phase 2 T0 probe.
- **Published surface frozen**: no schema/description/index/server/doc edit; `_register-baseline.json` `bases` fingerprints must not move (T015).
- **Zero new error codes / sub-states** (Principle IV): the empty vault is a success, not an error — never surfaced as `UpstreamError`.
- Commit after each logical group (e.g. the red test, the green predicate, the guard tests, the polish pass).
