# Post-implement verification: Verify Lifecycle Errors

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Tasks**: [tasks.md](tasks.md) · **Date**: 2026-11-04

## Release gates (T017)

`npm run lint`, `npm run typecheck`, `npm test` and `npm run build` all pass. `npm test` ran 203 test files (1 skipped) and 5061 tests (6 skipped), and the coverage threshold holds (statements 97.24 %, branches 94.57 %, functions 93.51 %, lines 97.96 %). No lint fix was needed.

## SC-004 (T018)

`handler.lifecycle.test.ts` runs its 24 checks in 28 ms of test time, and in about 0.4 s of wall time for the file alone, including transform and import. That is well under the 5 s budget.

## Published surface (T019, quickstart V4)

`git diff main -- src/tools/smart_connections_similar/_template.ts src/tools/smart_connections_similar/handler.ts src/tools/smart_connections_similar/schema.ts src/tools/smart_connections_similar/index.ts docs/tools/smart_connections_similar.md` is empty. The FR-018 registry-fingerprint test passes in `npm test` without `npm run baseline:write`, and `_register-baseline.json` is unchanged.

## CodeGraph structural verification (T020)

The index was brought up to date with `codegraph sync`. `codegraph_explore` was then run on `runEvalCode`, `runEvalTemplate`, `makeEvalRunnerSpawn` and the new test file's helpers (`simulatedApp`, `buildTool`, `callOnce`, `itFails`, `expectFailure`, `expectSuccess`; `callTool` was renamed `callOnce` in the PR #145 review fix, which also moved the one-spawn assertion into it).

1. **No new error code or error class.** The new code constructs no `UpstreamError` and declares no error class. The test file only reads the codes the handler already emits. `src/errors.ts` is unchanged.
2. **No production handler imports the boot-time DI factories.** All the new code is test support. The test calls `createQueue()` and `silentLogger()` (which wraps `createLogger()`) the way every handler suite does. No production file imports `_eval-template-fixtures.ts`, `_handler-test-fixtures.ts` or the new symbols.
3. **Placement and import direction.** `runEvalCode` is in `src/tools/_eval-template-fixtures.ts`, and `makeEvalRunnerSpawn` is in `src/tools/_handler-test-fixtures.ts` beside the other two spawn factories (standing rule item 9). The new edge is `_handler-test-fixtures` → `_eval-template-fixtures` → `_shared` (`composeEvalCode`). `_shared.ts` imports no fixture module, so no cycle forms. Both fixture modules fall under `tsconfig.build.json`'s `src/**/_*fixtures.ts` exclude, so neither is compiled into `dist/`. The `dist/tools/_handler-test-fixtures.*` files there are leftovers from a build on 2026-10-30 and contain no `makeEvalRunnerSpawn`.
4. **Reachability.** `runEvalCode` is called by `runEvalTemplate` and by `makeEvalRunnerSpawn`. `makeEvalRunnerSpawn` is called by `buildTool` in `handler.lifecycle.test.ts`. As intended for test support, both are reached only from tests.

**Kernel-node claim**: the plan said this item touches none of `createLogger()`, `createQueue()`, `UpstreamError` or `createServer()`, and that held. The first two are called from test code only, `UpstreamError` is only observed, and `createServer()` is never reached, because the tool is built directly.

## Deviations

- **Contract §M, edit M2** (raised at T014). §M expected M2 (swap S2 ↔ S3) to fail every check, but L1, P3, P4 and A2 pass. In those states the plugin is absent, so S1 returns not-installed before either moved step runs. The owner ruled option A on 2026-11-04: the contract's "all" was the error, not the checks, because ADR-014 places not-installed first in both chains. The §M row was amended. The full record is in [exercise.md](exercise.md).
- **`makeEvalRunnerSpawn` reads `Error:` messages by duck typing.** An error thrown inside the `node:vm` context comes from another realm, so `instanceof Error` is false for it, and `String(err)` would print `TypeError: …` instead of the message. The factory reads `.message` whenever it is a string, which is what T004 asks for ("the error's `.message`, else `String(err)`"). This path runs only in the swap-and-drop exercise.
- **Check titles use plain loops instead of `it.each`.** Vitest quotes and truncates `$field` interpolations in `it.each` titles (for example `'P1: not a note + not ready → not-a-no…'`), which breaks H6's rule that each title starts with its id and names what it expected. The rows are now `for … of` loops that call `it` with a template-string title.
- **Swap edits kept shared declarations ahead of the moved step.** `let f;` and `const env=p.env;` stayed ahead of every step that reads them, so that a swap tests the order of the guards, not a temporal-dead-zone read. This is recorded in exercise.md.
