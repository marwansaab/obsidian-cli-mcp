# Bug Fix: search and context_search match only whole words since the literal-phrase change

- **Slug**: bi-0175
- **Fixed**: 2026-11-03
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`literalPhraseQuery` now sends the query as one escaped Obsidian regular expression (`/…/`, with `\ ^ $ . * + ? ( ) [ ] { } |` and `/` each prefixed with `\`) instead of a double-quoted phrase. A quoted phrase matched whole words only, so queries that start or end part-way through a word found nothing. The escaped regex matches the literal character sequence anywhere and keeps everything spec 087 secured: operators are literal, multi-word queries match only the exact phrase, and whitespace is exact. Both handlers already route through the helper, so only their header comments change.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/tools/search/literal-phrase.ts` | modified | `literalPhraseQuery` body, doc comment and file header. Exported name kept, as the assessment asked. |
| `src/tools/search/handler.ts` | modified | Header comment only: "escaped, double-quoted phrase" became "escaped regular expression". |
| `src/tools/context_search/handler.ts` | modified | Header comment only, same wording change. |
| `src/tools/search/literal-phrase.test.ts` | modified + added tests | L1–L6 expect the regex form (approved, Q1 = A). Added L9–L12. L7 unchanged. |
| `src/tools/search/handler.test.ts` | modified | Line 40: `'query="foo"'` became `"query=/foo/"` (approved). |
| `src/tools/context_search/handler.test.ts` | modified | Line 55: same change (approved). |
| `src/tools/search/handler.literal-phrase.test.ts` | modified + added test | Argv expectations on lines 26, 39, 52, 76 and 157 now use the regex form, and test titles that mentioned quotes were reworded (approved). Added S10. |
| `src/tools/context_search/handler.literal-phrase.test.ts` | modified + added test | Argv expectations on lines 29, 34, 35, 52, 64 and 130 now use the regex form, and titles were reworded (approved). Added C10. |

No schema, description, error code or published surface changed. `_register-baseline.json` did not move: the FR-018 fingerprint gate passes in the full suite without `baseline:write`.

## Diff Highlights

```ts
// before
return `"${query.replace(/[\\"]/g, "\\$&")}"`;
// after
return `/${query.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&")}/`;
```

## Tests Added or Updated

- `literal-phrase.test.ts` L9: each of `\ ^ $ . * + ? ( ) [ ] { } | /` is escaped with one backslash.
- `literal-phrase.test.ts` L10: `"`, `-`, `:`, `#`, letters, digits, `é` and whitespace (leading, trailing, internal, tab) pass through unchanged.
- `literal-phrase.test.ts` L11 (property-style; 213 inputs, including L6's nine search-syntax inputs (added in the PR #130 review fix, Q2 = B) and 200 deterministic pseudo-random strings over every syntax character, `"-:#`, whitespace, letters, digits and `é`): with and without the `u` flag, the body between the delimiters, compiled as a `RegExp`, matches its input exactly when anchored, finds it at the right index inside `pre…post`, and rejects the input with one character changed or the first character dropped. This proves the escape is complete without the CLI.
- `literal-phrase.test.ts` L12: the partial-word queries `ead170`, `TC-0078` and `pha bet`, and the synthetic `|` rows (Q2 = A) `ol a | co` → `/ol a \| co/`, `|co` → `/\|co/` and `l b |` → `/l b \|/`.
- `literal-phrase.test.ts` L6 (updated): every search-syntax input yields a regex that matches only its literal text.
- `search/handler.literal-phrase.test.ts` S10: `ead170` and `pha bet` reach the CLI as `query=/…/` in both `search` and `search:context`, and the stubbed substring match is passed through.
- `context_search/handler.literal-phrase.test.ts` C10: the same two queries through `context_search`, with the read-back.

## Local Verification

- `npm run typecheck` → clean.
- `npm run lint` → clean.
- `npx vitest run src/tools/search src/tools/context_search` → 13 files, all tests pass.
- `npm test` (full suite with coverage) → 193 files passed, 1 skipped; 4759 tests passed, 6 skipped; 0 failures. No existing assertion outside the approved list failed.
- `npx prettier --check --end-of-line auto` on the changed files → `literal-phrase.ts` and `literal-phrase.test.ts` are clean (the test file was formatted). `search/handler.test.ts`, `context_search/handler.test.ts` and `context_search/handler.literal-phrase.test.ts` were already non-conforming at `HEAD`. I left them alone, because reformatting would touch test lines outside the approval.
- Live check: not run in this step. The required live probe matrix (assessment, Tests to add or update, last bullet) and the `My-Setup-Vault` timing comparison (Risks) are left to `/speckit-bug-test`, which runs under `.memory/test-execution-instructions.md`.

## CodeGraph structural verification

Queried after the change (2026-11-03, branch `fix/bi-0175`):

1. **No new error codes.** No `UpstreamError` construction was added or changed, and `src/errors.ts` is untouched. A CLI regex-parse error, should one ever occur, still surfaces through the dispatch classifier as `CLI_REPORTED_ERROR`.
2. **No DI-factory imports.** Neither handler imports `createLogger` or `createQueue`. Their imports are unchanged.
3. **Module direction.** No import was added. `literalPhraseQuery` stays in `src/tools/search/literal-phrase.ts`, and context_search reaches it over the existing one-directional context_search → search edge.
4. **Reachability.** `literalPhraseQuery` keeps its production callers `executeSearch` and `executeContextSearch`. No new production symbol was added.

**Kernel-node claim held.** The assessment said the fix touches no kernel node. `createLogger()`, `createQueue()`, `UpstreamError` and `createServer()` are all untouched.

## Deviations from Assessment

- **L5's expected values sit on lines 13–15, not line 17.** The assessment's approval names line 17 for L5. That line holds the shared assertion `toBe(expected)`, which did not change. The expected values the approval covers ("L1 to L6 expected values") are the table cells on lines 13–15, so those changed. This follows the approval's intent; its line number was off.
- **L6 (line 45) now asserts literal matching rather than an exact string.** L6 is a `test.each` over inputs only. Under the regex form those inputs no longer share one output template (`-draft` passes through, `[status]` is escaped). Keeping `toBe` would have meant editing the input table (lines 35–43, outside the approval) or re-implementing the escape inside the test. Line 45 now asserts that the regex built from the output, anchored, matches the input. The exact escaped strings are pinned by the new L9, L10 and L12.
- **Comments and headers reworded alongside the approved lines.** The approval covers the expected values and test titles. In the same test files, file-header comments, section-divider comments and the explanatory comments inside L3 and L4 ("The 6 characters …") also described the quoted form, and would otherwise be false. They were reworded. No assertion changed beyond the approved list.
- **`search/handler.literal-phrase.test.ts:27` was left as it was.** It was on the approved list. `not.toContain("query=alpha beta")` still holds under the regex form and still guards against a raw query, so no edit was needed.

## Follow-ups

- `/speckit-bug-test slug=bi-0175`: run the live probe matrix through the built server, including `ead170`, `TC-0078`, `cap170` (both lines), `alpha beta` (exact phrase only), `pha bet`, `ol a | co` and `l b |` against a table row. Time a `search` against `My-Setup-Vault` before and after the fix to rule out a regex-scan slowdown.
- PR docs pass: `docs/tools/search.md` (line 266 and the `query` field notes), `docs/tools/context_search.md` (`query` field notes) and `CHANGELOG.md` (`Fixed`) still say the query is sent as a quoted phrase.
- The name `literalPhraseQuery` was kept to limit churn (assessment), though the helper now builds a regex. A rename can wait until these files are next touched.
- Not changed here: the prettier non-conformance in three search test files was already present at `HEAD`.
- Three copies of one regex escape (PR #130 code-quality review, finding 1; owner ruling Q1 = C). `literalPhraseQuery`'s set `[\\^$.*+?()[\]{}|/]` is `find_and_replace/replace.ts`'s `REGEX_META` / `escapeRegex` plus `/`, and `src/tools/_vault-relative-error.ts` writes out the same `REGEX_META` set inline. The planned fix is one shared module, `src/tools/_regex-escape.ts`, exporting `escapeRegex` with `/` added to the set (`\/` is valid with and without the `u` flag). The three sites would import it, and the `describe("escapeRegex")` block would move out of `replace.test.ts`. It is left out of this PR because BI-0175 covers only `search` and `context_search`, and the `replace.test.ts` edit needs its own owner approval (refactor-decisions item 5).
- L6 overlaps L11 in `literal-phrase.test.ts` (PR #130 code-quality review, finding 2; owner ruling Q2 = B). Both check that the anchored regex body matches the input; L11 also checks near-misses, the match index and the `u` flag. L6's nine inputs now also run in L11 (`L6_INPUTS`), so deleting L6 would lose nothing. That deletion needs its own owner approval, because the BI-0175 approval covers only changing L6's expected value.
