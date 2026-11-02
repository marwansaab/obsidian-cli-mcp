# ADR-055 — Smart Connections tools fetch a fixed candidate list before sorting

- **Status:** Accepted
- **Date:** 2026-11-02
- **Source:** PR #116 (`specs/085-stabilise-query-ordering/`, FR-001 to
  FR-003 and FR-009, Clarifications Q1 = Option A and the analysis
  remediation that brought `smart_connections_similar` in scope, research
  D1 and D5), commit `7302c42`
- **Related:** ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency
  Pattern), whose plugin APIs and lifecycle stages are unchanged. ADR-040
  (Published Parameter Descriptions and Server Instructions), under which
  the guarantee is one description sentence and the edge case lives on the
  help pages.

## Context

`smart_connections_query` and `smart_connections_similar` document one
order: `score` descending, then `path` byte-ascending, then
`headingPath.join('#')` byte-ascending. Their eval templates sorted in that
order and then sliced to `limit`, but they had already passed the agent's
`limit` to the plugin (`lookup({ filter: { limit } })`,
`find_connections({ limit })`). The plugin's cut ran first and chose which
equal-score blocks survived, so the documented tie-break only reordered what
was left. With `Z.md` and `A.md` both at 0.9, `limit: 1` returned `Z.md`
while `limit: 2` returned `[A.md, Z.md]`: a smaller limit was not a leading
slice of a larger one (spec 085 research F1; F5 for the similarity tool).

## Decision

1. **Ask the plugin for `MAX_LIMIT` candidates on every call.** Both
   templates request 100, the maximum allowed `limit`, whatever `limit` the
   agent sent.
2. **Sort in full, then cut once.** The existing trailing
   `.slice(0, a.limit)` becomes the only cut to `limit`, applied after the
   filters (non-finite scores, and the similarity tool's self-exclusion) and
   the full sort.
3. **One source of truth for 100.** The constant is interpolated into the
   template from the same place the input schema's `.max()` reads it. As
   merged in PR #116, each tool's `schema.ts` exports its own `MAX_LIMIT`, so
   the two tools share no module.
4. **Fix both tools together.** The similarity tool had the same
   slice-before-sort step, and the backlog item's out-of-scope note said to
   fix it with the query tool if so. Its self-exclusion, lifecycle checks and
   errors are unchanged.
5. **Document the remaining edge.** Equal-score matches at the plugin's
   100th place are still chosen by the plugin. The help pages say so; the
   descriptions carry only the leading-slice guarantee.

## Alternatives rejected

- **Ask the plugin for its full set, with no limit.** The plugin's behaviour
  when no limit is given was never probed, and the result size would be
  unbounded on large vaults.
- **Ask for more than 100.** It would narrow the tie edge but make every call
  bigger, including the default `limit: 20` call, for a case the edge note
  already covers.
- **A literal `100` in each template, kept in step with the schema by a
  test.** Two sources of truth that a test has to reconcile.
- **A new payload field set by the handler (`candidates: 100`).** It changes
  the handler payload and its tests for no caller-visible gain.
- **Pass `limit` through and accept limit-dependent ties.** That is the
  defect.

## Consequences

- For any `limit` N < M, the N-result call returns the first N entries of the
  M-result call, and a repeat call returns the same list. Each tool's
  `_template.test.ts` checks every pair from 1 to 100 under `node:vm`
  against a stub plugin that truncates to the limit it is asked for.
- Every call, even `limit: 1`, asks the plugin for 100 candidates. That size
  was already reachable with `limit: 100`; it was not measured against a live
  indexed vault (spec 085 SC-005 recorded the fallback evidence instead).
- Raising the maximum `limit` raises the fetch with it, because both read the
  same constant.
- `smart_connections_similar` can return fewer than `limit` matches when the
  source note's own blocks were among the 100 candidates, the same at every
  `limit`.
- Input and output schemas, defaults, handlers, payloads and error envelopes
  are unchanged; only the two description fingerprints moved.
