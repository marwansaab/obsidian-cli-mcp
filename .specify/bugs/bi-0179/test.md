# Bug Verification: views_base attaches the previous malformed Base's parser complaint to the named Base

- **Slug**: bi-0179
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

After the fix, every live sequence the assessment asks for returns the named Base's own complaint and length. That covers A → B, B → A, a valid Base first, a note first, and malformed A → valid B, which lists B's own view. The automated suites, typecheck and lint all pass. The result is **partial**, not verified, for two reasons. TC-00736's symptom did not reproduce on this machine before the fix either (fix.md, Local Verification), so these runs cannot show that the fix removes the failure the TC saw. And the new `FOCUS_NOT_APPLIED` path is covered only by unit tests, because no live run made the focus switch fail. No regressions were found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix): A then B | Built handler (`dist/tools/views_base/handler.js`, post-fix), `vault` named, `Sandbox/BI-0179-test/A/broken.base` then `B/broken.base` | pass | A: 148 characters, quotes `name: [unclosed`. B: 128 characters, quotes `name: [a, b`. Each `base_path` and headline names its own Base. |
| Reproduction (post-fix): B then A | Same, opposite order | pass | B 128 / `[a, b`, then A 148 / `[unclosed`. |
| Control: valid Base open first | Focus `valid.base` directly, then `views_base` on B | pass | B: 128 / `[a, b`, the same as after a malformed Base. |
| Control: note open first | Focus `note.md` directly, then `views_base` on B | pass | B: 128 / `[a, b`, the same in every prior-focus case. |
| Malformed A → valid B (Resolved (Relay), Q1 = A) | `views_base` on A, then on `valid.base` | pass | `{"views":["GoodView"],"count":1}`. Not reported as malformed. |
| TC-00736's own fixtures | `_validation-056/broken.base` → `Fixtures/BI-0137/broken.base` → `_validation-056/broken.base` (read-only; only focus changes) | pass | 148 / 128 / 148, each quoting its own fault. |
| Front-vault mode (no `vault`) | A → B → A → valid | pass | 148 / 128 / 148, then `GoodView`. |
| Pre-fix reproduction of the symptom | See fix.md, Local Verification (raw CLI probe plus pre-fix built handler, with `vault` and without, with the vault in front and behind) | not reproduced | The symptom never appeared before the fix on Obsidian 1.15.0 (installer 1.14.4). The comparison between before and after the fix is therefore inconclusive. |
| `FOCUS_NOT_APPLIED` path, live | — | not-run | No live run made the open fail to land, and forcing that would mean changing code or Obsidian state outside the contract. Covered in-process by `_template.test.ts` (vm: never-lands, `active: null`, look-alike file) and `handler.test.ts` (exact `details`, one spawn). |
| Through the MCP server | `obsidian-cli-mcp-local` `views_base` | skipped | Not permitted during the fix step, so not retried. The running server would also still hold the pre-fix code until it restarts. |
| New / updated tests | `npx vitest run src/tools/views_base` | pass | 4 files, 89 tests. |
| Regression suite | `npm test` (vitest with coverage) | pass | 197 files passed, 1 skipped; 4906 tests passed, 6 skipped. The FR-018 fingerprint gate passes with no baseline change. |
| Lint / type-check | `npm run lint`, `npm run typecheck` | pass | Both exit 0. |
| Built code carries the fix | Search for `FOCUS_NOT_APPLIED` in `dist/tools/views_base/_template.js` and `handler.js` | pass | Found at `_template.js:24,33` and `handler.js:172`, so the live runs exercised the post-fix code. |

Live setup: `TestVault-Obsidian-CLI-MCP` was focused (`=> TestVault-Obsidian-CLI-MCP`). The fixtures were seeded under `Sandbox/BI-0179-test/` with the same faults as TC-00736 (`A/broken.base` `name: [unclosed`, `B/broken.base` `name: [a, b`, `valid.base` with view `GoodView`, `note.md`) and removed afterwards. `Welcome.md` is intact and there is no residue. The driver ran the built handler with real `createQueue` / `createLogger` and a stub vault registry. Prior focus for the controls was set with a direct `Obsidian.com eval` `openLinkText`. After each call the driver checked `getActiveFile()`, and it was the named file every time.

## Output Excerpts

```
=== L1 A then B (vault named) ===
Sandbox/BI-0179-test/A/broken.base: CLI_REPORTED_ERROR BASE_MALFORMED/invalid-yaml ... messageLength=148 quotes="name: [unclosed" ...  (active after: => Sandbox/BI-0179-test/A/broken.base)
Sandbox/BI-0179-test/B/broken.base: CLI_REPORTED_ERROR BASE_MALFORMED/invalid-yaml ... messageLength=128 quotes="name: [a, b" ...  (active after: => Sandbox/BI-0179-test/B/broken.base)
=== L4 note first, then B ===
[prior focus] Sandbox/BI-0179-test/note.md -> active => Sandbox/BI-0179-test/note.md
Sandbox/BI-0179-test/B/broken.base: CLI_REPORTED_ERROR BASE_MALFORMED/invalid-yaml ... messageLength=128 quotes="name: [a, b" ...
=== L5 malformed A then valid B ===
Sandbox/BI-0179-test/valid.base: OK {"views":["GoodView"],"count":1}  (active after: => Sandbox/BI-0179-test/valid.base)
```

```
 Test Files  197 passed | 1 skipped (198)
      Tests  4906 passed | 6 skipped (4912)
test exit 0
lint exit 0
```

## Residual Risks

Owner ruling, 2026-11-04 (option A): the partial result is accepted and the PR goes ahead with the three gaps below recorded here. TC-00736 is to be re-run through the restarted `obsidian-cli-mcp-local` server after merge or restart. The reserve retry from assessment step 2 is not to be added.

1. **No pre-fix reproduction of TC-00736.** TC-00736 failed on `0.9.0-local`, probably before Obsidian's 1.15.0 update (the installer is 1.14.4). It never reproduced here, before or after the fix, so there is no proof that the fix removes the failure the TC saw. The fix holds by construction: `base:views` parses the active file, and the handler now lists only once the named file is active. That rests on the assessment's reading of Obsidian's code, not on a reproduced failure followed by its absence. Closing this gap needs an environment where the symptom appears, probably Obsidian 1.14.4.
2. **The focus-failure error is tested only by unit tests.** No live run made the focus switch fail, so the `CLI_REPORTED_ERROR` with `details: { stage: "focus", base_path, active }`, its exact message and its single spawn are pinned only by `_template.test.ts` (vm) and `handler.test.ts`. If Obsidian drops an open rather than applying it late, callers get this retryable error instead of a misattributed complaint. Per the ruling, no retry is added.
3. **No run over the MCP stdio transport.** The live checks drove the same handler module the server registers, from a Node script, not through the `obsidian-cli-mcp-local` server over stdio. The follow-up is to re-run TC-00736 through that server once it has restarted on this build (after merge or restart).

Also carried from the assessment, and out of scope: a person changing focus between the focus eval and `base:views` can still swap the file.

## Recommendation

Owner sign-off, 2026-11-04: option A, so the partial result is accepted and the PR is opened (see Residual Risks).

Proceed to the PR, and keep TC-00736 open until it is re-run. The fix is correct by construction and causes no regressions, and every acceptance-criterion sequence passes live on the post-fix code. The original symptom, however, could not be reproduced, so this run cannot show that the fix removed it. Re-run TC-00736 through the MCP server once it is restarted on this build, ideally on the Obsidian version the TC first failed on. If it then reports `details.stage: "focus"`, revisit the retry from assessment step 2.
