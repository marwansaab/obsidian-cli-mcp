# Bug Verification: open_file reports success without checking that the file became active

- **Slug**: bi-0189
- **Tested**: 2026-11-07 (two live rounds: the first from the assessment's plan, the second ordered by the owner's 2026-11-07 ruling, option C)
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: partial

## Summary

Every live check passes on the built fix, and no run returned a false focus failure.

- **Round 1:** a note, a canvas, an image and a `.base`, each opened in all three placements, all succeeded, and `get_active_file` named the opened file in both specific and active mode (16 of 16 runs). A cross-vault open into the test vault while `My-Setup-Vault` was focused also passed.
- **Round 2 (owner's ruling, option C):** three cases from another focused vault, each checked with `get_active_file` naming the vault. All three passed:
  - a fresh note opened into a background vault (`active_tab_used`);
  - a PDF opened the same way;
  - a note opened into the test vault after its window was closed. The dispatch layer's cold-start retry fired, and the open succeeded in 639 ms.

The automated suites, typecheck and lint pass, and no regressions were found.

The result stays **partial**, as the owner's ruling fixes. The silent open failure the report describes has no known live trigger, so the new `FOCUS_NOT_APPLIED` path is proven only by construction: the stub-app template tests on fake timers plus the schema and handler tests. Plugin-registered views are also not covered. The assessment (Resolved (Relay), following ADR-072) accepts both gaps, and BI-0179 was recorded as `partial` for the same reason.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (pre-fix symptom, live) | — | not-run | No live trigger for a silent open failure is known; the assessment rules out inducing it (Resolved (Relay)). |
| Failure path by construction | `npx vitest run src/tools/open_file` | pass | 4 files, 108 tests. The `node:vm` focus-check suite covers each placement: an open that never lands returns `FOCUS_NOT_APPLIED` with `opened` and `active` after the bounded wait, and the open is not retried. The handler maps that to `CLI_REPORTED_ERROR` with `details` exactly `{ stage: "focus", path, vault, active }`, the advice message, and no disk path. |
| Round 1 — no false focus failure, 4 file types × 3 placements | Built handlers (`dist/tools/open_file/handler.js`, `dist/tools/get_active_file/handler.js`, post-fix build) driven from a scratch Node script against `Obsidian.com`, vault `TestVault-Obsidian-CLI-MCP` (focused), fixtures in `Sandbox/BI-0189-probe/` | pass | 16 of 16 runs (12 target opens plus 4 spacer opens that set up the reuse case). Each run was `open_file`, then `get_active_file` in specific and in active mode; both had to name the opened file. Placements matched what was expected. Each call took 78–196 ms. |
| Round 1 — cross-vault, existing tab | `My-Setup-Vault` focused (confirmed `=> My-Setup-Vault`), then `open_file` on `Sandbox/BI-0189-probe/Note-A.md` in the test vault, then `get_active_file` naming the test vault | pass | `existing_tab_reused`, 186 ms; `get_active_file` returned the note; focus moved to the test vault. |
| Round 2 — background vault, fresh note (`active_tab_used`) | `obsidian://open?vault=My-Setup-Vault`, confirmed `=> My-Setup-Vault` immediately before the call, then `open_file` `{ vault: "TestVault-Obsidian-CLI-MCP", path: "Sandbox/BI-0189-probe2/Fresh2.md" }` (a note not open anywhere), then `get_active_file` `{ target_mode: "specific", vault: "TestVault-Obsidian-CLI-MCP" }` | pass | `active_tab_used`, 175 ms; `get_active_file` returned `Sandbox/BI-0189-probe2/Fresh2.md`; focus moved to the test vault. An earlier run on `Fresh.md` also passed (208 ms), but a vault-targeted check eval ran between focusing and the call, so it was repeated on `Fresh2.md` with nothing in between. |
| Round 2 — PDF (`active_tab_used`, background vault) | Same set-up (`My-Setup-Vault` confirmed focused), `open_file` on `Sandbox/BI-0189-probe2/Doc.pdf` (a minimal valid one-page PDF built for the run), then `get_active_file` naming the test vault | pass | `active_tab_used`, 348 ms; `get_active_file` returned `Sandbox/BI-0189-probe2/Doc.pdf`. The test vault's active view type afterwards was `pdf`. |
| Round 2 — closed vault, cold launch | Closed the test vault's window (`window.close()` from an eval in that vault); `obsidian.json` then showed the test vault not open while `Funwright-Studio-Vault`, `Game-Server-Vault` and `My-Setup-Vault` stayed open. With `My-Setup-Vault` focused (`=> My-Setup-Vault`), ran `open_file` on `Sandbox/BI-0189-probe2/Cold.md`, then `get_active_file` naming the test vault | pass | The logger emitted `dispatch.retry` for `eval`: the first attempt hit the cold-start window and the inherited ADR-029 retry ran it again. Result `active_tab_used`, 639 ms end to end. `get_active_file` returned `Sandbox/BI-0189-probe2/Cold.md`. Afterwards the test vault was open again and focused, and the other three vaults were still open. |
| Regression suite | `npm test` | pass | 203 files passed, 1 skipped; 5106 tests passed, 6 skipped. The `_register` fingerprint baseline did not move. |
| Type-check | `npx tsc --noEmit` | pass | Clean. |
| Lint | `npx eslint .` | pass | Clean. |

## Output Excerpts

Round 1, the reuse case of each type (abridged):

```
{"label":"Note-A.md existing_tab_reused","result":{"ok":true,"ms":93,"opened":"Sandbox/BI-0189-probe/Note-A.md","vault":"TestVault-Obsidian-CLI-MCP","new_tab":false,"placement":"existing_tab_reused"},"get_active_file_specific":"Sandbox/BI-0189-probe/Note-A.md","get_active_file_active":"Sandbox/BI-0189-probe/Note-A.md","verdict":"PASS"}
{"label":"Board.canvas existing_tab_reused","result":{"ok":true,"ms":79,...},"get_active_file_specific":"Sandbox/BI-0189-probe/Board.canvas",...,"verdict":"PASS"}
{"label":"Pixel.png existing_tab_reused","result":{"ok":true,"ms":78,...},"get_active_file_specific":"Sandbox/BI-0189-probe/Pixel.png",...,"verdict":"PASS"}
{"label":"Items.base existing_tab_reused","result":{"ok":true,"ms":94,...},"get_active_file_specific":"Sandbox/BI-0189-probe/Items.base",...,"verdict":"PASS"}
SUMMARY pass=16 fail=0
```

Round 2:

```
=> My-Setup-Vault
{"label":"background vault: fresh note (clean), active_tab_used","result":{"ok":true,"ms":175,"opened":"Sandbox/BI-0189-probe2/Fresh2.md","vault":"TestVault-Obsidian-CLI-MCP","new_tab":false,"placement":"active_tab_used"},"get_active_file_specific":"Sandbox/BI-0189-probe2/Fresh2.md","verdict":"PASS"}
=> My-Setup-Vault
{"label":"background vault: PDF, active_tab_used","result":{"ok":true,"ms":348,"opened":"Sandbox/BI-0189-probe2/Doc.pdf","vault":"TestVault-Obsidian-CLI-MCP","new_tab":false,"placement":"active_tab_used"},"get_active_file_specific":"Sandbox/BI-0189-probe2/Doc.pdf","verdict":"PASS"}
TestVault-Obsidian-CLI-MCP open=          # after window.close(); Funwright, Game-Server, My-Setup still open=True
=> My-Setup-Vault
{"event":"dispatch.retry","command":"eval","firstCallId":"7daaa044-…","secondCallId":"79078d4c-…"}
{"label":"closed vault: cold-launch open of a note","result":{"ok":true,"ms":639,"opened":"Sandbox/BI-0189-probe2/Cold.md","vault":"TestVault-Obsidian-CLI-MCP","new_tab":false,"placement":"active_tab_used"},"get_active_file_specific":"Sandbox/BI-0189-probe2/Cold.md","verdict":"PASS"}
=> TestVault-Obsidian-CLI-MCP
```

Suites:

```
 Test Files  4 passed (4)            # src/tools/open_file
      Tests  108 passed (108)
 Test Files  203 passed | 1 skipped (204)   # npm test
      Tests  5106 passed | 6 skipped (5112)
```

Cleanup: `Sandbox/BI-0189-probe/` and `Sandbox/BI-0189-probe2/` and both scratch probe scripts were removed. `Welcome.md` is still present, the vault has no `.trash` folder, and the test vault ended open and focused as it started. Tabs these runs opened in the test vault's workspace now point at deleted files.

## Residual Risks

- **The failure path was never seen live (gap 1).** The silent open failure has no known trigger on this machine (Obsidian 1.15.0), so `FOCUS_NOT_APPLIED` is proven by construction only, as the assessment and ADR-072 accept. If a real trigger turns up, it will now surface as the `details.stage: "focus"` error instead of a false success.
- **Plugin-registered views (gap 4).** The test vault has no plugins by design. A plugin view for some other extension that is not a `FileView` would read as a focus failure (assessment, Risks & Considerations). Covering it would need a vault with such a plugin; if one fails, raise it as its own item.
- **The 1 s wait has margin, but limited evidence.** The slowest live open was the cold launch, at 639 ms end to end, including a full dispatch retry. The focus wait itself only starts after the open, so the margin is larger than that figure suggests. Still, a slower machine or a heavier vault was not tried.
- **Residual race** between `open_file` returning and the caller's next active-mode call is unchanged and accepted (assessment).

## Recommendation

Open the pull request. The fix holds everywhere it can be observed. Success is returned only when `get_active_file` agrees, across every core file type (note, canvas, image, PDF, `.base`) and placement. That includes the cross-vault cases the assessment flagged as the likeliest source of a false focus failure: a background vault with a fresh open, and a closed vault brought up by a cold launch. No regressions were found. The result stays `partial` only for gaps 1 and 4 above, which the owner accepted on 2026-11-07.
