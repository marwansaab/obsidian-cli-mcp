# Bug Fix: Smart Connections tools report `headingPath: [""]` for text before a note's first heading

- **Slug**: bi-0184
- **Fixed**: 2026-11-04
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Both Smart Connections eval templates now split a plugin block key into `{path, headingPath}` through one shared in-eval fragment, `SPLIT_BLOCK_KEY_JS` in `src/tools/_smart-connections.ts`, which drops empty segments after splitting. A note's pre-heading block, keyed `<path>#`, now comes back with `headingPath: []` (the same as a whole-note match) instead of `[""]`, and no result's `headingPath` can contain an empty string.

The PR #141 code-quality review later renamed the fragment to `TO_MATCH_JS` and widened it to build the whole match; see *Code-quality review fixes* below. The sections up to that one describe the fix as first committed (`bfc43d9`).

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/_smart-connections.ts` | modified | New export `SPLIT_BLOCK_KEY_JS`, a function-expression fragment: split on the first `#`, then on every `#` after it, `.filter(s=>s!=='')`. Header comment names it beside `MAX_LIMIT` and `SORT_SLICE_AND_EMIT`. |
| `src/tools/smart_connections_query/_template.ts` | modified | The inline key split is replaced by `const splitKey=${SPLIT_BLOCK_KEY_JS};` and `splitKey(m.key\|\|'')`; header comment's Stage 5 text names the shared fragment and BI-0184. |
| `src/tools/smart_connections_similar/_template.ts` | modified | Same replacement over its own key extraction `(r.item&&r.item.key)\|\|r.key\|\|''`; header comment's Stage 6 text updated. Self-exclusion and the shared sort tail are unchanged. |
| `src/tools/_smart-connections.test.ts` | added | Input→output table for the fragment run under `node:vm`, compared as JSON (vm objects come from another realm, per `.memory/refactor-decisions.md` item 53). |
| `src/tools/smart_connections_query/_template.test.ts` | added tests | New `BI-0184` describe block: acceptance-criteria rows and a mixed-key AC 6 row. |
| `src/tools/smart_connections_similar/_template.test.ts` | added tests | Same block on the similar side, plus the source note's own `Src.md#` block in the mixed set to guard self-exclusion. |

## Diff Highlights

```ts
// src/tools/_smart-connections.ts
export const SPLIT_BLOCK_KEY_JS =
  "(key=>{const i=key.indexOf('#');return i===-1?{path:key,headingPath:[]}:{path:key.slice(0,i),headingPath:key.slice(i+1).split('#').filter(s=>s!=='')};})";
```

```js
// smart_connections_query/_template.ts (rendered template)
const splitKey=${SPLIT_BLOCK_KEY_JS};
const matches=(Array.isArray(r)?r:[])
.map(m=>{
const {path,headingPath}=splitKey(m.key||'');
return {path,headingPath,score:m.score};
})
```

The similar template has the same shape over `(r.item&&r.item.key)||r.key||''`. The match objects keep their key order (`path`, `headingPath`, `score`).

## Tests Added or Updated

- `src/tools/_smart-connections.test.ts` — `SPLIT_BLOCK_KEY_JS` table: `Note.md` → `[]`; `Note.md#` and `Dir/Note.md#` → `[]`; `Note.md#H1` → `["H1"]`; `Note.md#H1#H2` → `["H1","H2"]`; `Note.md#---frontmatter---` → `["---frontmatter---"]`; `Note.md#H1#{1}` → `["H1","{1}"]`; edge keys `Note.md#H1#` → `["H1"]`, `Note.md##H2` → `["H2"]`, `Note.md##` → `[]`; `""` → `{path:"", headingPath:[]}`.
- `smart_connections_query/_template.test.ts` "BI-0184: a note's opening text has an empty headingPath" — AC 1 (`Note.md#` → `[]`), AC 3 (`Note.md` → `[]`), AC 4 (`Note.md#H1#H2` → `["H1","H2"]`), AC 5 (`Note.md#---frontmatter---`), and AC 6: a mixed set (pre-heading, whole-note, nested, frontmatter, `N.md#H1#`, `N.md##H2`) where no `headingPath` contains `""` and the full match list, scores included, is pinned in the documented order.
- `smart_connections_similar/_template.test.ts` "BI-0184: …" — the same rows with AC 2 (`Other.md#` → `[]`) in place of AC 1, and the source note's own pre-heading block `Src.md#` in the AC 6 set, which must stay excluded.

The four pre-heading and AC 6 rows were run against the unfixed templates first and failed (`headingPath: [""]`, "expected [ '' ] to not include ''"); every other new row passed before and after, as regression guards.

## Local Verification

- `npx vitest run src/tools/smart_connections_query/_template.test.ts src/tools/smart_connections_similar/_template.test.ts` before the fix → 4 failed, 27 passed (the expected red rows).
- `npx vitest run src/tools/_smart-connections.test.ts src/tools/smart_connections_query src/tools/smart_connections_similar` after the fix → 9 files, 212 tests passed.
- `npm run typecheck` → clean.
- `npm run lint` → clean.
- `npm test` (full suite with coverage) → 198 files passed, 1 skipped; 4925 tests passed, 6 skipped. `_surface.test.ts` passed, and no fingerprint baseline file changed, so the published tool surface is unchanged (as the assessment predicted: descriptions and schemas are untouched).
- Manual checks: none. The live check against the authorised test vault belongs to `/speckit-bug-test`.

## CodeGraph structural verification

Run with `codegraph_explore` on `SPLIT_BLOCK_KEY_JS` and the two templates after the change.

1. **No new error codes**: none added. No error class, no `UpstreamError` construction and no envelope error branch changed; `mapEnvelopeError` is untouched.
2. **No handler imports the boot-time DI factories**: no handler changed. The only new import edges are from the two `_template.ts` files to `_smart-connections.ts`.
3. **Module placement and import direction**: `SPLIT_BLOCK_KEY_JS` sits in the cohort leaf `src/tools/_smart-connections.ts`, beside `MAX_LIMIT` and `SORT_SLICE_AND_EMIT`. Its callers are `smart_connections_query/_template.ts` and `smart_connections_similar/_template.ts`, both downward edges in the same direction as the existing imports (Principle I). No tool→tool edge was added.
4. **Reachability**: the new export has production callers in both templates (each handler passes its `JS_TEMPLATE` to `composeEvalCode`), plus its own test in `_smart-connections.test.ts`. Nothing is orphaned.

**Kernel-node claim**: the assessment said the fix touches none of `createLogger()`, `createQueue()`, `UpstreamError` or `createServer()`. That held: none of them is changed, called or newly imported.

## Deviations from Assessment

None in the remediation itself: the preferred option (one shared fragment in `_smart-connections.ts`, interpolated into both templates, filtering every empty segment) was applied as proposed, within the listed files.

- `src/tools/_smart-connections-fixtures.ts` was not changed. Its `keyOf` oracle already maps `headingPath: []` to the bare path, and the new tests pin `headingPath` directly rather than through `keyOf`, so no pre-heading case was needed there.
- The assessment's out-of-scope guard ("sort order and scores unchanged from the pre-fix render for keys that were already well-formed") is pinned by an explicit expected list in the documented order, not by a comparison against a stored pre-fix render. For well-formed keys the two are the same thing: `[]` and the old `[""]` both join to `""` in `SORT_SLICE_AND_EMIT`'s tertiary key, so the order of every well-formed key is unchanged.
- Ordering risk noted in the assessment, now realised for the edge keys only: `N.md#H1#` and `N.md##H2` used to join to `"H1#"` and `"#H2"` (so `##H2` sorted first); after the fix they are `["H1"]` and `["H2"]` and sort `H1` before `H2`. No such key has been observed from the plugin; the AC 6 rows pin the new order.

## Code-quality review fixes (PR #141)

The thermo-nuclear review approved the fix and raised three low findings. All three are fixed, within the files the assessment lists:

- **One owner for the match shape.** Both templates still built the published match object themselves (`const {path,headingPath}=splitKey(K);return {path,headingPath,score:X.score};`). The fragment is now `TO_MATCH_JS`, `(key,score)=>{…;return {path,headingPath,score};}`, and each template's `.map` is one call: `toMatch(m.key||'',m.score)` (query) and `toMatch((r.item&&r.item.key)||r.key||'',r.score)` (similar). The split rule is unchanged, and so is the key order of the match object. The rendered `JS_TEMPLATE` text changes; its behaviour does not. `_smart-connections.test.ts` now checks the whole match, score included.
- **One copy of the BI-0184 test cases.** The AC 1–5 rows and the AC 6 mixed set with its expected list were copy-pasted in both `_template.test.ts` suites. They now live once in `_smart-connections-fixtures.ts` (`HEADING_PATH_CASES`, `MIXED_HEADING_KEYS`, `MIXED_HEADING_MATCHES`). Each suite, still next to its own template, runs them through its own `page`, and the similar suite adds its `Src.md#` self-exclusion row. The opening-text row uses `Note.md#` in both suites now (the similar suite used `Other.md#`; `Note.md` is not the similar suite's source note, so the case is the same).
- **The shared test oracle agrees with the template on edge keys.** `documentedOrder` split keys with a raw `split("#")`, so for `N.md#H1#` its tertiary key was `"H1#"` where the template's is `"H1"`. It now drops empty segments before the join, and `ScoredKey` / `keyOf` document the `<path>#` form. A new query-suite test lays the AC 6 mixed set out with `documentedOrder` and pins the result; it failed against the old oracle and passes now.

Quality gates after these fixes: `npm run typecheck` clean, `npm run lint` clean, `npm run build` clean, `npm test` 198 files passed, 1 skipped; 4926 tests passed, 6 skipped (was 4925, +1 for the oracle test). No fingerprint baseline changed.

## Follow-ups

- `/speckit-bug-test slug=bi-0184`: live check against the authorised test vault per `.memory/test-execution-instructions.md`, using the report's `Fixtures/BI-0062/long-line.md` and `Fixtures/BI-0123/latin-3072.md` opening blocks, on both `smart_connections_query` and `smart_connections_similar`.
- Docs pass (`/speckit-docs-as-code`): `docs/tools/smart_connections_query.md` and `docs/tools/smart_connections_similar.md` already promise `headingPath: []` for a source-level match. The pass may add that a note's opening text (a `<path>#` key) is reported the same way, and `.docs-as-code/` should name `SPLIT_BLOCK_KEY_JS` beside `SORT_SLICE_AND_EMIT`.
