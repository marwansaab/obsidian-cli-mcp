# Bug Verification: pattern_search applies `limit` before its documented sort

- **Slug**: bi-0183
- **Tested**: 2026-11-03
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The report's exact call no longer shows the bug. In `My-Setup-Vault`, pattern `^id: BI-01[0-9][0-9]$` over the Obsidian CLI MCP backlog folder with `limit: 5` now returns BI-0103 … BI-0107, the first five matches of the full sorted list. In the same session the pre-fix template returned BI-0182 … BI-0186. Every limit from 1 to total + 1 passed the prefix and truncation checks, in both live vault runs, and no regressions were found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction, the report's call (post-fix) | A node probe over the built `dist/` that calls `executePatternSearch` against `My-Setup-Vault`, pattern `^id: BI-01[0-9][0-9]$`, folder `421-Custom Connectors/Obsidian CLI MCP/Obsidian CLI MCP - Backlog`. For contrast it also runs the pre-fix template (the fix's `.sort(...)` fragment removed) through the same `invokeEval`, followed by the handler's sort. | pass | Read-only search; nothing was written to that vault. 76 matches in total (the report saw 72; the backlog has grown since). Pre-fix `limit: 5` gives `[BI-0182..BI-0186]`, the tail of the path order, so the bug reproduces. Post-fix it gives `[BI-0103..BI-0107]`, the head. |
| Acceptance criteria 1–4, live, report folder | Same probe: `limit` = 1 … 77, each result compared with `full.slice(0, n)`; all pairs N < M checked for the prefix property; `truncated` checked to be `true` for N < 76 and absent for N ≥ 76. | pass | "limits 1..77: all prefix + truncation checks PASS" |
| Second folder, live | Same probe on `421-Custom Connectors/Claude Code Stateful CLI MCP/Claude Code Stateful CLI MCP - Backlog` (12 matches). | pass | Pre-fix `limit: 5` gives `[BI-0160..BI-0164]`. Post-fix it gives `[BI-0100, BI-0101, BI-0102, BI-0140, BI-0141]`, which is the head. All limits 1..13 pass. |
| Live check in the authorised test vault | Seeded `Sandbox/BI-0183-run1/n01..n06.md` in reverse order, then added `n00.md` after indexing. Ran the same probe: 21 matches, 3 per note, two of them on one line. | pass (it could not tell the old code from the new) | `getMarkdownFiles()` listed the fixture notes in path order both times. Pre-fix and post-fix results were identical, so this vault can only confirm the fix does no harm. It cannot show the symptom; the `My-Setup-Vault` replay above does. Limits 1..22 all pass. The fixtures were removed afterwards. |
| New tests | `npx vitest run src/tools/pattern_search` | pass | 4 files, 72 tests. This includes the new `_template.test.ts` (6 tests). `fix.md` records that 3 of those fail on the unfixed template. |
| Regression suite | `npm test` (vitest with coverage) | pass | 196 files passed, 1 skipped; 4804 tests passed, 6 skipped. |
| Type-check | `npm run typecheck` | pass | `tsc --noEmit` reported no errors. |
| Lint | `npm run lint` | pass | `eslint .` reported no findings. |

## Output Excerpts

Report folder (`My-Setup-Vault`):

```
FIXED no limit: count=76 first5=[BI-0103,BI-0104,BI-0105,BI-0106,BI-0107]
PRE-FIX limit 5: truncated=true [BI-0182,BI-0183,BI-0184,BI-0185,BI-0186]
FIXED   limit 5: truncated=true [BI-0103,BI-0104,BI-0105,BI-0106,BI-0107]
limits 1..77: all prefix + truncation checks PASS
```

Second folder:

```
FIXED no limit: count=12 first5=[BI-0100,BI-0101,BI-0102,BI-0140,BI-0141]
PRE-FIX limit 5: truncated=true [BI-0160,BI-0161,BI-0162,BI-0163,BI-0164]
FIXED   limit 5: truncated=true [BI-0100,BI-0101,BI-0102,BI-0140,BI-0141]
```

Test vault:

```
getMarkdownFiles order: n00.md, n01.md, n02.md, n03.md, n04.md, n05.md, n06.md
limits 1..22: all prefix + truncation checks PASS
```

Suite:

```
Test Files  196 passed | 1 skipped (197)
     Tests  4804 passed | 6 skipped (4810)
```

## Residual Risks

- The live probes called the handler from the built `dist/` through a node script. They did not go through a running MCP server's `tools/call`. The registration layer between the two is unchanged by this fix and is covered by the suite.
- The "pre-fix" contrast ran the current template with the fix's `.sort(...)` fragment removed. After the change to the header comment, that is the same code as HEAD's template; it was not checked out from git.
- The bare test vault keeps `getMarkdownFiles()` in path order even for notes created later, so it cannot show the original symptom. The evidence that the symptom is gone rests on the read-only replay in `My-Setup-Vault`, whose file-map order does differ from path order, and on the vm unit test, whose stub lists notes out of order.
- Sandbox residue: none. `Sandbox/BI-0183-run1/` was removed, `Sandbox/` matches its pre-run listing, `Welcome.md` is present, and no `.trash/` entries were created (the fixtures were deleted on the filesystem, not through Obsidian).

## Recommendation

Close the bug once review is done. Verified end to end: the report's own reproduction showed the bug with the pre-fix code and does not show it with the fix, acceptance criteria 1–4 hold live for every limit in two real folders, and the full suite, type-check and lint pass. Next: open the PR, then `/code-review`, then `/speckit-docs-as-code`, which carries the follow-up in `fix.md` to reword the `pattern_search` docs and description.
