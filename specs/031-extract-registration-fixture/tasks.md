---
description: "Task list for BI-031 Extract Registration Stub Fixture"
---

# Tasks: Extract Registration Stub Fixture

**Input**: Design documents from `/specs/031-extract-registration-fixture/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/registration-stub.contract.md](contracts/registration-stub.contract.md), [quickstart.md](quickstart.md)

**Tests**: Test tasks ARE included for the Foundational phase only — the co-located `_registration-stub.test.ts` is the documented contract for the shared fixture per Principle II (NON-NEGOTIABLE) and R6 (research). The 16 consuming files retain their EXISTING tests verbatim; no new tests are added to consumer files.

**Organization**: Tasks are grouped by phase. Phase 2 (Foundational) blocks US1; US2 is automatically satisfied once US1 ships (it captures the standing-wave maintenance benefit of the consolidation, not a separate buildable surface).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 or US2)
- File paths are absolute relative to repository root (`c:\Github\obsidian-cli-mcp\`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the working environment is ready for the refactor.

- [X] T001 Verify working tree is clean and the active branch is `031-extract-registration-fixture` by running `git status` and `git branch --show-current`. If unclean, stop and ask the user how to proceed (stash, commit, or discard).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Ship the shared fixture module and its co-located unit test. Both user stories depend on this surface existing.

**⚠️ CRITICAL**: US1 (the 16-caller refactor) cannot start until the fixture exists and its co-located test passes.

- [X] T002 Create the shared fixture module at `src/tools/_registration-stub.ts` per the contract in [contracts/registration-stub.contract.md](contracts/registration-stub.contract.md). The file must (a) carry the `// Original — no upstream.` header from data-model.md §1.5; (b) export the `RegistrationStubOpts` interface with exactly the two fields `stdout?: string` and `exitCode?: number`; (c) export `makeRegistrationStubSpawn(opts?: RegistrationStubOpts): SpawnLike` whose body is byte-equivalent to the 788-byte template currently duplicated across the 11 byte-identical callers (per FR-003); (d) import `SpawnLike` from `../cli-adapter/_dispatch.js` (and import the supporting `SpawnOptions` from `node:child_process`, `EventEmitter` from `node:events`, `Readable` from `node:stream`, all needed inside the function body).

- [X] T003 Create the co-located unit test at `src/tools/_registration-stub.test.ts` with the 7 cases enumerated in data-model.md §5: (1) default invocation produces exit-0 child with empty streams; (2) `opts.stdout` is encoded as UTF-8 and pushed before the null sentinel; (3) `opts.exitCode` propagates to the `exit` event; (4) both opts together exercise the full pipeline; (5) the returned child satisfies the SpawnLike shape contract (`.stdout` Readable, `.stderr` Readable, `.pid = 7`, `.kill` returns `true`); (6) setImmediate lifecycle order — stdout-push precedes stdout-null-push; stdout-null-push precedes stderr-null-push; stderr-null-push precedes exit-emit (verified by attaching listeners and recording the sequence); (7) default `exitCode = 0` when `opts.exitCode` is omitted. Use vitest's `describe` / `it` / `expect`. Carry the `// Original — no upstream. Tests for the shared registration stub fixture (BI-031).` header.

- [X] T004 Run `npm test -- src/tools/_registration-stub.test.ts` and verify ALL 7 cases pass. This isolates the fixture's contract validation from the consumer refactor and exercises Q-1 / Q-2 / Q-3..Q-9 from quickstart.md. If any case fails, fix `_registration-stub.ts` before proceeding to Phase 3.

**Checkpoint**: Fixture exists at the locked path; co-located tests pass; the import target is resolvable from any `src/tools/<name>/index.test.ts` via `"../_registration-stub.js"`.

---

## Phase 3: User Story 1 — New typed tool inherits the registration stub via a one-line import (Priority: P1) 🎯 MVP

**Goal**: Replace each of the 16 local `function makeStubSpawn() { ... }` declarations with an import of the shared fixture. After this phase, a new typed tool author can write one import line to inherit the stub.

**Independent Test**: After Phase 3 completes, `npm test` runs cleanly with the same test inventory as the pre-refactor baseline (Q-11 + Q-17 from quickstart.md). The 16 files' diffs each show: deletion of the local function block, addition of one fixture import line, cleanup of four now-unused imports per R3 (Q-19).

### Implementation for User Story 1

The 16 consumer edits are mutually independent — each touches a different file. All 16 tasks are marked `[P]` and may be performed in any order or in parallel. Each task follows the exact per-caller diff template in data-model.md §3 and the editing protocol in R3 (research).

The editing protocol per consumer file is identical:
1. Remove `import { type SpawnOptions } from "node:child_process";`
2. Remove `import { EventEmitter } from "node:events";`
3. Trim `Readable` from the `node:stream` import (keep `Writable`)
4. Trim `type SpawnLike` from the `../../cli-adapter/_dispatch.js` import (keep `__resetInFlightRegistryForTests`)
5. Add `import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";` (placed after the other `../_` imports to match the file's existing import-ordering convention)
6. Delete the local `function makeStubSpawn(opts: { stdout?: string; exitCode?: number } = {}): SpawnLike { ... }` block in its entirety (approximately lines 15-37 in each file; the exact line range varies slightly per file)

After each edit, the file's invocations of `makeStubSpawn(...)` remain byte-stable.

- [X] T005 [P] [US1] Refactor `src/tools/delete/index.test.ts` per the editing protocol above. (Source body class: 788/e92c — byte-identical baseline.)

- [X] T006 [P] [US1] Refactor `src/tools/files/index.test.ts` per the editing protocol above. (Source body class: 789/78417 — pid=11 absorbed by unification on pid=7 per R4.)

- [X] T007 [P] [US1] Refactor `src/tools/find_by_property/index.test.ts` per the editing protocol above. (Source body class: 788/e92c.)

- [X] T008 [P] [US1] Refactor `src/tools/links/index.test.ts` per the editing protocol above. (Source body class: 788/e92c.)

- [X] T009 [P] [US1] Refactor `src/tools/move/index.test.ts` per the editing protocol above. (Source body class: 788/e92c.)

- [X] T010 [P] [US1] Refactor `src/tools/outline/index.test.ts` per the editing protocol above. (Source body class: 789/f6753 — pid=12 absorbed by unification on pid=7.)

- [X] T011 [P] [US1] Refactor `src/tools/properties/index.test.ts` per the editing protocol above. (Source body class: 789/ae069 — pid=13 absorbed by unification on pid=7.)

- [X] T012 [P] [US1] Refactor `src/tools/read/index.test.ts` per the editing protocol above. (Source body class: 788/e92c.)

- [X] T013 [P] [US1] Refactor `src/tools/read_heading/index.test.ts` per the editing protocol above. (Source body class: 788/e92c.)

- [X] T014 [P] [US1] Refactor `src/tools/read_property/index.test.ts` per the editing protocol above. (Source body class: 788/e92c.)

- [X] T015 [P] [US1] Refactor `src/tools/rename/index.test.ts` per the editing protocol above. (Source body class: 788/e92c.)

- [X] T016 [P] [US1] Refactor `src/tools/set_property/index.test.ts` per the editing protocol above. (Source body class: 788/e92c.)

- [X] T017 [P] [US1] Refactor `src/tools/smart_connections_query/index.test.ts` per the editing protocol above. (Source body class: 788/e92c.)

- [X] T018 [P] [US1] Refactor `src/tools/smart_connections_similar/index.test.ts` per the editing protocol above. (Source body class: 788/e92c.)

- [X] T019 [P] [US1] Refactor `src/tools/tag/index.test.ts` per the editing protocol above. (Source body class: 789/ae069 — pid=13 absorbed by unification on pid=7.)

- [X] T020 [P] [US1] Refactor `src/tools/tree/index.test.ts` per the editing protocol above. (Source body class: 789/ae069 — pid=13 absorbed by unification on pid=7.)

### Verification gate for User Story 1

- [X] T021 [US1] Run `npm run typecheck` and verify exit code `0`. Failure modes to expect if a task in T005..T020 was incomplete: (a) unused-import error from `noUnusedLocals: true` if an unused import was left in place; (b) `makeStubSpawn is not defined` error if the import was added with a different identifier than the call-site identifier expects. Verifies Q-10 from quickstart.md.

- [X] T022 [US1] Run `npm test` and verify (a) exit code `0`; (b) the same number of test files, test cases, case names, and pass / fail counts as the pre-refactor baseline. Capture the vitest summary line; compare against the pre-refactor baseline if available. Verifies Q-11, Q-16 (the `_register-baseline.test.ts` durable test must pass without baseline regeneration), and Q-17 from quickstart.md.

- [X] T023 [US1] Verify the obsidian_exec carve-out is intact by running `grep -n "function makeStubSpawn(" src/tools/obsidian_exec/index.test.ts` (expected: one match, the local declaration at approximately line 17) AND `grep -n "_registration-stub" src/tools/obsidian_exec/index.test.ts` (expected: zero matches). Verifies Q-12 from quickstart.md and confirms FR-006 / R7.

- [X] T024 [US1] Verify the post-refactor `function makeStubSpawn(` count by running `grep -rl "function makeStubSpawn(" src/tools/*/index.test.ts | wc -l` and confirming the count is exactly `1` (the surviving `obsidian_exec/index.test.ts`). Verifies Q-13 and Q-14 from quickstart.md, plus SC-001.

**Checkpoint**: User Story 1 is complete. A new typed tool author can now write `import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";` in their `index.test.ts` and skip the 22-line local declaration. The 16 consuming registration tests pass with no inventory drift; the carve-out is preserved; the registry-stability baseline holds.

---

## Phase 4: User Story 2 — Stub-quirk fix lands once and benefits every caller (Priority: P2)

> **⚠️ STRUCTURAL: US2 has NO implementation tasks of its own. US2 is satisfied AUTOMATICALLY the moment Phase 3 ships.** The consolidation IS the deliverable; any future edit to `_registration-stub.ts` propagates to all 16 consumers by the nature of TypeScript module imports. The co-located test from T003 gives future fixes a verification target. The single OPTIONAL task T025 below exists ONLY to demonstrate the propagation property empirically — running it is not required; satisfaction is by-construction.

**Goal**: Demonstrate (optionally) that a future fix to the shared fixture propagates to all 16 consumers automatically.

**Independent Test**: Per spec US2 acceptance scenario — edit a structural detail of the fixture (for example, change `child.pid` from `7` to a different literal, or insert a deterministic delay before `setImmediate`), run `npm test`, observe that every consuming test still passes without any edit to consumer files; then revert.

- [ ] T025 [US2] (OPTIONAL acceptance check) Edit `src/tools/_registration-stub.ts` to change `child.pid = 7` to `child.pid = 99`. Run `npm test`. Verify all 16 consuming registration tests still pass (none assert on the pid literal — see R4). Revert the edit. This exercises the spec US2 acceptance scenario and proves the propagation property empirically.

**Checkpoint**: User Story 2 is satisfied structurally by the consolidation itself. T025 documents the propagation property; running it is optional.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verify all constitutional and project gates pass; finalize delivery.

- [X] T026 [P] Run `npm run lint` and verify exit code `0` with zero warnings (constitutional Workflow gate point 1). Verifies Q-20 from quickstart.md.

- [X] T027 [P] Run `npm run build` and verify exit code `0` (constitutional Workflow gate point 3). Verifies Q-21 from quickstart.md.

- [X] T028 Run `npx vitest run --coverage` and verify the `statements` metric is at-or-above the pinned `91.3` floor in `vitest.config.ts`. Capture the actual percentage and include it in the PR description's quality-gate row. Verifies Q-18 from quickstart.md and SC-005. If the metric is BELOW `91.3`, investigate (per R5 the expected impact is flat-to-positive — a regression indicates an unforeseen interaction).

- [ ] T029 (Optional) Decide whether to add a CHANGELOG.md entry for the internal test-infrastructure refactor. This is a test-only change with no end-user surface impact, so a CHANGELOG entry is not strictly required by the project's release convention. If included, place under an `### Internal` subsection in the next `## [Unreleased]` block; do NOT bump the package version (currently `0.5.8`) for this refactor alone — bundle the version bump with the next BI that ships an end-user-visible change.

- [X] T030 Spot-check a sample of 3-4 of the 16 modified `index.test.ts` files in the IDE / VS Code SCM panel to verify the per-file diff shape matches the data-model.md §3.2 "after" template — function block deleted, fixture import added, four imports cleaned up per R3, no other edits. Verifies Q-19 from quickstart.md and SC-008. (No automated assertion; this is a reviewer-grade sanity check before the implementation commit.) ADDITIONALLY: compute the byte-distinct-body audit for SC-002 by extracting the post-refactor `makeStubSpawn` function bodies and hashing them — expected result is exactly 2 distinct sha256 hashes (the shared fixture's body + `obsidian_exec`'s 971-byte local body). One audit recipe (PowerShell-on-Windows): iterate over `src/tools/_registration-stub.ts` and `src/tools/obsidian_exec/index.test.ts`; for each, extract the lines from `function makeStubSpawn(` (or `function makeRegistrationStubSpawn(`) through the matching closing `}` brace; pipe each body through `Get-FileHash -Algorithm SHA256` (or `sha256sum` under bash); record the two distinct hashes in the PR description's quality-gate row. This makes SC-002 first-class verifiable rather than relying on Q-15's "manual audit" framing alone.

- [ ] T031 (Optional) Rotate the active-narrative block in CLAUDE.md — demote the 030-move-note prose to a "Predecessor feature narrative" subheading, write a new 031-extract-registration-fixture active-narrative block at the top, update the "See also" pointers. This is a SEPARATE commit per project convention (`docs(031-extract-registration-fixture): rotate CLAUDE.md active-narrative block`) — the plan-pointer link on line 4 was updated during /speckit-plan; the full narrative rotation is a documentation cycle distinct from the implementation. May be deferred to before-PR-open.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies. Can start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1. BLOCKS Phase 3.
- **Phase 3 (US1)**: Depends on Phase 2 completing AND `_registration-stub.ts` import target being resolvable. T005..T020 can run in any order or in parallel; T021..T024 are sequential gates that depend on T005..T020 being complete.
- **Phase 4 (US2)**: Structurally satisfied by Phase 3; T025 is optional.
- **Phase 5 (Polish)**: Depends on Phase 3 completing.

### Task Dependencies Within Phase 3

T005..T020 are mutually independent — different files, no shared state. The implementer can edit them serially (one at a time, running `npm run typecheck` after each to catch issues early) or in batches (e.g. five at a time, then typecheck). T021 (typecheck) MUST run after the LAST consumer edit completes. T022..T024 (test, carve-out check, count check) MUST follow T021 in order.

### Parallel Opportunities

- T005..T020 (sixteen consumer-file edits): all `[P]`, all independent. A team of two developers could split them 8/8; a team of four could split them 4/4/4/4. The mechanical nature of the edit makes parallel execution low-risk.
- T026, T027 within Phase 5: parallel.
- T028 (coverage) must follow T022 (test) but is otherwise independent of T026/T027.

### Within Each Phase

- Phase 2: T002 (fixture) before T003 (test) before T004 (verify).
- Phase 3: T005..T020 (edits) in any order, then T021 (typecheck), then T022 (test), then T023 (carve-out check), then T024 (count check).
- Phase 5: T026, T027 parallel; T028 follows T022; T030 follows T024; T029 / T031 are optional.

---

## Parallel Example: Phase 3 consumer edits

The 16 consumer-file edits in T005..T020 can be batched. Example shell-loop for a single developer to drive them serially with per-batch typecheck:

```powershell
# Five at a time, in alphabetical batches:
# Batch 1: delete, files, find_by_property, links, move
# Batch 2: outline, properties, read, read_heading, read_property
# Batch 3: rename, set_property, smart_connections_query, smart_connections_similar, tag
# Batch 4: tree (one remaining)

# After each batch:
npm run typecheck
```

Or, for parallel execution by multiple agents / developers, all 16 tasks may proceed simultaneously — the file-level isolation guarantees no merge conflicts.

---

## Implementation Strategy

### MVP First (US1)

1. Complete Phase 1 (T001) — verify environment.
2. Complete Phase 2 (T002, T003, T004) — ship the fixture and prove it works in isolation.
3. Complete Phase 3 (T005..T024) — refactor all 16 consumers, verify the gates.
4. **STOP and VALIDATE**: `npm test` exits 0 with byte-stable test inventory; `npm run typecheck` exits 0; carve-out is intact; count is exactly 1.
5. User Story 1 is complete and shippable as a self-contained refactor commit.

### Acceptance check for US2

US2 is satisfied structurally by US1 shipping. If the implementer wants to prove the propagation property empirically, run T025 (the optional acceptance check); otherwise mark US2 as satisfied-by-construction in the PR description's checklist.

### Polish

Run Phase 5 tasks (T026..T031). T029 (CHANGELOG) and T031 (CLAUDE.md narrative rotation) are optional / deferred-to-separate-commit; the rest are blocking gates.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to the user story for traceability.
- T005..T020 are the bulk of the refactor and are inherently mechanical — every task applies the same six-step editing protocol to a different file. Reviewers verifying SC-008 (one-pass reviewer verification) should expect the per-file diffs to be uniform.
- Avoid: edits to `obsidian_exec/index.test.ts` (FR-006 / R7 forbids); edits to handler.test.ts stubs (Family A out-of-scope); edits to cli-adapter test files (out-of-scope); edits to any tool descriptor / schema / handler / index.ts (production code untouched).
- The implementation commit message should follow the `feat(031-extract-registration-fixture): consolidate registration stub fixture` shape with task IDs (T002..T030) in the body and quality-gate results (`npm test` exit code + count + coverage delta) inline.
