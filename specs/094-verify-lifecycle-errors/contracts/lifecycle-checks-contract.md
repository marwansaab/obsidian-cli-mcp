# Contract: Lifecycle checks for `smart_connections_similar`

**Feature**: [../spec.md](../spec.md) · **Plan**: [../plan.md](../plan.md) · **Data model**: [../data-model.md](../data-model.md)

This contract fixes what each new check sets up, how it calls the tool and what it must observe. The checks live in `src/tools/smart_connections_similar/handler.lifecycle.test.ts`. Every expected value below is a literal in the test (research D5) and matches today's behaviour and `docs/tools/smart_connections_similar.md`. This item changes none of them (FR-013).

## §H — Harness

- **H1 Tool**: `createSmartConnectionsSimilarTool({ logger: silentLogger(), queue: createQueue(), env: {}, spawnFn })`, then `await tool.handler(args)`. `__resetInFlightRegistryForTests()` runs before and after each check, as in the existing suites.
- **H2 Stand-in**: `spawnFn = makeEvalRunnerSpawn(simulatedApp(state)).spawnFn`. This is the new factory in `_handler-test-fixtures.ts` (research D2), and it adds:
  - `makeEvalRunnerSpawn(app: unknown): { spawnFn: SpawnLike; recorded: SpawnRecording[]; getCount: () => number }`. The return shape matches `makeQueuedSpawn`.
  - For each spawn it records `{binary, argv, options}` and takes `code` from the `code=` argument (via `findKv`). It awaits `runEvalCode(code, app)` and pushes `=> ${value}\n` to stdout, exit 0. If the run rejects, it pushes `Error: ${message}\n`, exit 0. `child.pid` defaults to 4242, as in the other factories.
  - `runEvalCode(code: string, app: unknown): Promise<string>` lives in `_eval-template-fixtures.ts`. It is `runInNewContext(code, { TextDecoder, Uint8Array, atob, setTimeout, app })`, awaited, and returns a string. `runEvalTemplate(template, payload, app)` is re-expressed as `JSON.parse(await runEvalCode(composeEvalCode(template, payload), app))`, with an unchanged signature and result.
- **H3 Spawn count**: every check asserts one spawn per tool call: `getCount() === 1`, or 2 for L6, which makes two calls. The template answers every state in a single eval, and no retry fires.
- **H4 Arguments**: specific mode uses `{ target_mode: "specific", vault: "Demo", path | file }`, and active mode uses `{ target_mode: "active" }`. `limit` and `total` are left to their defaults.
- **H5 Failure read**: `result.isError === true`, `"structuredContent" in result === false`, and `JSON.parse(result.content[0].text)` `toEqual` the row's `{code, message, details}`. The whole `details` object is compared, so no unexpected key passes.
- **H6 Names**: each check's title starts with its id below, then names the state or combination, for example `"P1: not a note + not ready → not-a-note failure"`. A failing check therefore names what it expected (FR-012).

Shorthand in the tables: `CRE` means `CLI_REPORTED_ERROR`, `E` means `stage: "envelope-error"`, and `M:` is the message prefix `smart_connections_similar: `.

## §S — Single states (specific mode)

Unless a row says otherwise, the vault holds `Src.md` and the plugin is `ready`, with `Src.md` indexed and having no candidates.

| Id | State | Args locator | Expected `code` | Expected `details` | Expected `message` |
|---|---|---|---|---|---|
| L1 | plugin `absent` | `path: "Src.md"` | `CRE` | `{E, code: "SMART_CONNECTIONS_NOT_INSTALLED", detail: "plugin not loaded in vault: Demo"}` | `M:Smart Connections plugin is not installed in the vault (plugin not loaded in vault: Demo)` |
| L2a | no file `Missing.md` | `path: "Missing.md"` | `CRE` | `{E, code: "FILE_NOT_FOUND", detail: "path: Missing.md"}` | `M:file not found (path: Missing.md)` |
| L2b | no note named `Missing` | `file: "Missing"` | `CRE` | `{E, code: "FILE_NOT_FOUND", detail: "wikilink: Missing"}` | `M:file not found (wikilink: Missing)` |
| L3a | `Board.canvas` exists | `path: "Board.canvas"` | `CRE` | `{E, code: "NOT_MARKDOWN", detail: "path: Board.canvas extension: canvas"}` | `M:target is not a Markdown note (path: Board.canvas extension: canvas)` |
| L3b | `Tasks.base` exists | `path: "Tasks.base"` | `CRE` | `{E, code: "NOT_MARKDOWN", detail: "path: Tasks.base extension: base"}` | `M:target is not a Markdown note (path: Tasks.base extension: base)` |
| L3c | `Images/photo.png` exists | `path: "Images/photo.png"` | `CRE` | `{E, code: "NOT_MARKDOWN", detail: "path: Images/photo.png extension: png"}` | `M:target is not a Markdown note (path: Images/photo.png extension: png)` |
| L3d | `Docs/paper.pdf` exists | `path: "Docs/paper.pdf"` | `CRE` | `{E, code: "NOT_MARKDOWN", detail: "path: Docs/paper.pdf extension: pdf"}` | `M:target is not a Markdown note (path: Docs/paper.pdf extension: pdf)` |
| L4a–d | plugin `no-env` / `no-sources` / `no-items` / `items-null` | `path: "Src.md"` | `CRE` | `{E, code: "SMART_CONNECTIONS_NOT_READY", reason: "api-missing", detail: "env.smart_sources unavailable"}` | `M:Smart Connections plugin is loaded but its similarity API is not ready (env.smart_sources unavailable)` |
| L5a | `ready`, `Src.md` absent from index | `path: "Src.md"` | `CRE` | `{E, code: "SOURCE_NOT_INDEXED", detail: "Src.md"}` | `M:source note has no embedding yet (Src.md)` |
| L5b | `ready`, `Src.md` entry without `find_connections` | `path: "Src.md"` | `CRE` | as L5a | as L5a |
| L5c | `ready`, `Notes/Src.md` absent from index | `file: "Src"` | `CRE` | `{E, code: "SOURCE_NOT_INDEXED", detail: "Notes/Src.md"}` | `M:source note has no embedding yet (Notes/Src.md)` |
| L6 | L5a, then `Src.md` added to the same index with candidates `[{item:{key:"Other.md#H1"},score:0.9},{item:{key:"Src.md#Intro"},score:0.95}]`, then the same call repeated | `path: "Src.md"` | first call as L5a, second call a success | n/a | n/a |
| L7 | `ready`, `Src.md` indexed with no candidates | `path: "Src.md"` | success | n/a | n/a |

The L6 second call expects `{count: 1, matches: [{path: "Other.md", headingPath: ["H1"], score: 0.9}]}`, with the source's own block excluded, read as E5 success. Its spawn count is 2 over the two calls. L7 expects `{count: 0, matches: []}`, a success and never `SOURCE_NOT_INDEXED` (spec Edge Cases).

## §P — Precedence (specific mode)

| Id | Combined states | Args locator | Expected (row of §S) |
|---|---|---|---|
| P1 | `Board.canvas` exists + plugin `no-env` | `path: "Board.canvas"` | L3a |
| P2 | plugin `no-sources` + `Src.md` absent from any index | `path: "Src.md"` | L4 (not ready) |
| P3 | plugin `absent` + no file `Missing.md` | `path: "Missing.md"` | L1 |
| P4 | plugin `absent` + `Board.canvas` exists | `path: "Board.canvas"` | L1 |
| P5 | no file `Missing.md` + plugin `no-env` | `path: "Missing.md"` | L2a |

P3, P1 and P2 cover the three adjacent pairs that can occur together (not installed / missing, not a note / not ready, not ready / not indexed). P4 and P5 cover the non-adjacent pairs the spec names. A missing target and a not-a-note target cannot co-occur (FR-008).

## §A — Active mode (C-002)

| Id | State | Expected `code` | Expected `details` | Expected `message` |
|---|---|---|---|---|
| A1 | no active file, plugin `ready` | `ERR_NO_ACTIVE_FILE` | `{E, detail: "No note focused; switch to specific mode or focus a note."}` | `M:no note focused; switch to specific mode or focus a note.` |
| A2 | no active file + plugin `absent` | as L1 | as L1 | as L1 |
| A3 | no active file + plugin `no-env` | as A1 | as A1 | as A1 |

## §M — Swap-and-drop exercise (C-003; implement time only, not committed)

The five detection steps of `JS_TEMPLATE` are:

- **S1**: the `if(!p)` guard.
- **S2**: file resolution and its three `if(!f)` guards.
- **S3**: the `f.extension!=='md'` guard.
- **S4**: the readiness guard.
- **S5**: the `if(!src||…)` guard.

A swap moves the later step ahead of the earlier one. Declarations only the moved step uses go with it (S5's `const sourceKey` and `const src`). Declarations several steps use stay where they are (`const p`, `let f`, `const env`). A drop deletes the step's guard `return` statement(s) and keeps its declarations. Each edit is applied alone, the new test file is run (`npx vitest run src/tools/smart_connections_similar/handler.lifecycle.test.ts`), and the template is restored with `git checkout -- src/tools/smart_connections_similar/_template.ts`.

| Edit | Change | Checks that must fail (at least) |
|---|---|---|
| M1 | swap S1 ↔ S2 | P3, A2 |
| M2 | swap S2 ↔ S3 (S3's guard ahead of resolution) | all except the plugin-absent checks (L1, P3, P4, A2), because `f` is still undefined when S3 reads it; with the plugin absent, S1 returns first, so the swap has no effect (amended 2026-11-04, owner ruling option A) |
| M3 | swap S3 ↔ S4 | P1 |
| M4 | swap S4 ↔ S5 | L4a–d, P2 |
| M5 | drop S1 | L1, P3, P4, A2 |
| M6 | drop S2's guards | L2a, L2b, P5, A1, A3 |
| M7 | drop S3 | L3a–d, P1 |
| M8 | drop S4 | L4a–d, P2 |
| M9 | drop S5 | L5a, L5b, L5c, L6 |

The outcome of each edit is recorded in `specs/094-verify-lifecycle-errors/exercise.md`: the failing check ids, plus the observed `code` / `details.code` (or `Error:` line) of one failing check. The exercise passes when every edit fails at least the checks listed. The final `git diff -- src/tools/smart_connections_similar/_template.ts` is empty.
