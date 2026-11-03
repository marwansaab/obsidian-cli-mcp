# Bug Verification: find_and_replace returns a pass-through CLI error for a missing note named by name

- **Slug**: bi-0178
- **Tested**: 2026-11-03
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The bug no longer reproduces. Against the authorised test vault, `find_and_replace` with a `file` name that matches no note now returns `VALIDATION_ERROR` with `details: { code: "INVALID_NOTE", reason: "not-found", note: <name> }` for both preview and `commit: true`. That is the same envelope the `path` form returns. Nothing was written, no confirmation was requested, and a name that does exist still resolves. The unit, regression, type and lint gates all pass, with no regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Raw upstream signal | `Obsidian.com file vault=TestVault-Obsidian-CLI-MCP file=bi0178-ghost-name` (via `Start-Process`, stdout and stderr captured separately) | pass | Exit 0, stdout `Error: File "bi0178-ghost-name" not found.`, stderr empty. This is the line `FILE_NOT_FOUND_LINE` matches, so the fix keys on Obsidian's real answer. |
| Reproduction, TC-00784 (name form, `commit: true`) | Built `dist/` from `fix/bi-0178` (`npm run build`), drove `node dist/index.js` over stdio with a v2 `Client` declaring elicitation; `find_and_replace { vault, file: "bi0178-ghost-name", pattern, replacement, commit: true }` | pass | `isError: true`, `VALIDATION_ERROR`, `details` = `{ code: "INVALID_NOTE", reason: "not-found", note: "bi0178-ghost-name" }`. Before the fix this was `CLI_REPORTED_ERROR` with `details.command: "file"`. |
| Reproduction, name form, preview | Same, without `commit` | pass | Same envelope. |
| TC-00783 (path form, `commit: true`) | `path: "Sandbox/bi0178-ghost-name.md"` | pass | `VALIDATION_ERROR`, `details` = `{ code: "INVALID_NOTE", reason: "not-found", note: "Sandbox/bi0178-ghost-name.md" }`. Unchanged, with the same keys as the name form. |
| No confirmation prompt | Elicitation handler on the probe client records every `elicitation/create` | pass | Zero elicitation requests across all calls. |
| Nothing created or changed | Checked the vault for `bi0178*` files after the run; listed `Sandbox/`; checked `Welcome.md` | pass | No `bi0178-ghost-name.md` created at the root or in `Sandbox/`. `Sandbox/` listing is the same as before the run. `Welcome.md` is present. |
| Positive control (an existing name still resolves) | Seeded `Sandbox/bi0178-target-<ts>.md`, then previewed with `file: "bi0178-target-<ts>"` | pass | Preview listed that one note with 1 occurrence. The fixture bytes were unchanged, and the fixture was then deleted (verified gone). |
| New tests | `npx vitest run src/tools/find_and_replace/scope.test.ts -t "BI-0178"` | pass | 4 passed. `fix.md` records that 3 of them fail with the handler fix reverted. |
| find_and_replace suites | `npx vitest run src/tools/find_and_replace` | pass | 8 files passed, 1 skipped; 190 tests passed, 6 skipped. |
| Regression suite | `npm test` (full, with coverage) | pass | 196 files passed, 1 skipped; 4811 tests passed, 6 skipped. |
| Type-check | `npm run typecheck` | pass | `tsc --noEmit` clean. |
| Lint | `npx eslint src/tools/find_and_replace` | pass | Clean. |

## Output Excerpts

Live name-form commit (TC-00784), from the built server:

```json
{
  "isError": true,
  "payload": {
    "code": "VALIDATION_ERROR",
    "message": "find_and_replace: note \"bi0178-ghost-name\" does not exist in vault",
    "details": { "code": "INVALID_NOTE", "reason": "not-found", "note": "bi0178-ghost-name" }
  }
}
```

Live path-form commit (TC-00783):

```json
{
  "isError": true,
  "payload": {
    "code": "VALIDATION_ERROR",
    "message": "find_and_replace: note \"Sandbox/bi0178-ghost-name.md\" does not exist in vault",
    "details": { "code": "INVALID_NOTE", "reason": "not-found", "note": "Sandbox/bi0178-ghost-name.md" }
  }
}
```

Probe flags: `"elicitations": []`, `"ghostCreated": false`, `"fixtureUnchanged": true`, `"fixtureRemoved": true`.

Full suite: `Test Files  196 passed | 1 skipped (197)` / `Tests  4811 passed | 6 skipped (4817)`.

## Residual Risks

- The live check ran against `dist/` built from this branch, not against the published `@marwansaab/obsidian-cli-mcp@0.9.0-local` package that TC-00784 originally failed on. The TC should be re-run on the next local release.
- Only Windows was exercised live. The change is platform-neutral (it keys on Obsidian's stdout line, which already matches on the `write_note` path), and CI covers Linux in-process only.
- Out of scope and not exercised: names that match several notes, folder or vault-wide scope, and the pass-through shape of the other note-scoped tools (`read`, `append_note`, `prepend`, `patch_heading`, `patch_block`). That cross-tool divergence is accepted in the assessment.
- `npx prettier --check` warns on both changed files, as it did at HEAD before the fix (pre-existing drift, recorded in `fix.md`).

## Recommendation

Close the bug once the PR merges. The fix is verified end to end against the authorised test vault (TC-00784 and TC-00783 both return the documented envelope, nothing is written, and no prompt appears), and the full regression suite is green. Re-run TC-00784 on the next local release, and add the CHANGELOG note listed in `fix.md` Follow-ups.
