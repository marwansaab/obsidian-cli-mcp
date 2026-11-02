# Data Model: Stabilise query ordering

No schema changes. The input and output shapes of `smart_connections_query` and `smart_connections_similar` are unchanged (spec FR-006). This file pins the entities the ordering guarantee is about, and the rules the tests check.

## Entities

### E1: Match (unchanged)

`{ path: string (ends ".md"), headingPath: string[], score: number }` is `matchEntrySchema` in each tool's `schema.ts`. `score` is passed through unchanged (FR-005).

### E2: Candidate set (changed)

- **Before**: up to `limit` plugin results. The plugin chooses which ones when scores tie.
- **After**: up to `MAX_LIMIT` (100) plugin results, whatever `limit` the agent sent:
  - in `smart_connections_query`, from `lookup` with `filter:{limit:100}`;
  - in `smart_connections_similar`, from `find_connections` with `{limit:100}`.
- Matches with a non-finite score are dropped before ordering (unchanged). In `smart_connections_similar`, so are the source note's own blocks (unchanged).

### E3: Documented ordering (unchanged)

The comparator is the same in both templates:

1. `score` descending;
2. then `path` ascending, by byte;
3. then `headingPath.join('#')` ascending, by byte.

It is a total order on distinct matches.

### E4: Returned page

The first `limit` entries of E3 applied to E2 after its filters. `count` = the page length. With `total: true`, `matches` is `[]` and `count` stays the same.

### Constant

- `MAX_LIMIT = 100`, exported from the cohort leaf module `src/tools/_smart-connections.ts` (PR #116 review amendment; it was first one constant per tool's `schema.ts`). In both tools it is the input schema's `limit` maximum and the candidate count in the template. Both tools import it downward, so there is still no tool → tool import (Principle I).

## Rules (each is checked in [contracts/ordering-contract.md](contracts/ordering-contract.md))

- **V1, leading slice**: for limits N < M in 1..100, page(N) = page(M)[0..N).
- **V2, tie order**: within any run of equal scores on a page, entries are in `path` order, then `headingPath` order. This holds whatever order the plugin returned them in.
- **V3, fixed request**: each template asks the plugin for `MAX_LIMIT` candidates for every `limit` value.
- **V4, count invariant**: `count` is the same with `total: true` and `total: false` for the same call and limit.
- **V5, pass-through**: every returned `score` equals the plugin's value for that match.
- **V6, unchanged surface**: error envelopes, error codes, input schemas and output schemas do not change. Only the two tools' `descriptionFingerprint` values move in the baseline.
- **V7, self-exclusion unchanged**: `smart_connections_similar` never returns a block of the source note.
