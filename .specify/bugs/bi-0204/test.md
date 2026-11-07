# Bug Verification: pattern_search treats a note given as `folder` as an empty folder

- **Slug**: bi-0204
- **Tested**: 2026-11-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The symptom no longer reproduces against a live vault. `pattern_search` with `folder` naming a note now fails with `CLI_REPORTED_ERROR` / `details.code: "NOT_A_FOLDER"` and names the path, instead of returning `{ count: 0, matches: [] }`. All four acceptance criteria hold live. The unit, full regression, type-check and lint runs pass, with no regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix), TC-00906 path | `executePatternSearch` from the rebuilt `dist/` (real spawn of `Obsidian.com`), `{ pattern: "zebrafish", folder: "Repro1106/single.md", vault: "TestVault-Obsidian-CLI-MCP" }` | pass | Read-only. The pre-existing TC-00906 note now gives `NOT_A_FOLDER`; before the fix it returned `{"count":0,"matches":[]}` (assessment). |
| Criterion 1: note path rejected | Same call on a fresh Sandbox fixture `Sandbox/BI-0204-20261107115540/single.md` (body contains `zebrafish`) | pass | `CLI_REPORTED_ERROR`, `details: { code: "NOT_A_FOLDER", folder, stage: "handler-stage-3" }`, message names the path. |
| Criterion 2: containing folder still matches | `folder: "Sandbox/BI-0204-20261107115540"` and `folder: "Repro1106"` | pass | One match each, as before. |
| Criterion 3: missing folder unchanged | `folder: "Sandbox/BI-0204-20261107115540/no-such-folder"` | pass | `details.code: "FOLDER_NOT_FOUND"`, message `pattern_search: folder not found in vault`, byte-identical to before. |
| Criterion 4: same recognisable failure as `context_search` | `executeContextSearch` with `{ query: "zebrafish", folder: <note path> }` | pass | Both fail with `CLI_REPORTED_ERROR`, and both messages carry `"<path>" is a file, not a folder`. See residual risk on the differing `details` shapes. |
| Whole-vault scope unchanged | `pattern_search` with `folder: "/"` | pass | Scans the whole vault (2 matches). Out of scope, confirmed unchanged. |
| New / updated tests | `npx vitest run src/tools/pattern_search` | pass | 4 files, 74 tests. |
| Regression suite | `npx vitest run` | pass | 204 files passed, 1 skipped; 5114 tests passed, 6 skipped. The registry fingerprint baseline did not move. |
| Lint / type-check | `npx tsc --noEmit`; `npx eslint .` | pass | Both clean. |

## Output Excerpts

Live probes (`TestVault-Obsidian-CLI-MCP`, via `dist/` handlers, real CLI):

```
P1 pattern_search note-as-folder ERR {"code":"CLI_REPORTED_ERROR","message":"pattern_search: \"Sandbox/BI-0204-20261107115540/single.md\" is a file, not a folder. Pass the folder that contains it, or omit folder to search the whole vault.","details":{"code":"NOT_A_FOLDER","folder":"Sandbox/BI-0204-20261107115540/single.md","stage":"handler-stage-3"},"cause":null}
P2 pattern_search containing folder OK {"count":1,"matches":[{"path":"Sandbox/BI-0204-20261107115540/single.md","line":2,"offset":2,"match":"zebrafish","text":"A zebrafish swims here."}]}
P3 pattern_search missing folder ERR {"code":"CLI_REPORTED_ERROR","message":"pattern_search: folder not found in vault","details":{"code":"FOLDER_NOT_FOUND","folder":"Sandbox/BI-0204-20261107115540/no-such-folder","stage":"handler-stage-3"},"cause":null}
P4 context_search note-as-folder ERR {"code":"CLI_REPORTED_ERROR","message":"CLI bridge upstream error: CLI_REPORTED_ERROR","details":{"argv":["obsidian","vault=TestVault-Obsidian-CLI-MCP","folder","path=Sandbox/BI-0204-20261107115540/single.md"],"command":"folder","stdout":"Error: \"Sandbox/BI-0204-20261107115540/single.md\" is a file, not a folder.\n","stderr":"","exitCode":0,"message":"Error: \"Sandbox/BI-0204-20261107115540/single.md\" is a file, not a folder."},"cause":null}
P5 pattern_search whole vault (folder '/') OK {"count":2,"matches":[...]}
Repro1106/single.md ERR {"code":"CLI_REPORTED_ERROR","message":"pattern_search: \"Repro1106/single.md\" is a file, not a folder. ...","details":{"code":"NOT_A_FOLDER","folder":"Repro1106/single.md","stage":"handler-stage-3"}}
Repro1106 OK {"count":1,"matches":[{"path":"Repro1106/single.md","line":6,"offset":9,"match":"zebrafish","text":"The word zebrafish appears once."}]}
```

Regression run: `Test Files  204 passed | 1 skipped (205)` / `Tests  5114 passed | 6 skipped (5120)`.

## Test-vault hygiene

- Fixture `Sandbox/BI-0204-20261107115540/` (one note) was created for the run and deleted afterwards. No `BI-0204` entry is left under `Sandbox/`.
- `Welcome.md` is untouched. `Repro1106/single.md` was only read.
- The probes ran the handlers from a local `npm run build` (`dist/` is gitignored), with throwaway scripts in a temp directory outside the repo, removed after the run.

## Residual Risks

- **Criterion 4 is met by the shared code and phrase, not by identical `details`.** `context_search` surfaces the CLI's `folder` probe failure (`details.message: 'Error: "<path>" is a file, not a folder.'`, no `details.code`), while `pattern_search` gives `details.code: "NOT_A_FOLDER"`. Both are `CLI_REPORTED_ERROR` carrying the same `is a file, not a folder` phrase. Aligning `context_search`'s `details` is out of scope per the report.
- **Live run on Windows only.** CI covers Linux in the unit suite. The template's check reads `stat().type` from Obsidian's adapter, so it does not depend on the host OS.
- **Not exercised through the MCP stdio transport.** The probes called the built handlers directly. Wrapping into `isError: true` results is shared registration code covered by the existing suites.

## Recommendation

Close the bug: verified end to end against the live test vault, with every acceptance criterion confirmed and no regressions. Proceed to open the PR, then `/code-review` and `/speckit-docs-as-code <n>`.
