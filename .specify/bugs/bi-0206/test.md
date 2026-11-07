# Bug Verification: `patch_heading` append lands after the section's trailing blank line

- **Slug**: bi-0206
- **Tested**: 2026-11-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The bug no longer reproduces. The branch build of the server ran `patch_heading` `mode: "append"` against real notes in the authorised test vault, using the assessment's reproduction note plus table, paragraph, end-of-note and CRLF variants. In every case the content joined the section's last content line, and the blank line stayed before the next heading. The fix's new tests, the full suite, typecheck and lint all pass, and no regressions were found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix, live) | `npm run build`, then a throwaway MCP stdio client (kept outside the repo) spawned `node dist/index.js` and called `patch_heading` in specific mode on `TestVault-Obsidian-CLI-MCP`, `Sandbox/BI-0206-<timestamp>/*.md`. The written bytes were read back from disk. | pass (5/5) | Cases: `list` (the assessment's exact reproduction, `Top#Before` + `- three`), `table`, `paragraph`, `eof` (no following heading), `crlf-list`. Before the run, Obsidian reported the focused vault as `=> TestVault-Obsidian-CLI-MCP`. The fixture folder was removed afterwards; `Welcome.md` is untouched, and the earlier `Sandbox/` contents were left as found. |
| New / updated tests | `npx vitest run src/tools/patch_heading src/tools/_note-lines.test.ts` | pass | 10 files, 245 tests. Includes the ten BI-0206 `applyAppend` unit cases, the three handler byte-exact cases (LF / CRLF / CRLF with an LF blank line) and the updated `### TODO` assertion. |
| Pre-fix failure of the new tests | Recorded in `fix.md` (the fix step reverted `body-edit.ts` and re-ran the tests) | pass (evidence) | 14 failures without the fix, 0 with it. Not re-run here, because this step must not modify source. |
| Regression suite | `npm test` (vitest with coverage) | pass | 207 files passed, 1 skipped; 5180 tests passed, 6 skipped. The registration fingerprint test passed, so the tool surface did not move. |
| Lint / type-check | `npm run lint`; `npm run typecheck` | pass | Both exit 0. |

## Output Excerpts

Live probe (branch `dist/`, real vault):

```
PASS list isError=false result={"path":"Sandbox/BI-0206-1794036079088/list.md","vault":"TestVault-Obsidian-CLI-MCP","heading_path":"Top#Before","mode":"append","bytes_written":8}
  written="# Top\n## Before\n- one\n- two\n- three\n\n## After\n"
PASS table ... written="# Top\n## T\n| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n\n## After\n"
PASS paragraph ... written="# Top\n## P\nA paragraph.\nMore text.\n\n## After\n"
PASS eof ... written="# Top\n## A\na1\nappended\n"
PASS crlf-list ... written="# Top\r\n## Before\r\n- one\r\n- two\r\n- three\r\n\r\n## After\r\n"
cleanup: Sandbox/BI-0206-1794036079088 removed=true
failures=0
```

Test runs:

```
Test Files  10 passed (10)          # patch_heading + _note-lines
     Tests  245 passed (245)
Test Files  207 passed | 1 skipped (208)   # npm test
     Tests  5180 passed | 6 skipped (5186)
typecheck=0
lint=0
```

## Residual Risks

- The live probe ran on Windows only. CI covers Linux through the unit and handler suites, but no live Linux or macOS vault was exercised; the change is pure line arithmetic with no platform-dependent code.
- The pre-fix behaviour was not re-run live in this step. The defect on the published 0.9.0 is recorded in TC-00908, and the pre-fix test failures are recorded in `fix.md`.
- Behaviour change by design: a paragraph appended after a paragraph now continues it, unless `content` starts with a blank line. `docs/tools/patch_heading.md` documents this. Agents or notes that relied on the old "new block before the next heading" placement will see different output.
- Sections ending in a horizontal rule are out of scope. The closing blank line now moves below the appended content there too (noted in `fix.md` Follow-ups).

## Recommendation

Close the bug: it is verified end to end. The assessment's reproduction ran against a real vault with the branch build and gave the expected bytes for lists, tables, paragraphs, end-of-note and CRLF notes, and the full regression suite, lint and typecheck are green. Proceed to commit, open the PR, then `/code-review` and `/speckit-docs-as-code`. After release, re-run TC-00908 on the published package and retire the list/table "Tool Notes" gotcha.
