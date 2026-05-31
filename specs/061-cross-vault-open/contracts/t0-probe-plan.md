# T0 Probe Plan: Open Cross-Vault Files

Live-CLI probes per `.memory/test-execution-instructions.md` (authorised `TestVault-Obsidian-CLI-MCP`, `Sandbox/` scratch, **drive `Obsidian.com`**, capture stdout/stderr separately). The chosen mechanism is the eval-composed reactive focus-switch (ADR-031); the native route is OQ-1.

## Plan-time probe already run (2026-06-01) — OQ-1 evidence

A user-requested probe (Windows, `Obsidian.com`) captured native-command evidence for OQ-1 (full notes in research.md D8). Summary:

- Native `open` / `tab:open` commands exist and **honour `vault=`, switching focus cross-vault** (B1 applies only to `eval`). `open` (no `newtab`) **reuses** an open tab; `open newtab` / `tab:open` create one.
- Success stdout `Opened: <path>` — **no placement reported** (derived in both routes; the eval route derives it in-eval, D2).
- Errors: `Vault not found.` → `VAULT_NOT_FOUND/unknown`; `Error: File "x" not found.` → `FILE_NOT_FOUND` (disjoint from `COLD_START_PATTERN`).

This narrows OQ-1 toward native but does not, on its own, flip the eval default — see OQ-1 remaining items.

## Probes

| Probe | Question | Reasonable default |
|-------|----------|--------------------|
| **OQ-1** | Native route **full-contract** re-probe: does a native command meet *all* of vault=/placement-reporting/typed-errors/`new_tab:false` reuse/any-file-type/**cross-platform (macOS+Linux)**/unsupported-type-signal? (vault= and reuse already confirmed on Windows.) | eval-composed reactive switch (D1) ships; promote to native only via a **follow-up ADR** once OQ-1 fully clears. |
| **OQ-2** | Focus-switch landing window after `obsidian://open?vault=X` for (a) open-but-unfocused X, (b) closed X. | poll at `LAUNCH_POLL_INTERVAL_MS` (750 ms), ceiling `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS` (30 s). |
| **OQ-3** | Placement: confirm `(new_tab, alreadyOpen)` → placement (D2); pin the in-eval leaf-inspection API; re-confirm `openLinkText(path,'',false)` reuses (no duplicate) and `(…,true)` always new. | research D2; iterate `app.workspace` leaves reading `leaf.view?.file?.path`. |
| **OQ-4** | Locator scoping: `getFiles()`/`getFirstLinkpathDest` resolve in the focused target vault post-switch; a miss → `FILE_NOT_FOUND` (never wrong-vault open). | research D5 (resolution gated behind verified focus). |
| **OQ-5** | Recovery & opt-out: app-down inherits the dispatch launch (does it land on the requested vault, or does the D1 focus-switch correct it?); `OBSIDIAN_AUTO_LAUNCH=0` → `obsidian-not-running`, no launch. | research D3/D4; the D1 switch corrects a wrong default-vault landing. |
| **OQ-6** | Cross-window / cross-platform: URI switches focus to a vault open in a **separate OS window**; macOS/Linux equivalence. | yes; document any platform divergence (quickstart). |

## Safety / scope

- Cross-vault and closed-vault probes change which vault Obsidian shows — coordinate with the user (the plan-time probe switched the focused vault and was restored). Do not close or reconfigure any vault. `open newtab` accumulates tabs in the test vault — harmless, closeable; note residue.
- Bare-name wrong-vault probe (OQ-4 / FR-006a): stage a same-named note in the target `Sandbox/` and a second vault; request cross-vault; assert the **target** copy opened, never the other vault's.
- Clean up `Sandbox/` fixtures; leave `Welcome.md` untouched. Re-confirm any negative against `Obsidian.com` (`.exe` false-clean artifact).
