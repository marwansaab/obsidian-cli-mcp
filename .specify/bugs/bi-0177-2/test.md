# Bug Verification: move by note name or active note reports a file in the destination's folder position as NOT_A_FOLDER; move's description names NOT_A_FOLDER

- **Slug**: bi-0177-2
- **Tested**: 2026-11-07
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The bug no longer reproduces. A test vault run through the built stdio server (`dist/index.js`) gave `NOT_A_FOLDER` naming the blocking file for a `move` by `file`, by `path` and of the active note, both when the file is the destination folder's last segment and when it is a parent folder. Nothing changed on disk. `tools/list` shows `move`'s description naming `NOT_A_FOLDER` (397 characters). A genuinely missing folder still gives `FOLDER_NOT_FOUND`, and a full-path collision still gives the raw `Destination file already exists!` error. The full suite, typecheck and lint pass.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction step 5: description (TC-00867) | `tools/list` over stdio against `node dist/index.js` (protocol `2025-06-18`) | pass | `move` description is 397 characters and contains `NOT_A_FOLDER`; no `obsidian_exec` route in it. |
| Reproduction steps 2–3: `file` locator (TC-00865 step 4) | `tools/call move` `{target_mode:"specific", vault, file:"MoveMe-0177r2t", to:"Sandbox/BI-0177-2T/Blocker-0177r2t.md/"}` | pass | `isError`, `details: {code:"NOT_A_FOLDER", folder:"Sandbox/BI-0177-2T/Blocker-0177r2t.md"}`; advice to rename/remove the file or pick another destination; both files unchanged. |
| Reproduction step 4: active mode (TC-00900) | Focus `MoveMe-0177r2t.md` (`Obsidian.com open path=…`, confirmed by eval), then `tools/call move` `{target_mode:"active", to:"…/Blocker-0177r2t.md/"}` | pass | Same `NOT_A_FOLDER` failure; the blocking file was looked up in the focused vault; both files unchanged. |
| `path` locator (unchanged, TC-00701 shape) | `tools/call move` with `path:"Sandbox/BI-0177-2T/MoveMe-0177r2t.md"`, same `to` | pass | Same `NOT_A_FOLDER` failure. |
| Ancestor blocker, `file` and active | `to:"…/Blocker-0177r2t.md/Sub/"` by `file` and in active mode | pass | Both `NOT_A_FOLDER` naming `Blocker-0177r2t.md`. |
| Other failures unchanged: missing folder | `file` locator, `to:"Sandbox/BI-0177-2T/Missing/Deeper/"` | pass | `FOLDER_NOT_FOUND`, `details.folder: "Sandbox/BI-0177-2T/Missing/Deeper"`; nothing moved. |
| Other failures unchanged: destination file exists | `file` locator, full-path `to:"Sandbox/BI-0177-2T/Blocker-0177r2t.md"` | pass | Raw `CLI_REPORTED_ERROR`, `details.message: "Error: Destination file already exists!"`, no `details.code`; nothing moved. |
| New / updated tests | `npx vitest run src/tools/move src/tools/_file-type-support.test.ts src/tools/_description-quality.test.ts src/tools/_register.test.ts src/tools/help` | pass | 12 files, 283 tests: B7 (corrected), B8–B13, the retargeted `obsidian_exec` assertion, description budgets, registry baseline, help docs. |
| Regression suite | `npm test` (vitest with coverage) | pass | 206 files passed, 1 skipped; 5151 tests passed, 6 skipped. |
| Type-check | `npx tsc --noEmit` | pass | exit 0. |
| Lint | `npx eslint .` | pass | exit 0. |
| Build | `npm run build` | pass | Rebuilt before the live run, so the server ran the fixed code. |

Live runs followed `.memory/test-execution-instructions.md`. Obsidian had `Game-Server-Vault` focused at the start, so `TestVault-Obsidian-CLI-MCP` was focused through `obsidian://open?vault=…` and confirmed with `eval code=app.vault.getName()` before any write. Fixtures were `Sandbox/BI-0177-2T/MoveMe-0177r2t.md` and `Sandbox/BI-0177-2T/Blocker-0177r2t.md`, and the CLI behind the server was the production `Obsidian.com` shim.

## Output Excerpts

```text
DESCRIPTION(397): Move a file to another folder in an Obsidian vault, optionally renaming it. Use `rename` for a name change in place and `delete` to remove a file. Links are rewritten per the vault's "Automatically update internal links" setting, and the file keeps its type. A destination through an existing file fails with `NOT_A_FOLDER`. Works on any file type (notes, canvases, bases, attachments and others).
contains NOT_A_FOLDER: true

FILE-LOCATOR isError: true text: {"code":"CLI_REPORTED_ERROR","message":"move: \"Sandbox/BI-0177-2T/Blocker-0177r2t.md\" is an existing file, where the destination needs a folder of that name. Nothing was moved. Rename or remove that file, or pick another destination, then retry the move.","details":{"code":"NOT_A_FOLDER","folder":"Sandbox/BI-0177-2T/Blocker-0177r2t.md"}}
ACTIVE isError: true text: {"code":"CLI_REPORTED_ERROR", … "details":{"code":"NOT_A_FOLDER","folder":"Sandbox/BI-0177-2T/Blocker-0177r2t.md"}}
FILE-MISSING-FOLDER isError: true text: {"code":"CLI_REPORTED_ERROR","message":"move: the destination folder \"Sandbox/BI-0177-2T/Missing/Deeper\" does not exist in the vault. …","details":{"code":"FOLDER_NOT_FOUND","folder":"Sandbox/BI-0177-2T/Missing/Deeper"}}
FILE-FULLPATH-COLLISION isError: true text: {"code":"CLI_REPORTED_ERROR","message":"CLI bridge upstream error: CLI_REPORTED_ERROR","details":{…,"message":"Error: Destination file already exists!"}}

After every call: Blocker-0177r2t.md (12 bytes, content "blocker") and MoveMe-0177r2t.md (12 bytes) both still in Sandbox/BI-0177-2T/.

Test Files  206 passed | 1 skipped (207)
     Tests  5151 passed | 6 skipped (5157)
```

Cleanup: `Sandbox/BI-0177-2T/` and the temporary client folder were deleted; `Welcome.md` is present and there is no `.trash/` folder. The rest of `Sandbox/` predates this run and was left alone. Obsidian was left with `TestVault-Obsidian-CLI-MCP` focused.

## Residual Risks

- **Exact-string trigger.** The new branch matches the CLI's `Error: Destination file already exists!` text. If a future CLI release rewords it, `file` and active calls return the raw error again (not a wrong classification). Unit row B8 holds the captured line.
- **Folder-form collision with a genuinely existing file** (`file` or active, `to: "Archive/"` where `Archive/<name>` exists) was checked only by unit row B9, not live, because the live fixture would need two notes with the same name. It now costs one extra `eval` before the original error is returned.
- **POSIX `ENOTDIR`** is still inferred, as in round one (Windows host only).
- **The description audit record** (`src/tools/_description-audit-record.json`) still holds `move`'s old description fingerprint, so the audit reports `move` as needing review until it is re-judged (fix.md Follow-ups). No test gates on it.
- The vault-side TCs (TC-00865 step 4, TC-00867, TC-00900) are recorded in the vault by the owner's process; this run exercised their steps against the local build but did not update those notes.

## Recommendation

Close the bug once the PR merges. Every reproduction step in the assessment was re-run end-to-end through the built MCP server in the test vault, and all three ways of naming the note now give `NOT_A_FOLDER`. The description names the failure within the 400-character budget, the missing-folder and destination-exists failures are unchanged, and the full suite, typecheck and lint pass. Re-judge `move`'s entry in the description audit record as a follow-up.
