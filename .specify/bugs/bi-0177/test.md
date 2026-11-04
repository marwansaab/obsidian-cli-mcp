# Bug Verification: move reports a file blocking the destination folder as FOLDER_NOT_FOUND

- **Slug**: bi-0177
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The reproduction from `assessment.md` (TC-00701) was run live on Windows, through the built server's `move` tool, against the authorised test vault. It no longer reproduces. A destination folder name held by an existing note now fails with `details.code: "NOT_A_FOLDER"`, which names that note and gives no advice to create the folder. A destination folder that is really missing still gets the unchanged `FOLDER_NOT_FOUND`. Neither file changed. The full test suite, typecheck and lint pass; no regressions were found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix), TC-00701 | Started `node dist/index.js` (fresh `npm run build` of this branch) over MCP stdio with a v2 `Client`, and called `move` with `{target_mode:"specific", vault:"TestVault-Obsidian-CLI-MCP", path:"Sandbox/BI-0177-t1/MoveMe.md", to:"Sandbox/BI-0177-t1/Blocker.md/"}`, where `Blocker.md` is an existing note | pass | `isError: true`. The result is `CLI_REPORTED_ERROR` with `details: {code:"NOT_A_FOLDER", folder:"Sandbox/BI-0177-t1/Blocker.md"}` and no other keys. The message says an existing file holds the name and advises renaming or removing it, or picking another destination. It contains no "does not exist" and no "Create the folder", and it carries no absolute path. Before the fix, this was `FOLDER_NOT_FOUND`. |
| File in the way is an ancestor | Same call with `to: "…/Blocker.md/Sub/"` | pass | `NOT_A_FOLDER` naming `Sandbox/BI-0177-t1/Blocker.md` |
| Full-path `to` through a file | Same call with `to: "…/Blocker.md/Renamed.md"` | pass | `NOT_A_FOLDER` naming `Sandbox/BI-0177-t1/Blocker.md` |
| Missing folder unchanged | Same call with `to: "…/Missing/"` | pass | `FOLDER_NOT_FOUND`, `details.folder: "Sandbox/BI-0177-t1/Missing"`, with the message byte-identical to the spec 090 text |
| Success path unchanged | Same call with `to: "…/Dest/"` (an existing folder) | pass | `{"moved":true,"fromPath":"Sandbox/BI-0177-t1/MoveMe.md","toPath":"Sandbox/BI-0177-t1/Dest/MoveMe.md"}` |
| Nothing changed on the failures | SHA-256 of every fixture file before and after the run, plus a listing | pass | `Blocker.md` and `MoveMe.md` hashes are unchanged. No `Sub/`, `Missing/` or `Renamed.md` was created. `MoveMe.md` moved only in the success call, with the same hash. |
| New / updated tests | `npx vitest run src/tools/move src/tools/help` | pass | 9 files, 173 tests passed. This covers B1–B7, the re-provisioned M rows, `_template.test.ts`, the R1 wire test in `index.test.ts`, and the help docs-sync test. |
| Regression suite | `npx vitest run` | pass | 197 files passed, 1 skipped; 4884 tests passed, 6 skipped, 0 failed. The registry baseline (fingerprint) test passes against the regenerated `move` description fingerprint. |
| Type-check | `npx tsc --noEmit` | pass | clean |
| Lint | `npm run lint` (`eslint .`) | pass | no findings |
| Formatting | `npx prettier --check src/tools/move docs/tools/move.md` | pass (no new issues) | Prettier flags 9 files. Seven also fail on `main` (`handler.ts`, `schema.ts`, the move tests, `docs/tools/move.md`) or fail only because this Windows checkout has CRLF line endings (`index.ts`, the untouched `schema.test.ts`), so the fix did not cause them. The new `_template.test.ts` is not Prettier-formatted, like its sibling files. CI does not run `format:check`. |

## Output Excerpts

```text
--- R1 TC-00701 folder form naming a note (to=Sandbox/BI-0177-t1/Blocker.md/) isError=true
{"code":"CLI_REPORTED_ERROR","message":"move: \"Sandbox/BI-0177-t1/Blocker.md\" is an existing file, where the destination needs a folder of that name. Nothing was moved. Rename or remove that file, or pick another destination, then retry the move.","details":{"code":"NOT_A_FOLDER","folder":"Sandbox/BI-0177-t1/Blocker.md"}}
--- R4 missing folder (unchanged) (to=Sandbox/BI-0177-t1/Missing/) isError=true
{"code":"CLI_REPORTED_ERROR","message":"move: the destination folder \"Sandbox/BI-0177-t1/Missing\" does not exist in the vault. Nothing was moved. Create the folder (writing a note into it with write_note creates it), then retry the move.","details":{"code":"FOLDER_NOT_FOUND","folder":"Sandbox/BI-0177-t1/Missing"}}
--- R5 success into existing folder (to=Sandbox/BI-0177-t1/Dest/) isError=false
{"moved":true,"fromPath":"Sandbox/BI-0177-t1/MoveMe.md","toPath":"Sandbox/BI-0177-t1/Dest/MoveMe.md"}
```

```text
 Test Files  197 passed | 1 skipped (198)
      Tests  4884 passed | 6 skipped (4890)
```

The live run used the test vault focused and open in Obsidian, the `Obsidian.com` shim resolved by the production binary resolver, and fixtures under `Sandbox/BI-0177-t1/`. Afterwards the fixtures were removed, `Welcome.md` was still present, and no `.trash/` entries were created.

## Residual Risks

- **POSIX not covered.** On macOS/Linux, a rename through a file should fail with `ENOTDIR`, not `ENOENT`. Only the inferred unit rows B3/B4 cover that line; no POSIX host was available for a live run.
- **Active mode not exercised live.** Unit rows B7 and M6 cover it: the lookup runs in the focused vault with no `vault=`, and no registry lookup is made.
- **Case-sensitive lookup.** A blocking file whose name differs from `to` only in case is still reported as `FOLDER_NOT_FOUND`. This was seen live during the fix's probe and is documented in `docs/tools/move.md`.
- **Index staleness.** A file created outside Obsidian just before the move may not be in the index yet; in that case the result is today's `FOLDER_NOT_FOUND`.
- **Cancellation pass-through untested.** The one line that returns a non-`UpstreamError` abort reason from the lookup untouched has no unit test (see fix.md Follow-ups).
- **Acceptance evidence on the release build is still pending.** This run used the branch's `dist/`, not a published `-local` package. TC-00701 on the next `-local` build is the assessment's acceptance evidence.

## Recommendation

Proceed to the PR. The fix is verified end to end on Windows: the TC-00701 reproduction no longer gives `FOLDER_NOT_FOUND`, the new `NOT_A_FOLDER` error meets the report's acceptance criteria (it states a file is in the way, gives no create-folder advice, carries no absolute path, and leaves both files unchanged), the missing-folder and success paths are unchanged, and the whole suite is green. Re-run TC-00701 on the next `-local` build as acceptance, and capture the POSIX `ENOTDIR` line when a POSIX host is available.
