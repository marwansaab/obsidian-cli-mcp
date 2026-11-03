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
| `src/tools/pattern_search/handler.ts` | modified (review fix) | Removes `comparePatternSearchMatch` and the re-sort; the response keeps the envelope's order. The header and Stage 8 comments now say the template owns the order. The `.md` filter stays. |
| `src/tools/pattern_search/_template.test.ts` | updated test (review fix) | The all-pairs prefix test is folded into the first-N test, which now cites criterion 3. 5 cases remain. |
| `src/tools/pattern_search/handler.test.ts` | updated test (review fix) | (3) and (4) now assert that the handler keeps the envelope's order (`toEqual(matches)` on unsorted input). (27) is deleted, because (3) and (4) now cover what it checked. |

After the code review (PR #132), the handler no longer sorts. See Deviations.

## Diff Highlights

```diff
-const files=app.vault.getMarkdownFiles().filter(f=>a.folder===null||f.path.startsWith(a.folder+"/"));
+const files=app.vault.getMarkdownFiles().filter(f=>a.folder===null||f.path.startsWith(a.folder+"/")).sort((x,y)=>x.path<y.path?-1:x.path>y.path?1:0);
```

## Tests Added or Updated

The fixture has five notes in getMarkdownFiles order `Notes/b.md, Other/z.md, Notes/a/c.md, Notes/a.md, Notes/B.md`, with folder `Notes`. That gives 8 matches, with several per note and three on one line. The expected order is written out by hand, and it pins code-unit ordering in two places: `B` sorts before `a`, which `localeCompare` would reverse, and `Notes/a.md` sorts before `Notes/a/c.md` because `.` is lower than `/`.

- `_template.test.ts` › "returns the full set in (path, line, offset) order when the limit covers it": checks the uncapped order.
- › "returns exactly the first N of the full order for every N below the total": covers acceptance criteria 1 and 2 for every N from 1 to 7. Because every page equals `FULL_ORDER.slice(0, n)`, it also covers criterion 3. The review of PR #132 folded the separate all-pairs N < M prefix test into it: that test was implied by this one plus the full-set test, and it passed against the unfixed template.
- › "cuts between offsets of one line and keeps the lower offsets": `limit: 3` cuts inside `Notes/a.md` line 1.
- › "sets truncated when the total exceeds the limit" and "omits truncated when the limit equals or exceeds the total": cover criterion 4 at total − 1, 1, total and total + 1.

## Local Verification

- New suite run against the unfixed template (fix stashed): 3 of 6 tests fail. These are the full-order, first-N and mid-line-cut tests, and they fail because the template returned `Notes/b.md` first. The prefix and truncation tests pass both before and after the fix. At template level the old scan order was already self-consistent; the old bug showed up as a prefix break only after the handler's sort reordered the capped results. The truncation tests stay as pins for criterion 4. The review folded the prefix test into the first-N test (see Tests Added or Updated).
- `npm run typecheck` passed.
- `npx eslint src/tools/pattern_search` passed with no findings.
- `npm test` (full suite with coverage): 196 files passed, 1 skipped; 4804 tests passed, 6 skipped. The existing `handler.test.ts` cases (27), (10)–(12), (28) and (34) pass unchanged. A `.sort(...)` on a local array is not one of (34)'s forbidden mutating-API substrings.
- After the review fixes (handler re-sort removed, prefix test folded): `npm run lint`, `npm run typecheck` and `npm run build` were clean, and `npm test` passed 196 files (1 skipped) with 4802 tests passed and 6 skipped. That is two tests fewer than before: handler (27) was deleted and the template prefix test was folded. Statement coverage stayed at 97.08%.
- No live CLI probe was run in this step. The live check against the authorised test vault belongs to `/speckit-bug-test`.

## CodeGraph structural verification

- **Check 1, no new error codes**: passed. No new error class, no new `UpstreamError` code, no new `details.code`, and no throw site changed. The change is confined to the template string.
- **Check 2, DI factories**: passed. No file imports `createLogger()` or `createQueue()`. The new test imports only `JS_TEMPLATE` and `runEvalTemplate`.
- **Check 3, module placement and import direction**: passed. The test sits beside the template in `src/tools/pattern_search/` and imports the downward leaf `../_eval-template-fixtures.js`, which follows refactor-decisions item 45.
- **Check 4, reachability**: passed. No new production symbol was added. The review fix removed one symbol, `comparePatternSearchMatch`, which was private and had one caller. Nothing else referenced it (grep over `src/`, `docs/` and `.docs-as-code/`). CodeGraph lists `JS_TEMPLATE`'s callers in `handler.ts` and its tests as `_template.test.ts` and `handler.test.ts`.
- **Kernel-node claim**: held. The assessment said the fix touches none of `createLogger()`, `createQueue()`, `UpstreamError` or `createServer()`, and none of them changed.

## Deviations from Assessment

The template change is the preferred remediation. One deviation came from the code review of PR #132 (owner ruling 2026-11-03, option A).

- **The handler's re-sort is removed, which departs from spec R2's handler-side `(path, line, offset)` sort.** The assessment kept `comparePatternSearchMatch` as a defensive step. The review showed that it defends nothing. The template applies the cap, so a handler sort can only reorder the capped subset, never recover a match the template dropped. If the template's order ever drifted, the sort would make the response look sorted while the subset was wrong, which is the BI-0183 symptom itself. On every envelope the template can emit, the sort did nothing: notes are scanned in path order, each note's matches come out in (line, offset) order, and paths are unique. It also kept the path rule in two places, held in step only by a comment. The template now owns the order, as FEAT-023 "How it works" step 5 describes (sort, then cap, then `truncated`). This is the same shape as the smart_connections templates after BI-0167. `_template.test.ts`'s full-order rows are the one place the order is tested. The owner approved exactly these test edits (refactor-decisions item 5): handler tests (3) and (4) become "keeps the envelope's order" rows, and (27) is deleted. Every real response is byte-identical. Only a stubbed, out-of-order envelope now comes back unsorted.

## Follow-ups

- Docs, to be handled in `/speckit-docs-as-code` after review: `docs/tools/pattern_search.md` and `PATTERN_SEARCH_DESCRIPTION` should say a capped result is the leading `limit` matches of the `(path, line, offset)` order. Rewording the description moves the tool-surface fingerprint baseline, which is a deliberate-change gate. `.docs-as-code/capabilities/search-and-discovery.md`'s "first N of a deterministic sort of the full match set" claim is now true for `pattern_search`. Check it still reads correctly.
