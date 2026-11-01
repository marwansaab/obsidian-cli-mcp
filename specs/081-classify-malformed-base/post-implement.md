# Post-implement structural verification: 081-classify-malformed-base

**Task**: T021 | **Plan**: [plan.md](plan.md) §CodeGraph structural check | **Date**: 2026-11-01

`codegraph sync` was run after the implementation, then `codegraph_explore` on `INVALID_YAML_PATTERN`, `listFocusedViews`, `executeViewsBase` and `classifyUpstreamError`. The checks below were also cross-checked with `git diff` and `git grep`.

## 1. No new top-level code or error class

**Pass.** `src/errors.ts` is unchanged (`git diff --stat` is empty for it). Every new failure is constructed as `new UpstreamError({ code: "CLI_REPORTED_ERROR", … })` in `src/tools/views_base/handler.ts` (`onInvalidYaml` in both modes, and the named-mode `onNotABase`). The `details.code` values used (`BASE_MALFORMED`, `BASE_NOT_FOUND`) already existed. The only new `details.reason` values are `invalid-yaml` (already used by `query_base`) and `unknown`, the ADR-015 default sub-state.

## 2. DI discipline

**Pass.** No handler imports `createLogger` or `createQueue` (`git grep` over every `handler.ts` finds no such import). `src/server.ts`, `src/cli-adapter/**`, `src/tools/_register.ts` and `src/tools/_eval-parse.ts` are unchanged. `views_base` still receives `logger` and `queue` through `ExecuteDeps`.

## 3. Module placement and import direction

**Pass.** `src/tools/_base-malformed.ts` sits beside the other shared Bases helper, `_base-path.ts`. Its importers are exactly:

- `src/tools/views_base/handler.ts` (`INVALID_YAML_PATTERN`, line 26);
- `src/tools/query_base/handler.ts` (`INVALID_YAML_PATTERN`, line 21);
- `src/tools/_base-malformed.test.ts`.

`views_base/handler.ts` also imports `stdoutDetails` from `src/tools/_eval-parse.ts`, a shared helper. Every new import runs tool → shared helper. `views_base` imports nothing from `query_base` and the reverse holds: the only cross-mentions are comments.

## 4. Reachability and no inline copy

**Pass.** CodeGraph reports `INVALID_YAML_PATTERN` used from both production handlers (`listFocusedViews` on the failure and clean-exit paths; `CLASSIFIER_PATTERNS` in `query_base`) and tested by `_base-malformed.test.ts`. No inline copy of the regex remains in `query_base/handler.ts`: the `invalid-yaml` entry reads `pattern: INVALID_YAML_PATTERN`. The only remaining occurrences of the BI-057 phrase in `src/tools/query_base` and `src/tools/views_base` are test inputs. `_base-malformed.test.ts` pins the moved constant's `source` and `flags` to the original literal.

The new private helpers in `views_base/handler.ts` (`isViewLine`, `stdoutLines`, `upstreamReport`, `reportDetails`, the `FailureHandlers` interface) all have callers inside `listFocusedViews` or `executeViewsBase`, which `createViewsBaseTool` calls. Nothing new is orphaned.

This is SC-005's structural proof. Its live proof is T020 step 5 in [contracts/t0-probe-findings.md](contracts/t0-probe-findings.md): the same broken file gives `BASE_MALFORMED` / `invalid-yaml` from both tools.

## Kernel nodes

Not touched, as the plan claimed. `UpstreamError` is used at new construction sites but not edited. `createLogger`, `createQueue` and `createServer` are unchanged.

## Deviations

None from the plan's structure. One implementation detail worth recording: on both paths the not-a-base check keeps its pre-081 scan text (the combined raw stdout and stderr), as T007 specifies, so a view line containing the not-a-base phrase behaves exactly as before. Only the YAML check uses the view-line-free report.
