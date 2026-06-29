# Post-Implement: Fix Views Base (BI-064)

**Feature**: 064-fix-views-base | **Date**: 2026-06-29 | **Plan**: [plan.md](plan.md)

Implementation landed. Resolved arm: **native focus-first** (T007). Evidence: [contracts/t0-probe-findings.md](contracts/t0-probe-findings.md).

## What shipped

- **US1 — clean names**: `stripTypeLabel` in [handler.ts](../../src/tools/views_base/handler.ts) removes the injected `\t<type>` label (T0 P1: TAB delimiter; closed type set `{table, cards, list}` captured live), preserving internal spaces/hyphens/punctuation. Live round-trip confirmed (T024): a stripped name is accepted verbatim by `base:query`; the un-stripped `name\ttype` is rejected (`View not found`).
- **US2 — named Base**: optional `base_path` ([schema.ts](../../src/tools/views_base/schema.ts), `INVALID_BASE_PATH` sub-issues byte-parity with `query_base`) drives a focus-then-active flow — a frozen [_template.ts](../../src/tools/views_base/_template.ts) `openLinkText` eval (composed via the shared `composeEvalCode`, no `open_file` import) focuses the named `.base`, then active `base:views` reads it. `vault` routes cross-vault (inherited `dispatchCli`/ADR-031). One sanctioned DI line added in [server.ts](../../src/server.ts) (`vaultRegistry`).
- **US3 — distinguishable failures**: `BASE_NOT_FOUND/named-missing` (focus `FILE_NOT_FOUND` remapped, not leaked) vs `BASE_NOT_FOUND/not-open` vs `VALIDATION_ERROR/INVALID_BASE_PATH` vs `BASE_MALFORMED` vs `VAULT_NOT_FOUND/unknown`. No silent open-Base substitution on any named-path failure.

## Probe-driven design correction (D5)

The plan/D5 assumed a **space** delimiter and mandated token-anchored stripping to avoid over-trimming. T0 P1 showed the real delimiter is a **TAB**, which a view name cannot contain — so the name/type split is unambiguous. `stripTypeLabel` splits on the trailing tab and is *additionally* guarded by the known-type set, preserving the spec's "never blind-trim" intent. research.md D5 and data-model.md Stage C updated.

## Structural verification (T025)

The full `/graphify --update` refreshes semantic (prose) nodes at real token cost and adds nothing to the lexical/structural checks below; the AST graph rebuilds automatically on the next commit via the post-commit hook. Verification was done by authoritative grep (per CLAUDE.md "grep is correct for lexical questions") + git diff:

1. **No new top-level error code (Principle IV)** — confirmed. `handler.ts` emits only `CLI_REPORTED_ERROR` at the top level; `BASE_NOT_FOUND` / `BASE_MALFORMED` are `details.code` sub-discriminators and `reason` is a string literal. `INTERNAL_ERROR` (eval decode) and `VAULT_NOT_FOUND` (remap) are reused. **`src/errors.ts` is untouched** (empty diff) ⇒ no new error-class node.
2. **Handler imports neither the boot-time DI factories nor the `open_file` module** — confirmed. `handler.ts` (production) has zero hits for `createLogger` / `createQueue` / `createServer` / `open_file`. The only `createQueue` references are test-fixture construction in `*.test.ts`; the only `open_file` references are prose comments documenting the deliberate non-import (Principle I). `createLogger`/`createQueue` arrive via injected `ExecuteDeps`.
3. **No community migration** — the new imports are all downward to shared primitives (`../_active-file.js`, `../_shared.js`, local `./_template.js`), the same cohort `query_base` already consumes; no sibling-tool edge was added, so `views_base` stays a native Bases-family wrapper that now also composes the shared focus primitive. No D9 eval-fallback was taken (P3 reliable).
4. **Modified production files remain connected** — `_template.ts` ← `handler.ts` ← `index.ts` ← `server.ts`; `schema.ts` ← `handler.ts`/`index.ts`.

## Guardrail / baseline

- `_register-baseline.json` `views_base` fingerprints regenerated via `npm run baseline:write` (description + schema moved — the expected reviewed path, not drift). The FR-018 stability test and the per-tool invariant table (`properties_equals_set` now `{vault, base_path}`) pass.
- Tool count unchanged at 34 (no tool added/removed).

## Gates

- `npm run typecheck` / `npm run lint` / `npm run build` — clean.
- Full suite (Windows-safe `--pool=forks --no-file-parallelism`): **2759 passed, 6 skipped, 0 failed**; coverage 96.67% statements / 93.18% branches (thresholds held). `views_base` module 100% statements.
- T024 quickstart: US1 round-trip, US2 focus-then-active, US3 named-missing validated live against the running vault; invalid-locator + bad-vault are unit-covered. Probe fixtures cleaned from the TestVault `Sandbox/`.
