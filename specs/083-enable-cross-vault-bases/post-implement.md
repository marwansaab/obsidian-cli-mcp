# Post-implement structural verification: Enable cross-vault Bases

**Date**: 2026-11-02 | **Plan**: [plan.md](plan.md) | **Tasks**: [tasks.md](tasks.md) (T041)

The index was refreshed with `codegraph sync`, then queried with `codegraph_explore "executeBases executeViewsBase listFocusedViews executeCreateBase containNamedVaultTarget assertCreatedContained baseNotFound ITEM_FOLDER_TEMPLATE itemFolderEvalResponseSchema createServer"`.

## Plan checks

1. **No new error code or class.** `git diff src/errors.ts` is empty. Every new failure is an `UpstreamError` with an existing code: `CLI_REPORTED_ERROR` (`VAULT_NOT_FOUND` through `resolveVaultRootOrRemap`, `BASE_NOT_FOUND` with an additive `vault` key, and the shared decoder's `json-parse` / `envelope-parse` stages) and `PATH_ESCAPES_VAULT` (through `assertCanonicalPath`; the backstop re-throws the same code with an additive `createdPath`). No new `details.reason`.
2. **No handler imports a boot-time DI factory.** `bases/handler.ts`, `views_base/handler.ts` and `create_base/handler.ts` import none of `createLogger`, `createQueue` or `createVaultRegistry`. `vaultRegistry` arrives through `ExecuteDeps` from `createServer`. The test files construct `createQueue()` locally, as every handler test does.
3. **Module placement and import direction.** `ITEM_FOLDER_TEMPLATE` is defined in `create_base/_template.ts` and imported only by `create_base/handler.ts` and `create_base/_template.test.ts` (`create_base/schema.ts` names it in a comment only). Every new import runs tool → shared: `_active-file.ts` (`assertCanonicalPath`, `decodeEvalEnvelope`, `resolveVaultRootOrRemap`, `CanonicalGuardContext`), `_shared.ts` (`composeEvalCode`, `B64_PAYLOAD_DECODE_EXPR`, `closedVaultNote`) and `cli-adapter.ts` (`invokeEval`). There is no tool → tool edge.
4. **Reachability.** The call path `createServer → createCreateBaseTool → executeCreateBase → containNamedVaultTarget / assertCreatedContained / baseNotFound` reaches every new `create_base` symbol, and `containNamedVaultTarget` consumes `ITEM_FOLDER_TEMPLATE` and `itemFolderEvalResponseSchema`. `createServer → createViewsBaseTool → executeViewsBase → listFocusedViews` carries the new `vault` argument. `executeBases` is reached through `createBasesTool`. No new production symbol is orphaned.

**Kernel-node touch**: `git diff src/server.ts` is exactly the two planned lines (`createBasesTool({ logger, queue, vaultRegistry })`, `createCreateBaseTool({ logger, queue, vaultRegistry })`). `createLogger()`, `createQueue()` and `UpstreamError` are not edited.

## Deviations from the plan

- **`ITEM_FOLDER_TEMPLATE` does not use `parseYaml`.** Research F7 said Obsidian's eval context provides `parseYaml`; the T040 live run showed it does not (`ReferenceError: parseYaml is not defined`, and `require('obsidian')` is unavailable). With the planned template, every filtered Base fell to the new-note branch, so the pre-creation folder check only checked the vault root. The template now scans the block-style YAML Obsidian writes: a top-level `filters:` scalar, or a block `and:` list of string entries. The derivation rule (research D5) and the envelope are unchanged. Flow-style YAML and `or` / `not` groups take the new-note branch; the post-creation backstop covers that gap, as Clarifications Q4 intends. Evidence and the corrected rows are in research.md, "T040 live validation". `docs/tools/create_base.md` states the limit.
- **Contract row V9 named the wrong code.** The default path answers `Error: No active file.` with top-level `ERR_NO_ACTIVE_FILE` (dispatch priority (b)), not `CLI_REPORTED_ERROR`. The V9 test asserts the parity the row is about: the named-vault call fails with the same code, message and `details.stdout` as the default path, and never with `BASE_NOT_FOUND`. `docs/tools/views_base.md` says so.
- **The `bases` description omits "Obsidian vault display name".** T029's literal wording broke the published-surface rule in `_surface.test.ts` (no tool description restates the vault display-name rule, which the server instructions own). The `vault` parameter description keeps the phrase, as on every other tool.
- **Two pre-083 tests were replaced, not kept.** `bases/handler.test.ts` "vault parameter accepted but silently ignored (R-001)" and `create_base/handler.test.ts` "vault parameter accepted but silently ignored (R-004)" pinned the behaviour FR-001 and FR-003 reverse. B1–B4 and C1–C12 cover both paths instead. (T019 named the equivalent `views_base` test explicitly; the other two were implied by the reversal.)

## Code-quality follow-up

`create_base/handler.test.ts` now uses the shared `makeQueuedSpawn`, so the bespoke `function makeSpawn` stub is retired tree-wide. `.memory/refactor-decisions.md` item 16 should record this in the review pass (tasks.md Notes).
