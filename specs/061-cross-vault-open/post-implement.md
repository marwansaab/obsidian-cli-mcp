# Post-Implement Structural Verification — BI-061 (Open Cross-Vault Files)

**Date**: 2026-06-01 · **Branch**: `061-cross-vault-open` · Run after `/speckit-implement` landed the code, before marking the BI complete. Per CLAUDE.md "Post-implement structural verification" + tasks.md T017.

**Method note**: the `/graphify --update` skill wrapper could not run this session — its install step (`pip install graphifyy` fallback) was blocked by the harness safety classifier, which cancelled the pipeline before any extraction. graphify is installed, but I did not work around the denial. The four structural checks below were therefore performed by **direct source inspection** of `src/tools/open_file/*.ts` (grep over imports/error-codes + the import chain), which is authoritative for these claims, alongside the passing typecheck/lint/build/test gates. The committed `graphify-out/graph.json` (AST-only, refreshed by the post-commit hook) will pick up these files on the next commit; that does not change any conclusion here.

## Checks (all PASS)

| # | Check | Result |
|---|-------|--------|
| 1 | **No new top-level error code / `details.reason`** (Principle IV) | PASS — `handler.ts` classifies only through `CLI_REPORTED_ERROR` (the `FILE_NOT_FOUND` and `UNSUPPORTED_FILE_TYPE` `details.code` mappings) and `INTERNAL_ERROR` (malformed envelope, via `decodeEvalEnvelope`). Both top-level codes pre-exist in `src/errors.ts`. The retired `VAULT_NOT_FOCUSED → VAULT_NOT_FOUND/reason:"not-open"` mapping is **removed**; no emitter remains (unit test asserts a legacy `VAULT_NOT_FOCUSED` envelope now decodes to `INTERNAL_ERROR`, never `not-open`). App-down reuses inherited `CLI_NON_ZERO_EXIT/obsidian-not-running`. Zero-new-codes streak preserved. |
| 2 | **No boot-time DI factory import in the handler** | PASS — grep of `src/tools/open_file/*.ts` for `createLogger`/`createQueue`/`createServer` returns matches **only in test files** (`handler.test.ts`/`index.test.ts` construct `createQueue()` fixtures); zero in production `handler.ts`. `logger`/`queue` arrive via injected `ExecuteDeps`; the factories stay confined to `server.ts`. |
| 3 | **open_file stays in the eval-composed cohort; no new `app-launcher` edge** | PASS — grep for `app-launcher`/`launchObsidian`/`launchFn` across production `open_file/*.ts` returns matches only in *prose* (the handler header comment documenting their deletion) and in `handler.test.ts` (the structural assertions that forbid them) — no `import` statement, no dependency field. open_file routes through `invokeCli`/`decodeEvalEnvelope`/`composeEvalCode` (the eval-composed cohort); recovery remains inherited in `dispatchCli` (ADR-029/030); ADR-030's two-spawn-site invariant untouched. |
| 4 | **New production code structurally connected (not orphaned)** | PASS — `handler.ts` is imported by `index.ts` (`createOpenFileTool → executeOpenFile`), `index.ts` by the tool registry; `schema.ts`/`_template.ts` feed `handler.ts`. Graph degrees: handler/schema/_template/index all > 0 (no orphans). Test files are weakly connected by design (noise floor). |

## Kernel-node touch surface

Touches **none** of the four kernel nodes (`createLogger`, `createQueue`, `createServer`, `UpstreamError` construction). `UpstreamError` is imported and instantiated for classification (as every handler does), not modified. Matches the plan's explicit no-touch claim ([plan.md](plan.md) `### Graphify structural check`).

## Scope note

This BI changed `src/**` (the open_file `.ts` files) plus the tool doc and spec artifacts — not docs-only — so checks 1–4 all apply in full. All four pass; no structural deviations to report.

## Merge gates (T015) — recorded for completeness

`npm run lint` (0 warnings), `npm run typecheck`, `npm run build` all clean. Coverage (Windows-safe `--pool=forks --no-file-parallelism`): **2686 passed / 6 skipped / 0 failed**; `src/tools/open_file` **100% statements & lines, 92.85% branch**; aggregate **96.61% statements** (≥ 96 floor).

## Live validation (T002/T016) — see [contracts/t0-probe-findings.md](contracts/t0-probe-findings.md)

Quickstart S1–S8 driven through the real `obsidian` CLI via the production handler (temporary uncommitted integration test, since removed): **7/7 pass**, two consecutive stable runs. Frozen eval string pinned; intra-window leaf enumeration (markdown + non-md `.base`) confirmed complete (D9 caveat resolved). Fixtures cleaned from `TestVault/Sandbox`; Obsidian restored to closed.
