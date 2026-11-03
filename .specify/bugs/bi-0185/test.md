# Bug Verification: A registered vault whose folder is missing fails with a raw ENOENT string

- **Slug**: bi-0185
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

Before the fix, the compiled tools return the reported raw string. They were called with real Node file system calls and a vault entry pointing at a folder that does not exist (TC-00727's shape). After the fix, all eight affected tools return the structured `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `folder-missing` envelope with no disk path and no CLI call. Unit suites, the full suite, typecheck and lint pass. The result is **partial**, not verified, for two reasons. TC-00727 itself, which needs Obsidian to have registered a vault whose folder is gone, still could not be run live. And Obsidian's answers on the Q3 CLI routes (`file` locators, `bases`, `views_base`) are still unobserved.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction, pre-fix (real fs) | `HEAD`'s `src` compiled to a scratch folder. Each affected tool's registered handler (`createXTool(deps).handler(args)`) was called with real `node:fs/promises`, a registry mapping `OCM-Unavailable-Probe` → `%TEMP%\OCM-Unavailable-Probe` (folder absent), and a spawn stub that fails if the CLI is reached | pass (symptom reproduced) | All 8 tools threw `Error: ENOENT: no such file or directory, realpath 'C:\Users\sirzi\AppData\Local\Temp\OCM-Unavailable-Probe'`, the exact TC-00727 text. 0 spawns. |
| Reproduction, post-fix (real fs) | Same probe against the working tree compiled to a scratch folder | pass | All 8 tools return `isError` with `{"code":"CLI_REPORTED_ERROR", …, "details":{"code":"VAULT_NOT_FOUND","reason":"folder-missing","vault":"OCM-Unavailable-Probe"}}`, the restore / re-open hint, and no disk path. 0 spawns. |
| Missing drive, pre / post | Same probe with the vault root on a drive letter that does not exist (`Q:\Vaults\OCM-Unavailable-Probe`) | pass | Pre: raw `ENOENT … realpath 'Q:\'`. Post: the same `folder-missing` envelope. On this Windows host a missing drive reports ENOENT (not EPERM / UNKNOWN), so it gets the restore hint. |
| Available-vault control | `query_base` on an existing, empty scratch folder, pre and post | pass | Identical before and after: `CLI_REPORTED_ERROR` / `BASE_NOT_FOUND` (acceptance criterion 4). |
| Reproduction, live TC-00727 (Obsidian-registered vault, folder renamed) | Not runnable | not-run | Obsidian has no registered vault with a missing folder (`obsidian vaults verbose`: 7 vaults, all folders exist). Registering one needs Obsidian's vault switcher (see fix.md, "Q3 route probe"). TC-00727's renamed folder `%TEMP%\OCM-Unavailable-Probe-moved` still exists but is no longer registered. |
| Q3 routes live (`file` locators, `bases`, `views_base`) | Not runnable, same reason | not-run | fix.md's code reading found no route that can let a raw system error escape: each one reaches Obsidian only through `invokeCli` / `invokeEval`. What Obsidian actually answers there is unobserved. |
| New / updated tests | `npx vitest run src/tools/_active-file.test.ts src/tools/{query_base,create_base,find_and_replace,write_note,append_note,prepend,patch_block,patch_heading} src/path-safety` | pass | 57 files passed, 1 skipped; 1264 tests passed, 6 skipped. |
| Regression suite | `npm test` (vitest with coverage) | pass | 196 files passed, 1 skipped; 4837 tests passed, 6 skipped. Includes the FR-018 baseline fingerprint test (baseline not regenerated). |
| Type-check | `npm run typecheck` | pass | `tsc --noEmit`, exit 0. |
| Lint | `npm run lint` | pass | `eslint .` exit 0, after the scratch probe folder was removed (its compiled output had been picked up by `eslint .`). |

## Output Excerpts

Pre-fix (`HEAD`), every affected tool:

```text
## query_base [missing folder] -> THROWN (free text via SDK), spawns=0
   Error: ENOENT: no such file or directory, realpath 'C:\Users\sirzi\AppData\Local\Temp\OCM-Unavailable-Probe'
```

Post-fix, every affected tool:

```text
## query_base [missing folder] -> isError, spawns=0
   {"code":"CLI_REPORTED_ERROR","message":"Vault \"OCM-Unavailable-Probe\" is registered with Obsidian, but its folder could not be found on disk. Restore the folder, or re-open the vault in Obsidian, then call again.","details":{"code":"VAULT_NOT_FOUND","reason":"folder-missing","vault":"OCM-Unavailable-Probe"}}
```

Control (folder present), identical pre and post:

```text
{"code":"CLI_REPORTED_ERROR","message":"query_base: base file not found at the supplied vault-relative path","details":{"code":"BASE_NOT_FOUND","base_path":"x.base"}}
```

Suites: `Test Files 196 passed | 1 skipped (197)`, `Tests 4837 passed | 6 skipped (4843)`.

The probe script, the two scratch builds and the `HEAD` source extract lived in `.specify/bugs/bi-0185/_probe/` and were deleted after the run. The probe's empty `%TEMP%\OCM-Present-Probe-*` folders were removed too. No vault was touched, and Obsidian's registry was not modified in this step.

## Residual Risks

Owner ruling, 2026-11-04 (Relay sign-off, option A): the partial result is accepted and the pull request goes ahead without widening the fix. The first two items below are the accepted gaps. **TC-00727 is the re-run for the next owner-input validation pass**, and that pass also records Obsidian's live answers on the `file`-locator, `bases` and `views_base` routes for the same vault.

- **No live end-to-end run (TC-00727 not re-run).** The probe replaced only the vault registry (`obsidian vaults verbose`) with a stub. Everything after it ran as in production: the compiled tool, `registerTool`'s envelope, and real `fs.realpath`. A live run through the MCP server and Obsidian, against a vault Obsidian has registered and whose folder was renamed, is still owed. It needs that vault, set up by hand in Obsidian's vault switcher.
- **Q3 routes unobserved live.** With a `file` locator, the five editors call `obsidian file vault=<name>` before the guard, and `bases` / `views_base` go to the CLI only. Code reading says no raw error can escape there, but what Obsidian answers for such a vault (structured `CLI_REPORTED_ERROR`, a cold-start failure, or a found path that then hits the fixed guard) has not been seen. It needs the same vault as TC-00727.
- **Other errnos.** Only ENOENT was observed, including for a missing drive letter. A disconnected network share or removable drive may report something else on some hosts. That gets the `vault-root-check` envelope without the restore hint; the unit tests cover it (EPERM, EIO).
- **Raw errnos from below an existing vault root** (for example ENOTDIR for `Welcome.md/x.md` on Linux) still escape unchanged, as before. The owner ruled this outside BI-0185 (2026-11-04); it is listed in fix.md's Follow-ups as a candidate for its own BI.

## Recommendation

Open the pull request (owner ruling 2026-11-04, option A). The fix holds for every affected tool on a real file system: the symptom reproduces on `HEAD` and is gone on the fix, and the regression suite, typecheck and lint are green. Re-run TC-00727 in the next owner-input validation pass, with a vault Obsidian really has registered and whose folder has been renamed (set up through Obsidian's vault switcher). Record the `file`-locator, `bases` and `views_base` answers on the same vault in that pass.
