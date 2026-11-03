# Bug Verification: Disabled Obsidian command line is passed back as a normal result

- **Slug**: bi-0132
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

The automated checks pass. The new tests feed the verbatim notice (TC-00495, 2026-05-30) through dispatch, both facades, `read` and the vault registry, and every surface now fails with `CLI_REPORTED_ERROR` and `details.reason: "cli-disabled"` instead of succeeding. The rest of the suite, type-check, lint and build are green. A live read-only probe of this branch's build, run with the setting ON, returned normal results on every surface, so the new rule causes no false positive on real output. The live reproduction with the setting OFF was **not** run. It needs the owner to turn off Obsidian's Command line interface setting, and this unattended run cannot do that. The result is therefore `partial`, not `verified`.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix), setting OFF | Assessment steps 1–5: owner turns Settings > General > Advanced > Command line interface OFF, then `obsidian_exec files total`, `read`, `vaults` and one named-vault writer against TestVault-Obsidian-CLI-MCP | skipped | Needs the owner to change an Obsidian setting. Nobody was available in this unattended Relay step, and the BI rules out changing the setting from the server. The live capture of the notice wording, which would confirm `CLI_DISABLED_ANSWER`, was not made either. |
| Recovery / no false positive, setting ON (assessment step 6) | Raw `Obsidian.com vault=TestVault-Obsidian-CLI-MCP files total` (Start-Process, stdout and stderr captured separately), then a Node script against this branch's `dist/`: `invokeBoundedCli` files total, `invokeCli` read `Welcome.md`, `invokeEval` `app.vault.getName()`, and a `createVaultRegistry` wired through `invokeCli` as in `server.ts` (`list()`, `resolveVaultPath`) | pass | Read-only, against the authorised test vault only. Raw CLI: exit 0, stdout `807`. Through the fixed code, all five calls succeeded with normal output (see excerpts). This is the setting-ON half of the recovery story. The OFF→ON transition was not exercised live; it is covered in unit tests. |
| Tool envelopes, setting ON (owner option C preparation) | Node script (outside the repo, deleted afterwards) that serves this branch's `dist/` through `quietServer` plus an in-memory MCP client and calls `obsidian_exec` files total, `read` `Welcome.md`, `vaults`, and `find_and_replace` in preview mode with `vault` + `folder: "Sandbox"` (a named-vault call resolved through the registry; preview writes nothing) | pass | All four returned `isError: false` with normal results: `807`, the note text, 7 vaults, and `affected_notes: []`. The OFF run that was to follow was cancelled by the owner ruling of 2026-11-04 (see Residual Risks). |
| New / updated tests | `npx vitest run src/cli-adapter src/tools/read/handler.test.ts src/tools/vaults/handler.test.ts -t "BI-0132"` | pass | 15 tests passed: dispatch exact match with LF, without newline and with CRLF; eval; three contains-the-words successes; the fixture pin; `obsidian_exec` with and without `vault`; `invokeCli`; `invokeEval`; the unknown-vault rule unaffected; `read`; `vaults` plus registry failure and same-session recovery. |
| Regression suite | `npx vitest run` | pass | 196 files passed, 1 skipped; 4854 tests passed, 6 skipped. Includes the FR-018 fingerprint gate against the regenerated baseline. |
| Lint / type-check / build | `npx tsc --noEmit`; `npm run lint`; `npm run build` | pass | All exit 0. |

## Output Excerpts

```
Test Files  196 passed | 1 skipped (197)
     Tests  4854 passed | 6 skipped (4860)
```

```
# raw CLI, setting ON
exit=0
stdout=[807
]
stderr=[]
```

```
# this branch's dist/, setting ON
obsidian_exec files total OK "807\n"
invokeCli read Welcome.md OK "---\nfoo: bar\ntmp_018_probe: zzz\n---\nThis is your new *vault*. …"
invokeEval vault name OK "TestVault-Obsidian-CLI-MCP"
registry list count OK 7
registry resolveVaultPath OK "C:\\Marwan-Saab-ADO\\My-Setup\\My-Setup\\TestVault-Obsidian-CLI-MCP"
```

No files were created in the vault. The temporary probe script lived outside the repository and was deleted after the run.

## Residual Risks

**Open OFF-state checks, owner-run later.** By owner ruling of 2026-11-04 (recorded under Status on BI-0132), the PR opens with this partial result. That ruling replaces the earlier timing that ran the toggle session before the PR. The exact-match rule stays; there is no prefix widening. These three checks remain open, to be run by the owner with Settings > General > Advanced > Command line interface turned OFF against TestVault-Obsidian-CLI-MCP:

1. **Live reproduction with the setting OFF.** Run `obsidian_exec files total`, `read`, `vaults`, and one named-vault call that resolves through the registry (for example `find_and_replace` in preview mode with `vault`). Each must return `CLI_REPORTED_ERROR` with `details.reason: "cli-disabled"` and Obsidian's notice in `details.stdout`. Status: **open**.
2. **Live capture of the notice wording.** Capture the raw `Obsidian.com` stdout word for word and compare it with `CLI_DISABLED_ANSWER`. If it differs, correct the constant and the `CLI_DISABLED_STDOUT` fixture in `_dispatch.test.ts`, keeping the exact match. Status: **open**.
3. **OFF→ON recovery in one session.** Turn the setting back ON and repeat the calls in the same server session; they must succeed without a restart. Status: **open**. The ON side alone passed (see Checks Performed), and the transition passes in unit tests.

Related risks:

- **Notice wording not re-captured.** `CLI_DISABLED_ANSWER` is the string recorded from the single 2026-05-30 probe. If the installed Obsidian prints different words, or a localised build does, the exact-match rule never fires and the old behaviour silently returns. Only the owner-run OFF probe can confirm the constant.
- **OFF-state symptoms are unit-proven only.** The `read` content, the empty `vaults` list, the named-vault `VALIDATION_ERROR` and the opaque eval `json-parse` symptoms were inferred from source in the assessment. They are shown fixed against stubbed spawns, not against a real disabled CLI.
- **Bounded false positive (accepted in the assessment).** A command whose entire output is exactly the notice sentence, such as a note containing only that sentence, is reported as cli-disabled.

## Recommendation

Open the PR with this partial result (owner ruling, 2026-11-04). The fix is sound against every automated check and does not disturb normal operation live. The three OFF-state checks under Residual Risks stay open for an owner-run toggle session later. If that session captures a notice that differs from `CLI_DISABLED_ANSWER`, correct the constant and its fixture, keeping the exact-match rule. Once all three pass, mark this report `verified`.
