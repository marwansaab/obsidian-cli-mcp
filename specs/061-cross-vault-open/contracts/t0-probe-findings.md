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

---

# Controlled-session probes (2026-06-01) — recovery, `vault=X eval`, non-md reuse

User-approved controlled session (Obsidian fully quit/relaunched as needed). Started from **all vaults closed**; restored to all-closed afterward. Drive `Obsidian.com`. Target B = `TestVault-Obsidian-CLI-MCP`; other vault A = `The Setup`. Forcing-gate: cross-vault files exist only in B.

## Results table

| Probe | Setup | Command | Observed | Pass/Fail | Closes |
|-------|-------|---------|----------|-----------|--------|
| **2a app-down signature** | Obsidian fully closed (0 procs) | `vault=B eval code=1+1` | exit **1**, stdout empty, stderr `The CLI is unable to find Obsidian. Please make sure Obsidian is running…` (matches `/unable to find Obsidian/i`) | **PASS** | app-down signature the eval route inherits (ADR-030 `isAppNotRunning`) |
| **2b vault-targeted launch** | from app-down | fire `obsidian://open?vault=B`, poll | Obsidian launched **focused on B** (basePath = …\TestVault) | **PASS** | specific-mode launcher opens **directly on the requested vault** — no default-vault detour → §3 extra round eliminated |
| **3 `vault=X eval` routing** | A focused, B open (bg) | `vault=B eval code=basePath` | returned **B's** basePath (not A's); active focus stayed **A** before & after | **PASS (overturns B1)** | **B1 is FALSE for an open named vault**: `vault=X eval` routes to X's window (no focus change for a read) |
| **3a open-via-`vault=X eval` focuses X** | A focused, B open (bg) | `vault=B eval await openLinkText('<B-only file>','',false)` | opened the file in B **and focus moved A→B** | **PASS** | one `vault=X eval` opening a file **runs in X AND focuses X** |
| **1 closed-vault cold-start** | A focused, **B closed** | `vault=B eval code=basePath` ×2 | attempt-1 exit 0 stdout `Error: Command "eval" not found. It may require a plugin to be enabled.` (**matches `COLD_START_PATTERN`**); attempt-2 → B's basePath; focus→B | **PASS** | eval-route cold-start signature = ADR-029 trigger (inherited retry recovers); `vault=X eval` cold-launches a closed X and runs in it |
| **4 non-md reuse (iterateAllLeaves)** | B focused, `.base` open in a non-active leaf | eval: `getLeavesOfType('markdown').find(base)` vs `iterateAllLeaves`→`setActiveLeaf` | base leaf view type `bases`, `view.file.path` present; markdown scan **MISSED**; `iterateAllLeaves` **found + focused** it, active→`sample.base`, no dup | **PASS** | Decision §5 / D2 — the reuse search **must** be `iterateAllLeaves`, not markdown-only |
| **E2E** | A focused, **B closed** | one `vault=B eval` doing resolve + iterateAllLeaves-reuse-or-open of a **B-only** file, ×2 (retry) | attempt-1 cold-start; attempt-2 `OPEN:{base:B, active:<file>}`; focus→B | **PASS** | the whole cross-vault open in one `vault=X eval`, cold-start absorbed by the inherited retry |

## MAJOR finding — B1 is false in the current CLI; a simpler design is available

The documented upstream limitation **B1 ("`eval` ignores `vault=`, always runs against the focused vault")** does **not** hold in the current CLI: `vault=X eval` **routes to X's window** (X open → runs in X's bg window; X closed → cold-launches X then runs in it; app down → app-not-running → ADR-030 launch targets X). Opening a file via `vault=X eval` (`openLinkText`) **also brings X to focus**. `vault=X open`/`tab:open` likewise honour `vault=` (prior session).

This enables a design **much simpler than ADR-031's** guard-demote + `obsidian://` focus-switch + verify-poll:

- **`open_file` = `invokeCli({command:"eval", vault:X, target_mode:"specific", code})`** — the eval runs **in X**, resolves the file in X, does the explicit reuse-aware open (iterateAllLeaves → setActiveLeaf / openLinkText), which opens the file **and focuses X** — all in one call.
- **No focused-vault guard, no `VAULT_NOT_FOCUSED`, no focus-switch URI, no verify-poll, no `launchObsidian` import in `open_file`.** (D6's architecture-test caller-constraint concern evaporates — the tool imports nothing from `app-launcher`.)
- **Recovery fully inherited and vault-targeted, zero per-tool code**: cold-start (X closed) → ADR-029 retry (attempt-1 = `COLD_START_PATTERN`); app-down → ADR-030 launch of `obsidian://open?vault=X` (specific mode → `dispatchInput.vault=X`). The §3 extra-round caveat does not arise.
- Errors unchanged: unknown vault `Vault not found.`→`VAULT_NOT_FOUND/unknown`; file-not-found `Error: File "…" not found.`→`FILE_NOT_FOUND` (disjoint from `COLD_START_PATTERN`); unsupported-type via `viewRegistry`.

**Recommendation**: re-probe B1's original documented context (single-window? older CLI version?) to reconcile *why* B1 was recorded, then — if confirmed obsolete — supersede ADR-031's mechanism with the `vault=X eval` specific-mode design. This is a decision for the canonical ADR (not edited here).

**Caveat to pin at implement**: in probe 4 the `iterateAllLeaves` snapshot showed only 3 leaves and omitted a just-opened markdown tab — possibly a multi-window enumeration gap. The placement `alreadyOpen` check runs in X's own eval/window, so X's leaves should be fully visible; confirm the enumeration is complete within the target window during implement.

---

# Implement-T0 + post-implementation live validation (2026-06-01) — frozen string pinned; leaf enumeration confirmed; quickstart S1–S8 green

Run during `/speckit-implement` per `.memory/test-execution-instructions.md` (drive `Obsidian.com`). Backdrop focused A = `The Setup` (read-only); target B = `TestVault-Obsidian-CLI-MCP` (authorised scratch). Fixtures seeded under `B/Sandbox/` (`cv-live-md.md`, `cv-live-reuse.md`) + pre-existing `B/Fixtures/BI-0065/sample.base`; all removed afterward; Obsidian restored to all-closed. Validation drove the **real `obsidian` CLI through the production handler** (`executeOpenFile`, no spawn stub) via a temporary uncommitted vitest integration test (deleted post-run).

## T002 — frozen eval string PINNED (byte-stable)

`src/tools/open_file/_template.ts` `JS_TEMPLATE` is now frozen as the single block-body async IIFE: locator resolution (`app.vault.getFiles().find` for `path`; `app.metadataCache.getFirstLinkpathDest(a.file,'')` for `file`) → `FILE_NOT_FOUND`; `app.viewRegistry.isExtensionRegistered(f.extension)` → `UNSUPPORTED_FILE_TYPE`; explicit placement branch (`new_tab`→`openLinkText(f.path,'',true)`=`new_tab_created`; else existing-leaf via `app.workspace.iterateAllLeaves` matching `l.view.file.path===f.path` → `setActiveLeaf(existing,{focus:true})`=`existing_tab_reused`; else `openLinkText(f.path,'',false)`=`active_tab_used`); returns `{ok:true,opened,new_tab,placement}`. **No focused-vault guard, no `expectedBase`, no `VAULT_NOT_FOCUSED`.** The handler base64-encodes the `{path,file,new_tab}` payload; raw spawn-trace of the composed argv confirmed the exact code reaching the CLI.

## D9 caveat RESOLVED — intra-window leaf enumeration is complete

The probe-4 concern (an `iterateAllLeaves` snapshot omitting a just-opened tab) does **not** reproduce when the scan runs in the target window's own `vault=X eval`:

| Reuse case | Setup | Observed placement | Verdict |
|------------|-------|--------------------|---------|
| **markdown** | `Sandbox/cv-live-reuse.md` opened, then re-opened `new_tab:false` | `existing_tab_reused` (no duplicate) | **PASS** — `iterateAllLeaves` saw the just-opened md tab |
| **non-md `.base`** (D2) | `Fixtures/BI-0065/sample.base` opened, then re-opened `new_tab:false` | `existing_tab_reused` | **PASS** — `iterateAllLeaves` found the `bases`-view leaf a markdown-only scan would miss |

Both stable across two consecutive runs. The earlier probe-4 omission was a multi-window snapshot artifact, not a gap in the in-window scan the design relies on.

## T016 — quickstart S1–S8 results (live, through the handler)

| Scenario | Call | Result | FR/SC |
|----------|------|--------|-------|
| **S1/S2** cross-vault forcing-gate + cold-start | `open_file({vault:B, path:"Sandbox/cv-live-md.md"})` with A focused, B closed | success; `vault:B`, file resolved in B (absent from A → forcing-gate held); cold-launch absorbed (inherited ADR-029); placement ∈ enum | FR-001/003/005/019; SC-001/002/006 |
| **S4** new-tab control | `… new_tab:true` | `placement:"new_tab_created"` (force-new) | FR-009; SC-004 |
| **S4** reuse | re-open already-open file `new_tab:false` | `placement:"existing_tab_reused"`, no duplicate | FR-010; SC-005 |
| **S5** unknown vault | `open_file({vault:"NoSuchVault-zzz-061", …})` | `CLI_REPORTED_ERROR` / `VAULT_NOT_FOUND` / `reason:"unknown"` (pre-eval) | FR-013; SC-004 |
| **S5** missing file | `open_file({vault:B, path:"Sandbox/does-not-exist-xyz-061.md"})` | `CLI_REPORTED_ERROR` / `FILE_NOT_FOUND` | FR-014; SC-005 |
| **S8** type-agnostic | `open_file({vault:B, path:"Fixtures/BI-0065/sample.base"})` | success, identical shape `{opened,vault,new_tab,placement}`, native viewer | FR-020; SC-008 |
| **regression** | open unfocused/closed B | `VAULT_NOT_FOCUSED`/`reason:"not-open"` **never** emitted — closed/unfocused is a success path | ADR-031; Principle IV |

**7/7 passed, 0 failures, two consecutive stable runs.** S3 (app fully down) recovery is already proven inherited in the controlled-session probes above (2a/2b) and the opt-out branch is unit-tested (`handler.test.ts` `obsidian-not-running`); not re-driven here.

**Single-flight note**: an initial temp-test version using a per-call `createQueue()` produced two intermittent cross-response failures (a success decoded under the wrong call). Switching the temp test to one shared queue — mirroring production, where the server constructs a single queue for all tool calls — eliminated the flake. This is a test-harness fidelity note, not a handler bug; the spawn-trace confirmed each call's CLI output was individually correct.
