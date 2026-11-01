---

description: "Task list for 080-tolerate-plugin-noise (revised after analyze, 2026-11-01)"
---

# Tasks: Tolerate plugin noise

**Input**: Design documents from `specs/080-tolerate-plugin-noise/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/eval-output-contract.md](contracts/eval-output-contract.md), [quickstart.md](quickstart.md)

**Tests**: Required. Spec FR-015 asks for them, and Constitution Principle II requires co-located tests for every modified tool: a happy path, plus a failure or boundary case. Where code changes, write the tests in the same task as the code and run them red first.

**Organization**: Tasks are grouped by user story (spec priorities: US1 P1, US2 P1, US3 P2, US4 P2, US5 P2). The answer tag changes what `invokeCli` returns for every typed eval call, so **every answer reader moves in the Foundational phase**, which keeps the suite green. The story phases then pin each story's behaviour per tool, and add the dispatch change (US2) and `stdoutTail` (US3).

**Load first**: every task that writes code loads the `karpathy-guidelines` skill before starting (user CLAUDE.md). Changes stay surgical.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task serves (US1–US5)

## Shared test vocabulary

These are defined in `src/tools/_handler-test-fixtures.ts` by T008 (research D9).

| Name | Value |
|------|-------|
| `TEST_EVAL_NONCE` | `"00000000-0000-4000-8000-000000000080"` |
| `TEST_EVAL_TAG` | `obsidian-cli-mcp:${TEST_EVAL_NONCE}:` |
| `evalAnswerLine(v)` | `=> ${TEST_EVAL_TAG}${v}` |
| `wrappedEvalCode(code)` | `wrapEvalCode(code, TEST_EVAL_TAG)` |
| **NOISE_BEFORE** | `"Found and returned 3 smart_blocks.\n[warn] plugin x: cache warm\n\n"`, placed before the answer line |
| **NOISE_AFTER** | `"\nplugin y: done"`, placed after the answer line |
| **LOOKALIKE(v)** | `"=> " + v`, where `v` is a JSON value that **passes the tool's schema** but differs from the real answer (for example another path or count) |
| **INVENTED** | `"§§ zz-unknown-plugin ¤ 42 :: {not json} [[x]]\n"` |
| **NO_ANSWER** | `"plugin z: starting\nplugin z: ready\n"` |
| **LONG_NO_ANSWER** | `NO_ANSWER + "x".repeat(600)` |

"Normal result" means the value the tool's existing happy-path test asserts. Reuse that test's answer fixture, and only wrap its stdout.

---

## Phase 1: Setup and gate

- [ ] T001 Read `.memory/test-execution-instructions.md`. On the branch, before any change, run `npm run typecheck`, `npm run lint` and `npx vitest run`, and note any already-failing test in the PR description.
- [ ] T002 **T0 gate (research D10, quickstart §1).**
  1. Against the authorised test vault only, send `eval` through `obsidian_exec` (or the CLI directly) with `(async()=>{return "obsidian-cli-mcp:t0-probe:"+(await (<template>))})()`, once each for `FOCUSED_FILE_TEMPLATE`, `FOCUSED_VAULT_TEMPLATE` and the `links` template composed in active mode.
  2. Record the exact stdout of each.
  3. Confirm the answer line starts `=> obsidian-cli-mcp:t0-probe:` (raw form) or `=> "obsidian-cli-mcp:t0-probe:` (quoted form), and carries the template's normal JSON, not `[object Promise]`.
  4. **Stop rule**: if no form keeps the tag at the start of the answer line, stop all further tasks and raise it to the owner as a question.
  5. Record the forms you observed in the PR description, and clean up as the instructions require.

---

## Phase 2: Foundational (the tag mechanism and every reader)

**Purpose**: research D1, D4 and D9. **⚠️ CRITICAL**: no story task starts until T003–T009 are done and the whole suite is green.

- [ ] T003 Create `src/cli-adapter/eval-output.ts`.
  - **Header**: `// Original — no upstream.` followed by a one-line purpose statement.
  - **Imports**: no imports from `src/tools/**`, `_dispatch.ts` or `node:child_process`.
  - **Exports** (research D1, data-model E0–E2):
    - `evalAnswerTag(nonce: string): string` returns `` `obsidian-cli-mcp:${nonce}:` ``.
    - `wrapEvalCode(code: string, tag: string): string` returns `` `(async()=>{return ${JSON.stringify(tag)}+(await (${code}))})()` ``.
    - `findTaggedEvalAnswer(stdout: string, tag: string): string | null`:
      - split on `\n` and drop one trailing `\r` per line;
      - for each line whose `trimStart()` starts with `=> `, let `R` be the rest;
      - **raw form**: if `R.startsWith(tag)`, the candidate is `R.slice(tag.length)`;
      - **quoted form**: else if `R.startsWith('"' + tag)`, try `JSON.parse(R)`. If it yields a string that starts with `tag`, the candidate is that string without the tag;
      - if every candidate is identical, return it;
      - if there are no candidates, or two candidates differ, return `null`.
    - `hasEvalAnswerLine(stdout: string): boolean`: true when any line's `trimStart()` starts with `=> `.
    - `findReportedErrorLine(stdout: string): string | null`: returns the trimmed **last** line whose `trimStart()` starts with `"Error:"`.
- [ ] T004 Create `src/cli-adapter/eval-output.test.ts` covering every row of contract §1, A1–A15, through `findTaggedEvalAnswer`, with a fixed tag. Also cover:
  - `wrapEvalCode(t, tag)` contains `t` verbatim and starts `(async()=>{return "obsidian-cli-mcp:`;
  - `evalAnswerTag` gives the exact format;
  - `hasEvalAnswerLine` returns true and false;
  - `findReportedErrorLine` returns none, one, and the last of several.
- [ ] T005 Change the cli-adapter facade and dispatch types (research D1, D9).
  - In `src/cli-adapter/_dispatch.ts`, add optional `evalAnswerTag?: string` to `DispatchInput` (`:30`). Type only; no logic yet.
  - In `src/cli-adapter/cli-adapter.ts`:
    - add `evalNonce?: () => string` to `InvokeCliDeps`, documented as a test seam that defaults to `randomUUID` from `node:crypto`;
    - add `evalAnswer?: string | null` to `InvokeCliSuccess`;
    - in `invokeCli`, when `input.command === "eval"`: build `tag = evalAnswerTag((deps.evalNonce ?? randomUUID)())`, set `parameters.code = wrapEvalCode(String(parameters.code), tag)` on a copy, and pass `evalAnswerTag: tag` in `dispatchInput`. After `dispatchCli`, run the existing `Vault not found.` check unchanged, then return `{ stdout, stderr, evalAnswer: findTaggedEvalAnswer(out.stdout, tag) }`;
    - leave non-eval calls byte-identical, with no `evalAnswer` key;
    - update the file header.
  - In `src/cli-adapter/cli-adapter.test.ts`, add tests that:
    - an eval call's spawned argv `code=` equals `wrapEvalCode(code, evalAnswerTag(nonce))` for an injected nonce;
    - `evalAnswer` is the tagged answer;
    - an untagged `=> {…}` gives `evalAnswer: null`;
    - a non-eval call's argv and result are unchanged.
- [ ] T006 Change the shared readers in `src/tools/_active-file.ts` and `src/tools/_note-io.ts` (research D4).
  - Replace `parseEvalStdout` (`:72`) with `parseEvalAnswer(result: { stdout: string; evalAnswer?: string | null }): unknown`. It returns `JSON.parse(result.evalAnswer)` when that is a string, and otherwise throws `new SyntaxError("eval output carries no answer for this call")`.
  - Change `decodeEvalEnvelope` (`:89`) and `parseFocusedVault` (`:137`) to take the `invokeCli` result as the first parameter, read `result.stdout` wherever they used `stdout`, and call `parseEvalAnswer(result)`.
  - Make `resolveActiveFocusedFile` (`:194`) call `parseEvalAnswer(focused)`.
  - Make `evalInVault` (`:51`) return the result instead of the stdout.
  - In `src/tools/_note-io.ts:105-107`, compare `result.evalAnswer === "ok"`, and `=== "missing"` for `note-not-found`. Keep `detail = result.stdout.trim().slice(0, 200)`.
  - Update JSDoc and the `_active-file.ts` header (`:1`, its "`"=> "` stdout strip" phrase).
  - Codes, stages, messages and `details` keys are unchanged.
- [ ] T007 Move every handler call site onto the new readers. Each call stays inside its existing `try`, with code, stage, message and `details` unchanged.
  - **Inline strips → `parsedJson = parseEvalAnswer(result)`**, importing from `../_active-file.js`:
    - `src/tools/read_heading/handler.ts:45-50`
    - `src/tools/pattern_search/handler.ts:61-67`
    - `src/tools/find_by_property/handler.ts:42-47`
    - `src/tools/smart_connections_similar/handler.ts:51-57`
    - `src/tools/paths/handler.ts:42-49`
    - `src/tools/tag/handler.ts:45-52` (replace the "no LAST-`=> ` rescan" comment)
    - `src/tools/smart_connections_query/handler.ts:44-64` (remove the "Stage 1 — LAST-`=> ` extraction" block and its `payload` variable; update the R14 wording in its header)
    - `src/tools/set_property/handler.ts`: delete the local `parseEvalResponse` (`:63-69`) and call `parseEvalAnswer(focused)` at `:99`. The local `isFocusedFileResponse` stays.
  - **Argument changes (pass the result, not `.stdout`)**:
    - `decodeEvalEnvelope(result, …)` in `src/tools/links/handler.ts:50`, `src/tools/backlinks/handler.ts:52`, `src/tools/open_file/handler.ts:87`, `src/tools/get_active_file/handler.ts:84` and `src/tools/views_base/handler.ts:148`;
    - `parseFocusedVault(result)` in `src/tools/find_and_replace/handler.ts:202` and `src/tools/query_base/handler.ts:71`.
  - **Search check**: `src/tools/**/*.ts` (non-test) must contain no remaining `"=> "` strip, and no other `evalInVault` caller left on the old return type.
- [ ] T008 In `src/tools/_handler-test-fixtures.ts`, add the vocabulary from the table above: `TEST_EVAL_NONCE`, `TEST_EVAL_TAG`, `evalAnswerLine(v)` and `wrappedEvalCode(code)`. `wrappedEvalCode` imports `wrapEvalCode` / `evalAnswerTag` from `../cli-adapter/eval-output.js`; this is a test fixture, the only `src/tools/**` importer allowed (plan check 3). Update the existing `focusedFileResponse` helper (`:169`) to emit `evalAnswerLine(...)`.
- [ ] T009 Migrate the existing eval tests to tagged output.
  - **Find the stubs**: grep `src/**/*.test.ts`, `src/tools/**/_handler-fixtures.ts` and `src/tools/_typed-result-fixtures.ts` (`evalOut`, `:74`) for stub stdout starting `=> ` on eval calls.
  - **Rewrite them**: each becomes `evalAnswerLine(<same value>)`, and the test's deps gain `evalNonce: () => TEST_EVAL_NONCE`. Every argv assertion on an eval `code=` value becomes `wrappedEvalCode(<template>)`, or stays `toContain(<template>)` where it already asserts containment.
  - **Expected files**: the handler tests (and `_handler-fixtures.ts`, where present) of these tools:
    - `links`, `backlinks`, `open_file`, `get_active_file`, `views_base`;
    - `find_and_replace` (with `scope.test.ts` and its `ACTIVE_EVAL` fixture), `query_base`;
    - `read_heading`, `pattern_search`, `find_by_property`;
    - `smart_connections_similar`, `smart_connections_query`;
    - `paths`, `tag`, `set_property`;
    - the active-mode file cohort: `write_note`, `append_note`, `prepend`, `patch_block`, `patch_heading`, `read`, `rename`, `move`, `outline`.

    Also `src/tools/_active-file.test.ts` and `src/tools/_note-io.test.ts`.
  - **Do not change** test expectations other than stub stdout and argv.
  - **Then** run `npx vitest run` until it is green.

**Checkpoint**: the whole suite is green. Behaviour is unchanged except that eval argv is wrapped and untagged answers are rejected.

---

## Phase 3: User Story 1 - Success reported despite preceding plugin output (Priority: P1) 🎯 MVP

**Goal**: FR-001, FR-002, FR-009.

**Independent Test**: each affected tool's tests include NOISE_BEFORE + `evalAnswerLine(answer)`, which returns the normal result. One envelope `ok:false` behind NOISE_BEFORE still maps to its specific error.

- [ ] T010 [P] [US1] In `src/tools/read_heading/handler.test.ts`, add the NOISE_BEFORE normal-result case and one envelope-error case behind NOISE_BEFORE.
- [ ] T011 [P] [US1] Make the same addition in `src/tools/pattern_search/handler.test.ts`.
- [ ] T012 [P] [US1] Make the same addition in `src/tools/find_by_property/handler.test.ts`.
- [ ] T013 [P] [US1] Make the same addition in `src/tools/smart_connections_similar/handler.test.ts`, using a `SOURCE_NOT_INDEXED` envelope for the error case.
- [ ] T014 [P] [US1] In `src/tools/smart_connections_query/handler.test.ts`, confirm the existing preamble tests pass with tagged stubs, and add a NOISE_BEFORE case built from INVENTED lines.
- [ ] T015 [P] [US1] Make the same addition as T010 in `src/tools/paths/handler.test.ts` and `src/tools/tag/handler.test.ts`.
- [ ] T016 [P] [US1] In `src/tools/set_property/handler.test.ts`, add an active-mode NOISE_BEFORE case.
- [ ] T017 [P] [US1] In `src/tools/links/handler.test.ts` and `src/tools/backlinks/handler.test.ts`, add NOISE_BEFORE cases: the normal result, and a `FILE_NOT_FOUND` envelope mapping to `CLI_REPORTED_ERROR` with `envelope-error`.
- [ ] T018 [P] [US1] In `src/tools/get_active_file/handler.test.ts` and `src/tools/open_file/handler.test.ts`, add NOISE_BEFORE cases: the normal result, and one envelope error each.
- [ ] T019 [P] [US1] In `src/tools/views_base/handler.test.ts`, add a NOISE_BEFORE case on the focus-base eval.
- [ ] T020 [P] [US1] In `src/tools/find_and_replace/handler.test.ts` (or `scope.test.ts`) and `src/tools/query_base/handler.test.ts`, add NOISE_BEFORE cases on the focused-vault eval. Drive `defaultInvokeEval` through `spawnFn`, **not** the `invokeEval` seam.
- [ ] T021 [P] [US1] Add NOISE_BEFORE cases in three places:
  - `src/tools/write_note/handler.test.ts`: one active-mode case. It stands for the file cohort, which resolves through `_file-target.ts` → `resolveActiveFocusedFile`.
  - `src/tools/_active-file.test.ts`: cases for `resolveActiveFocusedFile` and `parseFocusedVault`.
  - `src/tools/_note-io.test.ts`: a case where NOISE_BEFORE + `evalAnswerLine("ok")` gives no `metadataRefreshFailed` log.

**Checkpoint**: US1 is delivered; this is the MVP.

---

## Phase 4: User Story 2 - Opening a note right after Obsidian starts (Priority: P1)

**Goal**: eval-only error recognition in dispatch, under the ADR-029 amendment of 2026-11-01 (research D2, D3; FR-007, FR-011, FR-012, FR-013).

**Independent Test**: contract §2 rows E1–E9 pass. An `open_file` call whose first attempt is NOISE_BEFORE plus the cold-start line, and whose second attempt is NOISE_BEFORE plus the tagged answer, succeeds after exactly one retry.

- [ ] T022 [US2] Add contract §2 rows E1–E8, including E5b, to `src/cli-adapter/_dispatch.test.ts` first, so they run red. Use the file's stub `spawnFn` and pass `evalAnswerTag` in `DispatchInput` for the tagged rows. Add E9 (no tag, `command: "eval"`) to `src/cli-adapter/invoke-bounded-cli.test.ts`, and assert there that `obsidian_exec`'s `code=` reaches the argv unwrapped.
- [ ] T023 [US2] Change `src/cli-adapter/_dispatch.ts` as follows. T022 then runs green.
  - Add `export const COLD_START_LINE_PATTERN = /^\s*Error: Command "[^"]*" not found\./m;` next to `COLD_START_PATTERN` (`:115`), whose value stays unchanged. Its JSDoc cites the ADR-029 amendment of 2026-11-01.
  - In `isColdStart` (`:136`), use `COLD_START_LINE_PATTERN` when `value.details?.command === "eval"`, and `COLD_START_PATTERN` otherwise.
  - In the exit-0 classifier (`:558-594`), when `input.command === "eval"`:
    - `answered = input.evalAnswerTag ? findTaggedEvalAnswer(stdout, input.evalAnswerTag) !== null : hasEvalAnswerLine(stdout)`;
    - if `answered`, go to priority (d);
    - else `line = findReportedErrorLine(stdout)`;
    - a line starting (case-insensitively) with `error: no active file` rejects `ERR_NO_ACTIVE_FILE`, with the existing `details` and message but `details.message: line`;
    - any other line rejects `CLI_REPORTED_ERROR`, with the existing `details` and `details.message: line`;
    - no line at all goes to priority (d).
  - Keep non-eval branches byte-identical, importing from `./eval-output.js`.
  - Update the JSDoc above `COLD_START_PATTERN` / `isColdStart` and the file header.
- [ ] T024 [US2] Add the cold-start case from the Independent Test above to `src/tools/open_file/handler.test.ts`, through the real dispatch path with a sequenced stub `spawnFn`. Also add the case where both attempts give NOISE_BEFORE + `Error: Command "eval" not found. …`: the existing cold-start error surfaces after one retry. Add a case where LOOKALIKE comes before the cold-start line: one retry still runs (E5b).
- [ ] T025 [US2] Add these cases, which depend on T023:
  - `src/tools/links/handler.test.ts`: active mode with NOISE_BEFORE + `Error: No active file.` and no answer gives `ERR_NO_ACTIVE_FILE` (spec US2 scenario 4);
  - `src/tools/read_heading/handler.test.ts`: `Error: plugin says hi\n` + `evalAnswerLine(answer)` gives the normal result (spec US2 scenario 5).
- [ ] T026 [US2] In `src/cli-adapter/_dispatch.test.ts`, confirm that the existing zero-new-code guard still passes. No new code or `details.reason` is expected (FR-013).

**Checkpoint**: US2 is delivered.

---

## Phase 5: User Story 3 - Genuine failures still reported, look-alikes never win (Priority: P2)

**Goal**: FR-003, FR-005, FR-014 and SC-004. A look-alike before or after the real answer never wins, a look-alike alone gives a parse failure, and long output carries `details.stdoutTail` (research D5).

**Independent Test**: each affected tool passes four checks.

1. **Look-alikes**: `LOOKALIKE(v) + "\n" + evalAnswerLine(real) + "\n" + LOOKALIKE(v)` gives the real answer's result.
2. **Look-alike alone**: `NO_ANSWER + LOOKALIKE(v)` gives the existing parse-failure code and stage with the raw output, never `v`'s result.
3. **No answer**: NO_ANSWER gives that same failure without `stdoutTail`.
4. **Long output** (bounded sites only): LONG_NO_ANSWER also carries `stdoutTail === stdout.slice(-500)`.

- [ ] T027 [US3] Add `evalParseFailureStdout` to `src/tools/_active-file.ts` and wire it into `decodeEvalEnvelope`.
  - **Helper**: `export function evalParseFailureStdout(stdout: string): { stdout: string; stdoutTail?: string }`. It returns `{ stdout: stdout.slice(0, 500) }`, plus `stdoutTail: stdout.slice(-500)` only when `stdout.length > 500`.
  - **`decodeEvalEnvelope`**: spread `...evalParseFailureStdout(result.stdout)` in place of `stdout: …slice(0, 500)` at both stages. Messages are unchanged.
  - **Tests** in `src/tools/_active-file.test.ts`:
    - the helper at 500 characters (no tail) and at 501 characters (tail);
    - `decodeEvalEnvelope` at both stages;
    - `resolveActiveFocusedFile` never has `stdoutTail`;
    - for `parseEvalAnswer` / `decodeEvalEnvelope`, check 1 (look-alikes before and after) and check 2 (look-alike alone).
- [ ] T028 [P] [US3] In `src/tools/read_heading/handler.ts` (`:55`, `:65`), spread `...evalParseFailureStdout(result.stdout)`. Add checks 1–4 to its `handler.test.ts`.
- [ ] T029 [P] [US3] Make the same change in `src/tools/pattern_search/handler.ts` (`:72`, `:83`), with checks 1–4 in its tests.
- [ ] T030 [P] [US3] Make the same change in `src/tools/smart_connections_similar/handler.ts` (`:62`, `:73`), with checks 1–4.
- [ ] T031 [P] [US3] Make the same change in `src/tools/smart_connections_query/handler.ts` (`:69`, `:80`), with checks 1–4.
- [ ] T032 [P] [US3] Make the same change in `src/tools/paths/handler.ts` (`:54`, `:65`) and `src/tools/tag/handler.ts` (`:57`, `:68`), with checks 1–4 in each.
- [ ] T033 [P] [US3] Make the same change at the `json-parse` site of `src/tools/set_property/handler.ts` (`:104`). Its `envelope-parse` site attaches `parsed` and stays unchanged. Add checks 1–4.
- [ ] T034 [P] [US3] Make the same change in `src/tools/find_and_replace/handler.ts:207` and `src/tools/query_base/handler.ts:76`, with checks 1–4 driven through `defaultInvokeEval`.
- [ ] T035 [P] [US3] Add checks 1–3 to `src/tools/find_by_property/handler.test.ts`. It keeps the full `details.stdout` and never has `stdoutTail`; there is no handler change.
- [ ] T036 [P] [US3] Add checks 1–4 to `src/tools/links/handler.test.ts`, and checks 1–2 to `backlinks`, `open_file`, `get_active_file` and `views_base` (`handler.test.ts` in each). These are `decodeEvalEnvelope` consumers with no handler change.
- [ ] T037 [P] [US3] Add checks 1–2 in three places:
  - `src/tools/write_note/handler.test.ts`, active mode, for the file cohort;
  - `src/tools/_note-io.test.ts`, where a look-alike `=> ok` without the tag must log `metadataRefreshFailed` with reason `unexpected-output`;
  - `src/tools/_active-file.test.ts`, for `parseFocusedVault`.

**Checkpoint**: US3 is delivered.

---

## Phase 6: User Story 4 - Output after the answer (Priority: P2)

**Goal**: FR-004 and Clarification Q1. The code already does this after T005–T007; this phase pins it per tool.

**Independent Test**: NOISE_AFTER on its own, and NOISE_BEFORE plus NOISE_AFTER, give the normal result.

- [ ] T038 [US4] Add NOISE_AFTER and before-plus-after cases to `src/tools/_active-file.test.ts` for `parseEvalAnswer`, `resolveActiveFocusedFile` and `parseFocusedVault`.
- [ ] T039 [US4] Add a NOISE_AFTER case to `src/tools/smart_connections_query/handler.test.ts`. Before this feature, that output failed.
- [ ] T040 [US4] Add one NOISE_AFTER normal-result case to the `handler.test.ts` of each of these tools, reusing each file's US1 fixture:
  - `read_heading`, `pattern_search`, `find_by_property`;
  - `smart_connections_similar`, `paths`, `tag`;
  - `set_property`, `links`, `backlinks`;
  - `get_active_file`, `open_file`, `views_base`;
  - `find_and_replace`, `query_base`, `write_note`.

---

## Phase 7: User Story 5 - Works whatever plugins are installed (Priority: P2)

**Goal**: FR-006 and SC-005.

- [ ] T041 [P] [US5] Add a table-driven case to `src/cli-adapter/eval-output.test.ts`. Use at least eight preceding and trailing line shapes:
  - INVENTED;
  - an empty line;
  - whitespace only;
  - `{"ok":false}`;
  - `[warn] x`;
  - a line of 2,000 characters;
  - non-ASCII text;
  - a line ending in `\r`.

  Also use an untagged `=> {"ok":false}`. In every case, `findTaggedEvalAnswer(shape + "\n=> " + tag + '{"ok":true}' + "\n" + shape, tag)` must return `{"ok":true}`.
- [ ] T042 [P] [US5] Add one INVENTED-before-and-after case each to `src/tools/get_active_file/handler.test.ts` and `src/tools/tag/handler.test.ts`, asserting the normal result.
- [ ] T043 [US5] Inspect `src/cli-adapter/eval-output.ts` and the T023 dispatch branch, and confirm they match only on `=> `, the call's tag and `Error:` line prefixes, and name no plugin. Record the check in the PR description. This task changes no code.

---

## Phase 8: Polish & cross-cutting concerns

- [ ] T044 Check every modified file's header and comments for statements the change has made false (Principle V; plan gate table). At least these:
  - `_active-file.ts:1`;
  - the `tag` handler comment;
  - the `smart_connections_query` header (R14);
  - the `cli-adapter.ts` header;
  - the priority (b) and (c) comments in `_dispatch.ts`;
  - the `parseFocusedVault` JSDoc (`_active-file.ts:128-136`, the quoted form). Note in it which form T002 observed.

  Correct only the words that changed.
- [ ] T045 Add to the `## [Unreleased]` section of `CHANGELOG.md`, following the file's existing style:
  - **Fixed**:
    - in-Obsidian query tools no longer report a parse failure when plugins print lines before or after the answer, or print text that looks like an answer;
    - a cold start behind plugin start-up lines gets its single retry.
  - **Changed**:
    - typed eval calls carry a per-call answer tag (internal);
    - long parse failures add `details.stdoutTail`;
    - an `obsidian_exec` `eval` whose output has plugin lines, then an `Error:` line, and no answer now returns `CLI_REPORTED_ERROR` (research D3).
- [ ] T046 Run `npm run typecheck`, `npm run lint`, `npm run format:check` and `npx vitest run`, and get them all green.
- [ ] T047 Run `git diff --stat main -- src/tools/_register-baseline.json` and confirm there is no change (contract §5). Confirm that no `index.ts`, `schema.ts`, `_template.ts`, `src/errors.ts`, `src/server.ts` or `src/cli-adapter/invoke-bounded-cli.ts` file is in the diff.
- [ ] T048 Run `codegraph sync`, then `codegraph_explore "evalAnswerTag wrapEvalCode findTaggedEvalAnswer hasEvalAnswerLine findReportedErrorLine COLD_START_LINE_PATTERN parseEvalAnswer evalParseFailureStdout invokeCli"`. Verify the plan's four post-implement checks and record the result in the PR description.
- [ ] T049 Run `src/cli-adapter/architecture.test.ts` on its own and confirm it is green.
- [ ] T050 Run the live check in quickstart §4 under `.memory/test-execution-instructions.md`, against the authorised test vault only. Record the findings and clean up.
- [ ] T051 Prepare the PR description's Constitution Compliance checklist with the plan's verdicts. It covers Principles I–V, ADR-010, ADR-013, ADR-014, ADR-015, the MCP Tool Surface Standards and the Security Defaults. Cite the ADR-029 amendment of 2026-11-01 and the owner's analyze-time ruling on look-alikes, and include the T002 observations and the research D3 note on `obsidian_exec` `eval`.

---

## Dependencies & execution order

### Phase dependencies

- **T001 → T002 (gate)**. A stop at T002 ends the run with a question to the owner.
- **Foundational**:
  - T003 → T004.
  - T003 → T005 → T006 → T007.
  - T008 needs T003.
  - T009 needs T005–T008.
  - **Every story needs T009**, with the suite green.
- **US1 (T010–T021)**: independent tasks, each in its own tool directory. T021 shares `_active-file.test.ts` with T009, so run it after T009.
- **US2 (T022–T026)**: T022 runs before T023. T024 and T025 need T023, and they edit tests also touched in US1 (T018, T017, T010), so run them after those tasks.
- **US3 (T027–T037)**: T028–T034, T036 and T037 need T027. Each edits files also touched in Foundational or US1, so run it after them.
- **US4 (T038–T040)**: after US1 and US3, which share the same test files.
- **US5 (T041–T043)**: T041 after T004; T042 after T018 and T015; T043 after T023.
- **Polish (T044–T051)**: after all stories.

### Structural dependency notes (CodeGraph, per CLAUDE.md `/speckit-tasks` rule)

- `codegraph_explore "dispatchOnce isColdStart invokeCli parseEvalStdout resolveActiveFocusedFile"` shows the runtime path `handler → invokeCli → dispatchCli → dispatchWithColdStartRetry → dispatchOnce`. Consequences:
  - Handler tests driven through `spawnFn` exercise the wrap, dispatch classification **and** the reader together, so T009 must migrate stubs and argv at once.
  - Any handler test with an `Error:` line before a valid answer, or with a look-alike before a cold-start line, depends on T023. This applies to T024 and T025.
- `invokeCli` (`cli-adapter.ts:70`) is the single point every typed eval passes through; tools never import `eval-output.ts` (the fixture file in T008 is the one test-only exception). `invokeBoundedCli` builds its own `DispatchInput` without a tag, so `obsidian_exec` is untouched by T005 and enters only T023's untagged branch.
- `query_base` (`handler.ts:56`) and `find_and_replace` (`_handler-fixtures.ts:192`, `ACTIVE_EVAL`) expose `invokeEval` seams that bypass `parseFocusedVault`. T020 and T034 must drive `defaultInvokeEval`.
- `_file-target.ts` (`resolveFileTarget`, `resolveFsTarget`) composes `resolveActiveFocusedFile`. Every file-cohort active-mode test stubs the focused-file eval, so all of them are in T009's migration list. Its behaviour is pinned once in `write_note` (T021, T037), because no file-cohort handler changes.
- `evalInVault`'s callers (`_note-io.ts:105`, `:122`) change with T006. T009 migrates `_note-io.test.ts`.

### Parallel opportunities

- US1: T010–T020 are all [P].
- US3: T028–T037 are all [P] after T027.
- US5: T041 and T042 are [P].
- US1 and US2 can run side by side after Foundational. US2's code touches only `src/cli-adapter/**`.

## Parallel example: User Story 3

```text
Task: "T028 read_heading: stdoutTail + look-alike before/after + look-alike-only + no-answer"
Task: "T029 pattern_search: same"
Task: "T032 paths + tag: same"
Task: "T036 links (+tail) + backlinks/open_file/get_active_file/views_base look-alike cases"
```

## Implementation strategy

1. **T001, T002 (gate)**. If the gate stops, stop here.
2. **Foundational T003–T009**, ending with a green suite. The tag mechanism is live.
3. **US1**: the MVP. Lines before the answer are tolerated everywhere.
4. **US2**: the cold-start retry and error recognition behind plugin lines.
5. **US3**: look-alikes never win, and raw output is kept for diagnosis.
6. **US4**: trailing output pinned.
7. **US5**: plugin-agnostic.
8. **Polish.**

Everything ships in one PR.

## Notes

- Every code-writing task loads `karpathy-guidelines` first.
- Keep `details` keys, codes, stages and messages byte-identical, apart from the added `stdoutTail`.
- Live CLI work (T002, T050) follows `.memory/test-execution-instructions.md`. Do not edit that file.
- Commit after each phase via `/speckit-git-commit`.
