# T0 Probe Plan: Open Cross-Vault Files

Implement-phase live-CLI probes. Run at the `/speckit-implement` T0 step, **before** freezing the eval template and the poll/placement logic. Per `.memory/test-execution-instructions.md`: authorised vault `TestVault-Obsidian-CLI-MCP`, scratch under `Sandbox/`, **drive `Obsidian.com`** (never `Obsidian.exe`), capture raw stdout/stderr separately. A second registered vault is required to exercise cross-vault focus — stage/confirm one with the user before the cross-vault probes (do not register vaults unprompted).

Each probe resolves a parameter the spec fixed behaviourally. Findings are recorded back here (and any divergence flagged before the predicate/template freezes), mirroring BI-059/BI-060's `t0-probe-findings.md` discipline.

| Probe | Question | Reasonable default if inconclusive |
|-------|----------|-----------------------------------|
| **OQ-1** | Is there a native vault-addressed open command (`open`/`tab:open`/…) that opens a file in a *named* vault and reports placement? Does `obsidian vault=X eval code=…` run the eval unchanged (B1) without a `vault=`-prefix error? | No native open command (BI-057) → eval-composed route (research D1); keep `target_mode:"active"`, adapter untouched. |
| **OQ-2** | After `obsidian://open?vault=X`, how long until an `active` eval observes `basePath==X` for (a) open-but-unfocused X, (b) closed X? | Poll at `LAUNCH_POLL_INTERVAL_MS` (750 ms), ceiling `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS` (30 s). |
| **OQ-3** | Does `(new_tab, alreadyOpen)` → placement hold? Pin the leaf-inspection API; re-confirm `openLinkText(path,'',false)` reuses an existing leaf (no duplicate) and `(path,'',true)` always opens a fresh leaf. | research D2 mapping; iterate `app.workspace` leaves reading `leaf.view?.file?.path`. |
| **OQ-4** | Does the URI switch focus to a vault open in a **separate OS window**? | Yes; if a platform cannot, document the limitation (quickstart) — spec edge case already flags it. |
| **OQ-5** | Do `getFiles()`/`getFirstLinkpathDest` resolve in the focused (target) vault post-switch? Does a miss yield `FILE_NOT_FOUND` (never a wrong-vault open)? | research D5 (resolution gated behind the verified focus). |
| **OQ-6** | Does an app-down open inherit the dispatch launch (and land on the requested vault without the D3 optimization)? Does `OBSIDIAN_AUTO_LAUNCH=0` yield `obsidian-not-running` with no launch? | research D3/D4; if app-down lands on the wrong vault, enable the D3 optimization (thread `vault=requested` into the dispatch input). |

## Safety / scope

- Cross-vault and closed-vault probes change which vault Obsidian shows — coordinate with the user (this may move their working window). Do not close or reconfigure any vault.
- Bare-name wrong-vault probe (OQ-5): stage a same-named note in **both** the target `Sandbox/` and a second vault, request it cross-vault, and assert the **target** copy opened (or `FILE_NOT_FOUND`) — never the other vault's copy.
- Clean up `Sandbox/` fixtures after the run; leave `Welcome.md` untouched.
- Re-confirm any negative observation against `Obsidian.com` (the `.exe` false-clean artifact has reverted false-flips before).
