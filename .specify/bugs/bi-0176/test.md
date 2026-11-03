# Bug Verification: write_note resolves a note name only at the vault root

- **Slug**: bi-0176
- **Tested**: 2026-11-03
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The original symptom no longer reproduces against the real Obsidian CLI. Overwriting a sub-folder note by bare name replaces that note in place (`created: false`, the resolved path) and leaves nothing at the vault root, and `read` by the same name returns the new content. With `overwrite: false`, the same name returns `FILE_EXISTS` for the resolved note. A Windows lock now returns `CLI_REPORTED_ERROR` / `EXTERNAL_EDITOR_CONFLICT` (`EPERM`) with a vault-relative path, the note unchanged and no absolute path in the envelope. The by-name overwrite also holds with the test vault open but not focused. There are no unit, type or lint regressions.

## Checks Performed

Live probes drove the built server (`npm run build` output in `dist/`) through an in-memory MCP client (`quietServer` + `connectInMemoryClient`), so each call went through the registered tool's schema parse, the handler and the real `Obsidian.com` CLI. They ran against `TestVault-Obsidian-CLI-MCP` (per `.memory/test-execution-instructions.md`), with fixtures under `Sandbox/BI-0176-20261103171232/`. Unless stated otherwise, the test vault was focused (`Obsidian.com eval code=app.vault.getName()` → `=> TestVault-Obsidian-CLI-MCP`).

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Raw CLI lookup, existing name | `Obsidian.com vault=TestVault-Obsidian-CLI-MCP file file=Alpha-bi0176-<ts>` | pass | TSV answer with `path	Sandbox/BI-0176-…/Alpha-….md`, the line `resolveFileByTsv` reads. |
| Raw CLI lookup, missing name | `Obsidian.com vault=TestVault-Obsidian-CLI-MCP file file=NoSuchNote-bi0176-<ts>` | pass | `Error: File "NoSuchNote-bi0176-20261103171232" not found.`, which matches `FILE_NOT_FOUND_LINE`. |
| Reproduction P1 (post-fix): overwrite by bare name, note in a sub-folder | Seeded `Sandbox/BI-0176-<ts>/Alpha-bi0176-<ts>.md` (`old body`); `write_note` `{file: "Alpha-bi0176-<ts>", content: "new body\n", overwrite: true}` | pass | `{created:false, path:"Sandbox/BI-0176-…/Alpha-….md", bytes_written:0}`. On-disk content replaced; no `<vault-root>/Alpha-….md`; vault-root listing identical before and after. |
| Acceptance 1: read by name after the replace | `read` `{file: "Alpha-bi0176-<ts>"}` | pass | `{"content":"new body\n"}` |
| Reproduction P2: `overwrite: false`, same name | `write_note` `{file: …, overwrite: false}` | pass | `FILE_EXISTS`, `details: {errno:"EEXIST", path:<resolved sub-folder path>, vault}`. Content unchanged; no root stray. Before the fix this created a root duplicate. |
| P3: a name no note has → documented fallback | `write_note` `{file: "Sandbox/BI-0176-<ts>/Beta-bi0176-<ts>.md", overwrite: false}` | pass | `{created:true, path:<that verbatim path>, bytes_written:5}`; file present. The bare-name → `<name>.md` at vault root fallback was **not** run live: the test-vault rules forbid vault-root writes. Unit-tested (below). |
| P5: `path` form regression | `write_note` `{path: <sub path>, overwrite: true}` | pass | `{created:false, path:<sub path>, bytes_written:1}`. |
| Reproduction, secondary defect P4: Windows lock | PowerShell `[System.IO.File]::Open(<abs>, Open, ReadWrite, FileShare.ReadWrite)` (no `FileShare.Delete`) held during `write_note` `{file: …, overwrite: true}`, then `$f.Close()` | pass | `CLI_REPORTED_ERROR`, `details: {code:"EXTERNAL_EDITOR_CONFLICT", reason:"file-locked", path:<vault-relative>, errno:"EPERM"}`. File byte-identical; vault folder appears nowhere in the envelope; no `.tmp` residue. |
| U1: by-name overwrite with the test vault open but **not focused** | Focused `My-Setup-Vault` via `obsidian://open?vault=My-Setup-Vault` (confirmed `=> My-Setup-Vault`), seeded `Gamma-bi0176-<ts>.md` in the fixture folder, `write_note` `{file: "Gamma-bi0176-<ts>", overwrite: true}`, then `read` by name | pass | `{created:false, path:"Sandbox/BI-0176-…/Gamma-….md", bytes_written:0}`; `read` → `"new gamma\n"`; no root stray; test-vault root unchanged; focus still `My-Setup-Vault` afterwards. The production argv puts `vault=` first, so the lookup ran in the named vault. Focus was then given back to the test vault. |
| New / updated tests | `npx vitest run src/tools/write_note` | pass | 7 files, 123 tests (includes `handler.note-name.test.ts` and `handler.fs-errors.test.ts`, plus the owner-approved edits to existing suites). |
| Regression suite | `npm test` (coverage floor 91.3%) | pass | 193 files passed (1 skipped), 4515 tests passed (6 skipped); statements 97.07%. The FR-018 descriptor-baseline gate passes with the regenerated baseline. |
| Type-check | `npx tsc --noEmit` | pass | exit 0 |
| Lint | `npm run lint` | pass | exit 0 |
| Build | `npm run build` | pass | exit 0 (built during `/speckit-bug-fix`; `dist/` used by the live probes) |

Vault hygiene: the fixture folder `Sandbox/BI-0176-20261103171232/` (Alpha, Beta, Gamma) was removed. A first attempt's folder `Sandbox/BI-0176-20261103171221/` (one seeded note; the harness failed to pass its JSON arguments, so no tool call ran) was also removed. No `BI-0176*` entries remain in `Sandbox/`. `Welcome.md` and the vault root are untouched, and the other Sandbox content was not touched. Focus is back on `TestVault-Obsidian-CLI-MCP`, the state at the start of the run.

## Output Excerpts

```
P1 write_note: {"isError":false,"body":{"created":false,"path":"Sandbox/BI-0176-20261103171232/Alpha-bi0176-20261103171232.md","bytes_written":0}}
P1 read by name: {"isError":false,"body":{"content":"new body\n"}}
P1 root stray exists: False
P2 write_note: {"isError":true,"body":{"code":"FILE_EXISTS","message":"File already exists at \"Sandbox/BI-0176-20261103171232/Alpha-bi0176-20261103171232.md\" and overwrite is false.","details":{"errno":"EEXIST","path":"Sandbox/BI-0176-20261103171232/Alpha-bi0176-20261103171232.md","vault":"TestVault-Obsidian-CLI-MCP"}}}
P3 write_note: {"isError":false,"body":{"created":true,"path":"Sandbox/BI-0176-20261103171232/Beta-bi0176-20261103171232.md","bytes_written":5}}
P4 write_note: {"isError":true,"body":{"code":"CLI_REPORTED_ERROR","message":"Cannot write \"Sandbox/BI-0176-20261103171232/Alpha-bi0176-20261103171232.md\" — the file is held open by an external editor (EPERM). Save and close the file in the editor, then retry.","details":{"code":"EXTERNAL_EDITOR_CONFLICT","reason":"file-locked","path":"Sandbox/BI-0176-20261103171232/Alpha-bi0176-20261103171232.md","errno":"EPERM"}}}
P4 byte-identical: True
P4 abs path in envelope: False
focused before U1: => My-Setup-Vault
U1 write_note (test vault unfocused): {"isError":false,"body":{"created":false,"path":"Sandbox/BI-0176-20261103171232/Gamma-bi0176-20261103171250.md","bytes_written":0}}
U1 read by name: {"isError":false,"body":{"content":"new gamma\n"}}
```

```
> Obsidian.com vault=TestVault-Obsidian-CLI-MCP file file=NoSuchNote-bi0176-20261103171232
Error: File "NoSuchNote-bi0176-20261103171232" not found.
```

```
npm test → Test Files 193 passed | 1 skipped (194); Tests 4515 passed | 6 skipped (4521); Statements 97.07%
```

## Residual Risks

- **The bare-name fallback to the vault root was not run live** (the test-vault rules forbid vault-root writes). It is covered by the unit tests (`handler.note-name.test.ts` fallback rows and the `020/US1` cases, which queue Obsidian's real not-found line), and the live raw-CLI probe confirms the not-found text the fallback keys on.
- **A shared name (two notes with the same name) was not probed live.** By construction it resolves to whatever `obsidian file` picks, the same lookup `read` uses; spec 089's live check L5 established that parity for the cohort.
- **The `EBUSY` lock variant, and `EPERM` on `stat` / `mkdir` / the `wx` create,** are covered by injected-errno unit tests only; the live lock probe produced `EPERM` on the rename path.
- **Miss detection depends on Obsidian's stdout wording** (`Error: File "<name>" not found.`). A wording change would turn create-by-name into a propagated `CLI_REPORTED_ERROR`: it fails loudly and never writes to the wrong place.
- **Residual race** (accepted by the assessment): a note moved or deleted between the lookup and the write is written at its old resolved path.
- **Not exercised:** a vault that is closed but registered (cold-start path; unit-tested with the `Error: Command "file" not found.` reply), Obsidian fully down, and macOS/Linux.

## Recommendation

Close the bug once the PR is reviewed. The fix is verified end to end against the real CLI for every reproduction in the assessment: the sub-folder overwrite by name with `overwrite: true` and `overwrite: false`, and the Windows lock. It also holds with the named vault open but unfocused. The full regression suite, type-check and lint are clean. The residual gaps above are covered by unit tests and need no further action before merge.
