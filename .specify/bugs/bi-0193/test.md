# Bug Verification: No-active-file advice names inputs or tools the caller cannot use

- **Slug**: bi-0193
- **Tested**: 2026-11-07 (second round, after the owner's ruling C)
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The bug no longer reproduces, live or in-process. The live reproduction, TC-00776, ran against the fixed build over real MCP stdio, with `TestVault-Obsidian-CLI-MCP` focused and no file open. `get_active_file` returned `{"active":null}` first. The `find_and_replace` preview with `active_note: true` then returned `ERR_NO_ACTIVE_FILE`, with no `affected_notes`, and with advice that names only `find_and_replace`'s own inputs (`path` / `file`, `vault`, `active_note`) and not `target_mode`. Every in-process check passes, and no regression was found.

## Round history

- **Round 1** (same day): the result was `partial`. All in-process checks passed, but TC-00776 was not run, because it needs the owner to focus the test vault and close its tabs.
- **Owner ruling 2026-11-07 (option C, recorded on BI-0193):** the owner focused `TestVault-Obsidian-CLI-MCP` in Obsidian and closed all its tabs, and approved active mode for this run only. Option B, wider guard coverage, was not chosen and stays under *Residual Risks*. The assistant did not change the tabs or the focus.
- **Round 2** (this report): TC-00776 ran live and the automated checks were re-run. No code changed between the rounds, so `fix.md` is unchanged.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Precondition: focused vault and no active file | `Obsidian.com eval "code=JSON.stringify({vault:app.vault.getName(),active:app.workspace.getActiveFile()?.path??null})"` (read-only; per `.memory/test-execution-instructions.md`, through `Obsidian.com`, never `Obsidian.exe`) | pass | `=> {"vault":"TestVault-Obsidian-CLI-MCP","active":null}`, exit 0. |
| Reproduction, live (TC-00776), step 1 | MCP stdio client → `node dist/index.js` (the fixed build: `npm run build` from the fixed sources; `dist/tools/find_and_replace/handler.js` contains the new advice) → `tools/call get_active_file {target_mode:"active"}` | pass | `isError: false`, `{"active":null}`. |
| Reproduction, live (TC-00776), step 2 | Same session → `tools/call find_and_replace {pattern:"BI0193-TC00776-NO-MATCH", replacement:"x", active_note:true}` (preview; `commit` left at its default `false`) | pass | `isError: true`, `ERR_NO_ACTIVE_FILE`, the new advice, `details: {}`, no `affected_notes`. No `target_mode` in the message. |
| Vault residue | `Get-ChildItem` of the vault root and of `Sandbox/` | pass | Preview only, so nothing was written. Every entry's timestamp predates this run, and `Welcome.md` is untouched. Older residue from earlier runs at the vault root and in `Sandbox/` (16 entries) was left as it is: none of it came from this run. |
| Unit-level reproduction (assessment steps 1–3) and new tests | `npx vitest run <the 8 affected test files> -t "BI-0193\|no note focused\|NO_ACTIVE_FILE\|no-focused\|no note open"` | pass | 8 files, 22 tests passed: the cross-tool guard (6 rows), the per-tool BI-0193 tests and the approved lifecycle assertion. |
| Retry validation (round 1, unchanged code) | A scratch Node probe parsing the advised retries through the built input schemas | pass | The OLD advice fails as the assessment recorded; the NEW advice passes. Excerpt below. |
| Regression suite | `npm test` (vitest with coverage, including the FR-018 register-baseline fingerprint gate) | pass | 204 files passed, 1 skipped; 5109 tests passed, 6 skipped; exit 0. |
| Type-check | `npx tsc --noEmit` | pass | exit 0 |
| Lint | `npx eslint .` | pass | exit 0 |
| Out-of-scope guard | `git diff --quiet -- src/errors.ts src/cli-adapter/_dispatch.ts` | pass | Both unchanged. No new error code, and the dispatch default is untouched (Relay Q1 = A). |

## Output Excerpts

TC-00776, live, fixed build over MCP stdio (verbatim):

```
initialize: ok (server obsidian-cli-mcp 0.9.0, protocol 2025-06-18)
--- get_active_file {target_mode:active}
isError: false
text: {"active":null}
structuredContent: {"active":null}
--- find_and_replace preview {active_note:true}
isError: true
text: {"code":"ERR_NO_ACTIVE_FILE","message":"No active file in Obsidian. Open a note in the editor, or call find_and_replace with path or file (and vault) instead of active_note.","details":{}}
```

Before the fix, the same call returned (TC-00776, 2026-11-03 / 2026-11-04, from the assessment): `No active file in Obsidian. Open a note in the editor, or call find_and_replace with target_mode=specific + vault + file/path.`

Retry-validation probe (round 1; the code has not changed since):

```
FAIL  find_and_replace OLD advice (target_mode=specific + vault + path)  -> Unrecognized key: "target_mode"
PASS  find_and_replace NEW advice (path + vault, no active_note)
PASS  find_and_replace NEW advice (file, no vault)
FAIL  set_property OLD advice (target_mode=specific only)  -> vault is required in specific mode; exactly one of `file` or `path` must be provided in specific mode (got neither)
PASS  set_property NEW advice (target_mode=specific + vault + path)
PASS  backlinks NEW advice (target_mode=specific + vault + file)
```

Full suite:

```
 Test Files  204 passed | 1 skipped (205)
      Tests  5109 passed | 6 skipped (5115)
TEST EXIT 0
```

## Residual Risks

- **Guard coverage (option B, not chosen by the owner, 2026-11-07).** The cross-tool guard `src/tools/_no-active-file-advice.test.ts` checks only the six tools this fix changed. The file-cohort tools (`write_note`, `append_note`, `prepend`, `patch_block`, `patch_heading`, `read`, `rename`, `move`, `outline`) and the dispatch-default reachers (`delete`, `read_property`) are compliant by inspection (assessment table), but no guard row checks them. Closing this needs per-tool fs or spawn fixtures, and changes tests only.
- **Live coverage is `find_and_replace` only.** TC-00776 is the only live reproduction the assessment lists. The `set_property`, `backlinks`, `links`, `read_heading` and `smart_connections_similar` messages are verified in-process, through stubbed evals and the built schemas, not against Obsidian.
- **Eval C2 route** (accepted with Relay Q1 = A). If an eval prints no answer line and some line starts with `Error: no active file`, a tool without a target mode, or the folder-scoped `files` / `paths`, could still receive the dispatch default, which names `target_mode` / `file`.
- **Message is published text.** The four eval tools' messages lost their `<tool>: ` prefix. `code` and `details` are unchanged. The docs-as-code pass should check those tools' error tables.

## Recommendation

Close the bug — verified end-to-end. Move on to the pull request (open PR → `/code-review` → `/speckit-docs-as-code`), carrying the residual risks above.
