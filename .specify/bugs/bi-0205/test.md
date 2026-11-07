# Bug Verification: `files` answers a missing folder as an empty folder

- **Slug**: bi-0205
- **Tested**: 2026-11-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The reproduction from the assessment (TC-00907) was re-run live against the authorised test vault, through the built server over real stdio. With the fix, `files` on a missing folder now fails with the same `CLI_REPORTED_ERROR` / `FOLDER_NOT_FOUND` shape as `paths`. An existing empty folder, the vault root, non-empty folders, file paths and `.obsidian` answer as before. The `..` and drive-absolute cases behave as the owner's Q1 ruling asks. The full regression suite, the type check and lint pass. No regressions were found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix), live | `npm run build`, then a temporary stdio client (`scripts/_stdio-client.ts` → `node dist/index.js`) calling `files` / `paths` in `TestVault-Obsidian-CLI-MCP` (probes P1–P14 below) | pass | All 14 probes gave the expected answer. Read-only, apart from one empty fixture folder created under `Sandbox/` and removed afterwards. |
| Raw CLI baseline | `obsidian vault=TestVault-Obsidian-CLI-MCP files folder=NoSuchFolder0205` (`Obsidian.com`, stdout and stderr captured separately) | pass | `exit=0 stdoutBytes=0 stderrBytes=0`. The CLI itself still answers a missing folder with nothing, so the new error comes from the wrapper's check, as designed. |
| New / updated tests | `npx vitest run src/tools/files src/tools/_folder-stat.test.ts` | pass | 5 files, 80 tests. fix.md also records that the 12 missing-folder handler cases fail against the unfixed handler. |
| Regression suite | `npm test` (vitest with coverage, as CI runs it) | pass | 206 files passed, 1 skipped; 5144 tests passed, 6 skipped. This includes the registry fingerprint baseline, `architecture.test.ts`, `_surface.test.ts` and `_plugin-noise.test.ts`. |
| Type-check | `npm run typecheck` | pass | No output from `tsc --noEmit`. |
| Lint | `npm run lint` | pass | `eslint .` clean. |
| Vault post-state | Count of `Sandbox/` entries before and after; `Welcome.md` present | pass | 191 entries before and after; the fixture folder `Sandbox/BI-0205-empty-20261107135056` was removed. `Welcome.md` is present and no `.trash/` entry was created. |
| Focused vault (for active-mode probes) | `obsidian eval "code=app.vault.getName()"` | pass | `=> TestVault-Obsidian-CLI-MCP` |

## Output Excerpts

Live probes (`vault: "TestVault-Obsidian-CLI-MCP"`, specific mode unless noted; long path lists are truncated in the probe output):

```
P1 files missing folder | isError=true | {"code":"CLI_REPORTED_ERROR","message":"files: FOLDER_NOT_FOUND for folder \"NoSuchFolder0205\"","details":{"stage":"envelope-error","code":"FOLDER_NOT_FOUND","folder":"NoSuchFolder0205"}}
P2 paths missing folder | isError=true | {"code":"CLI_REPORTED_ERROR","message":"paths: FOLDER_NOT_FOUND for folder \"NoSuchFolder0205\"","details":{"stage":"envelope-error","code":"FOLDER_NOT_FOUND","folder":"NoSuchFolder0205"}}
P3 files existing empty folder | isError=false | {"count":0,"paths":[]}
P3b files existing empty folder total | isError=false | {"count":0,"paths":[]}
P4 files vault root | isError=false | {"count":10,"paths":["EmptyName.md","NoView.md","Task1 1.md","Task1.md","…(+6)"]}
P5 files non-empty folder | isError=false | {"count":10,"paths":["Sandbox/BI-0008/tc-00425-path.md","Sandbox/BI-0008/tc-00426-wikilink.md","Sandbox/BI-0008/tc-00427-active.md","Sandbox/BI-0008/tc-00429-noeol.md","…(+6)"]}
P6 files traversal ../../etc | isError=true | {"code":"CLI_REPORTED_ERROR","message":"files: FOLDER_NOT_FOUND for folder \"../../etc\"","details":{"stage":"envelope-error","code":"FOLDER_NOT_FOUND","folder":"../../etc"}}
P7 files Sandbox/../Sandbox | isError=true | {"code":"CLI_REPORTED_ERROR","message":"files: FOLDER_NOT_FOUND for folder \"Sandbox/../Sandbox\"","details":{"stage":"envelope-error","code":"FOLDER_NOT_FOUND","folder":"Sandbox/../Sandbox"}}
P8 files drive-absolute C:/Windows | isError=true | {"code":"CLI_REPORTED_ERROR","message":"files: FOLDER_NOT_FOUND for folder \"C:/Windows\"","details":{"stage":"envelope-error","code":"FOLDER_NOT_FOUND","folder":"C:/Windows"}}
P9 files folder names a file | isError=false | {"count":0,"paths":[]}
P10 files .obsidian | isError=false | {"count":0,"paths":[]}
P11 files missing folder trailing slash | isError=true | {"code":"CLI_REPORTED_ERROR","message":"files: FOLDER_NOT_FOUND for folder \"NoSuchFolder0205\"","details":{"stage":"envelope-error","code":"FOLDER_NOT_FOUND","folder":"NoSuchFolder0205"}}
P12 files wrong-case folder | isError=false | {"count":0,"paths":[]}
P13 files active mode missing folder | isError=true | {"code":"CLI_REPORTED_ERROR","message":"files: FOLDER_NOT_FOUND for folder \"NoSuchFolder0205\"","details":{"stage":"envelope-error","code":"FOLDER_NOT_FOUND","folder":"NoSuchFolder0205"}}
P14 files active mode non-empty folder | isError=false | {"count":10,"paths":["Sandbox/BI-0008/tc-00425-path.md", …]}
```

How these map to the acceptance criteria:

- **Criterion 1** (a missing folder fails with a "folder not found" error naming the folder, matching `paths`): P1 against P2. The details are identical, and the messages differ only in the tool name. The same holds with a trailing slash (P11) and in active mode (P13).
- **Criterion 2** (an existing empty folder gives an empty list with count 0): P3, and P3b with `total: true`.
- **Criterion 3** (the vault root is unchanged): P4 lists the vault root's 10 files. That root call makes no check; the handler tests (3), (5) and (31) pin it to one spawn.
- **Owner ruling Q1** (a `..` segment fails with no `stat` check; absolute forms take the normal check): P6 and P7 fail as `FOLDER_NOT_FOUND`, and P8 (`C:/Windows`) fails as `FOLDER_NOT_FOUND` through the check.
- **Out of scope, unchanged**: a path that names a file stays empty (P9), and `.obsidian` stays empty through the dotfile filter (P10).

Unit / regression runs:

```
npx vitest run src/tools/files src/tools/_folder-stat.test.ts
 Test Files  5 passed (5)
      Tests  80 passed (80)

npm test
 Test Files  206 passed | 1 skipped (207)
      Tests  5144 passed | 6 skipped (5150)
```

## Residual Risks

- **A case-only misspelling is still not flagged on case-insensitive hosts.** P12: `folder: "sandbox/BI-0008"` (the real folder is `Sandbox/BI-0008`) lists nothing, because the CLI matches case-sensitively, but the check finds the folder, because Windows `stat` ignores case. So it answers `{ count: 0, paths: [] }`, not `FOLDER_NOT_FOUND`. This is documented in `docs/tools/files.md` and in the assessment's Risks; flagging it is beyond the report's criteria.
- **Linux and case-sensitive macOS were not exercised live.** Only Windows was. On those hosts both the CLI and `stat` are case-sensitive, so P12 would fail as `FOLDER_NOT_FOUND`. CI runs the unit suite on Linux, but not against a live vault.
- **Active-mode TOCTOU.** The listing and the check are two calls in the focused vault. A focus change between them could check the wrong vault. This is the documented active-mode caveat, not exercised here.
- **The published package (`@marwansaab/obsidian-cli-mcp@0.9.0`) still has the defect** until a release carries this fix. The live run used the local build (`dist/`) of the fix branch.
- **`paths` with `folder: ".."` (BI-0208) is unchanged** and was not probed here (out of scope).

## Recommendation

Close the bug once the PR merges. It is verified end-to-end: the live reproduction (TC-00907) now gives the `FOLDER_NOT_FOUND` error matching `paths`, all three acceptance criteria and the Q1 ruling hold live, and the full suite, type check and lint are green. When the fix ships, update TC-00907 and TC-00154's Expected results (traversal now fails as `FOLDER_NOT_FOUND`), and carry the reversed spec 019 FR-010 conflation into `.docs-as-code/` through `/speckit-docs-as-code`.
