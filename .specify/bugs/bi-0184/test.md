# Bug Verification: Smart Connections tools report `headingPath: [""]` for text before a note's first heading

- **Slug**: bi-0184
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Before the fix, the symptom reproduced live in `TestVault-Obsidian-CLI-MCP` with the old key split: both report fixtures came back with `headingPath: [""]`. With the fixed templates, every result's `headingPath` is free of empty strings, and the two fixtures come back with `headingPath: []`. Apart from that one change, the match lists are the same as the control's: same matches, same order, same scores. The automated suite, typecheck and lint all pass, and no regressions were found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Plugin key shape | `obsidian vault=TestVault-Obsidian-CLI-MCP eval` listing `env.smart_blocks.items` keys for the two fixtures | pass | The keys are `Fixtures/BI-0062/long-line.md#` and `Fixtures/BI-0123/latin-3072.md#`, the `<path>#` shape the assessment names as root cause. Smart Connections is loaded and indexed (802 sources). |
| Reproduction (pre-fix control) | Probe script: each tool's `JS_TEMPLATE`, rendered from the working tree, with `SPLIT_BLOCK_KEY_JS` swapped for the old split (`key.slice(i+1).split('#')`, no filter), composed by `composeEvalCode` and run through `Obsidian.com eval` | pass (symptom reproduced) | `smart_connections_query` (2 queries) and `smart_connections_similar` (2 sources) return the fixtures with `headingPath: [""]`, and 3–8 other notes per call show the same shape. |
| Reproduction (post-fix) | Same probe, unmodified fixed templates | pass | Both fixtures come back with `headingPath: []` on both tools (AC 1, AC 2). Neither fixture has a heading, so they are also the "note with no headings" case (AC 3). `withEmptySegment=0` on every call (AC 6). |
| Nothing else moved (live) | Fixed vs control lists, with the control's `""` segments dropped, compared as JSON, over 3 queries + 2 similar sources | pass | `sameAsNormalisedControl=true` on all 5 calls (10 or 50 matches each): same matches, order and scores. Live results still include multi-segment paths such as `["TC-107 Mixed Probe","Section 9 — JSON fragments"]` and `["Cap","{1}"]` (AC 4) and `["---frontmatter---"]` blocks (AC 5). Self-exclusion held on similar: the source note never appears. |
| New / updated tests | `npx vitest run src/tools/_smart-connections.test.ts src/tools/smart_connections_query src/tools/smart_connections_similar` | pass | 9 files, 212 tests. The new rows failed against the unfixed templates during `/speckit-bug-fix` (fix.md). |
| Regression suite | `npm test` (vitest with coverage) | pass | 198 files passed, 1 skipped; 4925 tests passed, 6 skipped. `_surface.test.ts` passes, and no fingerprint baseline changed. |
| Lint / type-check | `npm run typecheck`, `npm run lint` | pass | Both clean. |
| Full MCP tool call | `smart_connections_query` / `smart_connections_similar` through the connected `obsidian-cli-mcp-local` server | not-run | Permission was denied in this session. That server also runs the installed build, not this branch, so it could only have shown the pre-fix symptom. |

## Output Excerpts

```
query[pre-fix control] BI-0042 xxxx: codeLen=1564 count=10 withEmptySegment=4
   {"path":"Fixtures/BI-0062/long-line.md","headingPath":[""],"score":0.7728049487849771}
   {"path":"Fixtures/BI-0123/latin-3072.md","headingPath":[""],"score":0.6669723272828945}
query[fixed]           BI-0042 xxxx: codeLen=1582 count=10 withEmptySegment=0
   {"path":"Fixtures/BI-0062/long-line.md","headingPath":[],"score":0.7728049487849771}
   {"path":"Fixtures/BI-0123/latin-3072.md","headingPath":[],"score":0.6669723272828945}
similar[pre-fix control] Fixtures/BI-0062/long-line.md: codeLen=2206 count=50 withEmptySegment=8
   {"path":"Fixtures/BI-0123/latin-3072.md","headingPath":[""],"score":0.7680496315725501}
similar[fixed]           Fixtures/BI-0062/long-line.md: codeLen=2224 count=50 withEmptySegment=0
   {"path":"Fixtures/BI-0123/latin-3072.md","headingPath":[],"score":0.7680496315725501}
similar[fixed]           Fixtures/BI-0123/latin-3072.md: codeLen=2228 count=50 withEmptySegment=0
   {"path":"Fixtures/BI-0062/long-line.md","headingPath":[],"score":0.764832902615026}
```

```
similar long-line: n=50 sameAsNormalisedControl=true emptySeg=0 multiSegment=34 singleHeading=7 frontmatter=1
query L01: n=10 sameAsNormalisedControl=true emptySeg=0 multiSegment=4 singleHeading=2 frontmatter=1
```

```
 Test Files  198 passed | 1 skipped (199)
      Tests  4925 passed | 6 skipped (4931)
```

## Residual Risks

- **The MCP layer was not driven live.** The live check ran each tool's rendered `JS_TEMPLATE` (the defect and fix site) through the real `Obsidian.com eval`, not through the MCP server and handler. The handlers are unchanged. They parse the envelope with `matchEntrySchema` (`headingPath: z.array(z.string())`, which accepts `[]`), and their in-process tests pass. A full tool call from a build of this branch is the one step not exercised.
- **The pre-fix control is a reconstruction.** It is the fixed render with the shared fragment swapped for an expression equal to the old inline split, not HEAD's template bytes. The two differ only in how the split is written, not in what it does.
- **No live key with an interior empty segment.** Keys like `<path>##H2` or `<path>#H1#` did not occur in the test vault. Their new order is pinned only by the unit tests (fix.md Deviations).
- **Vault untouched.** All live calls were read-only (`lookup`, `find_connections`, key listing). No vault files were created or changed; the probe scripts lived in a temp directory outside the repository and were deleted after the run.

## Recommendation

Close the bug once the PR merges — verified at the template layer end to end against the real plugin index, with the symptom reproduced under the old split and gone under the new one, and no change to any other match. If an end-to-end MCP check is wanted, run `smart_connections_similar` on `Fixtures/BI-0123/latin-3072.md` in `TestVault-Obsidian-CLI-MCP` from a build of this branch and confirm `Fixtures/BI-0062/long-line.md` shows `headingPath: []`.
