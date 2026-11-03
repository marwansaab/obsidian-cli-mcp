# Bug Verification: write_note resolves a note name only at the vault root

- **Slug**: bi-0176
- **Tested**: 2026-11-03
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

When the named vault is the one focused in Obsidian, the fix holds end-to-end against the real CLI:

- Overwriting a sub-folder note by bare name replaces that note (`created: false`) and leaves nothing at the vault root.
- With `overwrite: false`, the same name returns `FILE_EXISTS` for the resolved note.
- A name no note has is created by the fallback rule.
- A held file lock returns `EXTERNAL_EDITOR_CONFLICT` / `EPERM` with no absolute path and the note unchanged.
- No unit, type or lint regressions.

The live probes also surfaced a gap the assessment did not cover. The Obsidian CLI ignores `vault=` for a vault that is not the focused one and answers from the focused vault. When the named vault is not focused, the name lookup therefore runs in the wrong vault, and the original symptom (a second note at the vault root) can still occur. The result is `partial`, not `verified`, for that reason.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction P1: overwrite by bare name, note in a sub-folder (post-fix) | Built `dist/`, drove the registered `write_note` tool (`tool.handler`, schema parse included) against `TestVault-Obsidian-CLI-MCP` with the test vault focused. Seeded `Sandbox/BI-0176-<ts>/Alpha-bi0176-<ts>.md`, then called `file: "Alpha-bi0176-<ts>"`, `overwrite: true` | pass | `{created:false, path:"Sandbox/BI-0176-…/Alpha-….md", bytes_written:0}`. Sub-folder note content replaced; no root stray; vault-root listing identical before and after. |
| Acceptance: read by name after replace | `read` tool, `file: "Alpha-bi0176-<ts>"` | pass | Returned `"new body\n"`, the new content. |
| Reproduction P2: `overwrite: false`, same name | `write_note` `file`, `overwrite: false` | pass | `FILE_EXISTS`, `details: {errno:"EEXIST", path:<resolved sub-folder path>, vault}`; content unchanged; no root stray. |
| P3: a name no note has → fallback | `write_note` `file: "Sandbox/BI-0176-<ts>/Beta-….md"` (folder-qualified), `overwrite: false` | pass | `created: true` at the verbatim path. The bare canonical name → `<name>.md` at the vault root was **not** run live, because the test-vault rules forbid writing at the vault root. It is covered by unit tests. |
| P5: `path` form regression | `write_note` `path: <sub path>`, `overwrite: true` | pass | `created: false`, written in place. |
| Raw CLI not-found text | `Obsidian.com file vault=TestVault-Obsidian-CLI-MCP file=NoSuchNote-bi0176-<ts>` | pass | `Error: File "NoSuchNote-bi0176-20261103123206" not found.`, exit 0. Matches `FILE_NOT_FOUND_LINE`. |
| P4: Windows lock (TC-00412 harness) | PowerShell `[System.IO.File]::Open(<abs>, Open, ReadWrite, FileShare.ReadWrite)` (no `FileShare.Delete`) held during a `write_note` `file` call with `overwrite: true`, then `$f.Close()` | pass | `CLI_REPORTED_ERROR`, `details: {code:"EXTERNAL_EDITOR_CONFLICT", reason:"file-locked", path:<vault-relative>, errno:"EPERM"}`. File byte-identical; no absolute path in `message` or `details`; no `.tmp` residue. |
| Lookup with the named vault **not** focused | `Obsidian.com file/read/eval` with `vault=` naming an unfocused vault | **fail (gap)** | See *Output Excerpts*. `vault=` is ignored and the focused vault answers. |
| New / updated tests | `npx vitest run src/tools/write_note` | pass | 7 files, 115 tests. |
| Regression suite | `npm test` (with coverage floor) | pass | 193 files passed (1 skipped), 4507 tests passed (6 skipped); statements 97.07%. |
| Type-check | `npx tsc --noEmit` | pass | exit 0 |
| Lint | `npm run lint` | pass | exit 0 |
| Build | `npm run build` | pass | exit 0 (needed for the live probes) |

Vault hygiene: the fixtures (`Sandbox/BI-0176-20261103123206/`, two notes) were removed. `Welcome.md` and the vault root are untouched, and the Sandbox's pre-existing content was not touched. Focus was moved to the test vault for the probes and then given back to `My-Setup-Vault`, which had focus before the run.

## Output Excerpts

Live probe, test vault focused:

```
P1 write_note: {"isError":false,"body":{"created":false,"path":"Sandbox/BI-0176-20261103123206/Alpha-bi0176-20261103123206.md","bytes_written":0}}
P1 root stray exists: false
P1 read by name: {"isError":false,"body":{"content":"new body\n"}}
P2 write_note: {"isError":true,"body":{"code":"FILE_EXISTS",...,"details":{"errno":"EEXIST","path":"Sandbox/BI-0176-20261103123206/Alpha-bi0176-20261103123206.md","vault":"TestVault-Obsidian-CLI-MCP"}}}
P4 write_note: {"isError":true,"body":{"code":"CLI_REPORTED_ERROR","message":"Cannot write \"Sandbox/BI-0176-20261103123206/Alpha-bi0176-20261103123206.md\" — the file is held open by an external editor (EPERM). Save and close the file in the editor, then retry.","details":{"code":"EXTERNAL_EDITOR_CONFLICT","reason":"file-locked","path":"Sandbox/BI-0176-20261103123206/Alpha-bi0176-20261103123206.md","errno":"EPERM"}}}
P4 byte-identical: true
P4 abs path in envelope: false
```

The gap. The CLI answers from the focused vault whatever `vault=` says (verbatim stdout, exit 0):

```
# My-Setup-Vault focused; the seeded TestVault note, and TestVault's own Welcome.md, are "not found":
> Obsidian.com file vault=TestVault-Obsidian-CLI-MCP file=Alpha-bi0176-20261103123206
Error: File "Alpha-bi0176-20261103123206" not found.
> Obsidian.com file vault=TestVault-Obsidian-CLI-MCP file=Welcome
Error: File "Welcome" not found.
# ...while a My-Setup-Vault note is "found" under vault=TestVault:
> Obsidian.com file vault=TestVault-Obsidian-CLI-MCP file=Home
path	Home.md
# TestVault focused; vault=My-Setup-Vault is ignored the same way:
> Obsidian.com file vault=My-Setup-Vault file=Home
Error: File "Home" not found.
> Obsidian.com read vault=My-Setup-Vault file=Home
Error: File "Home" not found.
> Obsidian.com eval vault=My-Setup-Vault code=app.vault.getName()
=> TestVault-Obsidian-CLI-MCP
```

It was not established whether `My-Setup-Vault` was still open in a background window when it was named while the test vault had focus. The `vaults` tool reports `open: null`. In both directions, the named vault that was not focused was ignored.

## Residual Risks

- **The named vault must be the focused one (new finding; it blocks acceptance).** `write_note` resolves the vault folder through the registry, which is correct for any vault, but the `obsidian file` lookup answers from the focused vault. If the named vault is not focused:
  - A name that exists only in the named vault's sub-folder comes back as not found. `write_note` then falls back to the vault root and creates a duplicate: the original BI-0176 symptom, with `created: true`.
  - A name that exists in the focused vault returns *that* vault's relative path. `write_note` then writes (and with `overwrite: true` replaces, or creates folders at) that path inside the named vault. This wrong-location outcome is new with the fix.
- **The CLI behaviour predates this fix and affects the whole cohort.** `resolveFileByTsv` also serves `append_note`, `prepend`, `patch_heading`, `patch_block`, `read`'s file-type check and `find_and_replace`. Spec 089's probes ran with the test vault focused, so none of them characterised this case. Those tools mostly fail loudly (a missing note or file), but `write_note` creates notes, so it is the one where a wrong answer becomes a silent wrong write.
- **The original incident is covered.** It wrote to `My-Setup-Vault`, presumably the focused vault, and that case is fixed.
- **Not run live:** the bare-canonical-name fallback to the vault root (forbidden by the test-vault rules; covered by `handler.note-name.test.ts` and the 020/US1 tests), the `EBUSY` lock variant (injected-errno unit test only), and macOS/Linux behaviour.

## Recommendation

Hold. Do not close yet. The fix is correct and verified for the reported scenario (named vault focused), with no regressions. But the bug's acceptance criterion, "a sub-folder note replaced by name is replaced and no note appears at the root", fails whenever the named vault is not the focused one. That is because of a CLI behaviour (`vault=` ignored for a vault that is not focused) that no spec has recorded. The owner should decide between two paths:

- **(a) Widen this fix before merge.** For example, check that the lookup ran in the named vault before trusting its answer: compare the focused vault, or check that a resolved path exists under the named vault's folder, and fail loudly instead of falling back.
- **(b) Accept the residual.** Document the focused-vault requirement on the help page, and open a separate BI for the cohort-wide `vault=` behaviour.

Either way, this CLI behaviour should be recorded in an ADR or architecture note, because it contradicts the assumption that `vault=` routes typed CLI calls.

---

## Re-test after owner ruling, scope (a) (2026-11-03)

- **Result**: verified
- **Fix**: ./fix.md, *Amendment: owner ruling, scope (a)*

The section above is the first run, kept as it was written. This section records the re-test after the fix was widened: write_note now resolves a `file` name with one eval routed to the named vault, which reports the vault it ran in. Any other vault means `CLI_REPORTED_ERROR` / `VAULT_MISMATCH`, and nothing is written.

### Correction to the first run's finding

The first run's "`vault=` is ignored when the named vault is not focused" was **an artifact of the probe's own argv order**, not a CLI behaviour. Those raw probes put `vault=` *after* the subcommand (`Obsidian.com file vault=… file=…`). The CLI only reads a *leading* `vault=` token (production `assembleArgv` sends `[binary, vault=…, command, …]`), so a trailing one is ignored and the focused vault answers. Re-probed read-only with the production order, with My-Setup-Vault focused and the test vault open:

```
> Obsidian.com vault=TestVault-Obsidian-CLI-MCP file file=Welcome
path	Welcome.md
> Obsidian.com vault=TestVault-Obsidian-CLI-MCP eval code=app.vault.getName()
=> TestVault-Obsidian-CLI-MCP
> Obsidian.com vault=TestVault-Obsidian-CLI-MCP file file=Home        (a My-Setup-Vault-only note)
Error: File "Home" not found.
> Obsidian.com file vault=TestVault-Obsidian-CLI-MCP file=Welcome     (the first run's form)
Error: File "Welcome" not found.
```

The first run's own write_note probes (P1–P5) used production argv and were not affected. The vault-confirmation the owner ruled for is still worth having: it guards any misrouting, it costs no extra call, and it turns a would-be silent wrong write into a structured error.

### Vault state at each probe

Read from `%APPDATA%\obsidian\obsidian.json` (`open` per vault) and from `Obsidian.com eval code=app.vault.getName()` (focused vault), immediately before each probe:

| Probes | `TestVault-Obsidian-CLI-MCP` | `My-Setup-Vault` | Focused |
|---|---|---|---|
| P1–P4 | **open but unfocused** (`open: true`) | open (`open: true`) | My-Setup-Vault |
| P6 | **closed but registered** (window closed by a name-guarded eval; `open` absent) | open | My-Setup-Vault |

After P6, the test vault was open again and focused, because the lookup's cold-start reopened it. Focus was then given back to My-Setup-Vault. The first run's write_note probes (P1–P5) ran with the test vault focused.

### Checks performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| P1: overwrite by bare name, sub-folder note | Built `dist/`, registered `write_note` tool, `file: "Alpha-bi0176-<ts>"`, `overwrite: true`; vault open but unfocused | pass | `{created:false, path:"Sandbox/BI-0176-20261103124326/Alpha-….md", bytes_written:0}`. Content replaced, no root stray, vault root listing unchanged, focus unchanged. |
| Read by name after replace | `read` tool, `file` | pass | `"new body\n"` |
| P2: `overwrite: false`, same name | `write_note` | pass | `FILE_EXISTS` with the resolved sub-folder path; content unchanged. |
| P3: a name no note has | `write_note` folder-qualified name, `overwrite: false` | pass | `created: true` at the verbatim Sandbox path. The bare-name root fallback was not run live (test-vault rule: no vault-root writes); unit-tested. |
| P4: Windows lock (TC-00412 harness) | `[System.IO.File]::Open(…, ReadWrite, FileShare.ReadWrite)` held during a by-name `overwrite: true` | pass | `CLI_REPORTED_ERROR` / `EXTERNAL_EDITOR_CONFLICT`, `errno: "EPERM"`, vault-relative `path`. File byte-identical, no absolute path, no `.tmp`. |
| P6: overwrite by name with the vault closed but registered | Closed only the test vault's window with `vault=… eval` guarded by `app.vault.getName()==='TestVault-Obsidian-CLI-MCP'`, then `write_note` `file`, `overwrite: true` | pass | `{created:false, path:<sub-folder path>, bytes_written:4}`. The vault reopened and the right note was replaced; no root stray. |
| Name-resolution parity | `getFirstLinkpathDest(name,'')` vs `obsidian vault=… file file=<name>` on 6 names (shared, `.md`, two qualified forms, unique, missing) | pass | Identical every time; fixtures removed. |
| `VAULT_MISMATCH` (unconfirmed vault) | Unit tests in `handler.note-name.test.ts` | pass | Not triggered live: with production argv the CLI routed correctly in both vault states, so no live misrouting could be produced. The injected-answer tests are the gate (Principle II failure path). |
| New / updated tests | `npx vitest run src/tools/write_note` | pass | 8 files, 122 tests |
| Regression suite | `npm test` | pass | 194 files passed (1 skipped), 4515 tests passed (6 skipped); statements 97.08%; FR-018 baseline gate unchanged |
| Type-check / lint | `npx tsc --noEmit`, `npm run lint` | pass | exit 0 / 0 |

Vault hygiene: the fixtures (`Sandbox/BI-0176-20261103124326/`, two notes) were removed. `Welcome.md` and the vault root were untouched, and focus is back on My-Setup-Vault.

### Residual risks

- `VAULT_MISMATCH` is proven by unit tests only; no live misrouting could be produced.
- Two vaults with the same display name: the confirmation compares names, so it cannot tell them apart. The vault registry has the same limit (the last row wins).
- The bare-name fallback to the vault root, and the `EBUSY` lock variant, are covered by unit tests only.
- Not exercised: macOS/Linux, and the app fully down (ADR-030 relaunch).

### Recommendation

Close the bug once the PR is reviewed. The fix is verified end to end in both vault states the owner asked about (open but unfocused, and closed but registered), with the vault confirmation in place and no regressions. Follow-up for the owner: consider adding to `.memory/test-execution-instructions.md` that raw CLI probes must put `vault=` *before* the subcommand. A trailing `vault=` is silently ignored, which is what produced the first run's false finding. That file is not edited without your say-so.
