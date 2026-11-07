# Bug Fix: Classify similarity failures (unembedded source, stale index entry)

- **Slug**: bi-0195
- **Fixed**: 2026-11-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`smart_connections_similar` now reports `SOURCE_NOT_INDEXED` when the plugin lists the source note but has not embedded it yet, instead of letting the plugin's `nearest()` throw into an untyped `CLI_REPORTED_ERROR`. Both Smart Connections templates now leave out outdated index entries before the sort and the cut to `limit`, each with the rule the owner ruled for it: similar keeps only candidates whose path is a Markdown note in the vault now, and query drops only empty paths.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/smart_connections_similar/_template.ts` | modified | Stage 5 also emits `SOURCE_NOT_INDEXED` (same `detail: sourceKey`) when `src.vec` is not an array or typed array, the plugin's own `nearest()` condition, checked before `find_connections`. New vault-note filter after the self-exclusion filter: keep a match only when `app.vault.getAbstractFileByPath(m.path)` returns a file with `extension === 'md'`. Header comment names both changes and the owner ruling. |
| `src/tools/smart_connections_query/_template.ts` | modified | New `.filter(m=>m.path!=='')` after the finite-score filter. No vault lookup; non-empty paths still pass through verbatim (BI-0074 Q2). Header comment names the ruling and warns against merging the two filters. |
| `src/tools/smart_connections_similar/_template.test.ts` | modified + added tests | Q2-approved stub edits: the `items[SRC]` stub gets `vec: [0.6, 0.8]`; the stub vault's `getAbstractFileByPath` knows the source plus every Markdown note a fixture key names. `runTemplate` gains an optional `gone` list (notes moved or deleted since indexing) used only by the new rows. New `BI-0195` describe block (5 rows). |
| `src/tools/smart_connections_similar/handler.lifecycle.test.ts` | modified + added tests | Q2-approved stub edits: `indexed()` gets `vec: [0.6, 0.8]`; L6's simulated vault also holds `Other.md` (its only candidate's note). New `entry(candidates, vec?)` builder (an index entry whose `find_connections` throws `Invalid vector input to nearest()` while it has no `vec`, as the plugin does; since the PR #156 review `indexed(c)` is `entry(c, [0.6, 0.8])`) and rows L5d, L5e, L6b, L8, L9. |
| `src/tools/smart_connections_query/_template.stale-entry.test.ts` | added | New co-located suite for query's empty-path filter (4 rows). The existing `smart_connections_query/_template.test.ts` is not edited (Q2 ruling). |

No production file outside the two templates changed. `src/tools/_smart-connections.ts`, both handlers, both schemas and `_register-baseline.json` are unchanged.

## Diff Highlights

`smart_connections_similar/_template.ts`, Stage 5 and Stage 6:

```js
const src=env.smart_sources.items[sourceKey];
const v=src&&src.vec;
if(!src||typeof src.find_connections!=='function'||!(Array.isArray(v)||ArrayBuffer.isView(v))){
return JSON.stringify({ok:false,code:'SOURCE_NOT_INDEXED',detail:sourceKey});
}
...
.filter(m=>m.path!==sourceKey)
.filter(m=>{const t=app.vault.getAbstractFileByPath(m.path);return !!t&&t.extension==='md';})
${SORT_SLICE_AND_EMIT}
```

`smart_connections_query/_template.ts`:

```js
.filter(m=>Number.isFinite(m.score))
.filter(m=>m.path!=='')
${SORT_SLICE_AND_EMIT}
```

The plugin's source `vec` getter (Smart Connections 4.7.2, `main.js:5595-5597`, read in the test vault's plugin folder) is `this.item.data?.embeddings?.[this.item.embed_model_key]?.vec`: fully optional-chained, so reading it on an unembedded entry returns `undefined` and never throws. The check calls nothing on the plugin.

## Tests Added or Updated

- `smart_connections_similar/handler.lifecycle.test.ts`
  - `L5d: ready, source listed but not embedded yet → not-indexed failure` — the SOURCE_NOT_INDEXED failure naming `Src.md`, one spawn. The stub throws like the plugin if the template queries first.
  - `L5e: ready, note named by wikilink listed but not embedded → not-indexed failure names the resolved path` — `detail` is `Notes/Src.md`.
  - `L6b: listed but not embedded, then embedded → same call returns results` — the same entry fails, then returns results once `vec` is set (two spawns).
  - `L8: an embedding held as a typed array counts as embedded → success` — a `Float32Array` vec passes the check.
  - `L9: outdated entries (empty key, a moved note's old path, a non-note file) are left out → success with the valid matches` — empty key, `Old/Moved.md#H`, `Old/Moved.md` (not in the vault) and `Board.canvas` (in the vault, not Markdown) are absent; one spawn.
  - L1–L7 and P1–P5, A1–A3 unchanged and passing (not-installed, not-ready, not-Markdown outcomes unchanged).
- `smart_connections_similar/_template.test.ts`, `BI-0195: outdated index entries are left out`
  - entries whose key names no path (`""`, `#`, `#H`, the shared `EMPTY_PATH_KEYS` rows in `_smart-connections-fixtures.ts`) are left out, every returned path is non-empty and ends in `.md`;
  - whole-note and block entries of a moved or deleted note are left out, `count` counts kept matches;
  - with four stale entries ahead of the 150-candidate tied fixture, page(100) equals the page for the other 96 candidates the plugin returned, and every page(N) for N in 1..99 is its leading slice;
  - `total: true` counts only the kept matches, at limit 3 and 100.
- `smart_connections_query/_template.stale-entry.test.ts`
  - the same shared `EMPTY_PATH_KEYS` rows are left out, no returned path is empty;
  - a non-empty path naming no vault note (`Old/Moved.md#H`) comes back verbatim (pins the BI-0074 Q2 pass-through; the stub `app` has no `getAbstractFileByPath` at all);
  - leading-slice property with the empty-keyed entry in the fixture;
  - `total: true` counts only the kept matches, at limit 2 and 100.

## Local Verification

- `npx vitest run src/tools/smart_connections_similar src/tools/smart_connections_query src/tools/_smart-connections.test.ts` with the template fix and **before** any stub edit → 16 failures, all in the two similar suites (`_template.test.ts` T10–T15, T12, BI-0184 rows; lifecycle L6, L7), as the assessment's Risks predicted. Query suites passed unchanged.
- Same command after the Q2-approved stub edits only → 238 passed. No assertion, expected value, test title or spawn count was changed.
- Same command with the new rows → 253 passed.
- Regression proof: with the two templates reverted to `HEAD` and the new tests kept → 11 of the new rows fail (L5d, L5e, L6b, L9, and each stale-entry template row at limit 100); restored the fix afterwards. The `total` rows at the small limits (3, 2) pass on the old template by coincidence (the cut happens to equal the kept count); their limit-100 twins fail.
- `npm run typecheck` → clean. `npx eslint src/tools/smart_connections_similar src/tools/smart_connections_query` → clean. `npm run build` → clean.
- `npm test` (full suite with coverage) → 207 files passed, 1 skipped; 5167 tests passed, 6 skipped. This includes the register-baseline fingerprint check; `_register-baseline.json` is unchanged.
- Prettier is not a CI gate (CI runs lint, typecheck, test, build). The touched files follow the surrounding style; `handler.lifecycle.test.ts` and most files in both tool folders were not prettier-clean before this change.
- Manual checks: read the plugin 4.7.2 source in the test vault (`.obsidian/plugins/smart-connections/main.js`) to confirm the `nearest()` throw condition (lines 5016-5020 region) and that the `vec` getters are optional-chained. No live CLI probe was run in this step; the live re-run of TC-00892 / TC-00899 / TC-00225 belongs to `/speckit-bug-test`.

## CodeGraph structural verification

Ran `codegraph sync`, then `codegraph_explore` on `JS_TEMPLATE` (both tools), `executeSmartConnectionsSimilar`, `executeSmartConnectionsQuery` and both `mapEnvelopeError`s.

1. **No new error codes** (Principle IV): none. The new outcome reuses the existing `SOURCE_NOT_INDEXED` envelope code, mapped by the unchanged `SOURCE_NOT_INDEXED` case of `smart_connections_similar`'s `mapEnvelopeError` to `CLI_REPORTED_ERROR`. `src/errors.ts` is unchanged; no new error class.
2. **No handler imports the boot-time DI factories**: neither handler nor template changed its imports; `createLogger()` / `createQueue()` remain confined to `server.ts`. The lifecycle test keeps using `createQueue()` as before (test code).
3. **Module placement and one-directional imports** (Principle I): the changes sit inside the existing `JS_TEMPLATE` constants of each tool's `_template.ts`; imports unchanged (`../_shared.js`, `../_smart-connections.js`). No helper was added to `_smart-connections.ts`, so each template carries its own rule as the ruling asks.
4. **Reachability**: no new production symbol. The changed `JS_TEMPLATE` constants are reached through `executeSmartConnectionsSimilar` / `executeSmartConnectionsQuery`, called from their tools' `index.ts`. The new test-local builders (`entry`, `IndexEntry`, the `gone` option) are used by the new rows.

**Kernel-node claim held**: the assessment claimed the fix touches none of the kernel nodes. `createLogger()`, `createQueue()`, `createServer()` and `UpstreamError` are unchanged; `UpstreamError` is constructed only through the existing branch. No deviation.

## Deviations from Assessment

- None in the production change. The similar test's stub helper `runTemplate` gained an optional `gone` parameter (default empty) so the new rows can model notes moved or deleted since indexing. It is used only by the new rows; existing calls, assertions, expected values, titles and spawn counts are unchanged, so it stays within the Q2 approval's limit. The stub vault's note set is derived from the fixture's candidate keys (paths ending in `.md`), which is how "a `getAbstractFileByPath` that knows every candidate note path in their fixtures" was implemented.
- L6's simulated vault gained `note("Other.md")`, its only candidate's note: the lifecycle form of the approved "simulated vault knows every candidate note path" edit.
- Leading-slice rows compare the stale-fixture page with the page for the clean candidates the plugin returned (`clean.slice(0, 96)` / `clean.slice(0, 99)`), not with the page for the whole clean fixture: the plugin cuts at `MAX_LIMIT` candidates inside a tied group, so stale entries take candidate slots. This is the documented "a call can return fewer than `limit` matches" behaviour, now also for dropped outdated entries.
- `docs/tools/smart_connections_similar.md` and `docs/tools/smart_connections_query.md` were not edited in this step; the assessment allows the docs-as-code pass to make them (see Follow-ups).

## Review fixes (PR #156)

The code-quality review of PR #156 raised three points; all three are fixed. The empty-path rows both template suites run now live once in `_smart-connections-fixtures.ts` (`EMPTY_PATH_KEYS` / `EMPTY_PATH_KEPT`, refactor-decisions item 63), and they add the keys `#` and `#H`, which also map to `path: ""`. With query's filter swapped for a key-based one (`.filter(m=>m.key)` before the map), the query row fails, so the filter on the mapped path is now pinned. Stage 5's guard drops the redundant `!v||`: `!(Array.isArray(v)||ArrayBuffer.isView(v))` gives the same result for every value. The lifecycle test modelled one plugin entry twice (`indexed()` and `listed()` with `ListedEntry`). They are now one `entry(candidates, vec?)` builder, and `indexed(c)` is the one-line wrapper `entry(c, [0.6, 0.8])`. This goes past the Q2 approval, because `indexed()` predates this BI, so it was done on owner ruling option A (2026-11-07). No assertion, expected value, title or spawn count changed. L8 now passes its `Float32Array` to `entry` instead of setting it afterwards. With the Stage 5 vec check removed from the template, L5d, L5e and L6b fail.

## Follow-ups

- `/speckit-docs-as-code`: update `docs/tools/smart_connections_similar.md` — the SOURCE_NOT_INDEXED row (line ~234) and the freshness note (~273) should also say "listed but not embedded yet", and that very short notes the plugin may never embed keep getting it; add a line that entries for notes no longer in the vault (and non-Markdown candidates) are left out, so `count` can be below `limit` (beside the self-exclusion note at ~285). `docs/tools/smart_connections_query.md`: empty-path entries are left out; non-empty stale paths still pass through, as the Caveats say.
- ADR-014 amendment line (recommended by the assessment): `SOURCE_NOT_INDEXED` covers "no entry, or an entry with no embedding yet". Owner's call; `.decisions/` is gitignored.
- `.memory/test-execution-instructions.md` says the test vault has no plugins, but it holds Smart Connections 4.7.2 (noted by the assessment). Owner's file; not edited.
- `/speckit-bug-test slug=bi-0195`: re-run TC-00892, TC-00899 and TC-00225 live in `TestVault-Obsidian-CLI-MCP`.
