---

description: "Task list for 087 Match literal phrases"
---

# Tasks: Match literal phrases

**Input**: Design documents from `specs/087-match-literal-phrases/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/literal-phrase-contract.md](contracts/literal-phrase-contract.md), [quickstart.md](quickstart.md)

**Tests**: Requested. Spec FR-013 and Constitution Principle II require them. Write each story's tests first; rows that prove the fix must fail on the unfixed code. US3's rows exercise the escape rule that US1 already implements, so they pass when written; the quickstart §1 red check proves that they bite.

**Organization**: one phase per user story, in priority order: US1 (P1), US2 (P1), US3 (P2). Row IDs refer to the contract:

- L1–L8: the module rows;
- S1–S9: the `search` handler rows;
- C1–C9: the `context_search` handler rows;
- P1–P3: the surface checks.

**Scope**: `search` (default and `context_lines: true`) and `context_search`. The following stay out of scope: `pattern_search`, `find_and_replace`, `obsidian_exec`, both `schema.ts` and `index.ts` files (descriptions included), `_register-baseline.json`, `src/errors.ts`, `src/cli-adapter/**`, and the ASCII-fold wording drift (research follow-up 1).

**Before any code edit**:

- load the `karpathy-guidelines` skill;
- read `.memory/refactor-decisions.md`. These items apply here:
  - §2: the byte-exact bar for unchanged behaviour;
  - §5: test edits. The only existing-test edits allowed are the two in T009, under the owner's conditional approval (option B, BI-0169);
  - §27(a): the baseline proves surface changes; it must not move here;
  - §46: one rule in one module.

**Before any live call**: read `.memory/test-execution-instructions.md`.

**Run vitest through PowerShell**, not the Bash tool (refactor-decisions, Operational gotchas).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US3 from spec.md

---

## Phase 1: Setup

**Purpose**: a known-green starting point.

- [X] T001 Before any edit, run `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }` in PowerShell on branch `087-match-literal-phrases`. Create `specs/087-match-literal-phrases/post-implement.md`, headed `# Post-implement: 087 Match literal phrases`, and record the result under `## T001 baseline`. A failure here is pre-existing: report it, and do not fix it in this feature.

---

## Phase 2: Foundational

**Purpose**: none needed. The only shared code is `src/tools/search/literal-phrase.ts`. US1 creates it with `literalPhraseQuery`, and US2 adds `oneMatchPerLine` to the same file, so the two stories run in order (see Dependencies).

---

## Phase 3: User Story 1 — A multi-word query matches only the exact phrase (Priority: P1) 🎯 MVP

**Goal**: every text-search mode sends the query to the CLI as one escaped, double-quoted phrase (research D1, data-model E2).

**Independent Test**: S1 and C1 show that the argv carries `query="alpha beta"`, and the contract's live column (quickstart §3) shows that only the exact-phrase note is returned.

### Tests for User Story 1 (write first; they must fail before T006–T008)

- [X] T002 [US1] Create `src/tools/search/literal-phrase.test.ts`.
  - **Header**: `// Original — no upstream. Pure tests for the literal-phrase helpers shared by search and context_search (spec 087): the escaped double-quoted CLI query and the one-entry-per-line reduction.`
  - **Import**: `literalPhraseQuery` from `./literal-phrase.js`.
  - **Rows**:
    - L1: `alpha beta` → `"alpha beta"`.
    - L5: each of ` alpha ` (leading and trailing space), `alpha\tbeta` (a real tab) and `alpha  beta` (two spaces) comes back wrapped, with its whitespace byte-identical. Assert with `toBe` against the expected literal.
  - Use `test.each` for the L5 inputs.
- [X] T003 [P] [US1] Create `src/tools/search/handler.literal-phrase.test.ts`.
  - **Header**: `// Original — no upstream. search handler tests for literal phrase matching (spec 087): the quoted query in both subcommands, one entry per line in line mode, and line-break queries.`
  - **Preamble**: copy the `deps(spawnFn)` helper, `findKv` and the `beforeEach` / `afterEach` `__resetInFlightRegistryForTests` hooks from `src/tools/search/handler.test.ts:18-29`. Import `makeQueuedSpawn` and `silentLogger` from `../_handler-test-fixtures.js`.
  - **Rows** (contract):
    - S1: `{ query: "alpha beta" }`, stub `["n1.md"]`. Assert that `recorded[0].argv` contains `query="alpha beta"`, contains no `query=alpha beta`, and that the result equals `{ count: 1, paths: ["n1.md"] }`.
    - S3: `{ query: " alpha " }`, once in default mode and once with `context_lines: true`, each with stub `"No matches found."`. Assert that each argv contains `query=" alpha "`.
    - S8: `{ query: "alpha", case_sensitive: true, folder: "/P/" }`, stub `["P/a.md"]`. Assert that the argv contains `query="alpha"`, `case=true` and `path=P` (the token form already pinned at `search/handler.test.ts:595`), and that the result equals `{ count: 1, paths: ["P/a.md"] }`.
    - S9: `{ query: "ALPHA BETA" }` with `case_sensitive: true`, then without it, each in default mode and with `context_lines: true`, each with a sentinel stub (four calls). Assert that every argv contains `query="ALPHA BETA"`; that `case=true` is present when the flag is set; and that `argv.find((a) => a.startsWith("case="))` is `undefined` when it is not.
- [X] T004 [P] [US1] Create `src/tools/context_search/handler.literal-phrase.test.ts`.
  - **Header**: `// Original — no upstream. context_search handler tests for literal phrase matching (spec 087): the quoted query, one entry per line, line-break queries, and the unchanged folder probe.`
  - **Preamble**: copy from `src/tools/context_search/handler.test.ts:20-31`. Import `captureRejection`, `makeQueuedSpawn` and `silentLogger` from `../_handler-test-fixtures.js`, and `UpstreamError` from `../../errors.js`.
  - **Rows**:
    - C1: `{ query: "alpha beta" }`, stub one file with line 3. Assert that the argv contains `query="alpha beta"` and that there is one match.
    - C3: `{ query: "alpha " }`, then `{ query: " alpha" }`, each with a sentinel stub. Assert that the argvs contain `query="alpha "` and `query=" alpha"`.
    - C8: `{ query: "alpha beta", folder: "Missing" }`. Stub the sentinel first, then the probe output `Error: Folder "Missing" not found.`, mirroring the existing H7 test (`context_search/handler.test.ts:519`). Assert that the call rejects with `UpstreamError` code `CLI_REPORTED_ERROR` and that the first argv carries `query="alpha beta"`.
    - C9: `{ query: "ALPHA BETA" }` with `case_sensitive: true`, then without it, each with a sentinel stub. Assert `query="ALPHA BETA"` both times, `case=true` only with the flag, and no `case=` token without it.
- [X] T005 [US1] Run `npx vitest run src/tools/search/literal-phrase.test.ts src/tools/search/handler.literal-phrase.test.ts src/tools/context_search/handler.literal-phrase.test.ts`. Expected red: L1 and L5 fail to import (the module is missing), and S1, S3, S8, S9, C1, C3, C8 and C9 fail on the argv assertions. Record the red result in `post-implement.md`.

### Implementation for User Story 1

- [X] T006 [US1] Create `src/tools/search/literal-phrase.ts`.
  - **Header**: `// Original — no upstream. Literal-phrase helpers shared by the search and context_search handlers (spec 087): the CLI reads its query as Obsidian search syntax, so the query is sent as one double-quoted phrase with \ and " escaped (research D1); search:context lists a line once per occurrence, so line-level results keep one entry per line (research D2).`
  - **Export**: `literalPhraseQuery(query: string): string` returns `` `"${query.replace(/[\\"]/g, "\\$&")}"` ``. That is one left-to-right pass: each `\` becomes `\\` and each `"` becomes `\"`; nothing else changes (data-model V1, V2). Add a one-line JSDoc citing research F6.
  - **Imports**: none yet.
- [X] T007 [US1] In `src/tools/search/handler.ts`:
  - import `literalPhraseQuery` from `./literal-phrase.js`;
  - change `query: input.query,` (line 63) to `query: literalPhraseQuery(input.query),`;
  - in the header comment, add one sentence after the first: `The query is sent as one escaped, double-quoted phrase (spec 087, literal-phrase.ts) so the CLI matches it literally in both subcommands.`

  No other line changes. Depends on T006.
- [X] T008 [P] [US1] In `src/tools/context_search/handler.ts`:
  - import `literalPhraseQuery` from `../search/literal-phrase.js`, beside the existing `../search/handler.js` import (the existing one-way context_search → search edge, research F3);
  - change `query: input.query,` (line 58) to `query: literalPhraseQuery(input.query),`;
  - in the header comment's "Pipeline:" sentence, change `assemble parameters (query, …` to `assemble parameters (query as one escaped, double-quoted phrase per spec 087, …`.

  Depends on T006. It can run beside T007 because it is a different file.
- [X] T009 [US1] **Approval-gated edit of existing tests** (owner ruling 2026-11-02, option B, BI-0169; `.memory/refactor-decisions.md` §5).
  1. Run `npx vitest run src/tools/search/handler.test.ts src/tools/context_search/handler.test.ts` unedited.
  2. **If and only if** the failing assertions are exactly `src/tools/search/handler.test.ts:41` and `src/tools/context_search/handler.test.ts:44` (`expect(argv).toContain("query=foo");`), change each of those two lines to `expect(argv).toContain('query="foo"');`. Change nothing else.
  3. If any other existing test fails, **STOP**. Do not edit that test. Record the failure verbatim in `post-implement.md`, and raise it for owner review.
- [X] T010 [US1] Run `npx vitest run src/tools/search src/tools/context_search`. All of L1, L5, S1, S3, S8, S9, C1, C3, C8 and C9 pass, and both existing `handler.test.ts` files pass. Record the result in `post-implement.md`.

**Checkpoint**: multi-word queries are phrase-matched in every mode. Line-level repeats remain until US2.

---

## Phase 4: User Story 2 — Each matching line is returned once (Priority: P1)

**Goal**: both line-level paths keep one entry per `(path, line)`, and return no lines for a query containing a line break (research D2, data-model E4, V4–V7).

**Independent Test**: S4 and C4 show that a line repeated in the wire appears once and that `count` equals the number of distinct lines.

### Tests for User Story 2 (write first; they must fail before T014–T016)

- [X] T011 [US2] Append to `src/tools/search/literal-phrase.test.ts`, and import `oneMatchPerLine`:
  - **L7**: wire `[{ file: "a.md", matches: lines [1, 1, 2, 1, 3] }]`, where each entry's text is `t<line>`. Expect the matches for lines `[1, 2, 3]`, each the first entry for its line. Also assert that the input array is unchanged (deep-equal to a `structuredClone` taken before the call; data-model V6).
  - **L8**: the same wire with the query `a\nb`, then with `a\rb`. Expect every file's `matches` to be `[]`, with the file entries kept.
- [X] T012 [P] [US2] Append to `src/tools/search/handler.literal-phrase.test.ts`:
  - **S4**: `{ query: "alpha beta", context_lines: true }`, wire one file with lines `[1, 1, 2]`. Expect `count: 2` and lines `[1, 2]`.
  - **S5**: `limit: 2`, lines `[1, 1, 1, 2]`. Expect `count: 2` and `truncated: true`.
  - **S6**: `limit: 3`, lines `[1, 1, 1, 2]`. Expect `count: 2` and no `truncated` key (`Object.hasOwn(r, "truncated") === false`).
  - **S7**: `{ query: "end alpha\nbeta start", context_lines: true }`, wire `[{ file: "a.md", matches: [{ line: 1, text: "end alpha" }] }]`. Expect `{ count: 0, matches: [] }`. Then, in default mode with stub `["a.md"]`, expect `{ count: 1, paths: ["a.md"] }`.
- [X] T013 [P] [US2] Append to `src/tools/context_search/handler.literal-phrase.test.ts`:
  - **C4**: wire `a.md` with lines `[2, 2, 5]` and `b.md` with lines `[1, 1]`. Expect `count: 3` and matches `a.md:2`, `a.md:5`, `b.md:1`.
  - **C5**: `limit: 2`, wire `a.md` with lines `[1, 1, 1]` and `b.md` with line `[1]`. Expect `count: 2` and `truncated: true`.
  - **C6**: wire one file with line 1 twice, text `"x\r"`. Expect one match with text `x`.
  - **C7**: `{ query: "a\nb", folder: "Projects" }`, wire one file with line 1. Expect `{ count: 0, matches: [] }` and `getCount() === 1` (no folder probe).
- [X] T014 [US2] Run `npx vitest run src/tools/search/literal-phrase.test.ts src/tools/search/handler.literal-phrase.test.ts src/tools/context_search/handler.literal-phrase.test.ts`. Expected red: L7 and L8 fail (no export); S4–S7 and C4, C5, C6 and C7 fail on repeated or line-break rows. C6 fails on its count. Record the result in `post-implement.md`.

### Implementation for User Story 2

- [X] T015 [US2] In `src/tools/search/literal-phrase.ts`:
  - add `import type { SearchContextWireFile } from "./schema.js";`;
  - export `oneMatchPerLine(query: string, wire: SearchContextWireFile[]): SearchContextWireFile[]`. It returns a new array: when `/[\r\n]/.test(query)`, each file becomes `{ ...f, matches: [] }`; otherwise each file becomes `{ ...f, matches: <first entry per line, in wire order> }`, using a `Set<number>` of seen lines. Do not mutate the input (data-model V4–V6).
  - Add a one-line JSDoc citing research F6 and F8.

  Depends on T006.
- [X] T016 [US2] In `src/tools/search/handler.ts`, line-mode branch:
  - change `const mdOnly = wire.filter(...)` so its result feeds `oneMatchPerLine(input.query, …)`, for example `const mdOnly = oneMatchPerLine(input.query, wire.filter((f) => f.file.toLowerCase().endsWith(".md")));`. Flatten, truncation, sort and slice stay as they are;
  - add `oneMatchPerLine` to the `./literal-phrase.js` import;
  - in the header comment's "Line-mode pipeline:" sentence, insert `keep one entry per line (none for a line-break query; spec 087),` after `file-level \`.md\` filter,`.

  Depends on T015.
- [X] T017 [P] [US2] In `src/tools/context_search/handler.ts`:
  - apply the same change to `const mdOnly = wire.filter(...)` (line 127);
  - add `oneMatchPerLine` to the `../search/literal-phrase.js` import;
  - in the header comment, change `Flatten file-grouped wire to per-line rows` to `Keep one entry per line (none for a line-break query; spec 087), flatten file-grouped wire to per-line rows`.

  Depends on T015. It can run beside T016 because it is a different file.
- [X] T018 [US2] Run `npx vitest run src/tools/search src/tools/context_search`. All rows so far pass. Both existing `handler.test.ts` files must pass with no edits beyond T009's two lines. If any other existing test now fails, apply T009 step 3 (STOP and raise it). Record the result in `post-implement.md`.

**Checkpoint**: US1 and US2 together satisfy the reported defect: no false phrase matches, and no repeated lines.

---

## Phase 5: User Story 3 — Search-syntax characters are matched as text (Priority: P2)

**Goal**: pin that every character group of FR-003 reaches the CLI as literal text inside the quoted phrase.

**Independent Test**: L2–L4, L6, S2 and C2 assert the exact escaped argv; quickstart §3 shows the live results.

- [X] T019 [US3] Append to `src/tools/search/literal-phrase.test.ts`:
  - **L2**: `say "hello" twice` → `"say \"hello\" twice"`.
  - **L3**: `a\b` → `"a\\b"`.
  - **L4**: `a\"b` → `"a\\\"b"`.
  - **L6**: `test.each` over `-draft`, `cats OR dogs`, `cats AND dogs`, `tag:urgent`, `file:Plan`, `/usr/bin/`, `[status]`, `(see note)` and `a*b`, each expecting `` `"${input}"` `` (no characters rewritten).

  Write the expected values as JS string literals and check them against the contract by eye: for L3, the 6 characters `"a\\b"`.
- [X] T020 [P] [US3] Append to `src/tools/search/handler.literal-phrase.test.ts`:
  - **S2**: query text `say "hi" a\b` (JS `'say "hi" a\\b'`), once in default mode and once with `context_lines: true`, each with a sentinel stub. Assert that each argv contains `query="say \"hi\" a\\b"` (JS `'query="say \\"hi\\" a\\\\b"'`) and that each result is the empty envelope.
- [X] T021 [P] [US3] Append to `src/tools/context_search/handler.literal-phrase.test.ts`:
  - **C2**: query text `"hello" -x tag:y /z/ [p] (q) a*b c\d`, sentinel stub. Assert that the argv contains `query=` + `literalPhraseQuery(text)`, computed independently as the literal `"\"hello\" -x tag:y /z/ [p] (q) a*b c\\d"`, and that the result is `{ count: 0, matches: [] }`.
- [X] T022 [US3] Run `npx vitest run src/tools/search src/tools/context_search`. Everything passes. Record the result in `post-implement.md`.

**Checkpoint**: all three stories are complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T023 [P] Update `docs/tools/search.md` with the contract's "Help-page text":
  - append the literal-phrase paragraph to the `query` bullet (line 50);
  - append `Each matching line appears once, however many times the phrase occurs in it.` to the `matches` row of the output table (line 96);
  - append `The file name or metadata must contain the whole phrase.` to the *Filename-match inflation* paragraph (line 228).

  Change nothing else. The ASCII-fold lines stay (research D7).
- [X] T024 [P] Update `docs/tools/context_search.md`:
  - append the literal-phrase paragraph to the `query` bullet (line 44);
  - append `Each matching line appears once, however many times the phrase occurs in it.` to the `matches` row of the output table (line 75).

  Change nothing else.
- [X] T025 [P] Update `CHANGELOG.md` `[Unreleased]`:
  - add `Spec 087-match-literal-phrases (BI-0169).` on its own paragraph after the `Spec 086-fix-section-replacement (BI-0168).` line;
  - append this bullet to `### Fixed`: `- **\`search\` and \`context_search\` match the whole query as one literal phrase** (spec 087). A query with spaces no longer matches notes that contain its words separately or in another order, and characters that mean something in Obsidian's search syntax (\`"\`, a leading \`-\`, \`OR\`, parentheses, square brackets, \`tag:\` / \`path:\` / \`file:\` prefixes, \`/…/\`, \`*\`, \`\\\`) are matched as text, with nothing to escape. Line-level results (\`context_search\`, and \`search\` with \`context_lines: true\`) list each matching line once, so \`count\` and \`truncated\` count lines, not occurrences; a query containing a line break returns no lines there. File-name matching, case handling and folder scoping are unchanged.`
- [X] T026 Run quickstart §1 in full: `npx vitest run src/tools/search src/tools/context_search`, then `npm test` (coverage floor and FR-018 baseline gate), `npm run typecheck` and `npm run lint`.
  - Then run the two-step red check:
    1. Temporarily set `query: input.query` in both handlers. S1–S3, S8, S9, C1–C3, C8 and C9 must fail.
    2. Restore it, then temporarily bypass `oneMatchPerLine` in both handlers. S4–S7, C4, C5 and C7 must fail.
  - Restore both changes and re-run to green.
  - Check the 1000-line gate with `[System.IO.File]::ReadAllLines(p).Length` on every new or edited test file.
  - Record everything in `post-implement.md`.
- [X] T027 Run quickstart §2: `git diff --stat main -- src/tools/_register-baseline.json src/tools/search/schema.ts src/tools/context_search/schema.ts src/tools/search/index.ts src/tools/context_search/index.ts src/errors.ts` must print nothing (contract P1, P2). Do NOT run `npm run baseline:write`. Record the result in `post-implement.md`.
- [X] T028 Post-implement structural verification (CLAUDE.md, plan "CodeGraph structural check"). Run `codegraph sync`, then `codegraph_explore "literalPhraseQuery oneMatchPerLine executeSearch executeContextSearch"`, and confirm the plan's four checks:
  1. no new error class or code, and no new `UpstreamError` construction in either handler;
  2. no `createLogger` / `createQueue` import in either handler;
  3. `literal-phrase.ts` imports only `./schema.js` (type), and its importers are exactly the two handlers and its test;
  4. both exports have production callers.

  Record the findings, and any deviation with its rationale, in `post-implement.md`.
- [X] T029 **Required** (research D6, amended by owner ruling 2026-11-02, option A, BI-0169): the work is not complete until this passes. Run quickstart §3, the live check against the built server (`npm run build`, then `node dist/index.js` through an MCP client) in `TestVault-Obsidian-CLI-MCP` `Sandbox/087-live-<timestamp>/`, following `.memory/test-execution-instructions.md`. Create the fixtures through `app.vault.create` (research, indexing gotcha), compare with the contract's live column, then clean up. Report the cases attempted, passed and failed, with verbatim output for any failure, in `post-implement.md`. This check is the proof of SC-001, SC-003 and SC-006 and of the matching half of FR-013(a); T026's automated rows prove only the query sent. If any case fails, the work stays incomplete: record the failure verbatim and fix it, or raise it for owner review.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: first; no dependency.
- **Foundational**: empty.
- **US1 (T002–T010)**: after T001.
- **US2 (T011–T018)**: after US1. T015 extends the file T006 creates, and T016 and T017 edit the lines T007 and T008 just changed.
- **US3 (T019–T022)**: after US1, because it exercises `literalPhraseQuery`. It is independent of US2 and can run before or after it, but not at the same time, because it appends to the same three test files.
- **Polish (T023–T029)**: T023, T024 and T025 can start any time after T010. T026, T027 and T028 run after every story; T029 runs last.

### Structural dependencies (CodeGraph, tasks phase)

`codegraph_explore "executeContextSearch stripBoundarySlashes searchContextWireSchema executeSearch"` confirms that `context_search/handler.ts` already depends on `search/handler.ts` (`stripBoundarySlashes`) and on `search/schema.ts` (`searchContextWireSchema`), and that `pattern_search/handler.ts` also imports `stripBoundarySlashes`. The new `literal-phrase.ts` adds edges only in the same context_search → search direction, so:

- T008 and T017 depend on T006 and T015 (the module) but not on T007 or T016;
- `pattern_search` is untouched, because it imports `search/handler.ts` only for `stripBoundarySlashes`, which no task edits;
- T016 and T017 must not move `oneMatchPerLine` into `search/handler.ts`. Placing it there would make context_search pull in more of the search handler than the shared helpers (research D3).

### Within Each User Story

- Tests are written first and fail (T005, T014). US3 is the noted exception, covered by T026's red check.
- The module comes before the handlers, and the handlers before the full-suite run.

### Parallel Opportunities

- T003 and T004: different new test files.
- T007 and T008, then T016 and T017: different handler files, after the module task.
- T012 and T013, then T020 and T021: different test files.
- T023, T024 and T025: different docs.

---

## Parallel Example: User Story 1

```text
# After T002, write both handler test files together:
Task: "T003 search/handler.literal-phrase.test.ts rows S1, S3, S8, S9"
Task: "T004 context_search/handler.literal-phrase.test.ts rows C1, C3, C8, C9"

# After T006, wire both handlers together:
Task: "T007 search/handler.ts query = literalPhraseQuery(input.query)"
Task: "T008 context_search/handler.ts query = literalPhraseQuery(input.query)"
```

---

## Implementation Strategy

### MVP first (User Story 1)

T001 → T002–T010. Multi-word queries are then phrase-matched in every mode, and every search-syntax character is already escaped. Stop and validate with T010.

### Incremental delivery

1. US1, the MVP: no false phrase matches.
2. US2: no repeated lines, so `count` and `truncated` are accurate.
3. US3: the literal-character rows pin the escape rule.
4. Polish: help pages, CHANGELOG, the full gate with the red check, the surface gate, structural verification, and the required live check (T029), which must pass before the work is marked complete.

---

## Notes

- The only edits to existing tests are T009's two lines, under the owner's conditional approval (option B). Any other existing-test failure stops the work for owner review.
- Do not regenerate `_register-baseline.json`. If the FR-018 gate fails, the published surface changed, which is a defect against FR-011.
- Do not touch the case-fold wording anywhere (research D7); it is a follow-up.
- Commit after each phase. The PR lifecycle continues with `/speckit-git-commit`, a PR, `/code-review` and `/speckit-docs-as-code <n>`.
