---

description: "Task list for 085 Stabilise query ordering"
---

# Tasks: Stabilise query ordering

**Input**: Design documents from `specs/085-stabilise-query-ordering/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ordering-contract.md](contracts/ordering-contract.md), [quickstart.md](quickstart.md)

**Tests**: Requested. FR-010 and Constitution Principle II require tests for the behaviour change in both tools. Write each story's tests first and confirm they fail against the unfixed templates before the implementation tasks.

**Organization**: one phase per user story, in the spec's priority order. Row IDs (T1–T15, S1–S5) refer to the contract. Task IDs are written `T0nn`, so they cannot be mistaken for contract rows.

**Scope**: `smart_connections_query` and `smart_connections_similar`. The latter is in scope only for the shared slice-before-sort step (spec Clarifications, analysis remediation). No change to scoring, to the default or maximum `limit`, or to `smart_connections_similar`'s target resolution, self-exclusion, lifecycle checks or errors.

**Before any code edit**:
- load the `karpathy-guidelines` skill;
- read `.memory/refactor-decisions.md`. §2 (byte-exact preservation bar), §3 (test doubles couple only to the public surface) and §31 (template logic is pinned by `node:vm` tests) apply here.

**Before any live call**: read `.memory/test-execution-instructions.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: which user story the task belongs to (US1, US2)

---

## Phase 1: Setup

**Purpose**: a known-green starting point.

- [X] T001 Before any edit, run `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }` in PowerShell on branch `085-stabilise-query-ordering` and record the result in `specs/085-stabilise-query-ordering/post-implement.md`. Create that file, headed `# Post-implement: 085 Stabilise query ordering`. A failure here is pre-existing: report it, do not fix it in this feature.

---

## Phase 2: Foundational (blocks US1 and US2)

**Purpose**: one source of truth for "100" per tool (research D1, D5; data-model "Constant").

- [X] T002 [P] In `src/tools/smart_connections_query/schema.ts`:
  - add `export const MAX_LIMIT = 100;` next to `MAX_QUERY_LENGTH`, with a one-line comment: it is the `limit` maximum and the number of candidates the eval template always asks the plugin for (spec 085 FR-002);
  - replace `.max(100)` on `limit` with `.max(MAX_LIMIT)`;
  - leave the `.describe("Maximum number of matches to return, integer 1..100. Default 20.")` string byte-identical;
  - extend the header comment with one clause: `MAX_LIMIT` is shared with `_template.ts` (spec 085).
- [X] T003 [P] In `src/tools/smart_connections_similar/schema.ts`, make the same change, using this tool's own constant (no import from `smart_connections_query`, per Principle I):
  - add `export const MAX_LIMIT = 100;` above `smartConnectionsSimilarInputSchema`, with the same one-line comment;
  - replace `.max(100)` with `.max(MAX_LIMIT)`;
  - leave the `.describe(...)` string byte-identical;
  - extend the header comment the same way.
- [X] T004 Run `npx vitest run src/tools/smart_connections_query/schema.test.ts src/tools/smart_connections_similar/schema.test.ts src/tools/_register.test.ts` with no `baseline:write`. All must pass unedited: this proves neither `schemaFingerprint` moved (contract S3, data-model V6).

**Checkpoint**: both `MAX_LIMIT` constants exist, and the published surface has not moved.

---

## Phase 3: User Story 1 — A smaller limit returns a leading slice of a larger one (Priority: P1) 🎯 MVP

**Goal**: for limits N < M, page(N) = page(M)[0..N) in both tools, because the plugin is always asked for `MAX_LIMIT` candidates, then filtered, sorted and cut to `limit`. Covers FR-001 to FR-003, FR-005 to FR-009, and FR-010 (a) and (c).

**Independent Test**: `npx vitest run src/tools/smart_connections_query src/tools/smart_connections_similar` passes rows T1, T2, T5, T6, T8, T9, T10, T11, T13, T14 and T15, plus S1, S2, S4 and S5.

### Tests for User Story 1 (write first; T1, T2, T5, T10, T11 and T13 must fail before T008/T009)

- [X] T005 [P] [US1] Create `src/tools/smart_connections_query/_template.test.ts`, following `src/tools/links/_template.test.ts`.

  **Header**: `// Original — no upstream. Template-execution tests for the smart_connections_query eval template (spec 085): renders JS_TEMPLATE through composeEvalCode and runs it under node:vm against a stub Smart Connections plugin whose lookup records its request, returns its fixture in plugin order and truncates it to filter.limit, checking the leading-slice, tie-break, fixed-request, count, non-finite and pass-through rows of contracts/ordering-contract.md.`

  **Harness**:
  - Function `runTemplate(fixture, { limit, total = false })`. It builds `code = composeEvalCode(JS_TEMPLATE, { query: "q", limit, total })` and a stub `app`:
    - `vault.getName()` returns `"Demo"`;
    - `plugins.plugins['smart-connections'].env.smart_sources.lookup` is `async (req) => { requests.push(req); return fixture.slice(0, req.filter.limit); }`.
  - Fixture items have the shape `{ key: "<path>#<h1>#<h2>" | "<path>", score }`.
  - The function `await`s `runInNewContext(code, { TextDecoder, Uint8Array, atob, app })` and returns the parsed envelope plus `requests`.
  - Import `MAX_LIMIT` from `./schema.js` and `composeEvalCode` from `../_shared.js`.

  **US1 rows**:
  - **T1**: plugin order `[{key:"Z.md",score:0.9},{key:"A.md",score:0.9},{key:"M.md",score:0.5}]`. `limit: 1` → `[{path:"A.md",headingPath:[],score:0.9}]`. `limit: 2` → `A.md`, then `Z.md`. Assert page(1) deep-equals page(2).slice(0,1).
  - **T2**: a deterministic 150-candidate fixture:
    - score clusters, for example 15 scores × 10 keys;
    - several paths, some with `#heading` segments;
    - each tied group in reverse documented order (a seeded shuffle is acceptable).

    Compute pages for limits 1..100 once. Then assert, for **every** pair N < M in 1..100 (4,950 pairs, no sampling), that page(N) deep-equals page(M).slice(0,N).
  - **T5**: for `limit` 1, 20 and 100, every recorded request has `filter.limit === MAX_LIMIT`, `hypotheticals` deep-equal to `["q"]`, and `collection === "smart_blocks"`.
  - **T6**: with the T2 fixture at `limit` 7 and at `limit` 100, `count` is equal for `total: true` and `total: false`, and `matches` is `[]` when `total: true`.
  - **T8**: 5 finite candidates at `limit: 100` → all 5 come back, in documented order, with `count: 5`.
  - **T9**: for the T2 fixture at `limit: 100`, each returned `score` is `===` the fixture score for its key: `path` + (`headingPath.length` ? `"#" + headingPath.join("#")` : `""`).
- [X] T006 [P] [US1] Create `src/tools/smart_connections_similar/_template.test.ts` on the same pattern.

  **Header**: `// Original — no upstream. Template-execution tests for the smart_connections_similar eval template (spec 085): renders JS_TEMPLATE through composeEvalCode and runs it under node:vm against a stub source note whose find_connections records its request, returns its fixture in plugin order and truncates it to limit, checking the leading-slice, tie-break, fixed-request, count, self-exclusion, non-finite and pass-through rows of contracts/ordering-contract.md.`

  **Harness**:
  - Function `runTemplate(fixture, { limit, total = false })`. It builds `code = composeEvalCode(JS_TEMPLATE, { active: false, path: "Src.md", file: null, limit, total })` and a stub `app`:
    - `vault.getName()` returns `"Demo"`;
    - `vault.getAbstractFileByPath(p)` returns `{ path: p, extension: "md" }` for `"Src.md"`;
    - `plugins.plugins['smart-connections'].env.smart_sources.items` is `{ "Src.md": { find_connections: async (opts) => { requests.push(opts); return fixture.slice(0, opts.limit); } } }`.
  - Fixture items have the shape `{ item: { key }, score }`.
  - The function runs the code like T005 and returns the parsed envelope plus `requests`.
  - Import `MAX_LIMIT` from `./schema.js`.

  **US1 rows**:
  - **T10**: plugin order `Z.md` 0.9, `A.md` 0.9, `M.md` 0.5. `limit: 1` → `[A.md]`; `limit: 2` → `[A.md, Z.md]`; page(1) = page(2)[0..1).
  - **T11**: a 150-candidate fixture with clustered ties out of path order, plus three `Src.md` / `Src.md#…` entries scattered among the top 100. For **every** N < M in 1..100, page(N) = page(M).slice(0,N), and no returned `path` is `"Src.md"`.
  - **T13**: for `limit` 1, 20 and 100, every recorded request has `limit === MAX_LIMIT`.
  - **T14**: the T11 fixture at `limit` 7 and 100: `count` is equal for `total: true` and `false`, and `matches` is `[]` with `total: true`.
  - **T15**: a fixture with `NaN`, `null`, a missing score and `Infinity` among finite scores. The non-finite entries are absent, and each returned `score` is `===` the fixture's.
- [X] T007 [US1] Run `npx vitest run src/tools/smart_connections_query/_template.test.ts src/tools/smart_connections_similar/_template.test.ts` against the **unfixed** templates. T1, T2, T5, T10, T11 and T13 must fail; the other rows may pass. Record the failing rows and their assertion messages in `post-implement.md` as the red proof.

### Implementation for User Story 1

- [X] T008 [P] [US1] In `src/tools/smart_connections_query/_template.ts`:
  - import `MAX_LIMIT` from `./schema.js`;
  - change `filter:{limit:a.limit}` to `filter:{limit:${MAX_LIMIT}}`;
  - leave every other template line byte-identical, including the sort and `.slice(0,a.limit)`;
  - update the header comment:
    - the lookup example now reads `filter:{limit:MAX_LIMIT}`;
    - Stage 3 asks the plugin for a fixed `MAX_LIMIT` candidates whatever the agent's `limit` (spec 085 FR-002);
    - Stage 6 is now the only cut to `a.limit`, applied after the full sort, so a smaller limit is a leading slice of a larger one.
- [X] T009 [P] [US1] In `src/tools/smart_connections_similar/_template.ts`:
  - import `MAX_LIMIT` from `./schema.js`;
  - change `src.find_connections({limit:a.limit})` to `src.find_connections({limit:${MAX_LIMIT}})`;
  - leave every other template line byte-identical, including the map, both filters, the sort and `.slice(0,a.limit)`;
  - update the header comment:
    - the API example now reads `find_connections({limit:MAX_LIMIT})`;
    - Stage 6 asks for a fixed `MAX_LIMIT` candidates (spec 085 FR-002);
    - replace the sentence "Slice to a.limit applied after transforms in case the plugin's internal cap exceeds the request limit." with: the slice to `a.limit` is the only cut, applied after the filters and the full sort, so a smaller limit is a leading slice of a larger one.
- [X] T010 [US1] Run `npx vitest run src/tools/smart_connections_query src/tools/smart_connections_similar`. The US1 rows of both `_template.test.ts` files must pass. Each tool's `handler.test.ts`, `index.test.ts` and `schema.test.ts` must pass unedited: each handler test re-renders `JS_TEMPLATE` itself.

### Published guarantee for User Story 1 (FR-009)

- [X] T011 [P] [US1] In `src/tools/smart_connections_query/index.test.ts`, add two new `it` cases. Do not edit any existing assertion.
  - **S1**, in the descriptor `describe`: `expect(SMART_CONNECTIONS_QUERY_DESCRIPTION).toContain("leading slice")`.
  - **S2**, in the docs `describe`: the body matches `/applied after (this|the) sort/` and `/leading slice/`, and contains `/100-candidate edge/i`.

  Both must fail now.
- [X] T012 [P] [US1] In `src/tools/smart_connections_similar/index.test.ts`, add two new `it` cases. Do not edit any existing assertion.
  - **S4**, in the descriptor `describe`: `expect(SMART_CONNECTIONS_SIMILAR_DESCRIPTION).toContain("leading slice")`. Import the constant from `./index.js` if it is not imported already.
  - **S5**, in the docs `describe`: the body matches `/applied after (this|the) sort/`, `/leading slice/` and `/100-candidate edge/i`, and `not.toMatch(/Mirrors the plugin's `find_connections\(\{limit\}\)` parameter/)`.

  Both must fail now.
- [X] T013 [P] [US1] In `src/tools/smart_connections_query/index.ts` (`SMART_CONNECTIONS_QUERY_DESCRIPTION`), append exactly one sentence after the sentence ending `tertiary headingPath.join('#') byte-ascending.` (same paragraph): `` `limit` is applied after this sort, to a fixed list of up to 100 candidates, so a smaller limit always returns a leading slice of a larger one.`` Change nothing else in the description. Extend the header comment with one clause: spec 085 leading-slice guarantee.
- [X] T014 [P] [US1] In `src/tools/smart_connections_similar/index.ts` (`SMART_CONNECTIONS_SIMILAR_DESCRIPTION`), append exactly one sentence at the end of the "Sort order:" paragraph, after `…from the result list.`: `limit is applied after this sort and these filters, to a fixed list of up to 100 plugin candidates, so a smaller limit always returns a leading slice of a larger one.` The sentence has no backticks, matching that description's style. Change nothing else. Extend the header comment with the same clause.
- [X] T015 [P] [US1] In `docs/tools/smart_connections_query.md`:
  - under the `Sort order:` line (around line 73), add: `` `limit` is applied after this sort, to a fixed list of up to 100 candidates the plugin returns, so a smaller `limit` always returns a leading slice of a larger one: the same entries, in the same order. ``
  - under `## Inherited limitations`, add item 9: `**Ties at the 100-candidate edge** — the wrapper asks the plugin for 100 candidates on every call, whatever \`limit\` is. If several matches share the score of the plugin's 100th candidate, the plugin decides which of them are in that list; the documented tie-break orders only the ones it returned. This does not depend on \`limit\`, so smaller limits are still leading slices of larger ones.`
- [X] T016 [P] [US1] In `docs/tools/smart_connections_similar.md`:
  - **`limit` bullet** (line 79, under "Per-field policy"): replace it with `- **\`limit\`** — caps the matches list length AND the count. The wrapper always asks the plugin's \`find_connections\` for 100 candidates, whatever \`limit\` is; \`limit\` is applied after the filters and the sort below, so a smaller \`limit\` always returns a leading slice of a larger one: the same entries, in the same order.`
  - **"Documented inherited limitations"**: add a subsection before "### Multi-vault basename ambiguity", headed `### Ties at the 100-candidate edge`, with the same body as the `smart_connections_query` item 9. Add one sentence: the source note's own blocks are removed after the 100-candidate fetch, so a call can return fewer than `limit` matches even when the plugin has more; this is the same at every `limit`.
- [X] T017 [US1] Regenerate the baseline. This depends on T013 and T014, through the structural path `fingerprintLiveRegistry` → `createServer()` → `create*Tool` → `*_DESCRIPTION`.
  1. Run `npm run baseline:write`.
  2. Run `git diff src/tools/_register-baseline.json`.
  3. Confirm (contract S3) that the only fingerprint changes are the `descriptionFingerprint` of `smart_connections_query` and of `smart_connections_similar`.
  4. Accept a change to `generatedFromBranch` / `generatedAt`: it is expected metadata, not a failure.
  5. Record the diff summary in `post-implement.md`.

  If any other fingerprint moved, stop and find out why before going on.
- [X] T018 [US1] Run `npx vitest run src/tools/smart_connections_query src/tools/smart_connections_similar src/tools/_register.test.ts src/tools/_surface.test.ts`. All must pass, S1, S2, S4 and S5 included.

**Checkpoint**: US1 is complete for both tools. A smaller limit is a leading slice, and the descriptions and help pages say so.

---

## Phase 4: User Story 2 — Equal-relevance results follow the documented tie-break (Priority: P2)

**Goal**: in both tools, equal-score matches come back in path order, then heading-path order, at every limit, including limits that cut through a tied group, and a repeated call gives the same list. Covers FR-004, FR-008 and FR-010 (b), and SC-002.

**Independent Test**: rows T3, T4, T7 and T12 pass.

### Tests for User Story 2

- [X] T019 [US2] Add the US2 rows to `src/tools/smart_connections_query/_template.test.ts`. It is the same file as T005, so this task is not [P] with that one.
  - **T3**: `[{key:"N.md#c",score:0.8},{key:"N.md#a",score:0.8},{key:"N.md#b",score:0.8}]` → `headingPath` order `["a"]`, `["b"]`, `["c"]`.
  - **T4**: fixture of
    - two leaders (0.99, 0.98);
    - a tied group of 5 at 0.7 in reverse path order (`E.md`, `D.md`, `C.md`, `B.md`, `A.md`);
    - three tail entries below 0.7.

    At `limit: 4`, ranks 3–4 are `A.md` and `B.md`. Run it a second time with the same input and assert the two results deep-equal (US2 AS3, SC-002).
  - **T7**: mix finite scores with `NaN`, `null`, a missing `score` and `Infinity`. The non-finite entries are absent, and the finite ones obey V1 (leading slice between `limit` 2 and 10) and V2 (tie order).
- [X] T020 [P] [US2] Add row **T12** to `src/tools/smart_connections_similar/_template.test.ts` (a different file from T019). Fixture: two leaders, a tied group of 5 at 0.7 in reverse path order (`{ item: { key: "E.md" } }` … `A.md`), and a tail. At `limit: 4`, ranks 3–4 are `A.md` and `B.md`.
- [X] T021 [US2] Red check for both tools:
  1. Temporarily revert T008 (`filter:{limit:a.limit}`) and T009 (`find_connections({limit:a.limit})`).
  2. Run both `_template.test.ts` files. T4 and T12 must fail, alongside T1, T2, T5, T10, T11 and T13. T3 and T7 may pass.
  3. Restore both changes.
  4. Re-run: all rows pass.

  Record both runs in `post-implement.md`. Confirm with `git diff src/tools/smart_connections_query/_template.ts src/tools/smart_connections_similar/_template.ts` that the restore is exact.

**Checkpoint**: US1 and US2 hold for both tools, and every contract row T1–T15 passes.

---

## Phase 5: Polish & Cross-Cutting

- [X] T022 [P] In `CHANGELOG.md` under `## [Unreleased]`:
  - add the line `Spec 085-stabilise-query-ordering.` after the existing spec lines;
  - add a `### Fixed` entry (create the subsection if it is missing, in Keep a Changelog order): `smart_connections_query` and `smart_connections_similar`: the result `limit` is now applied after the documented score / path / headingPath ordering, to a fixed list of up to 100 plugin candidates, so a smaller limit always returns a leading slice of a larger one and equal-score results no longer depend on the limit.
- [X] T023 Full gate: `npm run typecheck; if ($?) { npm run lint }; if ($?) { npm run format:check }; if ($?) { npm test }`. Compare with T001. Any new failure blocks completion.
- [X] T024 Post-implement structural verification (`CLAUDE.md` § Code index). Run `codegraph sync`, then `codegraph_explore "MAX_LIMIT JS_TEMPLATE smartConnectionsQueryInputSchema smartConnectionsSimilarInputSchema executeSmartConnectionsQuery executeSmartConnectionsSimilar"`. Verify and record in `post-implement.md`:
  1. no new error class or code, and `src/errors.ts` is unchanged;
  2. no handler imports `createLogger` / `createQueue`, and `src/server.ts` is unchanged;
  3. each `_template.ts` imports only `../_shared.js` and its own `./schema.js`, neither `schema.ts` imports its template, and there is no tool → tool edge;
  4. each `MAX_LIMIT` has production callers: its `schema.ts`, and its `_template.ts`, which is reached from its handler.

  Also confirm the kernel-node no-touch claim: `createServer()`, `createLogger()`, `createQueue()` and `UpstreamError` are not edited.
- [X] T025 SC-005 record (mandatory) and live check (optional; quickstart §3). Read `.memory/test-execution-instructions.md` first.
  - **If** a vault with Smart Connections indexed is available: run the read-only calls of both tools at `limit` 1, 2, 20 and 100, confirm the leading-slice property, and note whether every call returned within the timeout.
  - **Otherwise**: record in `post-implement.md` "SC-005 unverified live: no Smart Connections vault available". Cite the fallback evidence from spec SC-005: `limit: 100` is already an allowed input for both tools, so the 100-candidate request is a size both already make, and the transport payload is still cut to `limit`.

  Never write to any vault in this task.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: first.
- **Foundational (T002–T004)**: after T001. T002 and T003 run in parallel. They block US1 and US2, because `MAX_LIMIT` is imported by the templates and the tests.
- **US1 (T005–T018)**: after Phase 2.
- **US2 (T019–T021)**: after T008 and T009 (the fixes), and after T005 and T006 (the harnesses, same files). T021's red check needs both fixes in place in order to revert them.
- **Polish (T022–T025)**: T022 can run any time after Phase 2. T023–T025 run after US1 and US2.

### Within each story

- Tests before implementation: T005/T006 → T007 (red) → T008/T009 → T010.
- Published text: T011/T012 → T013–T016 → T017 → T018.
- T013 and T014 → T017: the baseline fingerprints the registered descriptions.
- T005 and T019 edit the same file, and so do T006 and T020: run each pair one after the other.

### Cross-module notes (from the CodeGraph pair check)

- `JS_TEMPLATE` ↔ `*InputSchema`: within each tool, the template and the schema share `MAX_LIMIT` after T008/T009. T002/T003 must land first.
- `*_DESCRIPTION` ↔ `fingerprintLiveRegistry`: the baseline reads both descriptions through `createServer()`, so T017 follows T013 and T014.
- The two tools share the comparator text but have no import edge between them, and none is added.

## Parallel Example

```text
# Phase 2:
T002 query schema.ts      [P]
T003 similar schema.ts    [P]
# US1 tests:
T005 query _template.test.ts     [P]
T006 similar _template.test.ts   [P]
# US1 fixes:
T008 query _template.ts   [P]
T009 similar _template.ts [P]
# US1 published text (after T010):
T011 T012 T013 T014 T015 T016 T022   [P]
# then T017 (baseline) → T018
```

## Implementation Strategy

### MVP first (US1)

T001 → T002–T004 → T005–T018. This ships the fix for both tools and the published guarantee. US2 adds the explicit tie-break and repeat-call proofs; the fix itself lands in T008 and T009.

### Incremental delivery

1. Foundation (`MAX_LIMIT` per tool).
2. US1: fixed request + slice proof + published text + baseline.
3. US2: tie-break rows, repeat-call row and the red check.
4. Polish: CHANGELOG, full gate, structural verification, SC-005 record.

## Notes

- **Amendment (PR #116 code-quality review, 2026-11-02)**: `MAX_LIMIT` now lives in `src/tools/_smart-connections.ts` with the shared `SORT_SLICE_AND_EMIT` tail; T002, T003, T005, T006, T008 and T009 import it from there instead of `./schema.js`. The two `_template.test.ts` files share `runEvalTemplate` (`_eval-template-fixtures.ts`, also used by the links and create_base template tests) and the ordering oracle (`_smart-connections-fixtures.ts`). T2 and T11 assert page(N) = page(100)[0..N) for every N in 1..99. That implies page(N) = page(M)[0..N) for all 4,950 pairs N < M (both sides are the first N entries of page(100)), so SC-001 is still proven for every pair, in 99 comparisons instead of 4,950.

- Task IDs use `T0nn`; contract rows use `T1`–`T15` and `S1`–`S5`.
- No existing test assertion is edited (plan, Test-edit scope). Only new cases and two new files are added.
- Handlers, payloads and `src/cli-adapter/**` are not edited.
- CodeGraph task-pair rule: the tasks cross `schema.ts`, `_template.ts` and `index.ts` in two tool directories, plus the baseline generator. The pair queries were run (see Cross-module notes), and the dependencies they surfaced are in the task graph.
- Analysis remediation applied:
  - I1: baseline metadata is expected (T017, contract S3, quickstart §2).
  - U1: SC-005 has a mandatory record (T025).
  - I2: every pair, not a sample (T005, T006, contract T2/T11).
  - C1: repeat-call row (T019, T4).
  - D1: FR-001 and FR-003 are kept as mechanism and property, with no change.
  - Scope: `smart_connections_similar` was added under the BI-0167 exception.
- `.docs-as-code/` is updated later by `/speckit-docs-as-code <n>` after review, not in this task list.
