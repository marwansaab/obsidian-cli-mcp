# Contract: `smart_connections_query` and `smart_connections_similar` ordering

This contract covers what each tool returns for a given plugin answer.

- **Rows T1–T9** run in the new `src/tools/smart_connections_query/_template.test.ts`. That file runs the real `JS_TEMPLATE` under `node:vm`, against a stub plugin whose `lookup` records its request, returns its fixture in **plugin order**, and truncates the list to `filter.limit`.
- **Rows T10–T15** run in the new `src/tools/smart_connections_similar/_template.test.ts`. The same approach is used there, with a stub source note whose `find_connections` records its request, returns its fixture in plugin order, and truncates to `limit`.
- **Rows S1–S5** are surface checks in existing suites.

## `smart_connections_query` template behaviour (vm)

| Row | Given (plugin fixture, plugin order) | When | Then | Spec |
|-----|--------------------------------------|------|------|------|
| T1 | `Z.md` 0.9, `A.md` 0.9, `M.md` 0.5 | the template runs with `limit: 1`, then with `limit: 2` | `limit: 1` → `[A.md]`; `limit: 2` → `[A.md, Z.md]`; page(1) = page(2)[0..1) | US1 AS1, AS3; FR-001, FR-003, FR-010(a) |
| T2 | 150 candidates with clustered equal scores, arranged so ties are out of path order | the template runs at every limit 1..100 | for **every** pair N < M in 1..100 (4,950 pairs), page(N) equals page(M)[0..N) exactly | US1 AS2; FR-003; SC-001 |
| T3 | 3 blocks at one score, same note, `headingPath` `["c"]`, `["a"]`, `["b"]` | the template runs | the blocks come back in heading order `a`, `b`, `c` | US2 AS1; FR-004 |
| T4 | a tied group of 5 at one score, ranked 3–7, in reverse path order | the template runs with `limit: 4`; then it runs a second time with the same input | ranks 3–4 are the two path-first members of the group; the second run's result deep-equals the first | US2 AS2, AS3; FR-004, FR-010(b); SC-002 |
| T5 | any fixture | the template runs with `limit` 1, 20 and 100 | each recorded `lookup` request has `filter.limit === MAX_LIMIT` (100), and the query is passed through | FR-002, FR-010(c) |
| T6 | the T2 fixture | the template runs with `total: true` and `total: false` at the same `limit` | `count` is equal in both; `matches` is `[]` with `total: true` | FR-007 |
| T7 | a fixture holding `NaN`, `null`, a missing score and `Infinity` among finite scores | the template runs | non-finite matches are absent, and the finite ones obey V1 and V2 | Edge: non-finite; FR-008 |
| T8 | fewer finite candidates than `limit` | the template runs with `limit: 100` | every finite candidate comes back, in documented order, and `count` equals their number | Edge: fewer than limit |
| T9 | any fixture | the template runs | each returned `score` is `===` the fixture's score for that key | FR-005; SC-003 |

## `smart_connections_similar` template behaviour (vm)

The source note is `Src.md`, resolved through `path`. Fixture items use the plugin's `{ item: { key }, score }` shape.

| Row | Given (connection-finder fixture, plugin order) | When | Then | Spec |
|-----|------------------------------------------------|------|------|------|
| T10 | `Z.md` 0.9, `A.md` 0.9, `M.md` 0.5 | the template runs with `limit: 1`, then with `limit: 2` | `limit: 1` → `[A.md]`; `limit: 2` → `[A.md, Z.md]`; page(1) = page(2)[0..1) | US1 AS4; FR-001, FR-003, FR-010(a) |
| T11 | 150 candidates with clustered ties out of path order, including 3 blocks of `Src.md` scattered among them | the template runs at every limit 1..100 | for every pair N < M, page(N) equals page(M)[0..N), and no `Src.md` entry appears | US1 AS4; FR-003, FR-008; SC-001 |
| T12 | a tied group of 5 in reverse path order, ranked 3–7 | the template runs with `limit: 4` | ranks 3–4 are the two path-first members of the group | US2 AS2; FR-004, FR-010(b) |
| T13 | any fixture | the template runs with `limit` 1, 20 and 100 | each recorded `find_connections` request has `limit === MAX_LIMIT` (100) | FR-002, FR-010(c) |
| T14 | the T11 fixture | the template runs with `total: true` and `total: false` at the same `limit` | `count` is equal in both; `matches` is `[]` with `total: true` | FR-007 |
| T15 | a fixture with non-finite scores among finite ones | the template runs | non-finite entries are absent; each returned `score` is `===` the fixture's | FR-005, FR-008; SC-003 |

Error envelopes are not touched in either tool by this change:
- `smart_connections_query`: `SMART_CONNECTIONS_NOT_INSTALLED`, `…_NOT_READY_API_MISSING`, `…_NOT_READY_EMBED_FAILED`.
- `smart_connections_similar`: `NO_ACTIVE_FILE`, `FILE_NOT_FOUND`, `NOT_MARKDOWN`, `SMART_CONNECTIONS_NOT_INSTALLED`, `SMART_CONNECTIONS_NOT_READY`, `SOURCE_NOT_INDEXED`.

Each tool's existing handler tests still cover its envelopes, unedited.

## Published surface

| Row | Check | Where | Spec |
|-----|-------|-------|------|
| S1 | `SMART_CONNECTIONS_QUERY_DESCRIPTION` contains the leading-slice sentence (it names "leading slice"). | `smart_connections_query/index.test.ts` (new case) | FR-009 |
| S2 | `docs/tools/smart_connections_query.md` states that `limit` applies after the sort, and lists the 100-candidate tie edge under Inherited limitations. | `smart_connections_query/index.test.ts` (new case) | FR-009 |
| S3 | After `npm run baseline:write`, the `_register-baseline.json` fingerprint changes are exactly the `descriptionFingerprint` of `smart_connections_query` and of `smart_connections_similar`. `schemaFingerprint`, `outputSchemaFingerprint`, `titleFingerprint` and `annotationsFingerprint` are unchanged for every tool. The envelope metadata `generatedFromBranch` / `generatedAt` may also change; this is expected and is not a failure. | `git diff` at implementation, plus the existing baseline test | FR-006; SC-004 |
| S4 | `SMART_CONNECTIONS_SIMILAR_DESCRIPTION` contains the leading-slice sentence. | `smart_connections_similar/index.test.ts` (new case) | FR-009 |
| S5 | `docs/tools/smart_connections_similar.md` states that `limit` applies after the sort (the `limit` bullet no longer says it "mirrors the plugin's `find_connections({limit})` parameter"), and lists the 100-candidate tie edge under Documented inherited limitations. | `smart_connections_similar/index.test.ts` (new case) | FR-009 |
