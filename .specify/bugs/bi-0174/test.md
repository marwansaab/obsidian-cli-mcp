# Bug Verification: help pages and tool descriptions disagree with live behaviour

- **Slug**: bi-0174
- **Tested**: 2026-11-04
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

The original drift no longer reproduces. Every help page has the four standard sections, every description fits in 4,096 characters, and each corrected example, message and hint that could be called safely matches what the built server returns live against the test vault. The full regression suite, typecheck and lint pass. The result is `partial`, not `verified`, only because three live checks the assessment lists could not be run safely here: the vault-unavailable answer, the disabled-CLI notice, and the no-active-file advice of `views_base` / `obsidian_exec`. The unit tests cover their code paths, but they were not exercised against a real Obsidian.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction 1: headings (TC-00586) | Shell loop over `docs/tools/*.md` (except `index.md`) for `## Input`/`Output`/`Errors`/`Examples` | pass | `heading-gaps=0`; the assessment found 24 pages short. Also locked by the new `docs-sync.test.ts` case, which ignores code-fenced headings. |
| Reproduction 2: description lengths | Live `tools/list` from `node dist/index.js` over stdio | pass | 35 tools; longest description 4,046 (`find_and_replace`, was 4,867). |
| Reproduction 3: unknown-vault shapes | Live calls with `vault: "NoSuchVault-bi0174"` | pass | `append_note` → `VALIDATION_ERROR`, `Vault "NoSuchVault-bi0174" is not registered with Obsidian.`, `{ requestedVault, knownVaults }`. `query_base` → `CLI_REPORTED_ERROR` `{ code: "VAULT_NOT_FOUND", reason: "unknown", vault }`. `search` and `tag` → `CLI_REPORTED_ERROR`, message `Vault not found.`, no `details.code`. Each matches its corrected page and description. |
| Reproduction 4: wrapped errors | Live `context_search` (missing folder, TC-00597) and `outline` (missing file, TC-00600) | pass | Both return the top-level `CLI bridge upstream error: CLI_REPORTED_ERROR`, with Obsidian's line in `details.message`, as the corrected pages now show. |
| Reproduction 5: schema-layer sub-codes (Q1 option C) | Live `patch_heading` (empty append), `patch_block` (empty `block_id`), `query_base` (`x.md`), `append_note` / `prepend` (empty content), `views_base` (`x.md`) | pass | Lifted `details.code` / `reason` (plus `mode`, `field`, `value`) with `details.issues` kept, on the five tools. `views_base` keeps the generic envelope with no `details.code`, as documented. |
| TC-00601: `find_and_replace` quoted message | Live preview with `folder: "DoesNotExist-bi0174"` | pass | `find_and_replace: folder "DoesNotExist-bi0174" does not exist in vault`, matching the prefixed doc quote. |
| Item 2: server instructions | Live `getInstructions()` | pass | 1,996 characters; rule line: `- Unsupported file types fail with UNSUPPORTED_FILE_TYPE; renames and moves keep the type. Descriptions name exceptions.` |
| Item 5e: accented case fold | Live `context_search` `CAFÉ CRÈME`; `search` `CAFÉ` with `case_sensitive: true` | pass | Default matches `café crème`; case-sensitive returns `{count: 0}`. |
| Item 10c: `query_base` value types | Live `query_base` on a sandbox Base | pass | YAML `priority: 1` → `"priority": "1"`, matching the corrected sample. |
| Item 11a: `links` decoding | Live `links` on a note with `[link](Head%20One.md)` | pass | `target: "Head One.md"`, matching the corrected page and description. |
| Item 13: read-only message | Live `read` on a `.png`, `outline` on a `.canvas`, `write_note` on a `.canvas` | pass | `read` / `outline` messages end without "Nothing was changed."; `write_note` keeps it. |
| `views_base` / `obsidian_exec` no-active-file advice (item 10e) | Live call with no file open in the vault | skipped | Needs the user's Obsidian with no file focused, which would change the user's workspace state. Covered by the new handler tests in `views_base/handler.test.ts` and `obsidian_exec/handler.test.ts`. |
| Vault-unavailable row (item 3) | Live call against a registered vault that cannot be brought up | skipped | Needs a broken vault registration; not safe to stage. The rows rest on spec 072's T0 probe. |
| Disabled-CLI row (item 3) | Live call with Obsidian's Command line interface setting off | skipped | Needs turning off the user's Obsidian setting. The rows rest on BI-0132's TC-00495 probe and the dispatch code (`_dispatch.ts`, `reason: "cli-disabled"`). |
| New / updated tests | `npx vitest run` on the 10 test files the fix added to or changed | pass | 10 files, 465 tests passed. |
| Regression suite | `npm test` (vitest with coverage) | pass | 199 files passed, 1 skipped; 4,949 tests passed, 6 skipped. Coverage: 97.04 statements, 94.51 branches, 92.48 functions, 97.81 lines. |
| FR-018 fingerprint gate | `src/tools/_register.test.ts` (in the regression run) | pass | Live registry matches the regenerated baseline. |
| Lint / type-check | `npx eslint .`, `npx tsc --noEmit` | pass | Both clean. |

## Output Excerpts

```text
### TC-00597 context_search missing folder
{"code":"CLI_REPORTED_ERROR","message":"CLI bridge upstream error: CLI_REPORTED_ERROR","details":{…,"command":"folder",…,"message":"Error: Folder \"DoesNotExist-bi0174\" not found."}}
### TC-00600 patch_heading empty append
{"code":"VALIDATION_ERROR","message":"content must be non-empty for mode='append'; use mode='replace' to clear a heading's direct body","details":{"code":"EMPTY_CONTENT","reason":"append","mode":"append","issues":[…]}}
### unknown vault: search (CLI)
{"code":"CLI_REPORTED_ERROR","message":"Vault not found.","details":{"command":"search","stdout":"Vault not found.\n","stderr":"","exitCode":0,"message":"Vault not found."}}
### read attachment (read-only msg)
{"code":"VALIDATION_ERROR","message":"read: Sandbox/bi0174t/pic.png is an attachment (.png); read supports notes, canvases and bases. Use open_file for this file instead.",…}
```

```text
 Test Files  199 passed | 1 skipped (200)
      Tests  4949 passed | 6 skipped (4955)
```

Live setup: `npm run build`, then a throwaway stdio client (in a temp folder outside the repo, since deleted) spawned `node dist/index.js` and called the tools against `TestVault-Obsidian-CLI-MCP`. Fixtures were seeded under `Sandbox/bi0174t/` through the filesystem. The fixture note's checksum was unchanged after the run (every write-tool call was a validation failure or a rejected file type). The folder was removed afterwards, nothing landed in `.trash/`, and `Welcome.md` is intact.

## Residual Risks

- The vault-unavailable and disabled-CLI rows on the seven pages were not re-observed live in this run; they depend on earlier probes (spec 072, TC-00495).
- The `views_base` and `obsidian_exec` no-active-file messages were checked only through unit tests with a stubbed CLI answer (`Error: No active file.`), not against a real Obsidian with nothing focused.
- The instructions sit at 1,996 of their 2,000-character test limit, so any later rule will need room made.
- The `.docs-as-code/` pages beyond the one fixed anchor have not yet been reconciled with the new wording; that is the docs-as-code step's job.

## Owner Sign-off

2026-11-04: the owner accepted the `partial` result (option A) and asked for the pull request to be opened. The three unexercised checks stay recorded above as residual risks: the `views_base` / `obsidian_exec` no-active-file advice (item 10e, unit tests only), the vault-unavailable row (item 3, spec 072's probe) and the disabled-CLI row (item 3, TC-00495 / BI-0132). No tabs were closed and no Obsidian setting was changed.

## Recommendation

Proceed: the fix holds for every check that could be run safely, with no regressions. Before closing BI-0174, optionally re-observe the no-active-file advice of `views_base` and `obsidian_exec` live (open a vault with no file focused); the vault-unavailable and disabled-CLI rows can rest on their earlier probes unless the owner wants them re-run.
