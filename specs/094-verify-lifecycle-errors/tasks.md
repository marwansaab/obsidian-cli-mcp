---

description: "Task list for 094 — Verify Lifecycle Errors"
---

# Tasks: Verify Lifecycle Errors

**Input**: Design documents from `specs/094-verify-lifecycle-errors/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/lifecycle-checks-contract.md](contracts/lifecycle-checks-contract.md), [quickstart.md](quickstart.md)

**Tests**: This feature *is* tests. The spec asks for checks that prove each lifecycle state (FR-009 to FR-012), so every user-story task writes test code. No production file changes (FR-013).

**Organization**: Tasks are grouped by user story. Every check lives in one new file, `src/tools/smart_connections_similar/handler.lifecycle.test.ts`, so tasks that edit it run in sequence.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Contract ids (L1–L7, P1–P5, A1–A3, M1–M9) refer to [contracts/lifecycle-checks-contract.md](contracts/lifecycle-checks-contract.md)

## Standing rules for the implementer

- Load the `karpathy-guidelines` skill before writing code.
- Read `.memory/refactor-decisions.md` items 5, 9 and 45.
  - Item 5: if any existing test fails, stop and raise it. Never edit an existing assertion.
  - Item 9: spawn factories live together in `_handler-test-fixtures.ts`. Do not add a bespoke stub.
  - Item 45: `runEvalTemplate` is the one vm harness.
- Expected values are literals in the test file. Never import them from `handler.ts` or `_template.ts` (research D5).
- Never edit `src/tools/smart_connections_similar/_template.ts`, `handler.ts`, `schema.ts`, `index.ts` or `docs/tools/smart_connections_similar.md`. The one exception is the temporary, reverted template edits of T014.
- FR-014 stop rule: if any L, P or A check fails against the unmodified production code (that is, outside T014's deliberate template edits), stop. Do not adjust the expected literal to match what the code does. A failure there means current behaviour departs from the published documentation or from contract §S, §P or §A. Record the check id, the expected value and the actual value, and raise it to the owner as a defect.
- The live-CLI gate in `.memory/test-execution-instructions.md` does not apply. No task invokes the real `obsidian` binary.

---

## Phase 1: Setup

**Purpose**: Confirm a green baseline before touching shared test support.

- [ ] T001 Run `npx vitest run src/tools/smart_connections_similar src/tools/_smart-connections.test.ts src/tools/*/_template.test.ts` on branch `094-verify-lifecycle-errors` and confirm everything passes. Note the pass count, because T003 compares against it. If anything fails before any edit, stop and report it: it is not caused by this item.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The stand-in for the Obsidian call and the simulated vault/plugin harness (research D2, D3; contract §H). Every user story depends on this phase.

- [ ] T002 In `src/tools/_eval-template-fixtures.ts`, add `export async function runEvalCode(code: string, app: unknown): Promise<string>`.
  - It runs `runInNewContext(code, { TextDecoder, Uint8Array, atob, setTimeout, app })`, awaits the result (sync or Promise), and returns it as a string.
  - Re-express `runEvalTemplate(template, payload, app)` as `JSON.parse(await runEvalCode(composeEvalCode(template, payload), app))`. Keep its signature, its result and the `setTimeout` comment.
  - Extend the file's `// Original — no upstream.` header sentence to name `runEvalCode` (the vm run of already composed code, used by `makeEvalRunnerSpawn`).
- [ ] T003 Re-run the T001 command. Every suite must pass with the same count, with no test edited (quickstart V2). If any fails, revert T002's change and stop.
- [ ] T004 In `src/tools/_handler-test-fixtures.ts`, add `export function makeEvalRunnerSpawn(app: unknown, opts: { pid?: number } = {}): { spawnFn: SpawnLike; recorded: SpawnRecording[]; getCount: () => number }` (contract §H2).
  - For each spawn, record `{ binary, argv: [...argv], options }` and build the child with the existing private `makeChild(opts.pid ?? DEFAULT_PID)`.
  - Read `code` with the existing `findKv(argv, "code")`. If it is missing, throw `new Error("spawn sent no code= argument")`.
  - Then, asynchronously: `runEvalCode(code, app)` from `./_eval-template-fixtures.js`. On resolve, push `` `=> ${value}\n` `` to stdout. On reject, push `` `Error: ${message}\n` `` (`message` is the error's `.message`, else `String(err)`). After that, end stdout, end stderr, and emit `exit` with `(0, null)` on a later `setImmediate`, mirroring `makeQueuedSpawn`.
  - Do not touch `makeQueuedSpawn`, `makeStubSpawn` or `renderStubStdout`.
  - Update the file header: "Three spawn factories on purpose". Add a third bullet: `makeEvalRunnerSpawn` runs the eval code the caller sent against a simulated `app` under node:vm and answers asynchronously (spec 094).
  - The import direction is `_handler-test-fixtures` → `_eval-template-fixtures` → `_shared`, and must create no cycle.
- [ ] T005 Create `src/tools/smart_connections_similar/handler.lifecycle.test.ts` with only the harness, plus one smoke check:
  - **Header**: `// Original — no upstream. Lifecycle checks for smart_connections_similar (spec 094): each check builds the registered tool with a stand-in spawn that runs the eval code the handler sent against a simulated vault and Smart Connections plugin, and confirms the failure or result the agent receives and the documented order of precedence.`
  - **Lifecycle hooks**: `beforeEach`/`afterEach(() => __resetInFlightRegistryForTests())`.
  - **`simulatedApp(state)`**, per data-model E2/E3:
    - `vault.getName: () => "Demo"`.
    - `vault.getAbstractFileByPath(p)` matches a file by exact `path`.
    - `metadataCache.getFirstLinkpathDest(name, "")` matches a note whose basename without `.md` equals `name`.
    - `workspace.getActiveFile()` returns `state.active ?? null`.
    - `plugins.plugins` depends on `state.plugin`:
      - `absent`: `{}`.
      - `no-env`: `{ "smart-connections": {} }`.
      - `no-sources`: `env: {}`.
      - `no-items`: `env: { smart_sources: {} }`.
      - `items-null`: `items: null`.
      - `ready`: `items: state.index`, the same object reference, so a test can add to it between calls.
  - **`indexed(candidates)`**: returns `{ find_connections: async ({ limit }) => candidates.slice(0, limit) }`. Candidates are `{ item: { key }, score }`.
  - **`callTool(state, args)`**: builds `createSmartConnectionsSimilarTool({ logger: silentLogger(), queue: createQueue(), env: {}, spawnFn })` with `makeEvalRunnerSpawn(simulatedApp(state))`, then `await tool.handler(args)`. It returns `{ result, getCount }`.
  - **`expectFailure(result, expected)`** implements contract §H5: `isError === true`, no `structuredContent` key, and `JSON.parse(result.content[0].text)` `toEqual(expected)` with the whole `details` object compared.
  - **`expectSuccess(result, expected)`** implements data-model E5: no `isError`, and `structuredContent` deep-equal to `JSON.parse(content[0].text)` and to `expected`.
  - **Expected-failure constants**, file-local literals that later tasks reuse:
    - `NOT_INSTALLED` (L1)
    - `MISSING_PATH` (L2a, for `Missing.md`)
    - `CANVAS_NOT_A_NOTE` (L3a, for `Board.canvas`)
    - `NOT_READY` (L4)
    - `NOT_INDEXED_SRC` (L5a)
    - `NO_ACTIVE_FILE` (A1)

    Each holds the full `{ code, message, details }` from contract §S / §A. These are literals, never imports from production. Defining them here means no story phase depends on another story's literals.
  - **Smoke check L7**: `"L7: ready + indexed with no neighbours → success, never not-indexed"`. Use plugin `ready`, `index: { "Src.md": indexed([]) }`, args `{ target_mode: "specific", vault: "Demo", path: "Src.md" }`. Expect `{ count: 0, matches: [] }` and `getCount() === 1`.
  - Run `npx vitest run src/tools/smart_connections_similar/handler.lifecycle.test.ts` and confirm it passes.

**Checkpoint**: the stand-in runs the real template through the real tool. Story checks can now be added.

---

## Phase 3: User Story 1 — Distinct failure when the plugin is installed but not ready (P1) 🎯 MVP

**Goal**: Prove the not-ready failure for every not-ready condition (FR-002, User Story 1 scenarios 1–2).

**Independent Test**: `npx vitest run src/tools/smart_connections_similar/handler.lifecycle.test.ts -t "L4"` passes. Each row returns the not-ready failure with its reason and no results.

- [ ] T006 [US1] In `src/tools/smart_connections_similar/handler.lifecycle.test.ts`, add `it.each` rows L4a–d.
  - States: plugin `no-env`, `no-sources`, `no-items` and `items-null`, with file `Src.md` present. Args: `path: "Src.md"`.
  - Titles: `"L4a: not ready (no env) → not-ready failure"`, and so on.
  - Each row expects `{ code: "CLI_REPORTED_ERROR", message: "smart_connections_similar: Smart Connections plugin is loaded but its similarity API is not ready (env.smart_sources unavailable)", details: { stage: "envelope-error", code: "SMART_CONNECTIONS_NOT_READY", reason: "api-missing", detail: "env.smart_sources unavailable" } }`, and `getCount() === 1`.

**Checkpoint**: US1 proven on its own.

---

## Phase 4: User Story 2 — Distinct failure when the source note has not been indexed yet (P1)

**Goal**: Prove the not-indexed failure names the note, and that results come back once the note is indexed (FR-003, FR-004, User Story 2 scenarios 1–3).

**Independent Test**: `npx vitest run src/tools/smart_connections_similar/handler.lifecycle.test.ts -t "L5|L6"` passes.

- [ ] T007 [US2] In `src/tools/smart_connections_similar/handler.lifecycle.test.ts`, add L5a, L5b and L5c.
  - **L5a**: plugin `ready`, `index: {}`, file `Src.md`, `path: "Src.md"`.
  - **L5b**: `index: { "Src.md": {} }`, an entry without `find_connections`. Same args as L5a.
  - **L5c**: file `Notes/Src.md`, `index: {}`, `file: "Src"`.
  - L5a and L5b expect `{ code: "CLI_REPORTED_ERROR", message: "smart_connections_similar: source note has no embedding yet (Src.md)", details: { stage: "envelope-error", code: "SOURCE_NOT_INDEXED", detail: "Src.md" } }`.
  - L5c expects the same with `Notes/Src.md` in both `message` and `detail`. This pins the resolved-path form (research D5).
  - Each expects `getCount() === 1`.
- [ ] T008 [US2] In the same file, add L6: `"L6: not indexed, then indexed → same call returns results"`.
  - One `state` object and one tool instance for both calls.
  - The first call expects the L5a failure.
  - Then set `state.index["Src.md"] = indexed([{ item: { key: "Other.md#H1" }, score: 0.9 }, { item: { key: "Src.md#Intro" }, score: 0.95 }])` and repeat the identical call.
  - Expect `expectSuccess(result, { count: 1, matches: [{ path: "Other.md", headingPath: ["H1"], score: 0.9 }] })`, with the source's own block excluded, and a total `getCount() === 2`.
  - Build the tool once, outside the two calls, so `getCount` spans both.

**Checkpoint**: US1 and US2 pass independently.

---

## Phase 5: User Story 4 — The most fundamental problem is reported first (P1)

**Goal**: Prove the base not-installed and target-missing states, every precedence pair, and active mode's no-focused-note place in the order (FR-001, FR-006, FR-007, FR-008, C-002).

**Independent Test**: `npx vitest run src/tools/smart_connections_similar/handler.lifecycle.test.ts -t "L1|L2|P[1-5]|A[1-3]"` passes.

- [ ] T009 [US4] In `src/tools/smart_connections_similar/handler.lifecycle.test.ts`, add L1, L2a and L2b.
  - **L1**: plugin `absent`, file `Src.md`, `path: "Src.md"`. Expects `{ code: "CLI_REPORTED_ERROR", message: "smart_connections_similar: Smart Connections plugin is not installed in the vault (plugin not loaded in vault: Demo)", details: { stage: "envelope-error", code: "SMART_CONNECTIONS_NOT_INSTALLED", detail: "plugin not loaded in vault: Demo" } }`.
  - **L2a**: plugin `ready`, no file `Missing.md`, `path: "Missing.md"`. Expects `message: "smart_connections_similar: file not found (path: Missing.md)"` and `details: { stage: "envelope-error", code: "FILE_NOT_FOUND", detail: "path: Missing.md" }`.
  - **L2b**: `file: "Missing"`. Expects `message: "smart_connections_similar: file not found (wikilink: Missing)"` and `detail: "wikilink: Missing"`.
  - Each expects `getCount() === 1`.
- [ ] T010 [US4] In the same file, add P1–P5 as `it.each` rows, each titled with the combination and its winner, e.g. `"P1: not a note + not ready → not-a-note failure"`.
  - **P1**: `Board.canvas` (extension `canvas`) and plugin `no-env`, `path: "Board.canvas"`. Expects the L3a failure (`NOT_MARKDOWN`, `detail: "path: Board.canvas extension: canvas"`).
  - **P2**: plugin `no-sources`, file `Src.md`, `path: "Src.md"`. Expects the L4 failure.
  - **P3**: plugin `absent`, no `Missing.md`, `path: "Missing.md"`. Expects the L1 failure.
  - **P4**: plugin `absent`, `Board.canvas`, `path: "Board.canvas"`. Expects the L1 failure.
  - **P5**: no `Missing.md`, plugin `no-env`, `path: "Missing.md"`. Expects the L2a failure.
  - Use the T005 constants `CANVAS_NOT_A_NOTE`, `NOT_READY`, `NOT_INSTALLED` and `MISSING_PATH`.
- [ ] T011 [US4] In the same file, add A1–A3 with args `{ target_mode: "active" }` and `active: null`.
  - **A1**: plugin `ready`. Expects `{ code: "ERR_NO_ACTIVE_FILE", message: "smart_connections_similar: no note focused; switch to specific mode or focus a note.", details: { stage: "envelope-error", detail: "No note focused; switch to specific mode or focus a note." } }`.
  - **A2**: plugin `absent`. Expects the L1 failure.
  - **A3**: plugin `no-env`. Expects the A1 failure.
  - Also assert that no recorded argv carries a `vault=` token, because active mode sends no vault (H4).

**Checkpoint**: the precedence order is proven in both modes.

---

## Phase 6: User Story 3 — Distinct failure when the target is not a note (P2)

**Goal**: Prove the not-a-note failure names the file and its type for a canvas, a base and attachments (FR-005).

**Independent Test**: `npx vitest run src/tools/smart_connections_similar/handler.lifecycle.test.ts -t "L3"` passes.

- [ ] T012 [US3] In `src/tools/smart_connections_similar/handler.lifecycle.test.ts`, add `it.each` rows L3a–d with plugin `ready`:
  - **L3a**: `Board.canvas` / `canvas`.
  - **L3b**: `Tasks.base` / `base`.
  - **L3c**: `Images/photo.png` / `png`.
  - **L3d**: `Docs/paper.pdf` / `pdf`.
  - Each passes `path: <file path>` and expects `{ code: "CLI_REPORTED_ERROR", message: "smart_connections_similar: target is not a Markdown note (path: <path> extension: <ext>)", details: { stage: "envelope-error", code: "NOT_MARKDOWN", detail: "path: <path> extension: <ext>" } }`, and `getCount() === 1`.
  - L3a uses the T005 constant `CANVAS_NOT_A_NOTE`.

**Checkpoint**: all single states and combinations in contract §S, §P and §A exist.

---

## Phase 7: User Story 5 — Every state proven on demand before a release (P1)

**Goal**: Show that the whole matrix runs on demand and catches a reordered or dropped detection step (FR-009 to FR-012, SC-003, C-003). Comes last because it depends on every check above.

**Independent Test**: quickstart V1 and V5.

- [ ] T013 [US5] Run `npx vitest run src/tools/smart_connections_similar/handler.lifecycle.test.ts` (quickstart V1).
  - All 24 checks must pass: L1, L2a, L2b, L3a–d, L4a–d, L5a–c, L6, L7, P1–P5 and A1–A3.
  - Every title must start with its contract id.
  - Note the file's duration from vitest's output for T018.
- [ ] T014 [US5] Run the swap-and-drop exercise M1–M9 from contract §M, one edit at a time.
  - **Edit**: change `src/tools/smart_connections_similar/_template.ts`. A swap moves the later step ahead of the earlier one, carrying only declarations that step alone uses (S5's `sourceKey` / `src`). A drop deletes the step's guard `return`(s) and keeps its declarations.
  - **Run**: `npx vitest run src/tools/smart_connections_similar/handler.lifecycle.test.ts`.
  - **Restore**: `git checkout -- src/tools/smart_connections_similar/_template.ts` before the next edit.
  - **Pass condition**: each edit must fail at least the checks §M lists.
  - If an edit fails fewer checks than listed, or none, stop. Do not change the contract to fit. Record it and raise it as a gap in the checks (FR-012).
- [ ] T015 [US5] Write `specs/094-verify-lifecycle-errors/exercise.md` (data-model E6).
  - A short intro naming C-003 and the date.
  - A table with one row per edit M1–M9: edit id, the change made, the failing check ids, and one observed outcome (`code` / `details.code`, or the `Error:` line).
  - A closing line confirming `git diff -- src/tools/smart_connections_similar/_template.ts` is empty.
- [ ] T016 [US5] Confirm `git status --short src/tools/smart_connections_similar/` lists only the new `handler.lifecycle.test.ts`, and that `_template.ts` is unchanged.

**Checkpoint**: SC-001 to SC-003 met.

---

## Phase 8: Polish & cross-cutting

- [ ] T017 Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` (quickstart V3). All must be green, including the coverage threshold. If lint flags the new code, fix the new code only.
- [ ] T018 Check SC-004: the new file's vitest duration (from T013 or the `npm test` run in T017) must be under 5 s. Note the figure for T020, which writes it into `specs/094-verify-lifecycle-errors/post-implement.md`.
- [ ] T019 Check quickstart V4 (SC-005, FR-013).
  - `git diff main -- src/tools/smart_connections_similar/_template.ts src/tools/smart_connections_similar/handler.ts src/tools/smart_connections_similar/schema.ts src/tools/smart_connections_similar/index.ts docs/tools/smart_connections_similar.md` must be empty.
  - The FR-018 registry-fingerprint test must pass in `npm test` without running `npm run baseline:write`.
- [ ] T020 Run the post-implement CodeGraph structural verification (CLAUDE.md, Code index). Run `codegraph sync`, then `codegraph_explore` on `runEvalCode`, `runEvalTemplate`, `makeEvalRunnerSpawn` and the new test file's helpers. Verify the four checks:
  1. No new error code or error class.
  2. No production handler imports `createLogger()` / `createQueue()`. The new code is test-only.
  3. The new symbols sit in `_eval-template-fixtures.ts` / `_handler-test-fixtures.ts` with downward imports and no cycle.
  4. Each new symbol has its caller: `makeEvalRunnerSpawn` from the new test, and `runEvalCode` from `runEvalTemplate` and `makeEvalRunnerSpawn`. Test-support symbols are reached only from tests by design.

  Also confirm the plan's no-kernel-node-touch claim held. Create `specs/094-verify-lifecycle-errors/post-implement.md` and record in it the results, the SC-004 figure from T018 and any deviation.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** comes first.
- **Foundational (T002 → T003 → T004 → T005)** is strictly sequential: T004 imports T002's `runEvalCode`, T003 gates on T002, and T005 uses T004. It blocks every story.
- **US1 (T006), US2 (T007 → T008), US4 (T009 → T010 → T011) and US3 (T012)** each depend only on T005. They are independent in logic, but they all edit `handler.lifecycle.test.ts`, so run them one at a time. The shared expected-failure constants are defined in T005, so no story phase depends on another.
- **US5 (T013 → T014 → T015 → T016)** depends on all story tasks.
- **Polish (T017–T020)** depends on US5. T017, T018 and T019 can run in any order. T020 runs last and writes `post-implement.md`, including T018's figure.

### Structural dependency notes (CodeGraph)

- `runEvalTemplate` (`_eval-template-fixtures.ts`) and `makeChild` (`_handler-test-fixtures.ts`) have no call path between them today. T004 adds the edge `_handler-test-fixtures` → `_eval-template-fixtures` → `_shared` (`composeEvalCode`). `_shared.ts` imports no fixture module, so no cycle forms. This is why T004 must follow T002.
- `createSmartConnectionsSimilarTool` → `executeSmartConnectionsSimilar` → `composeEvalCode` is the path that builds the code the stand-in runs. The checks depend on `composeEvalCode`'s output and `wrapEvalCode`'s answer tag being unchanged. Neither is edited, so no extra task is needed.
- Every `_template.test.ts` suite depends on `runEvalTemplate`. That blast radius is why T003 re-runs them before anything else builds on T002.

### Parallel opportunities

- Few by design. T002 and T004 touch different files but T004 imports T002, so they stay sequential. All story checks share one test file.
- T017, T018 and T019 can run in parallel.

---

## Parallel Example: Polish

```bash
# After T016:
Task: "T017 Release gates (lint, typecheck, test, build)"
Task: "T019 Published-surface diff + FR-018 fingerprint"
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. T001–T005 (baseline, harness, L7 smoke check).
2. T006 (L4a–d). Stop and validate: the not-ready state, which has never been observed live, is now proven on demand.

### Incremental delivery

1. US2 (T007–T008): not indexed, then indexed.
2. US4 (T009–T011): base states, precedence pairs and active mode.
3. US3 (T012): not-a-note types.
4. US5 (T013–T016): full run and the recorded exercise.
5. Polish (T017–T020).

---

## Notes

- This is a test-only BI. The tasks cross two shared test-support modules and one new test file, so the CodeGraph task-pair rule applies; see the structural notes above.
- No production code, no docs page, no published schema and no baseline changes. A diff outside `src/tools/_eval-template-fixtures.ts`, `src/tools/_handler-test-fixtures.ts`, `src/tools/smart_connections_similar/handler.lifecycle.test.ts` and `specs/094-verify-lifecycle-errors/` means something has gone wrong.
- Commit after the foundational phase and after each story phase, or as one commit at the end via `/speckit-git-commit`.
