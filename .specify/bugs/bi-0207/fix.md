# Bug Fix: `query_base` drops a grouped view's groups

- **Slug**: bi-0207
- **Fixed**: 2026-11-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

For a view whose `.base` definition groups by a property, `query_base` now returns the rows in the order of the groups Obsidian shows. Each row names its group in a reserved `group` key, and a top-level `group_by: { property, direction }` names the grouping. Obsidian's `base:query` still ignores `groupBy`, so the wrapper does the grouping itself:

1. It reads the view's `groupBy` from the `.base` in TypeScript.
2. It reads each row's group value from Obsidian in read-only eval batches.
3. It applies Obsidian's own grouping and ordering rules, taken from Obsidian 1.15's source and confirmed live.

An ungrouped view makes no eval call and returns exactly what it returned before.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/query_base/group-by.ts` | added | `findViewGrouping(text, viewName)`: scans the named view's block-style `groupBy` and `groupOrder`. Returns `none` (Obsidian's rule: grouped only when `property` is a non-empty string and `direction` is exactly `ASC` or `DESC`), `grouped` (with `customOrder` set when `groupOrder` is a list) or `unreadable`. Has a fast path for text without `groupBy`. |
| `src/tools/query_base/_template.ts` | added | `NOTE_GROUP_TEMPLATE` and `FILE_GROUP_TEMPLATE`, two frozen read-only eval templates. Each takes folder-grouped paths `[folder, [names]]` and returns each row's group value in a typed form, plus the locale of Obsidian's group collator. |
| `src/tools/query_base/groups.ts` | added | `groupSource`: maps a property to its source (`note.*`, bare name, or `file.folder` / `ext` / `tags` / `ctime` / `mtime`; anything else is unsupported). `planGroupBatches`: keeps each batch's code at or under `GROUP_VALUES_CODE_MAX = 2900`. `readGroupValues`: runs the evals and fails with typed errors. Also the mirror of Obsidian's value semantics: `valueText` (`Value.toString`), `looseEquals` (`Value.looseEquals`) and `groupRows` (`BasesQueryResult.groupedData`: first-appearance groups, then a stable sort; numbers compare numerically, everything else by `Intl.Collator {usage: "sort", sensitivity: "base", numeric: true}` in Obsidian's locale; the null group goes last). |
| `src/tools/query_base/handler.ts` | modified | `ExecuteFs` gains a required `readFile`. New Stage 5b `readViewGrouping` reads the `.base` (ENOENT → `BASE_NOT_FOUND`) and returns `null` for an ungrouped view, so Stage 6 runs unchanged. `groupedResult` handles grouped views: post-process all rows, read group values, reorder into group order, then apply the 1000-row cap; it adds the reserved `group` key and `group_by`. `withGroup` / `withGroupColumn` move a view column named `group` to `group_view`. The stat failure now goes through a shared `baseReadError` helper; the stat behaviour is unchanged. |
| `src/tools/query_base/schema.ts` | modified | The output envelope gains optional `group_by` (`queryBaseGroupBySchema`). Adds `queryBaseGroupValuesSchema`, the recursive answer schema for the group-value eval. The input `.describe()` gains a "Grouped views" paragraph, `group_by?` in the response shape and "(and `"group"` for a grouped view)" in the empty-view sentence. |
| `src/tools/_register-baseline.json` | modified | `npm run baseline:write`: only `query_base`'s `schemaFingerprint` (description text) and `outputSchemaFingerprint` (`group_by`) moved. This is the deliberate-change gate. |
| `src/tools/query_base/group-by.test.ts` | added test | Scanner cases. |
| `src/tools/query_base/_template.test.ts` | added test | Both templates run under node:vm against a stub `app`. |
| `src/tools/query_base/groups.test.ts` | added test | Mirror, batching and failure cases. |
| `src/tools/query_base/handler.grouped.test.ts` | added test | End-to-end through `executeQueryBase`, with `makeEvalRunnerSpawn` running the real templates. |
| `src/tools/query_base/schema.group-by.test.ts` | added test | `group_by`, the answer schema and the description guards. |
| `src/tools/query_base/handler.test.ts` | modified (approved edit 1) | `DepsOpts.fsReadFile?`. `deps()` adds `readFile` (default `UNGROUPED_BASE`, a one-view `.base` with no `groupBy`). The five inline `fs` literals each add `readFile`. |
| `src/tools/query_base/index.test.ts` | modified (approved edit 2) | `stubFs()` adds `readFile`. |
| `src/tools/_typed-result-fixtures.ts` | modified (approved edit 3) | The query_base entry's `fs` adds `readFile`. |
| `src/tools/_plugin-noise.test.ts` | modified (approved edit 4) | The "query_base (active)" case's `fs` adds `readFile`. |

The four approved test edits only add the `readFile` field (plus the `UNGROUPED_BASE` constant it uses). No assertion, expected value, test title or spawn queue changed, and no other existing test was edited or failed.

## Diff Highlights

```ts
// handler.ts, Stage 5b: an ungrouped view goes on to Stage 6 exactly as before, with no eval call.
const grouped = await readViewGrouping(fs, resolvedBasePath, input);
if (grouped !== null) return groupedResult(upstreamRows, grouped, input, deps);
```

```ts
// groups.ts: Obsidian's group order (PLe + fV in Obsidian 1.15's app.js)
return groups.sort((x, y) => {
  if (x.key !== null && y.key !== null) {
    const diff = "n" in x.key && "n" in y.key ? x.key.n - y.key.n : compare(valueText(x.key), valueText(y.key));
    return diff * sign;
  }
  return x.key !== null ? -1 : y.key !== null ? 1 : 0;
});
```

A grouped result for the report's three notes (criteria 1–3):

```json
{ "columns": ["path", "group", "file name"],
  "rows": [ { "path": "Sandbox/b-note.md", "group": "one", "file name": "b-note" },
            { "path": "Sandbox/a-note.md", "group": "two", "file name": "a-note" },
            { "path": "Sandbox/c-note.md", "group": "two", "file name": "c-note" } ],
  "truncated": false, "group_by": { "property": "note.status", "direction": "ASC" } }
```

## How Obsidian groups (T0, 2026-11-07, Obsidian 1.15.0, TestVault-Obsidian-CLI-MCP)

These rules come from Obsidian's own code: `BasesQueryResult.groupedData`, the grouping and ordering functions `gV`, `PLe` and `fV`, the `Value` classes, `Bi.fromFrontMatter` and the file properties' `objectAccess`, read from the running app's `app.js`. Each was checked against the open view's `groupedData`:

- **How groups form**: groups are made in row order; a row joins the first group whose key loosely equals its value, else starts a new one. Loose equality follows Obsidian's `Value.looseEquals`:
  - `9` and `"9"` share a group; so do `true` and `1`.
  - A one-element list matches its element, so `["a"]` and `"a"` share a group.
  - A string matches a link with that target.
  - Two links that resolve to the same file share a group.
  - A date matches a date-time on the same day.
- **How groups are ordered**: a stable sort. Two numbers compare by difference; anything else compares by its printed key under `Intl.Collator(undefined, {usage: "sort", sensitivity: "base", numeric: true})`, times −1 for `DESC`. The null group (no value) is last in both directions.
  - So `two` and `Two` are separate groups that keep their first-appearance order in both directions.
  - `""`, an empty list and "no tags" each form a `""` group, separate from the null group.
  - `file.tags` has no null group.
  - `file.ctime` / `file.mtime` groups are told apart by milliseconds but printed to the second (`YYYY-MM-DDTHH:mm:ss`, local time), so two groups can carry the same label.
- **How values are built**: a frontmatter key matches exactly, else case-insensitively. A `tags` key holding a string or a string list becomes `#`-prefixed tags. `"[[...]]"` becomes a link. Obsidian's date and date-time patterns become dates. Everything else maps by JSON type.
  - `file.folder` is the parent path (`/` at the root).
  - `file.tags` is the inline tags, then the trimmed, space-free frontmatter tags, `#`-prefixed and without repeats.
- **How the view parser decides**: a view is grouped only when `groupBy` has a non-empty string `property` and `direction` exactly `ASC` or `DESC`; otherwise it is silently ungrouped. A list `groupOrder` switches to a custom group order (rejected here).

## Tests Added or Updated

- `src/tools/query_base/handler.grouped.test.ts` (C1–C4 mark the BI-0207 report's acceptance criteria 1–4):
  - C1–C3: ascending grouped view over `two` / `one` / `two`, with the group property not a column.
  - Descending order, the null group last, upstream order kept within a group.
  - Grouping by `file.folder`.
  - The `group` → `group_view` collision.
  - The cap applied after the reorder (1,001 rows across several batches).
  - A zero-row grouped view: `group_by`, no eval.
  - C4: an ungrouped view returns today's result with no eval; a `direction: asc` view is ungrouped.
  - Typed failures, never flat rows: custom group order, unreadable `groupBy`, formula property, a value that can't be mirrored, a failed batch, `.base` gone → `BASE_NOT_FOUND`.
- `src/tools/query_base/groups.test.ts`:
  - The live-probe orders (strings, numbers, booleans, dates, mixed, lists, `file.tags`, `file.ctime`), each in both directions.
  - Eleven `looseEquals` pairs, both ways round.
  - `groupSource` mapping and rejections.
  - Batch plan: order, folder grouping, the code budget.
  - `readGroupValues` failures: missing note, value that can't be mirrored, nested value that can't be mirrored, count mismatch, malformed answer, non-JSON answer, locale mismatch.
  - Unknown collator locale.
- `src/tools/query_base/_template.test.ts`: every value form, the case-insensitive key, tags, links (display and resolution), dates, the `{u}` markers, missing paths and folders; `file.folder` / `ext` / `ctime` / `mtime` / `tags`; the template size budget.
- `src/tools/query_base/group-by.test.ts`:
  - The named view only; first match wins.
  - CRLF, BOM, comments, quoted names, items flush with `views:`.
  - Obsidian's ungrouped cases.
  - Three `groupOrder` list forms flagged; a scalar `groupOrder` ignored.
  - Six unreadable shapes.
- `src/tools/query_base/schema.group-by.test.ts`: `group_by` accepted and rejected forms, the answer schema, the description claims.

## Local Verification

- `npm run typecheck` → clean.
- `npm run lint` → clean.
- `npm test` → 212 files passed (1 skipped), 5279 tests passed (6 skipped). No existing test failed. Coverage: `group-by.ts` 97.8% lines, `groups.ts` 100%, query_base `handler.ts` 97.4%.
- `npm run baseline:write` → only `query_base`'s input and output schema fingerprints changed.
- `npm run build`, then a live comparison on `TestVault-Obsidian-CLI-MCP`:
  - **Setup**: the built `executeQueryBase` against Obsidian's own `groupedData`. Fixtures: seven notes in `Sandbox/bi0207probe/` with string, number, boolean, list, date and date-time, mixed number/string, link, `tags` and missing values. There were 26 grouped `.base` views (13 properties × ASC/DESC: `s`, `num`, `b`, `l`, `d`, `mix`, `lk`, `tags`, `file.folder`, `file.ext`, `file.tags`, `file.ctime`, `file.mtime`).
  - **Result**: **26/26 identical** row order and group label per row. Includes `b: 1` joining the `true` group, link `[[c]]` / string `c` / `[[c|C]]` sharing one group, and `9` / `"9"` sharing one group.
  - **Ungrouped view**: returned its rows with only `path` and `file name` and no `group_by`.
  - **Custom group order view**: failed with `CLI_REPORTED_ERROR` `{"code":"GROUPING_UNSUPPORTED","reason":"custom-group-order",…}`.
  - **Clean-up**: fixtures removed; `Welcome.md` untouched; the leaf the comparison opened was closed.

## Deviations from Assessment

1. **The `.base` is read in Node, not by the eval.** Owner ruling 2026-11-07, option A. The assessment had the eval template find `groupBy` but also required "an ungrouped view makes no eval call". `ExecuteFs` gains a required `readFile`, and the `groupBy` scan is TypeScript (`group-by.ts`). Four existing test files got field-only edits, as approved.
2. **Group values are read in batches.** The assessment planned one eval carrying every row path, but the `Obsidian.com` shim stops answering above about 2,900 characters of eval code (spec 088 F10). Paths are sent folder-grouped in batches under `GROUP_VALUES_CODE_MAX = 2900`, the context_search read-back pattern.
   - Measured: about 70 short paths (`Notes/nNNN.md`) per eval, about 12 paths per eval for ~100-character paths. The question to the owner estimated 30–60 per eval.
   - The note template is 1,878 characters and the file template 1,371, which limits the room left for paths.
3. **The grouping is computed in TypeScript.** The evals return each row's value in a typed form plus Obsidian's collator locale, as ruled. The assessment's "how Obsidian orders … is characterised by a T0 probe" became a mirror of Obsidian's own code, verified live (above).
4. **More value kinds are matched.**
   - The assessment expected numbers, booleans, lists, links and case to need characterising and possibly a typed error. All of them are now matched, including links (resolved through `metadataCache.getFirstLinkpathDest`) and mixed-type loose equality.
   - What still fails with `GROUPING_UNSUPPORTED` / `value-type`: object values, non-finite numbers, invalid dates, a `tags` list containing null, and a string that would need re-parsing as a date or link during comparison (cannot occur after Obsidian's conversion; kept as a guard).
   - A `groupBy` whose `direction` is not exactly `ASC` / `DESC`, or whose property is empty, is ungrouped: Obsidian's parser drops it, and `query_base` matches that rather than raising the assessment's "unknown direction" error.
5. **Error forms.** All failures use the existing `CLI_REPORTED_ERROR` (no new top-level code, Principle IV):
   - `details.code: "GROUPING_UNSUPPORTED"` with `reason` one of:
     - `unreadable-group-by` (with `detail`)
     - `custom-group-order`
     - `property` (formula, `file.*` other than the five, bare `file`)
     - `value-type` (with `path` and `value_type`)
     - `collator-locale` (Obsidian's locale unknown to this server's ICU)
   - `details.stage: "group-values"`, `reason: "note-not-found"` for a row whose note is gone.
   - `stage: "json-parse"` / `"envelope-parse"` for a malformed or mismatched batch answer.
6. **`columns` includes `group`.** For grouped views `group` follows `path` in `columns` (also for zero rows: `["path", "group"]`), so `columns` lists the keys every row carries. The assessment did not specify this.
7. **The `""` group.** Groups whose key prints as `""` (empty string, empty list, no tags) report `group: ""`. The assessment's string rule would map `""` to `null` as `base:query` does for columns, but that would merge them visually with the null group, which Obsidian keeps separate and orders differently.

## CodeGraph structural verification

Checked with `codegraph sync` + `codegraph_explore` on `findViewGrouping`, `groupRows`, `readGroupValues`, `groupSource`, `groupedResult`, `readViewGrouping`.

1. **No new top-level error code or error class.** Every new failure is an `UpstreamError` with `CLI_REPORTED_ERROR` (ADR-015 sub-discriminators); `src/errors.ts` is unchanged.
2. **No boot-time DI factory imports.** No production file in `src/tools/query_base/` imports `createLogger()` or `createQueue()`. `readGroupValues` receives the injected deps (`InvokeCliDeps`) from `executeQueryBase`.
3. **Imports run one way.** `group-by.ts` imports nothing. `_template.ts` imports `../_shared.js`. `groups.ts` imports `./_template.js`, `./schema.js`, `../../cli-adapter/cli-adapter.js`, `../../errors.js`, `../_active-file.js`, `../_shared.js`. The handler imports `./group-by.js` and `./groups.js`. No tool→tool edge, and `create_base/_template.ts` is not imported (technique copied).
4. **New production code is reachable.** `findViewGrouping` is called from `readViewGrouping`. `groupSource`, `readGroupValues`, `groupRows` and `valueText` are called from the handler; `planGroupBatches`, `looseEquals` and `assertMirrorable` are reached through them. All are on `executeQueryBase`'s path.
5. **Kernel-node claim held.** `assessment.md` said the fix touches no kernel node. `createLogger()`, `createQueue()` and `createServer()` are unchanged; `UpstreamError` is only imported and constructed.

## Follow-ups

- `/speckit-docs-as-code`:
  - Update `docs/tools/query_base.md`: the grouped-view response, `group_by`, the `group` / `group_view` keys, the `""` versus `null` groups, duplicate `ctime` / `mtime` labels, the `GROUPING_UNSUPPORTED` reasons and the `group-values` stage.
  - Update `.docs-as-code/` for the `.base` read and the eval batches.
- **Latency on large grouped views.** A 1,000-row grouped view with long paths costs roughly 80 evals. If that matters, shrinking the note template or sharing a long common folder prefix across a batch would raise the paths per eval. It could also be a dedicated performance BI.
- **Upstream drift.** If Obsidian's `base:query` starts emitting groups, or Obsidian changes `groupedData`'s rules, the mirror goes stale. Re-run the live comparison (the 26-view matrix above) on each Obsidian release that touches Bases.
- **`.memory/refactor-decisions.md` candidates.** `query_base/groups.ts` deliberately uses loose `==` (Obsidian's `PrimitiveValue.looseEquals`) and an O(groups) linear search mirroring `gV`. Neither should be "tidied" without re-running the live comparison.
