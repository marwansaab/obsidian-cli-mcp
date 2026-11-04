# Research: Verify Lifecycle Errors

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Date**: 2026-11-04

The Technical Context had no open unknowns: the stack, the test framework and the place of every check are fixed by the repository. The decisions below settle how the checks are built.

## D1 — What a check calls: the registered tool

**Decision**: Each check builds the tool with `createSmartConnectionsSimilarTool(deps)` and calls `tool.handler(args)`. It reads the result the agent would receive: `isError: true` with the `{code, message, details}` JSON text block for a failure, and `structuredContent` and the text block for a success.

**Rationale**: C-001 asks for one step from the simulated state to "the failure as the agent receives it". The registered tool is the closest in-process point to that. It runs the input schema, `executeSmartConnectionsSimilar`, `invokeEval`, the dispatch layer, `decodeEvalEnvelope`, `mapEnvelopeError` and `registerTool`'s error serialisation, and only the spawned process is replaced. `index.test.ts` already calls `tool.handler` this way, and `_plugin-noise.test.ts`'s `errorPayload` reads the error text block the same way.

**Alternatives considered**: Calling `executeSmartConnectionsSimilar` and catching the `UpstreamError`. This was rejected because it skips the boundary parse and the `isError` serialisation, which are part of what the agent receives. Driving a full MCP client over an in-memory transport (`connectInMemoryClient`) was also rejected: it adds the protocol handshake and proves nothing more about detection or order.

## D2 — The stand-in for the Obsidian command-line call

**Decision**: Add one spawn factory, `makeEvalRunnerSpawn(app)`, to `src/tools/_handler-test-fixtures.ts`. For each spawn it records the argv, reads the `code=` argument (the already wrapped eval code the handler sent) and runs it under `node:vm` with the simulated `app`. It then writes `=> <value>\n` to the child's stdout and exits 0. The wrapped code itself prefixes the call's answer tag (`wrapEvalCode`), so the line is exactly what Obsidian prints. If the code throws or rejects, the stand-in writes `Error: <message>\n` and exits 0. That path is reachable only in the C-003 exercise, when a detection step has been broken on purpose.

The vm run itself is a new `runEvalCode(code, app)` in `src/tools/_eval-template-fixtures.ts`, holding the same global set (`TextDecoder`, `Uint8Array`, `atob`, `setTimeout`, `app`). `runEvalTemplate` becomes `composeEvalCode` → `runEvalCode` → `JSON.parse`, with the same signature and behaviour, so its existing callers are untouched.

**Rationale**:
- The existing factories cannot do this. `makeQueuedSpawn` and `makeStubSpawn` render stdout synchronously at spawn time (`renderStubStdout`), and the similar-notes template is an async IIFE (`find_connections` is async), so its answer exists only after an await.
- Pre-computing the envelope with `runEvalTemplate` and queueing it through `makeQueuedSpawn` would run the test's own payload, not the code the handler sent. FR-010 forbids exactly that kind of ready-made result.
- Standing rule `.memory/refactor-decisions.md` item 9: spawn factories live together in `_handler-test-fixtures.ts`, each with a distinct contract, and bespoke spawn stubs are not re-introduced. A local stub would need its own copy of the private `makeChild`, which is the drift that rule exists to stop. The new factory reuses `makeChild` and documents its contract: it runs the sent code and answers asynchronously.
- Standing rule item 45: `runEvalTemplate` is THE vm harness. Extracting `runEvalCode` keeps one copy of the vm global set instead of a second `runInNewContext` call.

**Alternatives considered**: Making `StubStdout`'s function form async. This was rejected because it changes the synchronous contract of both existing factories and of `renderStubStdout`, for one caller. Exporting `makeChild` so the test file could build its own stub was also rejected, because it is the bespoke-stub pattern under another name.

## D3 — The simulated vault and plugin

**Decision**: The new test file holds one local builder, `simulatedApp(state)`. It returns the `app` surface `JS_TEMPLATE` reads, and nothing more:
- `vault.getName()` returns `"Demo"`.
- `vault.getAbstractFileByPath(p)` returns a file record or null.
- `metadataCache.getFirstLinkpathDest(name, "")` returns a file record or null.
- `workspace.getActiveFile()` returns a file record or null.
- `plugins.plugins["smart-connections"]` is absent or a plugin object whose `env` is set per not-ready condition.

A file record is `{ path, extension }`. The index (`env.smart_sources.items`) is a plain object that the check can add to between two calls, which is how "the plugin has since indexed the note" (User Story 2, scenario 2) is produced.

**Rationale**: The builder is specific to this template's reads, so it stays local (Karpathy: no abstraction for single-use code). The ordering suite's `runTemplate` in `_template.test.ts` builds the same kind of object inline. Keeping the state a plain value per check makes each state exist exactly as long as the check needs it (FR-009).

**Alternatives considered**: Moving the builder into `_smart-connections-fixtures.ts`. This was rejected because `smart_connections_query` reads a different `app` surface (`env.smart_sources.lookup`) and is out of scope.

## D4 — Where the checks live

**Decision**: New co-located file `src/tools/smart_connections_similar/handler.lifecycle.test.ts`.

**Rationale**: Principle II co-location. The precedent is `handler.note-name.test.ts` and `handler.line-endings.test.ts`, which hold a tool's tests on one concern beside the main `handler.test.ts`, already 958 lines. The checks run in `npm test`, in CI on Linux and Windows (FR-011, constitution gate 9), and need no Obsidian.

**Alternatives considered**: Adding to `handler.test.ts` (rejected: that file's subject is ready-made answers, and mixing in the second layer would hide which layer a test proves) or to `_template.test.ts` (rejected: that file runs the template without the handler, which C-001 ruled out).

## D5 — Expected values are written in the checks, from the published contract

**Decision**: Each check writes its expected `code`, `details.code`, `details.detail`, `details.reason` and `message` as literals. It never imports them from `handler.ts` or `_template.ts`. The literals are today's values, which this plan checked against `docs/tools/smart_connections_similar.md` (Error roster, Error-precedence chain) and ADR-014 / ADR-015. They are listed in [contracts/lifecycle-checks-contract.md](contracts/lifecycle-checks-contract.md).

**Rationale**: An oracle imported from the code under test would follow that code if it changed, and the check would prove nothing (the same reason item 27(b) keeps `_surface.test.ts`'s classification table independent). FR-013 freezes these values, so literals are stable.

**Finding (FR-014)**: no departure from the documentation was found. The template's stage order is the documented order in both modes, and every code and `details.code` matches the roster. The docs leave two details unstated, and the code is taken as authoritative for them:
- The not-indexed detail is the resolved vault-relative path, also when the agent named the note (spec Assumptions; closes the clarify-time open point).
- The not-ready reason is `api-missing`. Its `details.reason` is not shown in the similar-notes roster but is set by `mapEnvelopeError`, following ADR-015.

Neither is a contract change, so the docs page is not edited in this item. Whether to state them on the page is a call for the `/speckit-docs-as-code` pass.

## D6 — The swap-and-drop exercise (C-003)

**Decision**: During implement, apply nine one-at-a-time edits to a scratch copy of `JS_TEMPLATE`: the four adjacent swaps of the five detection steps and the five single-step drops. Run the new test file against each edit, revert each edit, and record which check failed in `specs/094-verify-lifecycle-errors/exercise.md`. The expected failure per edit is in the contract, §M. Nothing from the exercise is committed to `src/`.

**Rationale**: C-003. The scratch edit is made in the working tree and reverted with `git checkout -- src/tools/smart_connections_similar/_template.ts`. The final `git diff -- src` must show no template change, which `npm test` confirms. `exercise.md` is the item's record that SC-003 asks for.

**Alternatives considered**: Recording the exercise in the PR description only. Rejected because the PR text is not in the repository, and a later reader of the spec would not find the evidence next to it.
