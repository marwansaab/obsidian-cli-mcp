---

description: "Task list for 080-tolerate-plugin-noise"
---

# Tasks: Tolerate plugin noise

**Input**: Design documents from `specs/080-tolerate-plugin-noise/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/eval-answer-contract.md](contracts/eval-answer-contract.md), [quickstart.md](quickstart.md)

**Tests**: required. Constitution Principle II applies: every changed surface ships happy-path and failure/boundary tests in the same change. Co-located `*.test.ts` only.

**Organization**: grouped by user story (spec.md US1–US6). Every task that writes code starts by loading the `karpathy-guidelines` skill (user CLAUDE.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6 from spec.md
- Contract row IDs (A1–A5, C1–C5, N1–N13, D1–D6, E1–E5) refer to [contracts/eval-answer-contract.md](contracts/eval-answer-contract.md)

---

## Phase 1: Setup (T0 live probes)

**Purpose**: confirm the one runtime assumption before any code is written (research D6). Read `.memory/test-execution-instructions.md` first:

- use `TestVault-Obsidian-CLI-MCP` only;
- drive `Obsidian.com` (bare `obsidian`), never `Obsidian.exe`;
- capture stdout and stderr separately;
- never touch `Welcome.md`.

- [X] T001 Run T0 probes P1–P4 from quickstart.md §2. Record the verbatim stdout, stderr and exit code of each in a new `specs/080-tolerate-plugin-noise/contracts/t0-probe-findings.md`:
  - **P1**: wrapped value prints as `=> <<ocm-probe>>{"a":1}` on one line;
  - **P2**: where a `console.log` line lands relative to the answer line;
  - **P3**: cold-start signature of a wrapped eval on the closed test vault, then the immediate re-run;
  - **P4**: length of the wrapped `FOCUSED_FILE_TEMPLATE` `code=` element, ≤ 250.

  **Gate**: if P1 shows the value printed quoted (`=> "<<ocm-probe>>…"`), or P2 shows `console.log` output interleaved inside the answer line, STOP and escalate. Do not start Phase 2, because research D1's line shape would change.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the two new modules and tag-aware test stubs. Nothing here changes runtime behaviour yet: the stubs only rewrite output when the recorded `code=` carries a wrapper, and no production code calls the new modules until Phase 3.

**⚠️ CRITICAL**: no user-story work starts until this phase is complete.

- [X] T002 [P] Create `src/cli-adapter/_eval-answer.ts` with header `// Original — no upstream. …` (spec 080: per-call eval answer tag and stdout line scanning, ADR-029 2026-11-01 amendment). Export:
  - `EVAL_ANSWER_PREFIX = "=> "`;
  - `mintAnswerTag(): string`, returning `"ocm-" + randomUUID()` from `node:crypto`;
  - `wrapEvalCode(code: string, tag: string): string`, returning exactly `` `(async()=>'<<${tag}>>'+(await (${code})))()` `` (contract A1);
  - `stdoutLines(stdout: string): string[]`: split on `"\n"` only (never a regex `m` flag, research F2), drop one trailing `"\r"` per line, strip leading whitespace;
  - `findAnswer(stdout: string, tag?: string): string | undefined`. With `tag`, it returns the remainder after `"=> <<" + tag + ">>"` on the first line that starts with that marker (contract A2/A3). Without `tag`, it returns the remainder after `"=> "` on the first line that starts with `"=> "` (the untagged rule for `obsidian_exec`);
  - `findNoActiveFileLine(stdout): string | undefined`: the first line whose lower-cased form starts with `"error: no active file"`;
  - `findErrorLine(stdout): string | undefined`: the first line that starts with `"Error:"` (contract C2/C3).
- [X] T003 [P] Create `src/cli-adapter/_eval-answer.test.ts` with an `// Original — no upstream.` header. Cover:
  - the exact `wrapEvalCode` output;
  - `mintAnswerTag` uniqueness and shape;
  - `findAnswer`: tagged match after noise; look-alike before and after the answer ignored (A5); `\r\n` endings; leading whitespace; marker mid-line not matched (N10); a U+2028 inside a JSON body does not split the line; no line matches → `undefined`; empty body after the marker → `""`; untagged mode;
  - `findNoActiveFileLine` and `findErrorLine` on head and non-head lines, and their absence.
- [X] T004 [P] Create `src/tools/_eval-parse.ts` with an `// Original — no upstream. …` header. Export:
  - `parseEvalAnswer(answer: string | undefined): unknown`, which throws `new SyntaxError("eval output carries no answer for this call")` when `answer === undefined` and otherwise returns `JSON.parse(answer)`;
  - `EXCERPT_LIMIT = 1000`, `EXCERPT_EDGE = 500`, `EXCERPT_CUT_MARKER = "\n[… cut …]\n"`;
  - `stdoutDetails(stdout: string): { stdout: string; stdoutLength: number }`. Per contract §4 / FR-013, output of ≤ 1,000 characters is returned whole; longer output is `stdout.slice(0, 500) + EXCERPT_CUT_MARKER + stdout.slice(-500)`; `stdoutLength` is `stdout.length`.
- [X] T005 [P] Create `src/tools/_eval-parse.test.ts` with an `// Original — no upstream.` header. Cover:
  - `parseEvalAnswer`: undefined → `SyntaxError`; invalid JSON → `SyntaxError`; valid object, string, number. Also cover analyze F4 and the spec edge case "empty, `null`, `false` or an empty list… never confused with no answer": `"null"` → `null`, `"false"` → `false`, `"[]"` → `[]`, `"0"` → `0`. Each returns the value and does not throw. Only `undefined` and invalid JSON (including `""`) throw;
  - `stdoutDetails`: contract E1 (0), E2 (exactly 1,000: whole, no marker), E3 (1,001: head + marker + tail, lengths exact), E4 (2,000,000 characters: tail shows the last 500).
- [X] T006 Make the shared spawn stubs tag-aware in `src/tools/_handler-test-fixtures.ts`:
  - widen `StubResponse.stdout` and `StubChildSpec.stdout` to `string | ((ctx: { answerTag?: string }) => string)`;
  - add `answerTagFromArgv(argv: string[]): string | undefined`, which reads the tag out of a `code=` element that starts with `(async()=>'<<ocm-`;
  - when `stdout` is a string and the argv carries a tag, rewrite every line starting with `"=> "` to `"=> <<TAG>>" + rest`; when it is a function, call it with `{ answerTag }` and emit the result verbatim;
  - export `answerLine(tag: string, body: string): string` (returns `` `=> <<${tag}>>${body}` ``) and `unwrapEvalCode(codeArg: string): string` (strips `code=` and the A1 wrapper, returning the inner code; returns the input unchanged when it is not wrapped);
  - update the header intent line (spec 080);
  - **multi-marker sweep (analyze F6)**: grep `src/**/*.test.ts` and the `_*fixtures*.ts` files for string stdout fixtures with more than one line starting `=> ` (for example the smart_connections_query R14 cases, which put plugin lines ahead of the answer). Automatic tagging would tag every one of those lines, so the new first-tagged-line rule could pick a different line from the one the test expects. Convert each hit to function-form stdout that tags only the intended answer line with `answerLine`, and list the converted files in the T018 commit message.

  Depends on T002 for the wrapper shape. Import nothing from it at runtime: keep the fixture vitest-free and its imports downward, and duplicate the `'<<ocm-` literal with a comment pointing at `_eval-answer.ts`.
- [X] T007 Extend `src/tools/_handler-test-fixtures.test.ts`:
  - an unwrapped argv leaves stdout untouched;
  - a wrapped argv tags every `=> ` line;
  - function-form stdout receives the tag and is emitted verbatim;
  - `unwrapEvalCode` round-trips `wrapEvalCode`.

  Depends on T006.
- [X] T008 [P] Make `makeRegistrationStubSpawn` in `src/tools/_registration-stub.ts` tag-aware the same way: read argv, tag `=> ` lines of string stdout, accept function-form stdout. Add the cases to `src/tools/_registration-stub.test.ts`. Depends on T006 for the shared semantics; duplicate the minimal logic rather than importing the fixture (Principle I direction).

**Checkpoint**: `npm test` is green with no behaviour change: no production caller uses the new modules yet, and the stubs are no-ops without a wrapper.

---

## Phase 3: User Story 1 — Success despite noise before the answer (Priority: P1) 🎯 MVP

**Goal**: every eval-composed tool returns the no-noise result when plugin lines precede its answer (FR-001, FR-002, FR-003, FR-006).

**Independent Test**: contract N1–N3 and N7 pass for every eval-composed tool in `_plugin-noise.test.ts`. The whole existing suite passes through the tag-aware stubs.

**Atomicity note**: T009–T020 must land together. Once T010 wraps eval code, every head-strip parser receives `=> <<TAG>>…` and fails until it is switched to `answer`. Run `npm test` only after T020.

### Implementation for User Story 1

- [X] T009 [US1] In `src/cli-adapter/_dispatch.ts`:
  - add `answerTag?: string` to `DispatchInput`;
  - in `onTerminal` (exit-0 branch, before priorities (b) and (c)), when `input.command === "eval"` and `findAnswer(stdout, input.answerTag)` is not `undefined`, resolve as success (contract C1, FR-006);
  - leave every non-eval path byte-identical;
  - update the header intent line.

  Depends on T002.
- [X] T010 [US1] In `src/cli-adapter/cli-adapter.ts`:
  - when `input.command === "eval"`, mint a tag (`mintAnswerTag`), pass `parameters.code` through `wrapEvalCode`, and set `dispatchInput.answerTag`;
  - add `answer?: string` to `InvokeCliSuccess`, set from `findAnswer(out.stdout, tag)` and present only for eval when found (contract A3);
  - skip the `Vault not found.` check when an eval answer was found (C5), and leave it unchanged otherwise;
  - keep non-eval calls byte-identical;
  - update the header intent line.

  Depends on T002 and T009. Codegraph path: `invokeCli → dispatchCli → dispatchWithColdStartRetry → dispatchOnce`.
- [X] T011 [US1] In `src/tools/_active-file.ts`:
  - `evalInVault` returns `InvokeCliSuccess` (`{ stdout, stderr, answer? }`);
  - `decodeEvalEnvelope` takes `result: { stdout: string; answer?: string }` in place of `stdout`, and parses with `parseEvalAnswer(result.answer)`;
  - `parseFocusedVault` takes `result: { stdout: string; answer?: string }` and parses `result.answer` (keep the double decode);
  - `resolveActiveFocusedFile` parses `focused.answer`;
  - delete `parseEvalStdout`;
  - keep every existing error code, `stage` and message, and the existing `details.stdout` values for now (the excerpt rule lands in US3);
  - update the header and doc comments.

  Depends on T004 and T010.
- [X] T012 [P] [US1] Pass the whole `invokeCli` result to `decodeEvalEnvelope` in `src/tools/backlinks/handler.ts`, `src/tools/links/handler.ts`, `src/tools/get_active_file/handler.ts`, `src/tools/open_file/handler.ts` and `src/tools/views_base/handler.ts`. Depends on T011.
- [X] T013 [P] [US1] In `src/tools/_note-io.ts`, change `invalidateMetadataCache` to compare `result.answer` with `"ok"` / `"missing"` (anything else, including absent, gives `unexpected-output`). Keep `detail` as the raw stdout trimmed and sliced to its first 200 characters, as today. `openNote` keeps ignoring the output. Depends on T011.
- [X] T014 [P] [US1] Pass the `invokeCli` result to `parseFocusedVault` in the `defaultInvokeEval` of `src/tools/find_and_replace/handler.ts` and `src/tools/query_base/handler.ts`. Depends on T011.
- [X] T015 [P] [US1] Replace the inline `trimStart`/`startsWith("=> ")` strip with `parseEvalAnswer(result.answer)` in each of these, keeping each existing error's code, stage and message:
  - `src/tools/find_by_property/handler.ts`
  - `src/tools/read_heading/handler.ts`
  - `src/tools/paths/handler.ts`
  - `src/tools/tag/handler.ts`
  - `src/tools/pattern_search/handler.ts`
  - `src/tools/smart_connections_similar/handler.ts`

  Depends on T004 and T010.
- [X] T016 [P] [US1] In `src/tools/smart_connections_query/handler.ts`, replace the R14 last-`\n=> ` extraction (Stage 1) with `parseEvalAnswer(result.answer)`. Keep the stage-2 and stage-3 errors, and update the header and comment (R14 is superseded by spec 080 FR-002). Depends on T004 and T010.
- [X] T017 [P] [US1] In `src/tools/set_property/handler.ts`, delete `parseEvalResponse` and parse `focused.answer` with `parseEvalAnswer`, keeping its errors. Depends on T004 and T010.
- [X] T018 [US1] Update tests broken by the parser switch:
  - `src/tools/_active-file.test.ts`: the `parseEvalStdout` tests become `decodeEvalEnvelope` / `parseFocusedVault` tests over `{stdout, answer}`; the bare-JSON fallback test (l.69–71) becomes "no answer → json-parse";
  - `src/tools/_note-io.test.ts`: its local `recordingSpawn` becomes tag-aware like T006; the noisy-detail test (l.204) still expects `unexpected-output`, because its noise sits on the answer line;
  - `src/cli-adapter/cli-adapter.test.ts` (the eval `Vault not found.` case at ~l.414);
  - `src/cli-adapter/_dispatch.test.ts` (the `=> ok` case at ~l.802);
  - **sweep (analyze F2)**: grep `src/**/*.test.ts` for assertions on `details.stdout`, `details.partialStdout`, `details.argv` (on eval calls) or a logged `detail` whose expected value contains `=> ` or an eval `code=`. Rewrite each to build its expected value from the tag in the recorded argv (`answerTagFromArgv` + `answerLine`) or from `unwrapEvalCode`. Known instances: `src/tools/find_and_replace/handler.test.ts:878` (`details.stdout === "=> not-valid-json-at-all"`) and the `src/tools/_note-io.test.ts` "missing" case (`detail: "=> missing"`, ~l.198). Under the new rule that case still logs `note-not-found`, but its raw detail now contains the tag. Record each hit in the commit message.

  Depends on T011–T017.
- [X] T019 [P] [US1] Make the exact-`code=` assertions compare `unwrapEvalCode(codeArg)` with the template (research F6):
  - `src/tools/get_active_file/handler.test.ts` (l.76, 193)
  - `src/tools/backlinks/handler.test.ts` (~l.685)
  - `src/tools/links/handler.test.ts` (~l.616)
  - `src/tools/smart_connections_query/handler.test.ts` (~l.572)
  - `src/tools/smart_connections_similar/handler.test.ts` (~l.883)
  - `src/tools/_note-io.test.ts` (~l.226)
  - `src/tools/write_note/handler.test.ts` (~l.447)
  - the prefix and suffix checks in `src/tools/paths/handler.test.ts` (~l.623), `src/tools/tag/handler.test.ts` (l.73, ~383) and `src/tools/read_heading/handler.test.ts` (l.480–498)

  Keep `write_note/handler.test.ts:550` (≤ 250) asserting on the wrapped element, which P4 confirmed. Depends on T006 and T010.
- [X] T020 [US1] Add `src/cli-adapter/cli-adapter.test.ts` cases:
  - eval code is wrapped with an `ocm-` tag;
  - two calls mint different tags;
  - `answer` is returned after leading noise;
  - an untagged look-alike yields no `answer`;
  - non-eval `code`-free calls are not wrapped and return no `answer`;
  - C5: `Vault not found.` plus a tagged answer → success; `Vault not found.` alone → unchanged error.

  Add a `src/cli-adapter/_dispatch.test.ts` case for C1: eval stdout `Error: plugin\n=> <<TAG>>{…}` with `answerTag` → success.

  Add a `cli-adapter.test.ts` case pinning spec FR-010 (b) and contract §5: a typed eval that times out (`CLI_TIMEOUT`) has the same `details` keys as before. Its `details.argv` `code=` element is the A1 wrapper, and `unwrapEvalCode` of it equals the original code. A non-eval timeout's `argv` is unchanged.

  Depends on T009 and T010.

### Tests for User Story 1

- [X] T021 [US1] Create `src/tools/_plugin-noise.test.ts` with an `// Original — no upstream.` header:
  - **The table**: iterate the eval-composed tools of `TYPED_RESULT_FIXTURES` (`src/tools/_typed-result-fixtures.ts`), meaning every fixture whose recorded spawns include a wrapped `code=`. Build each tool with a spawn that wraps the fixture's responses.
  - **The baseline**: run each tool once with no noise to record its result.
  - **The variants**: assert contract N1, N2, N3 and N7 produce a result deep-equal to the baseline.
  - **Zero results (contract N13, analyze F4)**: for each tool whose envelope has a zero/empty success form (for example `paths`, `tag`, `find_by_property`, `links`, `backlinks`, `pattern_search` and the Smart Connections tools with `count: 0` and an empty list, or `get_active_file` with no active file where that is a success), wrap the zero-result answer in leading and trailing noise. Assert the zero result, never a parse error or another tool error.
  - **Single-expression guard (analyze F7, data-model R8)**: for every exported eval template constant (each `src/tools/*/_template.ts` `JS_TEMPLATE` with its placeholder filled through `composeEvalCode` and a sample payload, plus `FOCUSED_FILE_TEMPLATE`, `FOCUSED_VAULT_TEMPLATE`, set_property's focused-file template, `get_active_file`'s and `views_base`'s templates, and the two module-private `_note-io` builders, taken from the recorded `code=` argv element of an `invalidateMetadataCache` / `openNote` call so that nothing new is exported), assert that `new Function("app", "return " + wrapEvalCode(code, "ocm-guard"))` does not throw. For the recorded `_note-io` elements, which are already wrapped, parse the recorded code directly. The code is only parsed, never run. A future statement-form template then fails in CI rather than at runtime.
  - **Hook**: add a small fixture hook in `_typed-result-fixtures.ts` (for example an optional `noise` transform applied to every eval response's function-form stdout) if the existing `build()` shape cannot inject noise.
  - **Inventory check**: assert that the table covers every tool in spec Key Entities ("eval-composed cohort"). The table should include backlinks, links, get_active_file, open_file, views_base, find_by_property, read_heading, paths, tag, pattern_search, smart_connections_query, smart_connections_similar, set_property (active), find_and_replace, query_base, write_note, append_note, prepend, patch_block, patch_heading, and read, outline, move and rename in active mode where a fixture exists. Note any tool without a typed-result fixture in the test's comment, and give it a dedicated case.

  Depends on T006 and T018–T020.

**Checkpoint**: `npm test` green; US1 is the MVP.

---

## Phase 4: User Story 2 — Cold start succeeds first time (Priority: P1)

**Goal**: for eval, error lines (cold start, no active file, other `Error:`) are recognised anywhere when no answer is present, and the cold-start line still triggers exactly one retry (FR-007). Non-eval commands are unchanged (FR-008).

**Independent Test**: contract D1–D4 in `_dispatch.test.ts`; quickstart §2 end-to-end step 2.

- [X] T022 [US2] In `src/cli-adapter/_dispatch.ts` `onTerminal`, for `input.command === "eval"` with no answer (after the T009 check), replace the head-anchored checks:
  - (b) uses `findNoActiveFileLine(stdout)`, and `details.message` is that line;
  - (c) uses `findErrorLine(stdout)`, and `details.message` is that line.

  Keep each error's codes, messages and `details` keys (full `stdout`). Non-eval commands keep the `trimmedHead` code exactly. Depends on T009.
- [X] T023 [US2] In `src/cli-adapter/_dispatch.ts`, change `isColdStart` so that when `details.command === "eval"` it tests `COLD_START_PATTERN` against each line from `stdoutLines(details.stdout)`, and keeps the head test otherwise. Update its doc comment (ADR-029 2026-11-01 amendment). The retry stays in `dispatchWithColdStartRetry`; the second attempt reuses `input`, so the same tag. Depends on T022.
- [X] T024 [US2] Add `src/cli-adapter/_dispatch.test.ts` cases for contract D1–D4:
  - **D1**: noise, then cold start on attempt 1, then a tagged answer → success, exactly two spawns, one `dispatch.retry` log;
  - **D2**: noise then `Error: No active file.` → `ERR_NO_ACTIVE_FILE`;
  - **D3**: noise then `Error: something` → `CLI_REPORTED_ERROR` with message `Error: something`;
  - **D4**: a `read` command with noise then a cold-start line → success, no retry.

  Also add `isColdStart` unit cases (eval with a non-head line → true; non-eval with a non-head line → false). Confirm that every existing `_dispatch.test.ts` case passes unchanged. Depends on T023.
- [X] T025 [P] [US2] Add an `open_file` handler test in `src/tools/open_file/handler.test.ts`: plugin start-up lines plus the cold-start signature, then a tagged success envelope → success after one retry (spec US2 scenario 1). Depends on T023.

**Checkpoint**: US1 and US2 green.

---

## Phase 5: User Story 3 — Genuine failures still reported, with the raw output (Priority: P2)

**Goal**: every eval parse failure keeps its code and stage and carries the FR-013 excerpt plus `stdoutLength` (FR-005, FR-013).

**Independent Test**: contract N8, N9, N11 and E5 in `_plugin-noise.test.ts`, plus per-site excerpt assertions.

- [X] T026 [US3] In `src/tools/_active-file.ts`, replace `stdout: …` with `...stdoutDetails(rawStdout)` in:
  - `decodeEvalEnvelope` (json-parse, envelope-parse);
  - `resolveActiveFocusedFile` (json-parse: full stdout → excerpt; envelope-parse: add the excerpt, keep `parsed`).

  Messages unchanged. Depends on T011 and T004.
- [X] T027 [P] [US3] Apply `...stdoutDetails(result.stdout)` in place of `stdout: …slice(0, 500)` or full stdout at every eval parse-failure site (research F5):
  - `src/tools/find_by_property/handler.ts` (json-parse, schema-parse, count-paths-mismatch)
  - `src/tools/read_heading/handler.ts`, `src/tools/paths/handler.ts`, `src/tools/tag/handler.ts`, `src/tools/pattern_search/handler.ts`, `src/tools/smart_connections_query/handler.ts`, `src/tools/smart_connections_similar/handler.ts` (json-parse, envelope-parse)
  - `src/tools/set_property/handler.ts` (json-parse; envelope-parse gains the excerpt and keeps `parsed`)
  - `src/tools/find_and_replace/handler.ts` and `src/tools/query_base/handler.ts` `defaultInvokeEval`

  Keep codes, stages and messages. Depends on T015–T017 and T014.
- [X] T028 [US3] Extend `src/tools/_plugin-noise.test.ts` with contract N8, N9 and N11 for every tool in the table. Assert:
  - `isError: true`, with the tool's existing code and `stage: "json-parse"`;
  - `details.stdout` equal to `stdoutDetails(raw).stdout` and `details.stdoutLength === raw.length`;
  - no success and no empty result (SC-005).

  Add one long-noise case (> 1,000 characters) asserting the cut marker and that the tail holds the region where the answer was expected (E4). Depends on T026, T027 and T021.
- [X] T029 [P] [US3] Add a `src/tools/_active-file.test.ts` case for contract E5: a `resolveActiveFocusedFile` envelope-parse error now carries the `stdout` excerpt and `stdoutLength` alongside `parsed`. Do the same in `src/tools/set_property/handler.test.ts`. Depends on T026 and T027.

**Checkpoint**: US1–US3 green.

---

## Phase 6: User Story 4 — The capability's own answer, not a look-alike (Priority: P2)

**Goal**: plugin text formatted as an answer never reaches a parser (FR-003). The behaviour comes from T002/T010; this phase proves it per tool and at the dispatch layer.

**Independent Test**: contract N5, N6, N10, D5 and D6.

- [X] T030 [US4] Extend `src/tools/_plugin-noise.test.ts` with contract N5 (look-alike before) and N6 (look-alike after), and assert a result deep-equal to the baseline. The look-alike body is the fixture's valid envelope with altered data (for example a different path or count), so a wrong pick would be visible. Add N10 (marker mid-line → parse error). Depends on T021 and T028.
- [X] T031 [P] [US4] Add `src/cli-adapter/_dispatch.test.ts` cases:
  - **D5**: untagged eval `Error: plugin\n=> 42` (no `answerTag`, the `obsidian_exec` path) → success with raw stdout;
  - **D6**: tagged eval with only an untagged `=> 42` and an `Error:` line → `CLI_REPORTED_ERROR`.

  Depends on T022.
- [X] T032 [P] [US4] Add an `src/tools/obsidian_exec/handler.test.ts` case with `allowEval: true` and stdout `noise\nError: plugin\n=> 42`. Expect success, with `stdout` returned raw and unchanged, the output keys exactly `{stdout, stderr, exitCode, argv}` (no `answer`), and `code=` not wrapped (FR-012). Depends on T009 and T022.

---

## Phase 7: User Story 5 — Noise after the answer (Priority: P3)

**Goal**: trailing lines never change the result (FR-004).

**Independent Test**: contract N4 and N12.

- [X] T033 [US5] Extend `src/tools/_plugin-noise.test.ts`:
  - **N4** (`ANS\nnoise`) → baseline result;
  - **N12** (noise around the tool's own `ok:false` envelope) → the tool's normal typed error, not a parse error. Use each tool's own documented `ok:false` code where its fixture module exposes one, and skip with a comment for tools whose envelope has no `ok:false` branch.

  Depends on T021.

---

## Phase 8: User Story 6 — Works with any plugin (Priority: P3)

**Goal**: tolerance holds for arbitrary text with no plugin-specific setting (FR-009).

**Independent Test**: the randomised-noise case passes; no configuration names a plugin.

- [X] T034 [US6] Add a seeded pseudo-random noise case to `src/tools/_plugin-noise.test.ts`: a fixed seed and a small inline PRNG, with no new dependency. For each tool, generate 20 noise blocks of random printable and Unicode lines (including `Error:`-prefixed lines, `[warn]` lines, `=> `-prefixed untagged look-alikes, blank lines and `\r\n`), placed before and after the answer, and assert the baseline result. Depends on T030.
- [X] T035 [P] [US6] Verify that no setting was added: grep `src/**` for plugin names in the new code (`smart-connections` must not appear in `_eval-answer.ts` or `_eval-parse.ts`), and confirm that `src/server.ts` and env parsing are unchanged (`git diff main -- src/server.ts` is empty). Record the result in the PR description (SC-007).

---

## Phase 9: Polish & cross-cutting concerns

- [X] T036 [P] Update the docs per research D7:
  - **Full update** (the excerpt rule and `stdoutLength` on parse errors, plus one sentence that output from other plugins around the answer is ignored): `docs/tools/backlinks.md`, `find_by_property.md`, `get_active_file.md`, `links.md`, `open_file.md`, `paths.md`, `pattern_search.md`, `read_heading.md`, `smart_connections_query.md`, `smart_connections_similar.md`, `tag.md` and `write_note.md`;
  - **Check only** (they mention only the stage names; correct any wording that now misdescribes `details.stdout`): `docs/tools/outline.md`, `context_search.md`, `search.md` and `properties.md`.
  - **Closed-vault caveat (analyze F3, Option A)**: in `docs/tools/paths.md`, `tag.md`, `pattern_search.md`, `smart_connections_query.md` and `smart_connections_similar.md`, add one sentence next to the closed-vault / vault-unavailable entry: "When other plugins print output, the `Error: Command "eval" not found.` line can appear after their lines rather than at the start of `details.stdout`." Do NOT edit `closedVaultNote` in `src/tools/_shared.ts`, any tool description, or `docs/tools/query_base.md`. T038's unchanged baseline confirms this.
- [X] T037 [P] Add `CHANGELOG.md` `[Unreleased]` entries for spec 080-tolerate-plugin-noise (BI-0135):
  - **Fixed**: eval-composed tools ignore other plugins' output around their answer, and a cold start with plugin start-up lines recovers;
  - **Changed**: eval parse errors carry a head-and-tail `details.stdout` excerpt plus `details.stdoutLength`.
- [X] T038 Run `npm run baseline:write` and `git diff src/tools/_register-baseline.json`. Expect no change (contract §5). If anything moved, find and revert the unintended description or schema edit.
- [X] T039 Run `npm run typecheck`, `npm run lint` and `npm test`. All must be green. Fix any failure at its root; do not weaken assertions.
- [X] T040 Do the post-implement structural verification (plan §CodeGraph structural check, items 1–4) after `codegraph sync`, with `codegraph_explore` on:
  - `wrapEvalCode`, `findAnswer`, `findNoActiveFileLine`, `findErrorLine`, `parseEvalAnswer` and `stdoutDetails`;
  - `invokeCli`, `dispatchOnce` and `isColdStart`;
  - `decodeEvalEnvelope` and `parseFocusedVault`.

  Confirm all of these:
  - `src/errors.ts` is unchanged, and there is no new code, `stage` or `reason`;
  - (analyze F5, FR-014) `git diff main -- src/logger.ts` is empty, the `Logger` interface has no new method, and no new `deps.logger.*` call site was added outside the existing `dispatchRetry` / `dispatchRecovery` / `metadataRefreshFailed` sites;
  - no handler imports `createLogger` / `createQueue`;
  - `_eval-answer.ts` is imported only by `_dispatch.ts`, `cli-adapter.ts` and its test;
  - nothing in `src/cli-adapter/**` imports `src/tools/**`;
  - `parseEvalStdout` has no references.

  Record the outcome in `specs/080-tolerate-plugin-noise/contracts/t0-probe-findings.md` under a "Post-implement verification" heading.
- [X] T041 Run the quickstart §2 end-to-end steps 1–3 against the built server (`npm run build`) in `TestVault-Obsidian-CLI-MCP`, under `.memory/test-execution-instructions.md`, with fixtures in `Sandbox/080-<run>/`, then clean up. Report each result verbatim in `contracts/t0-probe-findings.md`.

---

## Dependencies & execution order

### Phase dependencies

- **Phase 1 (T001)** gates everything: the P1/P2 stop condition.
- **Phase 2 (T002–T008)** blocks all stories. T002, T004 and T008 can run in parallel with T006 once T002's wrapper shape is fixed. T003, T005 and T007 follow their modules.
- **Phase 3 (US1)** must land atomically (T009–T020) before `npm test` is meaningful. Then comes T021.
- **US2 (T022–T025)** depends on T009. It is independent of US3–US6.
- **US3 (T026–T029)** depends on the US1 parser switch.
- **US4 (T030–T032)** depends on T021 and T028 (shared matrix file) and T022.
- **US5 (T033)** depends on T021.
- **US6 (T034–T035)** depends on T030.
- **Polish (T036–T041)** comes after all stories.

### Structural dependencies surfaced by `codegraph_explore` (CLAUDE.md `/speckit-tasks` rule)

- **`invokeCli` → `dispatchCli` → `dispatchWithColdStartRetry` → `isColdStart` / `dispatchOnce`**: T010 depends on T009, and T023's `isColdStart` change runs on every typed eval through `invokeCli`. So run the full suite again after T023, not only `_dispatch.test.ts`.
- **`resolveFileTarget` / `resolveFsTarget` (`_file-target.ts`) → `resolveActiveFocusedFile`**: T011 and T026 change behaviour for read, outline, move, rename, append_note and prepend in active mode, with no edit to those handlers. Their existing active-mode tests are the regression check, and T021's table must include them.
- **`resolveActiveLocatorWithVault` → `resolveActiveFocusedFile`**: patch_block and patch_heading are affected the same way.
- **`makeQueuedSpawn` → `_typed-result-fixtures.ts` (`cli`, `evalOut`)**, and `makeRegistrationStubSpawn` → the cohort `index.test.ts` files: T006 and T008 must land before T010, or the existing suite fails on untagged fixtures.
- **`evalInVault` → `_note-io.ts`**: T013 depends on T011's return-type change.

### Within each phase

- Implementation before its tests where a test asserts the new behaviour. Tagging tests (T003, T005, T007) can be written first and fail until their module exists.
- The same file in two tasks is sequential: `_plugin-noise.test.ts` (T021 → T028 → T030 → T033 → T034), `_dispatch.ts` (T009 → T022 → T023), `_dispatch.test.ts` (T020 → T024 → T031).

## Parallel examples

```text
# Phase 2, once T002's wrapper shape is fixed:
T002 src/cli-adapter/_eval-answer.ts   |  T004 src/tools/_eval-parse.ts   |  T006 src/tools/_handler-test-fixtures.ts
T003 src/cli-adapter/_eval-answer.test.ts  |  T005 src/tools/_eval-parse.test.ts  |  T008 src/tools/_registration-stub.ts

# Phase 3, after T011:
T012 decodeEvalEnvelope call sites  |  T013 _note-io.ts  |  T014 find_and_replace + query_base
T015 six inline-strip handlers      |  T016 smart_connections_query  |  T017 set_property  |  T019 code= assertions

# Phase 5:
T027 per-site excerpt adoption  ∥  T029 E5 cases
```

## Implementation strategy

### MVP (User Story 1)

1. Run T001 (gate).
2. Complete Phase 2 and check that `npm test` is green with no behaviour change.
3. Complete Phase 3 as one atomic change, then T021, and check that `npm test` is green. This alone fixes the reported false parse failures.

### Incremental delivery

- US2 (cold start) next, as it is P1.
- Then US3 (excerpts), US4 (look-alike proofs and the exec boundary), US5 and US6.
- Polish (docs, CHANGELOG, baseline, structural verification, live end-to-end) closes the BI.

## Notes

- **CodeGraph `/speckit-tasks` rule**: applied. The task list crosses `src/cli-adapter/**` and `src/tools/**`, and the pairwise call paths found are listed under *Structural dependencies* above.
- **Kernel nodes**: `UpstreamError` is used, not edited. `createLogger`, `createQueue` and `createServer` are untouched, and no task edits `src/errors.ts`, `src/logger.ts`, `src/queue.ts` or `src/server.ts`.
- **Writing code**: every code-writing task begins by loading the `karpathy-guidelines` skill. Keep diffs surgical: do not refactor neighbouring parsers beyond the answer switch and the excerpt.
- **Commits**: commit after each phase checkpoint. Phase 3 is one commit, because of the atomicity note.
