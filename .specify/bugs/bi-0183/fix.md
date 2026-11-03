# Bug Fix: pattern_search applies `limit` before its documented sort

- **Slug**: bi-0183
- **Fixed**: 2026-11-03
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

The `pattern_search` eval template now sorts the note list by path, in UTF-16 code-unit order, before it scans. Within a note, matches already come out in `(line, offset)` order, so the in-template cap now keeps the leading `limit` matches of the full `(path, line, offset)` order instead of the first `limit` matches in Obsidian's file-map order. The early exit and the exact truncation check stay as they were.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/pattern_search/_template.ts` | modified | Appends `.sort((x,y)=>x.path<y.path?-1:x.path>y.path?1:0)` to the filtered `getMarkdownFiles()` list. The header comment now records the path sort and why truncation stays exact. |
| `src/tools/pattern_search/_template.test.ts` | added test | New vm suite. It runs the rendered template through the shared `runEvalTemplate` harness against a stub `app` whose notes are listed out of path order. |

`handler.ts` is unchanged. Its stage comments were already accurate, and its `.md` filter and `comparePatternSearchMatch` sort stay as defensive steps. On a correctly ordered envelope the sort now does nothing.

## Diff Highlights

```diff
-const files=app.vault.getMarkdownFiles().filter(f=>a.folder===null||f.path.startsWith(a.folder+"/"));
+const files=app.vault.getMarkdownFiles().filter(f=>a.folder===null||f.path.startsWith(a.folder+"/")).sort((x,y)=>x.path<y.path?-1:x.path>y.path?1:0);
```

## Tests Added or Updated

The fixture has five notes in getMarkdownFiles order `Notes/b.md, Other/z.md, Notes/a/c.md, Notes/a.md, Notes/B.md`, with folder `Notes`. That gives 8 matches, with several per note and three on one line. The expected order is written out by hand, and it pins code-unit ordering in two places: `B` sorts before `a`, which `localeCompare` would reverse, and `Notes/a.md` sorts before `Notes/a/c.md` because `.` is lower than `/`.

- `_template.test.ts` › "returns the full set in (path, line, offset) order when the limit covers it": checks the uncapped order.
- › "returns exactly the first N of the full order for every N below the total": covers acceptance criteria 1 and 2 for every N from 1 to 7.
- › "makes every smaller cap a prefix of every larger cap": covers criterion 3 with the all-pairs N < M check.
- › "cuts between offsets of one line and keeps the lower offsets": `limit: 3` cuts inside `Notes/a.md` line 1.
- › "sets truncated when the total exceeds the limit" and "omits truncated when the limit equals or exceeds the total": cover criterion 4 at total − 1, 1, total and total + 1.

## Local Verification

- New suite run against the unfixed template (fix stashed): 3 of 6 tests fail. These are the full-order, first-N and mid-line-cut tests, and they fail because the template returned `Notes/b.md` first. The prefix and truncation tests pass both before and after the fix. At template level the old scan order was already self-consistent; the old bug showed up as a prefix break only after the handler's sort reordered the capped results. They stay in the suite as pins for criteria 3 and 4.
- `npm run typecheck` passed.
- `npx eslint src/tools/pattern_search` passed with no findings.
- `npm test` (full suite with coverage): 196 files passed, 1 skipped; 4804 tests passed, 6 skipped. The existing `handler.test.ts` cases (27), (10)–(12), (28) and (34) pass unchanged. A `.sort(...)` on a local array is not one of (34)'s forbidden mutating-API substrings.
- No live CLI probe was run in this step. The live check against the authorised test vault belongs to `/speckit-bug-test`.

## CodeGraph structural verification

- **Check 1, no new error codes**: passed. No new error class, no new `UpstreamError` code, no new `details.code`, and no throw site changed. The change is confined to the template string.
- **Check 2, DI factories**: passed. No file imports `createLogger()` or `createQueue()`. The new test imports only `JS_TEMPLATE` and `runEvalTemplate`.
- **Check 3, module placement and import direction**: passed. The test sits beside the template in `src/tools/pattern_search/` and imports the downward leaf `../_eval-template-fixtures.js`, which follows refactor-decisions item 45.
- **Check 4, reachability**: passed. No new production symbol was added. CodeGraph lists `JS_TEMPLATE`'s callers in `handler.ts` and its tests as `_template.test.ts` and `handler.test.ts`.
- **Kernel-node claim**: held. The assessment said the fix touches none of `createLogger()`, `createQueue()`, `UpstreamError` or `createServer()`, and none of them changed.

## Deviations from Assessment

None. The fix is the preferred remediation, and only the two files the assessment listed changed.

Note on refactor-decisions item 53 ("a frozen eval template CAN share a rule with TS code"): the template's comparison is the single-key path order. It is not a copy of the three-key `comparePatternSearchMatch`, so no shared fragment was extracted. The two must agree on path order (the assessment's comparator-parity risk). The new suite pins that agreement with the hand-written code-unit order, including the `B`/`a` and `.`/`/` cases.

## Follow-ups

- Docs, to be handled in `/speckit-docs-as-code` after review: `docs/tools/pattern_search.md` and `PATTERN_SEARCH_DESCRIPTION` should say a capped result is the leading `limit` matches of the `(path, line, offset)` order. Rewording the description moves the tool-surface fingerprint baseline, which is a deliberate-change gate. `.docs-as-code/capabilities/search-and-discovery.md`'s "first N of a deterministic sort of the full match set" claim is now true for `pattern_search`. Check it still reads correctly.
