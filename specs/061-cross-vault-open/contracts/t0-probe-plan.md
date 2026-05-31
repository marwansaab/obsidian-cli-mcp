# T0 Probe Plan: Open Cross-Vault Files

Live-CLI probes per `.memory/test-execution-instructions.md` (authorised `TestVault-Obsidian-CLI-MCP`, `Sandbox/` scratch, **drive `Obsidian.com`**, capture stdout/stderr separately). The chosen mechanism is the eval-composed reactive focus-switch (ADR-031); the native route was probed and rejected (OQ-1, resolved below).

## OQ-1 — RESOLVED (forcing-gate probe, 2026-06-01)

A user-requested forcing-gate probe (Windows, `Obsidian.com`; raw data + table in [t0-probe-findings.md](t0-probe-findings.md)) **resolved OQ-1 against the native route**:

- Native `open` / `tab:open` **honour `vault=` and switch focus cross-vault** (B1 applies only to `eval`); typed `Vault not found.` / `Error: File "x" not found.`; type-agnostic; success stdout `Opened: <path>`.
- **But** native `open` (no flag) opens in the **active leaf** (`openLinkText(…,false)`) and the command set has **no focus-existing affordance** → it **cannot deliver `existing_tab_reused`** (FR-008/FR-010/US4-AC2). Only an eval can (`iterateAllLeaves → setActiveLeaf`, proven, zero duplicates). The same finding exposed a latent BI-0065 `new_tab:false` reuse bug.
- Placement is **not** reported by the native command; the eval derives it in-eval (D2).

**Verdict**: the eval-composed reactive switch is the mechanism; native is rejected. OQ-1 is closed.

## Remaining (deferred) probes

| Probe | Question | Reasonable default |
|-------|----------|--------------------|
| **OQ-2** | Focus-switch landing window after `obsidian://open?vault=X` for (a) open-but-unfocused X, (b) closed X. | poll at `LAUNCH_POLL_INTERVAL_MS` (750 ms), ceiling `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS` (30 s). |
| **OQ-3** | Placement (mostly answered): pin the in-eval type-agnostic leaf iteration (`iterateAllLeaves`, `leaf.view?.file?.path`) so a non-markdown file already open is detected; confirm the explicit branch (new leaf / `setActiveLeaf` existing / `openLinkText` active). | research D2; `iterateAllLeaves` (NOT `getLeavesOfType('markdown')` — would miss non-md reuse). |
| **OQ-4** | Locator scoping: `getFiles()`/`getFirstLinkpathDest` resolve in the focused target vault post-switch; a miss → `FILE_NOT_FOUND` (never wrong-vault open). | research D5 (resolution gated behind verified focus). |
| **OQ-5** | Recovery & opt-out: app-down inherits the dispatch launch (does it land on the requested vault, or does the D1 focus-switch correct it?); `OBSIDIAN_AUTO_LAUNCH=0` → `obsidian-not-running`, no launch. | research D3/D4; the D1 switch corrects a wrong default-vault landing. |
| **OQ-6** | Cross-window / cross-platform: URI switches focus to a vault open in a **separate OS window**; macOS/Linux equivalence. | yes; document any platform divergence (quickstart). |

## Safety / scope

- Cross-vault and closed-vault probes change which vault Obsidian shows — coordinate with the user (the plan-time probe switched the focused vault and was restored). Do not close or reconfigure any vault. `open newtab` accumulates tabs in the test vault — harmless, closeable; note residue.
- Bare-name wrong-vault probe (OQ-4 / FR-006a): stage a same-named note in the target `Sandbox/` and a second vault; request cross-vault; assert the **target** copy opened, never the other vault's.
- Clean up `Sandbox/` fixtures; leave `Welcome.md` untouched. Re-confirm any negative against `Obsidian.com` (`.exe` false-clean artifact).
