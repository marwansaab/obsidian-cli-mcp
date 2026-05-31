# Research: Open Cross-Vault Files

Phase 0 decisions, aligned to **canonical ADR-031** (eval-composed reactive focus-switch as the chosen mechanism; native `open`/`tab:open` route as **OQ-1**, a T0 re-probe). The spec's 2026-06-01 clarification settled the contract; this file records the mechanism decisions (D1–D8) and the implement-phase T0 probe plan. Every probe has a reasonable default, so none is a `[NEEDS CLARIFICATION]`.

> **History note**: an earlier same-day draft pivoted the whole design to the native `open`/`tab:open` route after a live probe. The canonical ADR-031 reverted that to the conservative eval default, keeping the native route as OQ-1 (with the probe evidence as strong preliminary signal — see "Live probe findings"). The native findings are preserved below as OQ-1 evidence, not as the chosen mechanism.

---

## D1 — Mechanism: eval-composed reactive vault-targeted focus-switch + verify-poll

**Decision** (ADR-031): Keep `open_file` eval-composed and `target_mode:"active"`. Demote the in-eval focused-vault guard's mismatch branch from a hard error (`VAULT_NOT_FOCUSED` → thrown `VAULT_NOT_FOUND/not-open`) to an **internal switch-signal**. The handler reacts by firing the vault-targeted focus-switch (`launchObsidian({vault: requested})` → `obsidian://open?vault=<requested>`) and re-running the eval in a bounded verify-poll until the focused base path matches the requested vault (success) or the bound elapses (`obsidian-not-running`).

**Rationale**:
- Overcomes B1 (eval ignores `vault=`) by making the requested vault *focused* before the eval resolves/opens.
- **Reactive** (switch only on the mismatch signal) keeps the same-vault open untouched — one eval, guard matches, zero extra spawn/latency.
- Reuses the already-sanctioned `launchObsidian` opener (ADR-030) — **no third spawn site**.
- Realises ADR-029's FR-013 carve-out (the eval cold-launch "wrong vault focused" case, left to the tool's own guard) as designed — the dispatch layer stays frozen.

**Why not the native route (RESOLVED against it)**: a forcing-gate probe (D8) showed native `open`/`tab:open` switch focus cross-vault — but native `open` (no flag) opens in the **active leaf (replace)** and has **no focus-existing affordance**, so it cannot deliver `existing_tab_reused` (FR-008/FR-010/US4-AC2). Only an eval can (`iterateAllLeaves → setActiveLeaf`). OQ-1 is therefore resolved against native; the eval switch is the mechanism, not a placeholder.

---

## D2 — Placement detection: derive in-eval from (new_tab, alreadyOpen)

**Decision**: determine placement deterministically **inside the eval** (which, after the switch, runs in the focused target vault and can inspect `app.workspace` directly), before `openLinkText`:

| `new_tab` | `alreadyOpen` (any leaf shows the resolved path) | placement |
|-----------|--------------------------------------------------|-----------|
| `true`    | (any)                                            | `new_tab_created` |
| `false`   | `true`                                           | `existing_tab_reused` |
| `false`   | `false`                                          | `active_tab_used` |

**Implementation refinement (T0-confirmed 2026-06-01)**: the placement open MUST be **explicit**, not `openLinkText(f.path,'',new_tab)` alone — the T0 probe proved `openLinkText(…,false)` opens in the **active leaf (replace)** and does **not** focus an existing tab (so BI-057's current `new_tab:false` reuse is a latent bug). The eval template therefore branches:
- `new_tab:true` → open in a new leaf (`getLeaf(true).openFile` / `openLinkText(…,true)`) → `new_tab_created`.
- `new_tab:false` & a leaf already shows `f.path` → `app.workspace.setActiveLeaf(thatLeaf,{focus:true})` → `existing_tab_reused` (no duplicate — proven in the probe).
- `new_tab:false` & not open → `openLinkText(f.path,'',false)` (active leaf) → `active_tab_used`.

`alreadyOpen` and the existing leaf are found in-eval by iterating **all** leaves (`app.workspace.iterateAllLeaves`, comparing `leaf.view?.file?.path === f.path`) — **not** `getLeavesOfType('markdown')`, which would miss a non-markdown file (PDF/canvas/base/image) already open and mis-report `active_tab_used` instead of `existing_tab_reused`. Since `open_file` opens any recognised type, the search MUST be type-agnostic. The probe confirmed the markdown case; the all-view-types iteration is the production form. This is the only route that can deliver `existing_tab_reused`; it needs no extra CLI round-trip and fixes the BI-057 reuse bug. The signal is what BI-0129 (TC-00488/TC-00489) requires. **Validated (controlled session 2026-06-01)**: a `.base` (view type `bases`) exposes `view.file.path`; `getLeavesOfType('markdown')` **missed** it while `iterateAllLeaves`→`setActiveLeaf` **found + focused** it with no duplicate — so `iterateAllLeaves` (all view types) is mandatory. (Caveat: one snapshot omitted a just-opened markdown tab — confirm complete leaf enumeration within the target window at implement.)

---

## D3 — Closed-vault / app-down recovery: inherited at the dispatch chokepoint

**Decision**: no bespoke launcher; `open_file` routes its eval through `dispatchCli` and inherits ADR-030 app-down launch + ADR-029 cold-start retry. The three vault states (per ADR-031 Decision §3):
- **App fully down** → `dispatchCli` launches before the eval runs (ADR-030, inherited).
- **App up, requested vault closed-but-registered** → cold-launch window absorbed by ADR-029's retry (inherited).
- **App up, wrong vault focused** → the residual ADR-029 FR-013 carve-out; the handler's reactive focus-switch (D1) handles it — the one genuinely new, **tool-level** dimension (honestly surfaced; not inherited).
- **Caveat (OQ-5)**: if the app-down launch brings up the *default* vault rather than the requested one, the eval lands on the wrong vault and the D1 focus-switch corrects it (one extra round). The `OBSIDIAN_AUTO_LAUNCH` opt-out stays enforced upstream either way; the focus-switch branch is unreachable while the app is down (it only fires on a `VAULT_NOT_FOCUSED` envelope, which requires the app to have run the eval).

---

## D4 — Error vocabulary: reuse only (no new code, no new reason)

| Condition | Surface |
|-----------|---------|
| Unknown/unregistered vault | `CLI_REPORTED_ERROR` + `details.code:"VAULT_NOT_FOUND"` + `reason:"unknown"` — **sole hard vault error** (pre-eval via `resolveVaultRootOrRemap`) |
| File absent in requested vault | `CLI_REPORTED_ERROR` + `details.code:"FILE_NOT_FOUND"` |
| Type with no registered view | `CLI_REPORTED_ERROR` + `details.code:"UNSUPPORTED_FILE_TYPE"` (retained from BI-057) |
| Focus/launch unrecoverable (bound exhausted, or app-down + opt-out) | `CLI_NON_ZERO_EXIT` + `details.reason:"obsidian-not-running"` (reused, ADR-030) |
| Input validation | `VALIDATION_ERROR` (retained) |
| Malformed eval envelope | `INTERNAL_ERROR` (retained) |

`VAULT_NOT_FOCUSED` is removed from the *thrown* surface — internal switch-discriminator only. `reason:"not-open"` stops being emitted but stays in the enum (ADR-015 additive-only). **No new top-level code; no new reason.**

---

## D5 — Locator resolution scoped to the requested (target) vault (FR-006a)

**Decision**: input schema unchanged (exactly-one-of `path`/`file`; static per ADR-003 / Principle III). Resolve the locator **only after** the guard passes (focused base == requested): `path` → `getFiles().find`; `file` → `getFirstLinkpathDest` in the target vault. A miss → `FILE_NOT_FOUND`, never a wrong-vault open. The verify-poll only proceeds past the guard when focus has landed, so resolution is structurally guaranteed to run in the target vault. **Probe OQ-4** confirms `getFirstLinkpathDest` resolves in the target vault post-switch.

---

## D6 — Focus-switch seam & module boundary

**Decision**: add `launchFn?: LaunchFn` to `open_file`'s `ExecuteDeps`, defaulting to `launchObsidian` (`src/app-launcher/`); the handler calls `deps.launchFn({vault: input.vault})` on `VAULT_NOT_FOCUSED`. Injection is a test seam; the default is wired in the `open_file` module (not the composition root) → `createServer` untouched. One one-directional `open_file → app-launcher` import edge; the imported `launchObsidian` is a function value, not `spawn`, so ADR-030's two-spawn-site invariant holds. **Implement-phase check**: confirm `architecture.test.ts` constrains spawn imports + `dispatchCli` callers only (not launcher callers); if it constrains launcher callers, wire the default one level up. **Update (controlled session 2026-06-01)**: under the simpler `vault=X eval` design (D9), this seam is **not needed at all** — `open_file` imports nothing from `app-launcher`, app-down recovery is fully inherited in `dispatchCli`, and this caller-constraint question is moot.

---

## D7 — Bound & verify-poll reuse

**Decision**: reuse BI-060/BI-0133's `LAUNCH_POLL_INTERVAL_MS` (750 ms) and `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS` (30 s) for the verify-poll; on exhaustion throw the reused `obsidian-not-running`. One source of truth for the readiness bound. **Probe OQ-2** measures the focus-switch landing window; a smaller poll interval may be adopted if it is reliably sub-second (still bounded; 30 s ceiling kept).

---

## D8 — Native `open`/`tab:open` route — OQ-1 **RESOLVED (2026-06-01): native rejected**

**Decision**: the native-command route is **not** the mechanism. A full forcing-gate T0 probe (raw data in [contracts/t0-probe-findings.md](contracts/t0-probe-findings.md)) resolved OQ-1 **against** native: the native `open` honours `vault=` and switches focus cross-vault, but **cannot implement `existing_tab_reused`** (the spec's no-duplicate focus-existing required by FR-008/FR-010/US4-AC2). The eval-composed reactive switch (D1) is confirmed as ADR-031's mechanism.

### Probe findings (2026-06-01, `Obsidian.com`, Windows)

- Native **`open`** / **`tab:open`** commands exist and **honour `vault=`, switching focus cross-vault** (B1 applies only to `eval`) — confirmed with a forcing-gate (target file present only in the unfocused vault).
- **`open newtab` always creates a fresh tab** → `new_tab:true` = `new_tab_created`.
- **`open` (no flag) opens in the ACTIVE leaf (replace) — it does NOT focus an existing tab.** Tested with the target open in a *non-active* tab: the target was duplicated into the active leaf, the existing tab not focused. The earlier "reuse" reading was an artifact of re-opening an already-*active* file (a no-op).
- The native `open` (no flag) is exactly `openLinkText(path,'',false)` = replace-active — **the same primitive BI-057's eval template uses**, so BI-057's current `new_tab:false` reuse is itself a latent bug (replaces active, not focus-existing).
- An **eval CAN implement true reuse** (`getLeavesOfType().find(path) → setActiveLeaf`) with zero duplicate tabs — proven. A fixed CLI command cannot.
- Placement observability: in-eval `getLeavesOfType('markdown').map(l=>l.view?.file?.path)` returns full paths of open files → reuse-vs-active derivable in-eval, one round-trip. Native route would need a cross-vault `tabs` snapshot (not cleanly available).
- Errors: `Vault not found.` → `VAULT_NOT_FOUND/unknown`; `Error: File "x" not found.` → `FILE_NOT_FOUND` (disjoint from `COLD_START_PATTERN`). Unsupported-type detectable in-eval via `viewRegistry.isExtensionRegistered` (`xyz:false`). Type-agnostic confirmed (`open path=…sample.base`).

**OQ-1 verdict**: native meets *vault=*/*cross-vault*/*typed-errors*/*any-type* but **FAILS tab-reuse** (architecturally — no focus-existing affordance) and is weaker on placement detection. The eval route satisfies the full contract. **Eval is the mechanism; the canonical ADR-031 choice holds, the disqualifier being tab-reuse (not placement-reporting as originally framed).** The deferred sub-probes (closed-vault cold-start, app-down targeting) were run in the controlled session — see D9.

---

## D9 — Controlled-session findings (2026-06-01): B1 is false; a simpler design is available

Recovery sub-probes + the `vault=X eval` gate were run in a user-approved controlled session (Obsidian quit/relaunched). Raw data + table in [contracts/t0-probe-findings.md](contracts/t0-probe-findings.md). **This is a decision-critical finding for the canonical ADR — recorded here, not unilaterally applied (the user folds it in).**

**Recovery signatures confirmed (eval route inherits cleanly):**
- App-down: `vault=B eval` with Obsidian closed → exit 1, empty stdout, stderr `/unable to find Obsidian/i` — the ADR-030 `isAppNotRunning` trigger. The vault-targeted launch `obsidian://open?vault=B` opens **directly on B** (no default-vault detour) → the §3 extra-round caveat does not arise when the dispatch input carries `vault=B`.
- Closed-vault cold-start: `vault=B eval` with B closed → attempt-1 `Error: Command "eval" not found. It may require a plugin to be enabled.` — **matches `COLD_START_PATTERN`** exactly; attempt-2 runs in B. The ADR-029 retry recovers it. (Disjoint from `Error: File … not found.`.)

**B1 is FALSE in the current CLI (overturns BI-057's premise):** `vault=X eval` **routes to X's window** — X open → runs in X's background window; X closed → cold-launches X then runs in it; app down → ADR-030 launch targets X. Opening a file via `vault=X eval` (`openLinkText`) **also focuses X**. Forcing-gate held (B-only files; focus moved A→B). End-to-end confirmed: a single `vault=X eval` from a foreign focused vault with X closed cold-starts then opens the file in X and focuses X.

**Implication — a much simpler design than D1/ADR-031:** `open_file` = `invokeCli({command:"eval", vault:X, target_mode:"specific", code})`. The eval runs **in X**, resolves the file in X, does the explicit reuse-aware open (iterateAllLeaves → setActiveLeaf / openLinkText) which opens **and focuses** X — one call. **No focused-vault guard, no `VAULT_NOT_FOCUSED`, no `obsidian://` focus-switch, no verify-poll, no `launchObsidian` import** (D6 moot). Recovery inherited and vault-targeted with zero per-tool code (cold-start ADR-029; app-down ADR-030 via specific-mode `vault=X` → `dispatchInput.vault=X`).

**Recommendation**: reconcile *why* B1 was originally documented (older CLI version? single-window?), then — if obsolete — supersede ADR-031's mechanism with this `vault=X eval` specific-mode design. Lower risk: it deletes machinery rather than adding it, and the placement/reuse/error/recovery pieces are all probe-confirmed. Decision belongs to the canonical ADR (not edited here).

---

## T0 probe plan (implement-phase, against `Obsidian.com`)

Run at the `/speckit-implement` T0 step per `.memory/test-execution-instructions.md` (authorised `TestVault-Obsidian-CLI-MCP`, `Sandbox/` scratch, drive `Obsidian.com`). Defaults below ship if inconclusive.

- **OQ-1 — RESOLVED (2026-06-01, forcing-gate probe — D8)**: native route rejected (native `open` is replace-active, cannot focus-existing → fails `existing_tab_reused`). Eval is the mechanism. No further re-probe needed.
- **OQ-2 — Focus-switch landing window**: time from `obsidian://open?vault=X` to an `active` eval seeing `basePath==X` (open-but-unfocused; closed). *Default*: poll at `LAUNCH_POLL_INTERVAL_MS`, ceiling `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS`.
- **OQ-3 — Placement detection**: confirm the (new_tab, alreadyOpen) → placement mapping (D2); pin the leaf-inspection API; re-confirm `openLinkText` reuse/new semantics. *Default*: D2.
- **OQ-4 — Locator scoping**: `getFirstLinkpathDest`/`getFiles` resolve in the focused target vault post-switch; a miss → `FILE_NOT_FOUND`. *Default*: D5.
- **OQ-5 — Recovery composition & opt-out**: app-down inherits the dispatch launch (whether it lands on the requested vault without threading `vault=`; if not, the D1 switch corrects it); `OBSIDIAN_AUTO_LAUNCH=0` → `obsidian-not-running`, no launch. *Default*: D3/D4.
- **OQ-6 — Cross-window / cross-platform focus**: the URI switches focus to a vault open in a separate OS window; macOS/Linux equivalence. *Default*: works; document any divergence (quickstart).

---

## Cross-references

- **Supersedes**: BI-057/BI-0065 FR-010/FR-011 → ADR-031 (eval-composed reactive switch).
- **Folds in**: BI-0129 (tab-disposition reporting) — the placement capability; TC-00488/TC-00489 validate.
- **Composes with**: ADR-029/BI-059 (cold-start retry), ADR-030/BI-060/BI-0133 (app-launch, `launchObsidian`, `obsidian-not-running`, `OBSIDIAN_AUTO_LAUNCH`, bounds), ADR-015 (sub-discriminators), ADR-003 (static locator schema).
- **Upstream limitation**: B1 (`.architecture/Obsidian CLI - Upstream Issues and Limitations.md`) — applies to `eval`; native `open`/`tab:open` are exempt (OQ-1 evidence).
