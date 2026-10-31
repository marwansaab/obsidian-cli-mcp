---
description: "Task list for 072 — Align Closed-Vault Reporting"
---

# Tasks: Align Closed-Vault Reporting

**Input**: Design documents from `specs/072-align-closed-vault-reporting/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/closed-vault-contract.md](contracts/closed-vault-contract.md), [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md), [quickstart.md](quickstart.md)

**Tests**: Required. Spec FR-011 and Constitution Principle II require co-located tests for every touched tool in the same change.

**Organization**: Tasks are grouped by user story. The six tools in scope are `paths`, `tag`, `pattern_search`, `query_base`, `smart_connections_query` and `smart_connections_similar`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: The user story the task serves (US1–US4)

## Shared test recipe (used by T003–T014 and T030–T035)

Every handler test file already imports `makeQueuedSpawn`, `captureRejection` and `silentLogger` from `src/tools/_handler-test-fixtures.ts`. `makeQueuedSpawn(responses)` returns `{ spawnFn, recorded, getCount }`, where `recorded[i].argv` is the argv of spawn *i*. Handler calls go through the real `invokeCli` → `dispatchCli` → ADR-029 cold-start retry, so a queued `"Error: Command \"eval\" not found. It may require a plugin to be enabled.\n"` stdout on exit 0 triggers exactly one retry. Use `base:query` in place of `eval` for `query_base`. Import `COLD_START_PATTERN` from `src/cli-adapter/_dispatch.ts` to assert on `details.stdout`. Name the vault `"Closed"` in these cases. `query_base` also needs its existing registry and fs stubs (the `stubVaultRegistry` fixture and the fs fake already used in its file) so that the call reaches the spawn.

- **Recovers (US1)**: queue `[coldStart, validEnvelope]`. Expect:
  - the tool's normal result;
  - `getCount() === 2`;
  - both `recorded[i].argv` contain `vault=Closed` and the same subcommand;
  - no recorded argv has the element `"vaults"`. Match the exact array element, not a substring, because the eval template text may contain "vault".
- **Unavailable (US2)**: queue `[coldStart, coldStart]`. Expect:
  - `UpstreamError` with `code === "CLI_REPORTED_ERROR"`;
  - `COLD_START_PATTERN.test(details.stdout)`;
  - `details.code === undefined` and `details.reason === undefined`;
  - `getCount() === 2`;
  - no recorded argv has the element `"vaults"`.
- **Empty answer (US4)**: queue `[{ stdout: "", exitCode: 0 }]` with `vault: "Closed"`, plus nothing else, so a second spawn would fail the queue. Expect:
  - `CLI_REPORTED_ERROR` with `details.stage === "json-parse"`;
  - `getCount() === 1`.

---

## Phase 1: Setup

**Purpose**: Record the starting state.

- [ ] T001 Run `npm run typecheck`, `npm run lint` and `npm test` from the repository root and confirm all are green before any edit. Note any pre-existing failure in `specs/072-align-closed-vault-reporting/research.md` under a new "Implement log" heading, so later failures are attributable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The live evidence that every story's claims rest on.

**⚠️ CRITICAL**: No user-story task starts until T002 passes. If G1 fails, stop: do not delete anything, record the finding, and escalate (contracts/t0-probe-plan.md "Fail").

- [ ] T002 Read `.memory/test-execution-instructions.md`, then run T0 gate G1 (and G2 only if the environment allows) exactly as written in `specs/072-align-closed-vault-reporting/contracts/t0-probe-plan.md`. Record:
  - stdout, stderr and exit code;
  - the six tool results;
  - whether `dispatch.retry` was seen;
  - the date.

  Write these in `specs/072-align-closed-vault-reporting/research.md` under a new "T0 evidence" heading, with paths redacted to vault-relative form. Restore the test vault's open/closed state afterwards.

**Checkpoint**: G1 passed. The empty-stdout signal is confirmed unreachable, and stories can proceed.

---

## Phase 3: User Story 1 — A closed registered vault just works (Priority: P1) 🎯 MVP

**Goal**: Prove, per tool, that a closed vault recovers through the shared retry and returns the normal result with no per-tool check involved.

**Independent Test**: The six "recovers" cases pass. Live confirmation is T002 G1 step 3.

These tests characterise behaviour that already holds through ADR-029, so they pass before and after US4. They lock it in before the dead stage is removed.

- [ ] T003 [P] [US1] Add a "closed vault recovers via cold-start retry" test (shared recipe, Recovers) to `src/tools/paths/handler.test.ts`. Use `target_mode: "specific"`, `vault: "Closed"`, and the file's existing valid envelope helper.
- [ ] T004 [P] [US1] Add the same Recovers test to `src/tools/tag/handler.test.ts`, using `defaultEnv([...])` for attempt 2.
- [ ] T005 [P] [US1] Add the same Recovers test to `src/tools/pattern_search/handler.test.ts`, using the file's valid `ok: true` envelope.
- [ ] T006 [P] [US1] Add the same Recovers test to `src/tools/query_base/handler.test.ts`. Use subcommand `base:query`, the file's registry and fs stubs, and a valid JSON row array for attempt 2.
- [ ] T007 [P] [US1] Add the same Recovers test to `src/tools/smart_connections_query/handler.test.ts`, using the file's valid `ok: true` envelope (with the plugin preamble if the file's helper includes one).
- [ ] T008 [P] [US1] Add the same Recovers test to `src/tools/smart_connections_similar/handler.test.ts`. Use `target_mode: "specific"`, a `path`, and the file's valid `ok: true` envelope.

**Checkpoint**: All six Recovers cases are green.

---

## Phase 4: User Story 2 — A vault that cannot be brought up is clearly reported (Priority: P1)

**Goal**: Pin the vault-unavailable failure (the existing post-retry `CLI_REPORTED_ERROR`) per tool, separately from unknown vault.

**Independent Test**: The six "unavailable" cases pass, and the existing unknown-vault cases still pass unchanged (SC-003).

Same files as Phase 3, so each task runs after its Phase 3 sibling (T009 after T003, and so on). The six tasks are parallel with one another.

- [ ] T009 [P] [US2] Add a "vault unavailable: cold-start persists after retry → CLI_REPORTED_ERROR unchanged" test (shared recipe, Unavailable) to `src/tools/paths/handler.test.ts`. Leave the existing "US1 Q-17 unknown vault" case untouched.
- [ ] T010 [P] [US2] Add the same Unavailable test to `src/tools/tag/handler.test.ts`. Leave the "unknown vault: 'Vault not found.'" case untouched.
- [ ] T011 [P] [US2] Add the same Unavailable test to `src/tools/pattern_search/handler.test.ts`. Leave "US1 (14) unknown vault" untouched.
- [ ] T012 [P] [US2] Add the same Unavailable test to `src/tools/query_base/handler.test.ts`, using `base:query`. Also assert that `details.code` is neither `VIEW_NOT_FOUND` nor `BASE_MALFORMED`: the failure must pass through `classifyAndThrow` unchanged (research F4). Add a second variant whose stdout carries the `Did you mean: base:views, base:create?` suffix and expect the same result. Leave both unknown-vault cases untouched.
- [ ] T013 [P] [US2] Add the same Unavailable test to `src/tools/smart_connections_query/handler.test.ts`. Leave "unknown vault: 'Vault not found.'" untouched.
- [ ] T014 [P] [US2] Add the same Unavailable test to `src/tools/smart_connections_similar/handler.test.ts`. Leave "unknown vault: 'Vault not found.'" untouched.

**Checkpoint**: Vault unavailable is pinned in all six tools, and unknown vault is unchanged.

---

## Phase 5: User Story 3 — Documentation lists only failures that can occur (Priority: P2)

**Goal**: Descriptions and reference pages drop `not-open` and describe automatic recovery plus vault unavailable (contract §2–§4).

**Independent Test**: The quickstart Story 3 grep shows `not-open` only in `views_base` files. The `index.test.ts` assertions pass. The baseline diff moves only the six description fingerprints.

### Descriptions and their tests (one task per tool; each touches its own `index.ts` + `index.test.ts`)

Constraint for every task below: keep the `describeSupport(...)` sentence intact in `query_base` and `smart_connections_similar`, because `src/tools/_file-type-support.test.ts` asserts it.

Each task asserts in `index.test.ts`:

- the description contains `Closed vault`, `opened automatically`, `Command "`, `vault unavailable` and `never an empty result`;
- it does not contain `not-open` or `registered but not open`;
- the closed-vault sentence (from `Closed vault` to the end of that sentence) contains neither `Vault not found` nor `VAULT_NOT_FOUND`, so it stands on its own (FR-008, SC-007).

Unknown-vault text in the descriptions is left unchanged, except where `not-open` is removed from it. Correcting that wording is out of scope (spec Out of Scope; follow-up on BI-0076).

- [ ] T015 [P] [US3] In `src/tools/paths/index.ts`, add the contract §2 closed-vault sentence (`<cmd>` = `eval`) to `PATHS_DESCRIPTION`. Add the matching assertions to `src/tools/paths/index.test.ts`.
- [ ] T016 [P] [US3] In `src/tools/tag/index.ts`, change "(`VAULT_NOT_FOUND` with sub-reasons `unknown` / `not-open`)" to "(`VAULT_NOT_FOUND` with sub-reason `unknown`)", dropping only `not-open`, and add the §2 sentence (`eval`). Add the assertions to `src/tools/tag/index.test.ts`.
- [ ] T017 [P] [US3] In `src/tools/pattern_search/index.ts`, drop `VAULT_NOT_FOUND` from the `CLI_REPORTED_ERROR` sub-discriminator list (in this tool it only stood for `not-open`) and add the §2 sentence (`eval`). Add no unknown-vault text. Add the assertions to `src/tools/pattern_search/index.test.ts`.
- [ ] T018 [P] [US3] In `src/tools/query_base/index.ts`, change "`VAULT_NOT_FOUND` with sub-reasons `unknown`/`not-open`" to "`VAULT_NOT_FOUND` with sub-reason `unknown`" and add the §2 sentence (`base:query`). Add the assertions to `src/tools/query_base/index.test.ts`.
- [ ] T019 [US3] In `src/tools/smart_connections_query/index.ts`, remove the "Closed-but-registered vaults: …" sentence and the `VAULT_NOT_FOUND(not-open) →` precedence step, and add the §2 sentence (`eval`). In `src/tools/smart_connections_query/index.test.ts`:
  - replace `expect(desc).toContain("not-open")` with the new assertions;
  - in the docs-body code list (around line 100), replace `"not-open"` with `"vault unavailable"`.

  T019 depends on T025, because the docs-body assertion reads `docs/tools/smart_connections_query.md`.
- [ ] T020 [US3] In `src/tools/smart_connections_similar/index.ts`, edit the "Vault states: …" sentence so it keeps its unknown-vault part unchanged (`VAULT_NOT_FOUND` carries `details.reason` `"unknown"` — vault not registered). Drop only the `"not-open"` alternative, the closing "In practice closing a vault … treat both as 'vault unavailable' …" clause and the retry advice. Add the §2 sentence (`eval`) as a separate sentence, and remove the `VAULT_NOT_FOUND(not-open) →` precedence step. In `src/tools/smart_connections_similar/index.test.ts`:
  - replace `expect(desc).toContain("not-open")` with the new assertions;
  - change the docs-body `expect(body).toMatch(/not-open|closed/i)` to `/vault unavailable/i`.

  T020 depends on T026, because the docs-body assertion reads `docs/tools/smart_connections_similar.md`.

### Reference pages (contract §3–§4)

Applies to T021–T026: leave the unknown-vault rows byte-for-byte unchanged, and do not reference them from the new row or note. The new row and note each stand on their own and say that a vault that cannot be brought up is a failure, not an empty result.

- [ ] T021 [P] [US3] In `docs/tools/paths.md`, remove the `not-open` error row (line ~252), add the vault-unavailable row and a "Closed vault" note near the `vault` parameter, and keep the unknown-vault and empty-folder rows.
- [ ] T022 [P] [US3] In `docs/tools/tag.md`, remove the `not-open` / `handler-stage-0` row (line ~230) and any stage-0 prose, add the vault-unavailable row and the "Closed vault" note, and keep the unknown-vault and zero-match descriptions.
- [ ] T023 [P] [US3] In `docs/tools/pattern_search.md`, fix the `vault` parameter bullet (line ~51) to say a closed vault is opened automatically, replace the `not-open` error row (line ~223) with the vault-unavailable row, and keep the unknown-vault wording.
- [ ] T024 [P] [US3] In `docs/tools/query_base.md`, change the `VAULT_NOT_FOUND` row (line ~73) to cover `unknown` only, and add the vault-unavailable row (`base:query`) and the "Closed vault" note.
- [ ] T025 [P] [US3] In `docs/tools/smart_connections_query.md`, remove the `not-open` JSON example (line ~128), the `not-open` table row (line ~140) and the `VAULT_NOT_FOUND(not-open)` precedence line (line ~154). Add the vault-unavailable row and the "Closed vault" note, and keep at least four `### Example` headings, which `index.test.ts` asserts.
- [ ] T026 [P] [US3] In `docs/tools/smart_connections_similar.md`, remove the `not-open` surface bullets (lines ~236–251), the precedence line (line ~265), the closed-vault paragraph and the "Important detection caveat" (lines ~286–288). Add the vault-unavailable row and the "Closed vault" note (automatic recovery; no retry-after-delay advice), and keep at least four `### Example` headings.
- [ ] T027 [P] [US3] In `docs/tools/find_and_replace.md`, delete the `CLI_REPORTED_ERROR | VAULT_NOT_FOUND | not-open` row (line ~110). That is the page's only closed-vault mention (FR-009).
- [ ] T028 [P] [US3] In `docs/tools/patch_block.md`, change the `VAULT_NOT_FOUND` row (line ~177) from `unknown` / `not-open` to `unknown`, and its trigger text to "Vault is not registered." (FR-009).

### Baseline

- [ ] T029 [US3] Run `npm run baseline:write` from the repository root, then `git diff src/tools/_register-baseline.json`. Confirm that exactly six `descriptionFingerprint` values moved (`paths`, `tag`, `pattern_search`, `query_base`, `smart_connections_query`, `smart_connections_similar`) and nothing else. Also review `git diff src/tools/*/index.ts`: unknown-vault text changes only where `not-open` was removed (`tag`, `query_base`, `smart_connections_query`, `smart_connections_similar`), and nothing else in that text changes. Depends on T015–T020.

**Checkpoint**: The published surface states reachable failures only, and the baseline was moved deliberately.

---

## Phase 6: User Story 4 — No dead handling left behind (Priority: P3)

**Goal**: Remove the six unreachable stages, their retired tests and the `_eval-vault-closed-detection` module (FR-005, FR-006, FR-007).

**Independent Test**: The quickstart Story 4 grep returns nothing, the folder is gone, and the six Empty-answer cases pass with a single spawn.

### Tests first (each must FAIL before its handler edit: today the stage issues a second `vaults` spawn)

Same files as Phases 3–4, so each runs after T009–T014 for its tool. The six tasks are parallel with one another.

- [ ] T030 [P] [US4] In `src/tools/paths/handler.test.ts`, delete "US5 Q-18 closed-vault: empty stdout + registered → VAULT_NOT_FOUND(reason:'not-open')". Add the Empty-answer case (shared recipe, `target_mode: "specific"`). Update the file header's intent line to drop the closed-vault wording.
- [ ] T031 [P] [US4] In `src/tools/tag/handler.test.ts`, delete "stage-0 closed-vault: empty stdout + registered → CLI_REPORTED_ERROR(reason:'not-open')". Rename "stage-0 non-empty stdout: shared detector skipped; stages 1+ run" to "named vault, non-empty stdout: single spawn", keeping its body. Add the Empty-answer case and update the header intent line (drop "stage-0 closed-vault detection via the shared `_eval-vault-closed-detection` module").
- [ ] T032 [P] [US4] In `src/tools/pattern_search/handler.test.ts`, delete "US1 (13) closed-but-registered vault: … VAULT_NOT_FOUND(not-open)". Add the Empty-answer case and update the header intent line if it names the detection.
- [ ] T033 [P] [US4] In `src/tools/query_base/handler.test.ts`, rename "US1: input.vault=undefined does NOT trigger closed-vault detection (single spawn only)" to "US1: no-vault path: single base:query spawn", keeping its body: it still pins the no-vault spawn count. Delete "US1: closed-but-registered vault (FR-009) → CLI_REPORTED_ERROR/VAULT_NOT_FOUND/not-open". Add the Empty-answer case (empty stdout and empty stderr → `details.stage: "json-parse"`, one spawn) and update the header intent line.
- [ ] T034 [P] [US4] In `src/tools/smart_connections_query/handler.test.ts`, delete:
  - "closed-but-registered vault: empty stdout + registered → CLI_REPORTED_ERROR(reason:'not-open')";
  - "precedence: VAULT_NOT_FOUND(unknown) wins over VAULT_NOT_FOUND(not-open)";
  - "precedence: VAULT_NOT_FOUND(not-open) wins over SMART_CONNECTIONS_NOT_INSTALLED".

  Add the Empty-answer case and update the header intent line.
- [ ] T035 [P] [US4] In `src/tools/smart_connections_similar/handler.test.ts`, delete:
  - "closed-but-registered vault: … (R5a / FR-017a / SC-011a)";
  - both `not-open` precedence cases;
  - "BI-027 ripple: stage-0 closed-vault detection produces byte-equal error after shared-module refactor";
  - any helper used only by those cases.

  Add the Empty-answer case (`target_mode: "specific"`) and update the header intent line.

### Handler edits (each after its own test task)

Each task: remove the closed-vault block and the `import { detectIfClosed } …` line, renumber nothing (stage comments keep their numbers), and rewrite the `Original — no upstream.` intent line to drop the stage-0 / shared-module / `not-open` wording (Principle V). No other change.

- [ ] T036 [P] [US4] `src/tools/paths/handler.ts`: remove "Stage 3 — closed-but-registered-vault detection" (lines ~43–65) and the `detectIfClosed` import. After T030.
- [ ] T037 [P] [US4] `src/tools/tag/handler.ts`: remove "Stage 0 — closed-but-registered-vault detection" (lines ~46–69) and the import. After T031.
- [ ] T038 [P] [US4] `src/tools/pattern_search/handler.ts`: remove "Stage 5 — closed-but-registered-vault detection" (lines ~65–82) and the import. After T032.
- [ ] T039 [P] [US4] `src/tools/query_base/handler.ts`: remove "Stage 5 — closed-but-registered vault detection" (lines ~422–446), the now-unused `stderrTrimmed` / `stdoutTrimmed` / `upstreamMessage` locals and their comment (lines ~412–420), and the `detectIfClosed` import. Keep `classifyAndThrow` and Stage 6 unchanged. After T033.
- [ ] T040 [P] [US4] `src/tools/smart_connections_query/handler.ts`: remove "Stage 0 — closed-but-registered-vault detection (R5a)" (lines ~45–71) and the import, and rewrite the header line's "stage-0 closed-but-registered-vault detection (R5a) …" clause. After T034.
- [ ] T041 [P] [US4] `src/tools/smart_connections_similar/handler.ts`: remove "Stage 0 — closed-but-registered-vault detection (R5a / FR-017a / SC-011a)" (lines ~51–80) and the import. After T035.

### Module removal

- [ ] T042 [US4] Delete the folder `src/tools/_eval-vault-closed-detection/` (`detector.ts`, `detector.test.ts`, `registry-parser.ts`, `registry-parser.test.ts`, `index.ts`). Then run `grep -rn "detectIfClosed\|_eval-vault-closed-detection\|parseVaultRegistry\|handler-stage-0" src` and expect no hits. Depends on T036–T041.

**Checkpoint**: No per-tool closed-vault path remains, and the empty answer is still a structured failure.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T043 [P] In `CHANGELOG.md`, add `## [Unreleased]` above `## [0.9.0]` with:
  - **Changed**: `paths`, `tag`, `pattern_search`, `query_base`, `smart_connections_query` and `smart_connections_similar` now document a closed vault as opened automatically. They document the existing post-retry `CLI_REPORTED_ERROR` (`Error: Command "…" not found.`) as their vault-unavailable failure.
  - **Removed**: the never-emitted `VAULT_NOT_FOUND` / `not-open` sub-state from those six tools and from the `find_and_replace` and `patch_block` pages, and the internal closed-vault detection module.

  Cite spec 072 and BI-0076 (FR-012).
- [ ] T044 Run the full quickstart gate from the repository root: `npm run typecheck`, `npm run lint`, `npm test` (coverage thresholds included), then the Story 3 and Story 4 greps from `specs/072-align-closed-vault-reporting/quickstart.md`. All must be green. Within the Story 3 grep's scope (`docs/tools/*.md` and `src/tools/**/index.ts`), `not-open` may appear only in `views_base` files. Outside that scope it is expected in `open_file`'s retirement comments and tests, `CHANGELOG.md` (T043), `specs/`, and `.docs-as-code/`, which the docs-as-code pass updates after review. Depends on T001–T043.
- [ ] T045 Post-implement structural verification (plan "CodeGraph structural check"):
  1. Run `codegraph sync`.
  2. Run `codegraph_explore` on `executePaths executeTag executePatternSearch executeQueryBase executeSmartConnectionsQuery executeSmartConnectionsSimilar UpstreamError`.
  3. Verify items 1–5: no new error code or class; no handler imports `createLogger` / `createQueue`; imports run one way and no `_eval-vault-closed-detection` symbol remains; no orphaned production symbol; only six fingerprints moved.

  Record the result in `specs/072-align-closed-vault-reporting/research.md` under "Implement log". Depends on T044.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: none.
- **Foundational (T002, T0 G1)**: after T001. Blocks every user story. On failure, stop and escalate.
- **US1 (T003–T008)**: after T002.
- **US2 (T009–T014)**: after T002. Each shares a file with its US1 sibling, so it runs after it (T003→T009, T004→T010, …, T008→T014).
- **US3 (T015–T029)**: after T002. Independent of US1/US2 files. T019 after T025; T020 after T026; T029 after T015–T020.
- **US4 (T030–T042)**: after T002. Each test task follows its tool's US2 task (T009→T030, …, T014→T035). Each handler task follows its test task (T030→T036, …, T035→T041). T042 after T036–T041.
- **Polish (T043–T045)**: T043 any time after T002. T044 after all tasks. T045 after T044.

### Structural dependency notes (CodeGraph, per CLAUDE.md `/speckit-tasks` rule)

The task list crosses the six tool modules, `src/cli-adapter`, `src/tools/_eval-vault-closed-detection` and `src/tools/_file-type-support.test.ts`. Pair queries run at tasks time found:

- **`executeQueryBase` ↔ `isColdStart` / `COLD_START_PATTERN`**:
  - Path: `executeQueryBase` → `invokeCli` → `dispatchCli` → `dispatchWithColdStartRetry` → `isColdStart` (`src/cli-adapter/_dispatch.ts`).
  - `executeQueryBase` catches `CLI_REPORTED_ERROR` and calls `classifyAndThrow`, which returns early only when no pattern matches.
  - Consequence: T012 asserts pass-through explicitly, so any future `classifyAndThrow` pattern that captures `Command "…" not found.` breaks a test. The US1/US2 tests depend on `COLD_START_PATTERN` staying exported; it is, and it is not edited.
- **`QUERY_BASE_DESCRIPTION` / `SMART_CONNECTIONS_SIMILAR_DESCRIPTION` ↔ `_file-type-support.test.ts`**: that test imports both constants and asserts the `describeSupport(...)` sentence. T018 and T020 must keep it. No task edits `_file-type-support.test.ts`.
- **`detectIfClosed` ↔ six handlers**: its only production callers are the six handlers plus the module barrel. T042 is therefore safe only after T036–T041. This is reflected above.
- **smart_connections `index.test.ts` ↔ `docs/tools/*.md`**: those tests read the docs pages (not a code edge CodeGraph indexes, found by reading the tests). Hence T019→T025 and T020→T026.

### Parallel opportunities

- T003–T008: six files, all [P].
- T009–T014: [P] with each other, once their US1 sibling is done.
- T015–T018, T021–T028: twelve files, all [P]. T019 and T020 are not marked [P] because they wait for T025 and T026; once those are done, they can run alongside the others.
- T030–T035: [P] with each other. T036–T041: [P] with each other.
- T043: [P] with anything after T002.

## Parallel Example: User Story 3

```text
Task: "T021 docs/tools/paths.md — vault-unavailable row + Closed vault note"
Task: "T022 docs/tools/tag.md — …"
Task: "T025 docs/tools/smart_connections_query.md — …"
Task: "T026 docs/tools/smart_connections_similar.md — …"
Task: "T015 src/tools/paths/index.ts + index.test.ts — closed-vault sentence"
Task: "T016 src/tools/tag/index.ts + index.test.ts — …"
# then T019 (after T025), T020 (after T026), then T029 baseline
```

## Implementation Strategy

### MVP (User Story 1)

T001 → T002 (G1 gate) → T003–T008. Closed-vault recovery is pinned per tool. Value: the contract that agents rely on is locked by tests.

### Incremental delivery

1. US2 pins vault unavailable (T009–T014).
2. US3 corrects the published surface (T015–T029).
3. US4 removes the dead path (T030–T042).
4. Polish (T043–T045).

Each story leaves the suite green. Commit at each checkpoint with `/speckit-git-commit` if a split is wanted; one PR carries the whole feature.

## Notes

- No `src/cli-adapter/**`, `src/errors.ts`, `src/server.ts`, `src/tools/_register.ts`, `obsidian_exec`, `views_base` or `open_file` file is edited.
- Out of scope, recorded as a follow-up (plan "Follow-ups"): the unknown-vault wording mismatch in the five eval tools' docs and descriptions. No task touches unknown-vault text beyond removing `not-open`, the ADR-029 retry, or `obsidian_exec`.
- `.docs-as-code/` pages are updated by `/speckit-docs-as-code <n>` after review, not here (plan, Docs-as-code).
- Line numbers are from HEAD `e0e49d6`. Locate by the quoted stage comments or test titles if they have drifted.
- Write durable text (code comments, docs, changelog) in normal prose.
