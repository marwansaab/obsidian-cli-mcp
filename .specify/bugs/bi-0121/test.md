# Bug Verification: Focused-vault operations no longer depend on a warm vault-name cache

- **Slug**: bi-0121
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The cold-cache failure no longer reproduces. A fresh `node dist/index.js` process was started for each of the five cohort tools, and each tool's active-mode call (for `find_and_replace`, a `file` with no `vault`) was the first call of its process. Each succeeded against a note focused in TestVault-Obsidian-CLI-MCP, and each tool that reports a vault reported `vault: "TestVault-Obsidian-CLI-MCP"`, never the folder path. The full unit suite, type-check, lint and build pass, and the FR-018 fingerprint baseline did not move. No regressions were found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Pre-run checks | `obsidian eval "code=app.vault.getName()"` → `=> TestVault-Obsidian-CLI-MCP`; seeded `Sandbox/bi0121-probe-20261104115843.md`; focused it with `Start-Process "obsidian://open?vault=TestVault-Obsidian-CLI-MCP&file=Sandbox%2Fbi0121-probe-20261104115843"` | pass | The eval confirmed the vault, the active file (`Sandbox/bi0121-probe-20261104115843.md`) and `basePath`, which equals the `obsidian vaults verbose` row for the vault byte for byte. Driven through `Obsidian.com` (bare `obsidian`), per `.memory/test-execution-instructions.md`. |
| Reproduction (post-fix), live: `prepend` | Fresh server process; first call `prepend({ target_mode: "active", content: "bi0121-prepended" })` | pass | `isError: false`, `vault: "TestVault-Obsidian-CLI-MCP"`, `bytes_written: 17`. Before the fix this was the `Vault not found.` case (assessment step 2). |
| Reproduction (post-fix), live: `append_note` | Fresh process; first call `append_note({ target_mode: "active", content: "bi0121-appended" })` | pass | `vault: "TestVault-Obsidian-CLI-MCP"`, `bytes_written: 15`. Before the fix it reported the folder path (step 4). |
| Reproduction (post-fix), live: `patch_heading` | Fresh process; first call `patch_heading({ target_mode: "active", heading_path: "Probe#Section", mode: "append", content: "- bi0121-patched\n" })` | pass | `vault: "TestVault-Obsidian-CLI-MCP"`, `bytes_written: 17`. |
| Reproduction (post-fix), live: `patch_block` | Fresh process; first call `patch_block({ target_mode: "active", block_id: "bi0121", content: "bi0121 block replaced" })` | pass | `vault: "TestVault-Obsidian-CLI-MCP"`, `block_shape: "paragraph"`, `bytes_written: 11`. |
| Reproduction (post-fix), live: `find_and_replace` | Fresh process; first call `find_and_replace({ file: "bi0121-probe-20261104115843", pattern: "bi0121-token", replacement: "x", mode: "literal", commit: false })`, no `vault` | pass | Preview with 1 occurrence on line 10 of the probe note. Its `obsidian file vault=…` lookup resolved, which before the fix was the `Vault not found.` case (step 3). Preview only; nothing written. |
| Post-state of the probe note | `Get-Content` of the note after the five calls | pass | The note shows all four edits in place (prepended line, replaced block, appended line, patched section). Its other content is intact. |
| Pre-fix live reproduction | — | skipped | Skipped by owner ruling (assessment Open Questions, "Live confirmation", option A). The pre-fix symptom comes from the source and the pinned unit tests, plus BI-0117's 2026-05-26 bisect on an earlier version. |
| Unregistered focused vault, live | — | not-run | Needs a focused vault that `vaults verbose` does not list, which cannot be staged safely. Covered in-process by the flipped fallback tests and `find_and_replace/scope.test.ts`, which expect `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `focused-unregistered` with nothing written. |
| New / updated tests | `npx vitest run src/vault-registry src/tools/_active-file.test.ts src/tools/append_note src/tools/prepend src/tools/patch_block src/tools/patch_heading src/tools/find_and_replace` | pass | 42 files passed (1 skipped); 945 tests passed, 6 skipped. |
| Regression suite | `npx vitest run` | pass | 196 files passed (1 skipped); 4868 tests passed, 6 skipped; 0 failed; no unhandled errors. Includes the FR-018 fingerprint gate in `_register.test.ts`, which passes without `baseline:write`. |
| Lint / type-check | `npx tsc --noEmit -p .`; `npm run lint` | pass | Both exit 0. |
| Build | `npm run build` | pass | `tsc -p tsconfig.build.json` clean; the live probes ran against this build. |
| Cleanup | Removed the probe note and the throwaway probe script (kept outside the repository, in `%TEMP%`) | pass | `Sandbox/` listing matches the pre-run listing; `Welcome.md` is present. No `.trash/` entries (the note was removed on the filesystem). |

## Output Excerpts

Live probe: one fresh server process per line. In each, the call shown was the process's first tool call.

```text
{"tool":"prepend","isError":false,"text":"{\"path\":\"Sandbox/bi0121-probe-20261104115843.md\",\"vault\":\"TestVault-Obsidian-CLI-MCP\",\"bytes_written\":17,\"inline\":false}"}
{"tool":"append_note","isError":false,"text":"{\"path\":\"Sandbox/bi0121-probe-20261104115843.md\",\"vault\":\"TestVault-Obsidian-CLI-MCP\",\"bytes_written\":15,\"inline\":false}"}
{"tool":"patch_heading","isError":false,"text":"{\"path\":\"Sandbox/bi0121-probe-20261104115843.md\",\"vault\":\"TestVault-Obsidian-CLI-MCP\",\"heading_path\":\"Probe#Section\",\"mode\":\"append\",\"bytes_written\":17}"}
{"tool":"patch_block","isError":false,"text":"{\"path\":\"Sandbox/bi0121-probe-20261104115843.md\",\"vault\":\"TestVault-Obsidian-CLI-MCP\",\"block_id\":\"bi0121\",\"block_shape\":\"paragraph\",\"bytes_written\":11}"}
{"tool":"find_and_replace","isError":false,"text":"{\"mode\":\"preview\",\"affected_notes\":[{\"path\":\"Sandbox/bi0121-probe-20261104115843.md\",\"occurrence_count\":1,\"occurrences\":[{\"line_number\":10,\"full_line\":\"bi0121-token here\",\"matched_substring\":\"bi0121-token\",\"replacement_substring\":\"x\"}]}],\"total_occurrences\":1}"}
```

Unit suite:

```text
 Test Files  196 passed | 1 skipped (197)
      Tests  4868 passed | 6 skipped (4874)
```

## Residual Risks

- **Windows host only.** The live check ran on Windows, where Obsidian's `basePath` and the `vaults verbose` path agree byte for byte. On a host where they differ (case, separators, a trailing slash, a symlinked folder), the cohort now fails with `focused-unregistered` instead of echoing the path. This is the intended direction, but it is not live-tested. CI runs the unit suite on Linux too.
- **`focused-unregistered` path is unit-tested only.** It was not exercised live (see the not-run row).
- **Pre-fix symptom not re-observed live on 0.9.0.** This is by ruling. The post-fix runs are exactly the assessment's fresh-process reproduction scenario.
- **Accepted residuals from the assessment still stand.** These are duplicate display names, and one extra `vaults verbose` spawn on the first active-mode call of a process.
- **Focus left on the removed probe note.** Obsidian's focus was left on the removed probe note; the user may want to click away from it.

## Recommendation

Close the bug. The fix is verified end to end: every in-scope operation succeeds as the first call of a fresh server process and reports the vault's display name, and there are no regressions in the unit, type, lint, build or fingerprint gates. The five live first-call checks above can serve as BI-0121's per-tool regression-lock TCs (assessment scope item 3). Proceed to open the PR, then `/code-review` and `/speckit-docs-as-code`. The review should also update the stale `.memory/refactor-decisions.md` entries listed in fix.md's Follow-ups.
