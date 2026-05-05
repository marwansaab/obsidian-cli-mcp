---
description: "Task list for feature 002-detect-cli-errors"
---

# Tasks: Detect CLI Errors

**Input**: Design documents from [specs/002-detect-cli-errors/](./)
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED for this feature. FR-010 mandates seven co-located vitest cases (one happy-path, three failure-path, three boundary). Coverage floor of 84.3% statements per FR-012 enforces the merge gate.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3); omitted for setup/foundational/polish
- File paths in descriptions are repository-relative

## Path conventions

This is a single-library MCP server (per [plan.md](./plan.md#project-structure)). Source lives at `src/`, tests are co-located as `*.test.ts` per Constitution Principle II. The canonical errors contract lives at `specs/001-add-cli-bridge/contracts/errors.contract.md` (edited in place per Q5 clarification — no file moves).

---

## Phase 1: Setup

**Purpose**: Verify the baseline so any failure we observe later is attributable to this feature, not pre-existing state.

- [X] T001 Verify baseline at HEAD: run `npm run lint && npm run typecheck && npm run build && npm test` and confirm all four pass and coverage is at or above the FR-012 floor (84.3% statements). Capture the baseline coverage number to compare against the post-implementation number in T015.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type-system extension that BLOCKS the US1 implementation — without this, the new `callEndFailure({ errorCode: "CLI_REPORTED_ERROR", ... })` call in T003 fails `tsc --noEmit`.

**⚠️ CRITICAL**: T003 in US1 cannot land until T002 lands.

- [X] T002 Extend the `Logger.ErrorCode` union in [src/logger.ts](../../src/logger.ts) (currently at line 4) to include `"CLI_REPORTED_ERROR"`. The new union becomes `"CLI_NON_ZERO_EXIT" | "CLI_BINARY_NOT_FOUND" | "CLI_TIMEOUT" | "CLI_OUTPUT_TOO_LARGE" | "CLI_REPORTED_ERROR"`. Per [data-model.md](./data-model.md) "Logger.ErrorCode union (extended)" section. Typecheck-only change; no logger logic change required because `callEndFailure` passes `errorCode` through to the JSON-lines emitter without inspecting it.

**Checkpoint**: Foundation ready — US1 implementation can begin.

---

## Phase 3: User Story 1 - Surface upstream CLI-reported failures as structured errors (Priority: P1) 🎯 MVP

**Goal**: When the CLI exits `0` with stdout that begins (after leading-whitespace trim) with the literal `Error:` prefix, the bridge raises `UpstreamError` with `code: "CLI_REPORTED_ERROR"` instead of returning the success shape. The `details` payload preserves `argv`, `stdout`, `stderr`, `exitCode: 0`, and a parsed `message` (first line trimmed).

**Independent Test**: An MCP client invoking `obsidian_exec({ command: "nonexistent_command_xyz" })` against a real Obsidian 1.12+ host receives `isError: true` with `code === "CLI_REPORTED_ERROR"` and `details.message === "Error: Command \"nonexistent_command_xyz\" not found."` (Quickstart Scenario 2).

### Implementation for User Story 1

- [X] T003 [US1] Insert detection logic in [src/tools/obsidian_exec/handler.ts](../../src/tools/obsidian_exec/handler.ts) inside the `if (code === 0)` branch (currently lines 216-220). Per [research.md](./research.md) "Detection-site analysis": before the existing `resolve(...)` call, add an `if (stdoutFull.trimStart().startsWith("Error:"))` check that calls `deps.logger.callEndFailure({ callId, errorCode: "CLI_REPORTED_ERROR", durationMs })` and `reject(new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: null, details: { argv, stdout: stdoutFull, stderr: stderrFull, exitCode: 0, message: stdoutFull.split("\n", 1)[0]!.trim() } }))` then `return`. Both the log call and the reject MUST land together. Verifies FR-001, FR-002, FR-003 (including the Q2-pinned message algorithm), FR-004, FR-005, FR-006, FR-013.

- [X] T004 [P] [US1] Update the published MCP tool description constant `OBSIDIAN_EXEC_DESCRIPTION` in [src/tools/obsidian_exec/tool.ts](../../src/tools/obsidian_exec/tool.ts) (currently lines 15-16) per [contracts/obsidian_exec.tool-patch.md](./contracts/obsidian_exec.tool-patch.md). Replace the failures sentence to mention "CLI exits 0 with `Error:` stdout prefix" alongside the existing four failure modes. Verifies FR-009. Parallel with T003 (different file). The existing description-equality assertion in [tool.test.ts:54](../../src/tools/obsidian_exec/tool.test.ts#L54) compares constant-against-constant, so updating the constant satisfies the test without any test-file edit.

### Tests for User Story 1 ⚠️ (FR-010 mandates these — write after T003 so the assertions can run against the new behaviour)

- [X] T005 [US1] Add a co-located vitest case to [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) for FR-010 case (b) / Story 1 AC #1: `obsidian_exec({ command: "nonexistent_command_xyz" })` with a mocked spawn whose stdout is `"Error: Command \"nonexistent_command_xyz\" not found.\n"` and exit `0` MUST reject with `UpstreamError` whose `code === "CLI_REPORTED_ERROR"`, `cause === null`, `details.argv === ["obsidian", "nonexistent_command_xyz"]` (or whatever `OBSIDIAN_BIN` resolves to in the test env, matching the existing US1 success-test pattern), `details.stdout` byte-preserved, `details.stderr === ""`, `details.exitCode === 0`, and `details.message === "Error: Command \"nonexistent_command_xyz\" not found."` (no trailing `\n`). Sequential with T006/T007 (same file).

- [X] T006 [US1] Add a co-located vitest case to [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) for FR-010 case (c) / Story 1 AC #2: `obsidian_exec({ command: "read", parameters: { path: "this/does/not/exist.md" } })` with a mocked spawn whose stdout starts `"Error: File ..."` and exit `0` MUST reject with `code === "CLI_REPORTED_ERROR"` and `details.message` equal to the trimmed first line of the mocked stdout. Sequential with T005 (same file).

- [X] T007 [US1] Add a co-located vitest case to [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) for FR-010 case (d) / Story 1 AC #3: `obsidian_exec({ command: "eval", parameters: { code: "throw new Error('test')" } })` with a mocked spawn whose stdout is multi-line and starts `"Error: ..."` (rendered exception followed by stack-trace lines) and exit `0` MUST reject with `code === "CLI_REPORTED_ERROR"`, full `details.stdout` byte-preserved (multi-line), `details.message` is just the first trimmed line. Sequential with T005/T006 (same file).

**Checkpoint**: US1 fully functional and testable independently. The MVP is shippable here. T005/T006/T007 collectively verify FR-010 cases (b)(c)(d) and Story 1 acceptance scenarios #1, #2, #3.

---

## Phase 4: User Story 2 - Avoid false positives on legitimate output that mentions "Error:" (Priority: P1)

**Goal**: The detection logic from US1 is anchored to the leading non-whitespace token of stdout, not a substring match. Output containing `Error:` later in its body — most importantly, JSON-formatted search results whose matched files contain that text — continues to return as success.

**Independent Test**: `obsidian_exec({ command: "search", parameters: { query: "Error:" } })` against a vault containing notes mentioning `Error:` returns the success shape with `exitCode: 0` (Quickstart Scenario 5). Independently, `obsidian_exec({ command: "version" })` continues to succeed (Quickstart Scenario 1).

**Note**: US2 has no separate implementation tasks — the algorithm in T003 already encodes the "anchored on trimmed leading prefix" semantics (per FR-005 + FR-006). US2 is verified entirely through boundary tests that confirm the negative path.

### Tests for User Story 2 ⚠️

- [X] T008 [US2] Add a co-located vitest case to [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) for FR-010 case (a) / Story 2 AC #2: `obsidian_exec({ command: "version" })` with a mocked spawn whose stdout is a version string (not starting with `Error:`) and exit `0` MUST resolve with the success shape `{ stdout, stderr, exitCode: 0, argv }` — no `UpstreamError` raised, no false positive. Sequential with T009 (same file).

- [X] T009 [US2] Add a co-located vitest case to [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) for FR-010 case (e) / Story 2 AC #1: `obsidian_exec({ command: "search", parameters: { query: "Error:" } })` with a mocked spawn whose stdout is a JSON matches array (e.g., `'[{"path":"note.md","excerpt":"... Error: foo ..."}]\n'`) and exit `0` MUST resolve with the success shape — no false positive even though `Error:` appears inside the body. Sequential with T008 (same file).

- [X] T009b [US2] Add a co-located vitest case to [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) for FR-010 case (f) / Story 2 AC #3: a mocked spawn whose stdout is multi-line and `Error:` appears at the start of a non-first line (e.g., `"OK\nError: foo\n"`) and exit `0` MUST resolve with the success shape — anchored detection rejects body-internal occurrences regardless of line position, even when a subsequent line literally begins with the prefix. Sequential with T008/T009 (same file). Added per /speckit-analyze finding C1.

- [X] T010 [US2] Add a co-located vitest case to [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) for FR-010 case (g) / Story 2 AC #4 / FR-006 case-sensitivity: a mocked spawn whose stdout starts with `"error: ..."` (lowercase) and exit `0` MUST resolve with the success shape — the detection is case-sensitive on the exact six-character prefix `Error:`. Sequential with T008/T009/T009b (same file).

**Checkpoint**: US1 + US2 both work independently. The detection is provably symmetric: it fires on the documented prefix and only on the documented prefix. Together with US1's tests, all seven FR-010 cases (a)(b)(c)(d)(e)(f)(g) are covered, and all four Story 2 acceptance scenarios are exercised by at least one test.

---

## Phase 5: User Story 3 - Preserve the existing genuine-crash error path (Priority: P2)

**Goal**: The pre-existing `CLI_NON_ZERO_EXIT` code continues to fire (and only fires) for genuine non-zero exits. Exit-code precedence applies: a non-zero exit is always classified as `CLI_NON_ZERO_EXIT` regardless of stdout's leading bytes (FR-007). This phase also implements the FR-014 contract reconciliation that surfaces `exitCode` and `signal` in `details` (so MCP clients can observe them after `cause` is dropped during serialization).

**Independent Test**: With a synthetic CLI substitute that exits `1` with stdout starting `"Error: ..."`, `obsidian_exec({ command: "version" })` rejects with `code: "CLI_NON_ZERO_EXIT"` (NOT `CLI_REPORTED_ERROR`), and `details.exitCode === 1` and `details.signal === null` are observable on the error.

### Implementation for User Story 3

- [X] T011 [US3] Apply the FR-014 implementation tweak to [src/tools/obsidian_exec/handler.ts](../../src/tools/obsidian_exec/handler.ts) at the existing `CLI_NON_ZERO_EXIT` construction site (currently line 227). Add `exitCode` and `signal` to the `details` object literal so the construction becomes `details: { argv, stdout: stdoutFull, stderr: stderrFull, exitCode, signal }`. The existing `cause: { exitCode, signal }` stays unchanged. Per [data-model.md](./data-model.md) "Modified: CLI_NON_ZERO_EXIT" implementation note. Without this tweak, the contract patch in T013 is aspirational — MCP serialization drops `cause`, so the `exitCode`/`signal` fields would be invisible to MCP clients. Sequential after T003 (same file, conflict-prone diff).

### Tests for User Story 3 ⚠️

- [X] T012 [US3] Add a co-located vitest case to [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) for Story 3 AC #2 / FR-007 precedence: a mocked spawn that exits `1` with stdout starting `"Error: foo"` MUST reject with `code === "CLI_NON_ZERO_EXIT"` (NOT `CLI_REPORTED_ERROR`) — exit-code precedence trumps the stdout-prefix detection. Also assert `details.exitCode === 1` and `details.signal === null` to verify FR-014's runtime change. Sequential with T005/T006/T007/T008/T009/T010 (same file).

- [X] T013 [US3] If the pre-existing `CLI_NON_ZERO_EXIT` test in [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) (from feature 001) uses a strict-shape `toEqual` on `details` that excludes `exitCode`/`signal`, update its assertion to expect the new fields per FR-014. If it uses `toMatchObject`, partial-match, or only asserts on `code`, no change needed — verify by reading the existing test before editing. Sequential with T012 (same file).

**Checkpoint**: All three user stories independently functional. FR-007 (precedence), FR-014 (CLI_NON_ZERO_EXIT details reconciliation) verified end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation edits that consolidate the seven-code surface across all canonical artifacts, plus the merge-gate verification.

- [X] T014 [P] Apply the seven edits from [contracts/errors.contract-patch.md](./contracts/errors.contract-patch.md) in-place against [specs/001-add-cli-bridge/contracts/errors.contract.md](../001-add-cli-bridge/contracts/errors.contract.md) per the Q5 clarification. Edits in order: (1) drop the `(v0.1)` version pin from the section header at line 28; (2) append `details.exitCode` and `details.signal` rows to the `CLI_NON_ZERO_EXIT` table for FR-014; (3) insert a new `### CLI_REPORTED_ERROR` section for FR-008; (4) insert a new `### VALIDATION_ERROR` section for FR-015; (5) insert a new `### TOOL_NOT_FOUND` section for FR-015; (6) patch the prose at line 106 to cover the new codes' cause-mirroring; (7) patch the test-coverage list at lines 110-111 to cite both `handler.test.ts` (five codes) and `tool.test.ts` (two codes). Verifies FR-008, FR-014 (documentation half), FR-015. After applying, validate against the seven acceptance criteria in the patch document's "Validation" section.

- [X] T015 [P] Update the README error-codes table in [README.md](../../README.md) (currently lines 107-114) per FR-011: (a) add a new `CLI_REPORTED_ERROR` row with the trigger condition (`CLI exits 0 with stdout that, after leading-whitespace trim, starts with Error:`) and the key `details` fields (`argv`, `stdout`, `stderr`, `exitCode`, `message`); (b) update the existing `CLI_NON_ZERO_EXIT` row's "Key `details` fields" column to list the new fields added by FR-014 (`argv`, `stdout`, `stderr`, `exitCode`, `signal`) so the README does not diverge from the post-T014 canonical contract. Parallel with T014 (different file). Both edits land in the same `git add README.md` per /speckit-analyze finding I1.

- [X] T016 Run the full quality-gate suite: `npm run lint && npm run typecheck && npm run build && npm test`. Confirm zero lint warnings, zero typecheck errors, build success, and all tests green (including T005, T006, T007, T008, T009, T010, T012). Confirm aggregate statements coverage is at or above the FR-012 floor (84.3%, captured as the baseline in T001). Report the post-implementation coverage number alongside the baseline. If any gate fails, fix and re-run before marking T016 complete. Final task — must be the last one.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: No dependencies — runs first to establish baseline.
- **Foundational (T002)**: Depends on Setup. **BLOCKS US1 (T003).**
- **US1 (T003-T007)**: T003 depends on T002. T004 is parallel with T003 (different file). T005/T006/T007 depend on T003 (need the impl to assert against) and are sequential with each other (same file).
- **US2 (T008-T010)**: All four tests (T008, T009, T009b, T010) depend on T003 (need the impl); sequential with each other (same file). May land in parallel with US3 implementation tasks (different concerns) but the same-file constraint means they queue with US1 tests.
- **US3 (T011-T013)**: T011 depends on T003 (same file). T012/T013 depend on T011 and are sequential (same file).
- **Polish (T014-T016)**: T014 and T015 are parallel (different files) and independent of US1/US2/US3 implementation tasks (they only consume the implementation, they don't depend on it). T016 is the last task and depends on everything else.

### Critical path

`T001 → T002 → T003 → T005 → T006 → T007 → T008 → T009 → T009b → T010 → T011 → T012 → T013 → T016`

T004, T014, T015 hang off the side as parallel branches.

### User story dependencies

- US1 has no story-level dependencies beyond T002.
- US2 piggybacks on US1's implementation (T003) — its tests verify the negative path of the same algorithm.
- US3's T011 must land after T003 because both edit `handler.ts`. US3's tests can land after T011.

### Parallel opportunities

- **Within US1**: T003 (handler.ts) and T004 (tool.ts) can land in parallel — different files, no shared state.
- **Polish phase**: T014 (errors.contract.md edit) and T015 (README.md edit) can land in parallel — different files.
- **Within phase tests**: All US1/US2/US3 test cases live in the same `handler.test.ts` file, so they cannot literally run in parallel (would conflict). They are sequential within the file but can be batched into a single edit if preferred.

### Within each user story

- T003 (US1 implementation) before T005-T007 (US1 tests need the impl to assert).
- T011 (US3 implementation) before T012-T013 (US3 tests need the FR-014 fields to assert).
- Description update (T004) is independent of detection logic (T003) — they touch disjoint files.

---

## Parallel example — Polish phase

```bash
# Land both documentation edits in parallel (different files):
Task: "Apply errors.contract-patch.md edits to specs/001-add-cli-bridge/contracts/errors.contract.md (T014)"
Task: "Add CLI_REPORTED_ERROR row to README.md error-codes table (T015)"
# Then T016 verifies everything together.
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. T001 (baseline) → T002 (Logger union) → T003 (detection logic) → T004 (description text) → T005, T006, T007 (US1 tests).
2. **STOP and VALIDATE**: run `npm test` — the three new test cases should be green; existing 001 tests should still pass; coverage should not regress below 84.3%. If yes, this is a shippable MVP — the spec's primary defect is closed.
3. Optional: ship the MVP as 0.1.1-alpha if downstream timing demands it. Otherwise continue to US2/US3.

### Incremental delivery

1. Setup + Foundational (T001-T002) → foundation ready.
2. US1 (T003-T007) → MVP shippable. Demo: nonexistent-command call gets a structured error.
3. US2 (T008-T010) → boundary guard verified. Demo: search results containing `Error:` still return as success.
4. US3 (T011-T013) → genuine-crash path preserved + FR-014 contract reconciliation lives in code. Demo: synthetic exit-1 with `Error:` stdout still classifies as `CLI_NON_ZERO_EXIT`, with `exitCode` visible to MCP clients for the first time.
5. Polish (T014-T016) → documentation consolidation + merge gates pass.

### Sequential strategy (single-developer)

The same-file constraint on `handler.ts` and `handler.test.ts` makes parallel execution within a phase impractical for a single developer. The recommended order is the critical path above: `T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T009b → T010 → T011 → T012 → T013 → T014 → T015 → T016`. T004, T014, T015 can be batched at any point after their dependencies (T003 for T004; nothing for T014/T015) — landing them earlier reduces context-switch cost.

---

## Notes

- [P] tasks = different files, no dependencies. Most US1/US2/US3 tests cannot use [P] because they share `handler.test.ts`.
- [Story] label maps task to specific user story for traceability.
- The MVP is genuinely the US1 phase: the spec exists to close the spec-vs-reality gap that US1 addresses; US2 is a co-equal P1 because a false-positive regression would be just as bad, and US3 is a backward-compatibility safety net.
- Verify tests fail before implementing where possible (TDD). The test cases describe behaviour the bridge does not yet exhibit; running them against HEAD before T003 lands should produce useful red.
- Commit after each task or logical group per CONTRIBUTING.md.
- Stop at any checkpoint to validate independently.
- Avoid: vague tasks (every task names a file), same-file conflicts (sequenced explicitly above), cross-story dependencies that break independence (US3's T011 is the one cross-story coupling — it modifies the same handler.ts file as US1's T003 — and is explicitly sequenced after T003).
