# Post-Implement Structural Verification: Tech Stack Upgrade

**Feature**: `067-upgrade-tech-stack` | **Run**: 2026-07-05 (T047), on main at the
PR #79 merge (all five increments landed: PRs #75, #76, #77, #78, #79; docs PR #74)

`/graphify --update` refreshed the graph first: 237 changed files re-extracted
(113 code via AST, 124 docs via semantic extraction across 6 parallel subagents);
merged graph 18,812 nodes / 25,527 edges / 1,160 communities. The four checks below
ran against that refreshed graph per plan.md § Graphify structural check.

## Check 1 — No new error-class nodes outside src/errors.ts: PASS

All eight top-level `UpstreamError` codes (VALIDATION_ERROR, CLI_REPORTED_ERROR,
CLI_NON_ZERO_EXIT, FS_WRITE_FAILED, PATH_ESCAPES_VAULT, OUTPUT_CAP_EXCEEDED,
UPSTREAM_TIMEOUT, INTERNAL_ERROR) remain in the `src/errors.ts` star. The error-like
nodes elsewhere (`ErrorCode` union in logger.ts, `ToolErrorPayload` in _shared.ts, the
per-tool `*EvalErrorCode` unions in schema files) all predate BI-067 — none introduced
by this feature. The Principle IV zero-new-top-level-codes streak holds; the SC-009
lint gate now enforces it structurally going forward.

## Check 2 — No production handler imports the boot-time DI factories: PASS

The only production-file neighbors of `createLogger()` and `createQueue()` are
`server.ts` / `createServer()` (plus their own defining modules). No handler reaches
back into the composition root; `RegisterDeps` / `ExecuteDeps` injection discipline
is intact. `server.ts` itself received a comment-only touch in this BI (two justified
`eslint-disable @typescript-eslint/no-deprecated` lines for the deliberate low-level
SDK `Server` usage) — flagged in PR #78 and accepted at review; no structural change.

## Check 3 — Normalizer landed in the boot-spine community beside toMcpInputSchema: PASS

`normalizeToDraft7Parity()`, `normalizeNode()`, and `isBarePrimitiveBranch()` (the
BI-067 descriptor-parity pass) all cluster in the same community as
`toMcpInputSchema()` — the boot-spine tool-factory community containing the
`create*Tool()` cohort and the registerTool surface. No surprise placement. Known
dedup-imperfection caveat applies: semantic re-extraction produced additional
`toMcpInputSchema` marker nodes in spec-artifact communities; the AST nodes are the
structural truth and they co-locate as planned.

## Check 4 — No orphaned production code: PASS

New production files from the BI (including the PR #78 review refactor):

- `src/tools/_required-string.ts` / `requiredString()` — degree 4, consumed by
  create_base and query_base schemas. Connected.
- `src/tools/_schema-test-utils.ts` — degree 26 (walkSchema, countDescriptionKeys,
  messageForPath consumed across the schema.test.ts cohort). Connected — and being
  test-support, weak connectivity would have been acceptable anyway.

## Kernel-node stability (relative claims)

`createQueue()`, `UpstreamError`, `invokeCli()`, `registerTool()`, and
`createServer()` remain the top god-nodes by degree — the kernel set named in
CLAUDE.md § Validated architectural facts is unchanged by this BI.
`toMcpInputSchema()` — the highest-blast-radius rewrite of the BI — retains its
chokepoint role (called by registerTool, imported across the per-tool test cohort).

## Deviations

None structural. Two review-time findings already recorded in their PR trails, noted
here for completeness: (1) the normalizer walk originally descended into `properties`
maps (field names colliding with schema keywords could be corrupted) — latent, no
current tool affected, fixed in the PR #78 review commit `4c2ef96` with a
walk-boundary test; (2) the enum-mismatch issue-code consolidation
(`invalid_enum_value` → `invalid_value`) is a documented accepted drift, wire-visible
only for enum-mismatch input; ADR-015 `params` machine codes are unaffected.
