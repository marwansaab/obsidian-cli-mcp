---

description: "Task list for 075-unify-size-reporting"
---

# Tasks: Unify Size Reporting

**Input**: Design documents from `specs/075-unify-size-reporting/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/bytes-written-contract.md](contracts/bytes-written-contract.md), [quickstart.md](quickstart.md)

**Tests**: tests are required. Constitution Principle II requires them for every modified tool, and spec FR-012 names the minimum cases. Test tasks come before their implementation task within each story.

**Organization**: tasks are grouped by user story, in spec.md priority order. Before writing code, load the `karpathy-guidelines` skill, then make surgical changes that match the surrounding style.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task serves (US1 to US6)

## Path Conventions

Single project: `src/`, with co-located `*.test.ts`. Docs are in `docs/tools/`.

---

## Phase 1: Setup

**Purpose**: confirm a green starting point.

- [ ] T001 Run `npm run typecheck`, `npm run lint` and `npm test` on branch `075-unify-size-reporting` before any edit, and note any pre-existing failure, so later failures can be attributed (repository root).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the shared description string every output schema uses. There is no behaviour change yet.

**⚠️ CRITICAL**: US5 needs this phase. US1 to US3 do not, but landing it first keeps each schema edit to a single pass.

- [ ] T002 In `src/tools/_shared.ts`, export `BYTES_WRITTEN_DESCRIPTION` with the exact text from contract §4: "Change in the note's size in bytes caused by this write: its size after the write minus its size before, counting a note that did not exist as 0. Zero when the size did not change; negative when the note shrank." Give it a one-line doc comment ("shared by the output schemas of the five single-note text writers, spec 075 FR-008"), and append a `075:` clause to the file's header intent line. Add no runtime import.
- [ ] T003 In `src/tools/_shared.test.ts`, assert that `BYTES_WRITTEN_DESCRIPTION` equals the contract §4 text exactly. Depends on T002.

**Checkpoint**: `npm run typecheck` and `npm test` are green, with no behaviour change.

---

## Phase 3: User Story 1 — Section and block edits report the size change (Priority: P1) 🎯 MVP

**Goal**: patch_heading and patch_block report `after − before`, which can be zero or negative, instead of the total size (FR-003, FR-004).

**Independent test**: on a 200-byte note, patch_heading `replace` with same-size content returns `bytes_written: 0`, and clearing a 30-byte body returns `-30`.

### Tests for User Story 1 ⚠️ (write first and confirm they fail)

- [ ] T004 [P] [US1] In `src/tools/patch_heading/handler.test.ts`, replace the "bytes_written equals Buffer.byteLength of written content" test (around line 532) with one that asserts `bytes_written === byteLength(written) − byteLength(original)`. Then add these cases:
  - `append` and `prepend` each yield the positive delta;
  - `replace` with same-size content yields 0;
  - `replace` with shorter content yields a negative delta;
  - `replace` with `""` yields a negative delta;
  - **multi-byte**: `replace` a body `x` with `é` yields `bytes_written === 1`, although the character count is unchanged. Assert both `1` and `!== "é".length - "x".length`, so a character-count regression fails.

  Each case follows the shape of a contract §3 patch_heading row. Compute the expected value from the fixture's actual content before and after the edit (`byteLength(written) − byteLength(original)`, data-model R1), not from the row's illustrative sizes, because `append` and `prepend` can add separator lines. Keep the existing `toBeGreaterThan(0)` assertions (lines 151, 606 and 823) only where the edit really grows the note; otherwise replace them with the exact delta.
- [ ] T005 [P] [US1] In `src/tools/patch_block/handler.test.ts`, replace the "bytes_written equals Buffer.byteLength…" test (around line 512) with the delta assertion. Add cases for growth, same size (0), shrink (negative) and clear (`""`, negative) on a paragraph block, plus one grow case on a separately-placed block. Each case follows the shape of a contract §3 patch_block row, with the expected value computed from the fixture's actual content before and after the edit, as in T004. Add a **multi-byte** case: replacing a paragraph body `abc` with `日本` yields `bytes_written === 3`, while the character change is −1; assert the byte value and that it differs from the character delta. Review the `toBeGreaterThan(0)` assertions at lines 125 and 600 the same way as in T004.
- [ ] T006 [P] [US1] In `src/tools/patch_heading/schema.test.ts` and `src/tools/patch_block/schema.test.ts`, change "rejects negative bytes_written" to "accepts negative bytes_written" (−1 and 0 both parse). Keep "rejects non-integer bytes_written".

### Implementation for User Story 1

- [ ] T007 [P] [US1] In `src/tools/patch_heading/schema.ts`, change `bytes_written: z.number().int().min(0)` to `z.number().int()` (research D3), and append a `075:` clause to the header intent line ("bytes_written is the size change, may be zero or negative"; Principle V, spec 074 precedent). Depends on T006.
- [ ] T008 [P] [US1] In `src/tools/patch_block/schema.ts`, make the same change, including the header clause. Depends on T006.
- [ ] T009 [US1] In `src/tools/patch_heading/handler.ts` (line 232), set `bytesWritten = Buffer.byteLength(editedContent, "utf8") - Buffer.byteLength(originalContent, "utf8")`. `originalContent` is the content the edit was derived from, so the race path that tolerates other changes (R5) still describes this write. Append a `075:` clause to the header intent line ("bytes_written = edited minus original byte length"). Nothing else in the handler changes. Makes T004 pass. Depends on T004 and T007.
- [ ] T010 [US1] In `src/tools/patch_block/handler.ts` (line 185), make the same change, including the header clause. Makes T005 pass. Depends on T005 and T008.
- [ ] T011 [US1] Run `src/tools/patch_heading/index.test.ts` and `src/tools/patch_block/index.test.ts`. Their `payload.bytes_written > 0` assertions (lines 125 and 102) must still hold for their fixtures; if a fixture's edit does not grow the note, assert the exact delta instead. Depends on T009 and T010.

**Checkpoint**: US1 tests green. The section and block editors report the change.

---

## Phase 4: User Story 2 — Adding to the end or top keeps the same meaning (Priority: P1)

**Goal**: append_note and prepend values and guards are byte-for-byte unchanged (FR-005, R3).

**Independent test**: the existing append_note and prepend handler tests pass with no edit to their handlers.

- [ ] T012 [P] [US2] In `src/tools/append_note/handler.test.ts`, add (or confirm that one already exists) a test for each contract §3 append_note row: `"a\n"` + `"b\n"` → 2; `"a"` + `"b"` → 2, including the separator. Each asserts `bytes_written === byteLength(written) − byteLength(existing)`. Do not edit `append_note/handler.ts`.
- [ ] T013 [P] [US2] In `src/tools/prepend/handler.test.ts`, confirm that a test asserts `bytes_written === postStatSize − preStatSize` (contract §3 prepend row, 100 → 158 → 58) and that the `post-stat-byte-delta-zero` guard test is unchanged. Add the delta test if it is missing. Do not edit `prepend/handler.ts`.

**Checkpoint**: the adders are proven unchanged.

---

## Phase 5: User Story 3 — Whole-note writes report the size change (Priority: P2)

**Goal**: write_note returns `{ created, path, bytes_written }`. If it cannot `stat` an existing note, the call fails before writing (FR-006, FR-006a, R4).

**Independent test**: creating `"hello"` returns `bytes_written: 5`. Overwriting a 40-byte note with 10 bytes returns `-30`. A `stat` that fails with EACCES gives `FS_WRITE_FAILED` with nothing written.

### Tests for User Story 3 ⚠️ (write first and confirm they fail)

- [ ] T014 [US3] In `src/tools/write_note/_handler-fixtures.ts`, add a default `stat` to `fakeFs` that throws ENOENT (reuse the local `enoent()`), and update the header comment. Then migrate the existing tests in `src/tools/write_note/handler.test.ts` that simulate an existing note through a `realpath` override (lines 44-46, 501, 538 and 962) to also, or instead, override `stat` to return `{ size: <old byte length> }`. The containment tests that override `realpath` for parent directories (line 567 onwards, and the real-fs test at line 636) keep their `realpath` overrides, and the real-fs test gains `stat: (p) => nodeFs.stat(p)`. This fixture migration is the test-fixture change SC-005 allows: assertions stay unchanged apart from `bytes_written`. The fixture is typed as `ExecuteFs`, so add T018's `stat` member to the `ExecuteFs` interface in `src/tools/write_note/handler.ts` in this same edit. The handler logic stays for T018.
- [ ] T015 [US3] In `src/tools/write_note/handler.test.ts`, add the contract §3 write_note rows:
  - create `"hello"` with `overwrite: false` → 5;
  - create on an absent path with `overwrite: true` → 5;
  - create `""` → 0;
  - create `"é"` → 2;
  - overwrite 40 → 55 bytes → 15;
  - overwrite 40 → 40 bytes → 0;
  - overwrite 40 → 10 bytes → −30;
  - active mode overwrite → delta.

  Then:
  - **Failure case**: `stat` rejects with an EACCES errno (`syscall: "stat"`) → `UpstreamError` `FS_WRITE_FAILED` with `details` `{ errno: "EACCES", syscall: "stat", path }` and `cause` set, while `fs.writes` and `fs.renames` stay empty (FR-006a).
  - **Update existing assertions**: change every `toEqual({ created, path })` to include `bytes_written`, and change test #30 ("exactly two keys", line 763) to expect `["bytes_written", "created", "path"]`.
- [ ] T016 [US3] In `src/tools/write_note/schema.test.ts`:
  - update test (20) so the output includes `bytes_written`;
  - add the cases: rejects a missing `bytes_written`, rejects a non-integer, accepts a negative value.

### Implementation for User Story 3

- [ ] T017 [US3] In `src/tools/write_note/schema.ts`, add `bytes_written: z.number().int()` to `writeNoteOutputSchema` (still strict). Depends on T016.
- [ ] T018 [US3] In `src/tools/write_note/handler.ts`:
  - add `stat: (p: string) => Promise<{ size: number }>` to `ExecuteFs`;
  - add `stat` to `DEFAULT_FS`, mapping `nodeFs.stat` to `{ size }` the way prepend's `DEFAULT_FS` does;
  - in the `overwrite === true` branch, replace `await fs.realpath(absPath)` with `oldSize = (await fs.stat(absPath)).size`. ENOENT gives `existedBefore = false` and `oldSize = 0`; any other errno still throws `mapFsError(e)`;
  - in the `wx` branch, `oldSize = 0`;
  - return `{ created, path: relPath, bytes_written: Buffer.byteLength(input.content, "utf8") - oldSize }`;
  - update the header intent line ("→ stat probe … → return { created, path, bytes_written }").

  Makes T014 to T016 pass. Depends on T014, T015 and T017.
- [ ] T019 [US3] Run `src/tools/write_note/index.test.ts`, `src/tools/write_note/handler.file-type.test.ts`, `src/tools/_file-type-support.test.ts` and `src/tools/_surface.test.ts` (the write_note entry in `_typed-result-fixtures.ts` uses `writeNoteFakeFs()`, whose default `stat` gives ENOENT, so the case becomes a create). Update the `index.test.ts` envelope assertion (around line 95) to include `bytes_written`. Depends on T018.

**Checkpoint**: write_note reports the change, and the failure path writes nothing.

---

## Phase 6: User Story 4 — One assertion shape for test authors (Priority: P2)

**Goal**: one check, "reported figure equals size after minus size before", passes unchanged on all five writers (SC-002).

**Independent test**: the five tests below have the same shape and differ only in the tool call.

- [ ] T020 [US4] Add one test per handler test file, named "bytes_written equals size after minus size before (075 uniform check)". Each measures `before` from the content (or `stat` size) the fake fs held before the call and `after` from what it holds afterwards (the written content, or the post-call `stat` for prepend), then asserts `result.bytes_written === after − before` with no per-tool adjustment:
  - `src/tools/append_note/handler.test.ts`;
  - `src/tools/prepend/handler.test.ts`;
  - `src/tools/patch_heading/handler.test.ts`;
  - `src/tools/patch_block/handler.test.ts`;
  - `src/tools/write_note/handler.test.ts`.

  Depends on T009, T010 and T018.

  This test deliberately overlaps the per-story delta assertions (T004, T005, T012, T013, T015). User Story 4 asks for one shared shape, and the per-story tests keep the edge values (0, negative, multi-byte, separator). Keep both; do not fold one into the other.

**Checkpoint**: the uniform check is green on all five writers.

---

## Phase 7: User Story 5 — Documentation says one thing (Priority: P2)

**Goal**: the published output schemas and the five reference pages describe `bytes_written` in the same words, with no advice that fails for 0 or a negative value (FR-008, FR-009, SC-003).

**Independent test**: all five published output schemas carry the identical `bytes_written` description. Grepping `docs/tools/` for "red flag" and "post-edit file size" finds nothing.

- [ ] T021 [US5] Attach `.describe(BYTES_WRITTEN_DESCRIPTION)` as the last call on `bytes_written`, keeping each bound (research D3), in these five files:
  - `src/tools/append_note/schema.ts` (`.int().min(1)`);
  - `src/tools/prepend/schema.ts` (`.int().min(1)`);
  - `src/tools/patch_heading/schema.ts` (`.int()`);
  - `src/tools/patch_block/schema.ts` (`.int()`);
  - `src/tools/write_note/schema.ts` (`.int()`).

  Import the constant from `../_shared.js`. Depends on T002, T007, T008 and T017.
- [ ] T022 [US5] In each of the five tools' `index.test.ts`, assert that the published `outputSchema.properties.bytes_written.description` equals `BYTES_WRITTEN_DESCRIPTION`. Use the same accessor the file already uses for the published schema, or `toJSONSchema` on the output schema if none exists. Depends on T021.
- [ ] T023 [P] [US5] In `docs/tools/patch_heading.md` (line 180) and `docs/tools/patch_block.md` (line 164), rewrite the `bytes_written` row. It uses the contract §4 sentence, removes the "near-zero … red flag" advice, and adds: "To verify a write, compare `bytes_written` with the size change you intended; 0 and negative values are normal for same-size and shrinking edits." Update the example envelopes (patch_heading line 170, patch_block line 217) to realistic delta values.
- [ ] T024 [P] [US5] In `docs/tools/append_note.md` (lines 115 and 121) and `docs/tools/prepend.md` (lines 154 and 160), make the leading definition of `bytes_written` the contract §4 sentence, followed by each page's existing separator explanation, which stays true. Add the same verification sentence as T023.
- [ ] T025 [P] [US5] In `docs/tools/write_note.md`, document `bytes_written` with the contract §4 sentence and the T023 verification sentence:
  - change "Returns `{ created, path }`" (line 5) to `{ created, path, bytes_written }`;
  - add a row to the output table (around line 134);
  - change "exactly `{ created, path }`" (line 137) to the three keys;
  - update the example results (lines 129, 184, 201 and 216);
  - add a row to the error table for the pre-write `stat` failure: `FS_WRITE_FAILED`, `syscall: "stat"`, nothing written.
- [ ] T026 [P] [US5] In `docs/tools/index.md`, add `bytes_written` to the write_note entry (line 41) and leave append_note's envelope (line 5) as it is.
- [ ] T027 [US5] Run `npm run baseline:write`, then `git diff src/tools/_register-baseline.json`. Confirm that only `outputSchemaFingerprint` changed, and only for `append_note`, `patch_block`, `patch_heading`, `prepend` and `write_note` (contract §6, quickstart §2). Depends on T021.

**Checkpoint**: the published surface and the docs say one thing.

---

## Phase 8: User Story 6 — The change is announced (Priority: P3)

**Goal**: the release notes carry the change with a migration note, and the addition (FR-010, SC-004).

**Independent test**: under `[Unreleased]`, `CHANGELOG.md` names patch_heading and patch_block under **Changed** with a migration note, and write_note under **Added**.

- [ ] T028 [P] [US6] In `CHANGELOG.md` `[Unreleased]`:
  - add the line `Spec 075-unify-size-reporting (BI-0116).` after the 074 line;
  - under **Changed**, add: "**`bytes_written` means the size change on every single-note text writer** (`append_note`, `prepend`, `patch_heading`, `patch_block`, `write_note`). `patch_heading` and `patch_block` now report the note's size after the edit minus its size before, instead of its total size; the value is 0 for a same-size edit and negative when the note shrinks. *Migration*: a check that compared `bytes_written` with the note's total size should compare it with the intended size change instead, or read the note to get its size. `append_note` and `prepend` are unchanged.";
  - add an **Added** section (if the file has none under `[Unreleased]`, place it before **Changed**, per Keep a Changelog order): "**`write_note` reports `bytes_written`**, with the same meaning, counting a new note's old size as 0. If the existing note's size cannot be read before an overwrite, the call fails with `FS_WRITE_FAILED` before anything is written. Its `details` shape is unchanged; `details.syscall` now reads `\"stat\"` where the old existence probe reported `\"realpath\"`."

  Follow the file's existing entry style.

**Checkpoint**: the release notes are complete.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T029 Run `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` (quickstart §1), and fix any failure in the files this feature touched. Depends on T001 to T028.
- [ ] T030 Post-implement structural verification (CLAUDE.md; plan "Post-implement structural verification"): run `codegraph sync`, then `codegraph_explore "BYTES_WRITTEN_DESCRIPTION executeWriteNote executePatchHeading executePatchBlock writeNoteOutputSchema createServer"`. Confirm all four checks:
  - no new error code, and `src/errors.ts` unchanged;
  - `server.ts` unchanged, and no handler imports `createLogger` / `createQueue`;
  - the schema → `_shared.ts` imports run downward only, with no tool→tool import;
  - `BYTES_WRITTEN_DESCRIPTION` and write_note's `stat` path are reachable from `createServer`.

  Record the outcome in the PR description's Constitution Compliance section. Depends on T029.
- [ ] T031 Live end-to-end check, quickstart §3 (optional, recommended). Read `.memory/test-execution-instructions.md` first. Then `npm run build` and run steps 1 to 6 against `TestVault-Obsidian-CLI-MCP` under `Sandbox/075-<run>/`, comparing each `bytes_written` with the measured `(Get-Item).Length` difference. Afterwards, remove the fixtures, confirm `Welcome.md` is untouched, and report the results verbatim. Depends on T029.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: none.
- **Foundational (T002, T003)**: blocks US5's T021. US1 to US3 can start in parallel with it.
- **US1 (T004 to T011)**: independent. T007 and T008 come after T006; T009 after T004 and T007; T010 after T005 and T008; T011 after T009 and T010.
- **US2 (T012, T013)**: independent of everything (no source change).
- **US3 (T014 to T019)**: independent of US1. T018 needs T014 to T017.
- **US4 (T020)**: after T009, T010 and T018.
- **US5 (T021 to T027)**: T021 after T002, T007, T008 and T017; T022 and T027 after T021. The doc tasks T023 to T026 can be done at any time.
- **US6 (T028)**: any time.
- **Polish (T029 to T031)**: T029 after everything; T030 and T031 after T029.

### Structural dependencies (CodeGraph, tasks phase)

- **`_shared.ts` → five `schema.ts`**: today `closedVaultNote` (`src/tools/_shared.ts:41`) is consumed only by tool `index.ts` files, and no `schema.ts` imports `_shared.ts` yet. T021 adds that edge. `_shared.ts` imports types only, so there is no cycle. T021 must follow T002.
- **`writeNoteOutputSchema` (`write_note/schema.ts:58`) ↔ `executeWriteNote` (`write_note/handler.ts:99`)**: the schema is consumed by `write_note/index.ts`, and the handler's return type is `WriteNoteOutput`, so T018 compiles only with T017 in place (ordered).
- **write_note's `ExecuteFs` ↔ `fakeFs` (`write_note/_handler-fixtures.ts:32`) ↔ `TYPED_RESULT_FIXTURES` (`_typed-result-fixtures.ts:117`, write_note entry)**: making `stat` required breaks every `ExecuteFs` literal until T014 adds it. `_surface.test.ts` drives the typed fixture through the published output schema, so T019 must run after T017 and T018.
- **`patchHeadingOutputSchema` / `patchBlockOutputSchema` ↔ their handlers**: each is consumed by its own `index.ts` only. A handler returning a negative value fails the published-schema check in `index.test.ts` unless T007 and T008 land first (ordered T007 → T009, T008 → T010).

### Within each story

Tests first, and confirm they fail; then the implementation; then the checkpoint.

### Parallel opportunities

- T004, T005 and T006 are different files.
- T007 and T008 are different files.
- T012 and T013 are different files, independent of US1.
- T023 to T026 and T028 are docs and changelog, independent of the code.

## Parallel Example: User Story 1 alongside User Story 3 and the docs

```text
Agent A: T004 → T006 → T007 → T009 ; T005 → T008 → T010 → T011     (patch_heading + patch_block)
Agent B: T014 → T015 → T016 → T017 → T018 → T019                    (write_note)
Agent C: T023, T024, T025, T026, T028                               (docs/tools/*.md, CHANGELOG.md)
Then:    T002 → T003 → T021 → T022 → T027 → T020 → T029 → T030 → T031
```

## Implementation Strategy

### MVP first (User Story 1)

1. Phase 1 (green baseline).
2. Phase 3 (US1): the section and block editors report the change. This is the defect.
3. Stop and validate: the T004 to T006 tests are green.

### Incremental delivery

1. US2: the adders are proven unchanged.
2. US3: write_note gains the figure and its failure path.
3. US4: the uniform check on all five writers.
4. US5: the shared description, the docs and the baseline.
5. US6: the changelog.
6. Polish: the full gate, structural verification and the live check.

## Notes

- **CodeGraph tasks rule**: the list crosses source modules (`_shared.ts`, five `schema.ts`, three `handler.ts`, `write_note/_handler-fixtures.ts` and `_typed-result-fixtures.ts` through its consumers). Every pair was queried at HEAD `a45d8b8`, and the structural dependencies are recorded above. No path exists that the task graph does not already reflect.
- **Kernel nodes**: none touched (plan). `server.ts` must stay unchanged.
- **Do not edit** `src/cli-adapter/**`, `src/errors.ts`, `src/vault-registry/**`, `src/server.ts`, `src/tools/_register.ts`, `src/tools/_note-io.ts`, `src/tools/_fs-errors.ts`, `append_note/handler.ts`, `prepend/handler.ts` or any `index.ts` description (plan, Constraints).
- `.docs-as-code/` is updated later by `/speckit-docs-as-code <n>` after review, not in this task list (CLAUDE.md, PR lifecycle). That pass also records the D8 ADR and handles the gitignored architecture-note follow-up (plan, Follow-ups).
