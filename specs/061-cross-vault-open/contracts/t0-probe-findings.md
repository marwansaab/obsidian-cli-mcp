# T0 Probe Findings — Open Cross-Vault Files (OQ-1 resolution)

**Date**: 2026-06-01 · **Host**: Windows · **Binary**: `C:\Program Files\Obsidian\Obsidian.com` (per `.memory/test-execution-instructions.md`; `.exe` not used) · **Vaults**: focused A = `The Setup`; target B = `TestVault-Obsidian-CLI-MCP`. Forcing-gate fixtures `Sandbox/cv061/{alpha,beta,gamma}.md` seeded in B only (deleted after) so a wrong-vault resolution surfaces as "File not found". Focus restored to A afterward.

**Purpose**: resolve OQ-1 — does a native one-shot `open`/`tab:open` command meet the full BI-0131 contract (cross-vault + tab-reuse + placement + typed errors + any-type), so ADR-031 flips to a native wrapper, or do gaps keep the eval-composed reactive-switch as the default?

## Results table

| Probe | Command (raw) | Observed (stdout / focus) | Pass/Fail | Implication for OQ-1 |
|-------|---------------|---------------------------|-----------|----------------------|
| **Cross-vault open (#3, forcing-gate)** | `vault=TestVault… open path=Sandbox/cv061/alpha.md` while `The Setup` focused | `Opened: Sandbox/cv061/alpha.md`; active eval → `base` switched to TestVault, `active=…/alpha.md` (alpha exists only in B) | **PASS** | Native `open` honours `vault=` and switches focus cross-vault. B1 does not apply to `open`. |
| **Bare-name cross-vault (#4)** | `vault=TestVault… open file=beta` while `The Setup` focused | `Opened: Sandbox/cv061/beta.md`; focus → TestVault, `active=…/beta.md` | **PASS** | Bare name resolves in the target vault post-switch; forcing-gate held (beta not in A). |
| **`open newtab` ≡ `tab:open` (#2)** | `open newtab path=X` with X already open | tabs: X-leaf count 1→2, total +1 | **PASS** | `open newtab` always creates a fresh tab → maps `new_tab:true` = `new_tab_created`; `tab:open` redundant. |
| **`open` reuse, no flag (#1)** | `open path=X` with X already open in a **non-active** tab (active = a different file Y) | tabs: **X +1, Y −1, total unchanged** — X opened **into the active (Y) leaf**, the existing X tab NOT focused | **FAIL (reuse)** | Native `open` (no flag) = open-in-active-leaf (replace). It has **no focus-existing-tab capability** → cannot produce `existing_tab_reused` without a duplicate. |
| **`open` not-open, no flag** | `open path=Z` (Z not open), active = Y | tabs: total unchanged, Y replaced by Z | PASS (active-tab-used) | `new_tab:false` + not-open = `active_tab_used` (replace active leaf). |
| **`openLinkText(p,'',false)` (eval, isolation)** | eval `await app.workspace.openLinkText('…/alpha.md','',false)` with alpha open in non-active tab, active=gamma | **alpha +1, gamma −1, total unchanged**, active=alpha | (diagnostic) | Confirms the native `open` behaviour is just `openLinkText(false)` = **replace-active, never focus-existing**. Same primitive BI-057's eval template uses. |
| **Explicit focus-existing (eval)** | eval `getLeavesOfType('markdown').find(l=>l.view.file.path===t); setActiveLeaf(lv,{focus:true})` | returns `focused-existing`; **all tab counts unchanged**, active=alpha, the other file's tab preserved | **PASS** | An **eval can implement true no-duplicate reuse**. A fixed CLI command cannot. This is the decisive eval-only capability. |
| **Placement observability (#7)** | eval `getLeavesOfType('markdown').map(l=>l.view?.file?.path)` | returns full **paths** of all open files in the focused vault (incl. duplicates) | **PASS (eval)** | The eval can derive `alreadyOpen` (and thus reuse-vs-active) in-eval, post-switch, in ONE round-trip — no external `tabs` call. (Native route would need a cross-vault `tabs` snapshot — not available cleanly.) |
| **Unknown vault (roster)** | `vault=NONEXISTENT-zzz open path=…` | `Vault not found.` exit 0 | **PASS** | → `VAULT_NOT_FOUND` / `reason:"unknown"` (via `invokeCli` re-classification). |
| **Missing file (roster)** | `vault=TestVault open path=…/nope-missing.md` | `Error: File "…/nope-missing.md" not found.` exit 0 | **PASS** | → `FILE_NOT_FOUND`. Prefix is `Error: File …` — **disjoint** from `COLD_START_PATTERN` (`Error: Command "…" not found.`), so not mis-retried. |
| **Unsupported type (OQ-B)** | eval `app.viewRegistry.isExtensionRegistered('xyz' / 'md' / 'base' / 'pdf' / 'png')` | `xyz:false`, `md/base/pdf/png:true` | **PASS (eval)** | The eval **can detect** a no-viewer extension → `UNSUPPORTED_FILE_TYPE` survives. (`create path=…blob.xyz` forces `.md`, so a real no-viewer fixture must be fs-seeded; the registry check is the mechanism.) |
| **Success stdout** | `open path=X` | `Opened: <resolved vault-relative path>` exit 0 | **PASS** | Exact parse format for the native route (if used); the eval route returns its own envelope. |
| **Type-agnostic** | `vault=TestVault open path=Fixtures/BI-0065/sample.base` | `Opened: Fixtures/BI-0065/sample.base` exit 0 | **PASS** | Non-md recognised type opens + switches focus. (No PDF/PNG fixtures in B; `viewRegistry` shows pdf/png registered.) |
| **Closed-vault cold-start (#5)** | — | **NOT RUN** — no registered vault is currently closed in all windows; forcing one would disrupt the live session | **DEFERRED** | Cold-start is inherited (ADR-029) regardless of route; native cold-start signature unprobed. Re-probe in a controlled session. |
| **App-down targets requested vault (#6)** | — | **NOT RUN** — requires quitting Obsidian entirely (too disruptive to the live session) | **DEFERRED** | Inherited recovery (ADR-030). Eval route uses `target_mode:"active"` (launcher gets `vault=undefined` → default vault), then the focus-switch corrects (ADR-031 §3 caveat). Re-probe in a controlled session. |

## Decisive finding

`openLinkText(path, '', false)` — the primitive behind **both** the native CLI `open` (no flag) **and** BI-057's current eval template — **opens in the active leaf (replace), it does NOT focus an existing tab**. Therefore:

1. The **native `open` cannot implement `existing_tab_reused`** (focus the existing tab, no duplicate). It always replaces the active leaf. The command set has no "focus tab showing file X" command. → **native route fails FR-008 / FR-010 / US4-AC2.**
2. An **eval can** implement true reuse (`getLeavesOfType().find(path) → setActiveLeaf`), proven with zero duplicate tabs. → **only the eval route satisfies the reuse contract.**
3. Side finding: **BI-057's current `open_file` reuse is a latent bug** — for `new_tab:false` on an already-open file it calls `openLinkText(false)` and replaces the active leaf rather than focusing the existing tab (the `_template.ts` T0 note flagged this as unconfirmed; it is now confirmed wrong). BI-0131 fixes it by making the eval do explicit placement.

## Recommendation

**Keep the eval-composed reactive focus-switch as ADR-031's mechanism** (native route remains OQ-1-rejected, not adopted). The native `open`/`tab:open` honours `vault=` and switches focus cross-vault — but it **cannot** deliver the spec-required `existing_tab_reused` (no-duplicate focus-existing), which only an eval can. The eval route additionally owns placement detection (in-eval full-path leaf inspection, one round-trip), unsupported-type detection (`viewRegistry`), and bare-name resolution (`getFirstLinkpathDest`) natively. This **confirms the canonical ADR-031 choice**, for a sharper reason than originally stated: the disqualifier is **tab-reuse**, not placement-reporting.

**Design refinement for the eval template** (BI-0131): derive placement by an **explicit** branch, not by `openLinkText(new_tab)` alone:
- `new_tab:true` → open in a new leaf → `new_tab_created`.
- `new_tab:false` & target already open (leaf found) → `setActiveLeaf(existingLeaf, {focus:true})` → `existing_tab_reused` (no duplicate).
- `new_tab:false` & not open → open in the active leaf (`openLinkText(…, false)`) → `active_tab_used`.

This both delivers the placement contract and fixes the BI-057 reuse bug.
