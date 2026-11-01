# Post-implement structural verification: 082-fix-active-file-messaging

**Date**: 2026-11-01 | **Plan**: [plan.md](plan.md) (CodeGraph structural check) | **Task**: T016

Run after `codegraph sync`, with `codegraph_explore "applyTargetModeRefinementForFolderScoped activeFileLocatorMessage folderScopedLocatorMessage getActiveFileInputSchema filesInputSchema pathsInputSchema"`.

## Checks

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | No new error class or code; `src/errors.ts` unchanged | **Pass** | `git diff --stat -- src/errors.ts` is empty. The rejection is still a Zod `custom` issue surfaced as `VALIDATION_ERROR` by `registerTool`; no `UpstreamError` path was touched. |
| 2 | No handler imports `createLogger` / `createQueue`; `src/server.ts` unchanged | **Pass** | `git diff --stat -- src/server.ts src/tools/_register.ts` is empty. No handler file changed. |
| 3 | Only `get_active_file/schema.ts` passes a second argument | **Pass** | `getActiveFileInputSchema` calls `applyTargetModeRefinementForFolderScoped(folderScopedTargetModeBaseSchema, activeFileLocatorMessage)`. `filesInputSchema` and `pathsInputSchema` still pass one argument, and `files/schema.ts` / `paths/schema.ts` are unchanged on disk. |
| 4 | The new message function is reachable | **Pass** | The index lists `activeFileLocatorMessage` (`src/tools/get_active_file/schema.ts:20`) with its caller in the same file, `getActiveFileInputSchema`, which `get_active_file/index.ts` registers. The private default `folderScopedLocatorMessage` (`src/target-mode/target-mode.ts:97`) is reached as the parameter default by `files`. |

## Module placement and imports

- `folderScopedLocatorMessage` is module-private in `src/target-mode/target-mode.ts`; `activeFileLocatorMessage` is module-private in `src/tools/get_active_file/schema.ts`. Neither is exported.
- No new import edge. `get_active_file/schema.ts → target-mode.ts` already existed (tool → shared primitive, one-directional, Principle I).

## Kernel nodes

None touched, as the plan claimed: `createLogger`, `createQueue`, `UpstreamError` and `createServer` are neither edited nor newly called.

## Published surface

`npm run baseline:write` moved exactly one fingerprint, `get_active_file`'s `descriptionFingerprint`. Its `schemaFingerprint` and every other tool's fingerprints are unchanged (superRefine messages are invisible to JSON Schema). The generator also rewrote its `generatedFromBranch` metadata field to this branch, as it does on every regeneration.

## Deviations

None from the plan.

Two observations about the environment, not this change:

- `npm run format:check` reports 1,230 files on this Windows working copy, including files the change does not touch (`vitest.config.ts`, `tsconfig.json`). The cause is `core.autocrlf=true` checking files out with CRLF. Every hunk this change added was checked against Prettier with `--end-of-line auto` and conforms; the Prettier deviations that remain in `target-mode.ts`, `target-mode.test.ts`, `get_active_file/index.ts` and `get_active_file/schema.test.ts` were already there at HEAD and are left alone.
- T017, the optional live check, was not run: validation fails before any CLI call, so it adds nothing the wire-level test in `index.test.ts` (A2) does not already cover.
