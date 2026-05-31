# Research: Open Cross-Vault Files

Phase 0 decisions. The spec's 2026-06-01 clarification session settled the **contract**; this file records the **mechanism decisions** (D1–D7) and the implement-phase **T0 live-CLI probe plan** (OQ-1…OQ-6) that pin the remaining timing/signature parameters. Every probe has a reasonable default stated, so none is a `[NEEDS CLARIFICATION]`. Probes run against the production-resolved `Obsidian.com` shim per `.memory/test-execution-instructions.md`.

---

## D1 — Open mechanism: reactive vault-targeted focus-switch + verify-poll

**Decision**: Keep `open_file` eval-composed and `target_mode:"active"`. Demote the in-eval focused-vault guard's mismatch branch from a hard error (`VAULT_NOT_FOCUSED` → thrown `VAULT_NOT_FOUND/not-open`) to an **internal switch-signal**. The handler reacts to that signal by firing the vault-targeted focus-switch (`launchObsidian({vault: requested})` → `obsidian://open?vault=<requested>`) and re-running the eval in a bounded verify-poll until the focused base path matches the requested vault (success) or the bound elapses (`obsidian-not-running`).

**Rationale**:
- Overcomes upstream limitation **B1** (eval ignores `vault=`, runs against the focused vault) the only way possible — by making the requested vault *focused* before the eval resolves/opens. A single `obsidian eval` cannot cross vaults (the `app` object is per-window/per-vault), so a focus-switch step is unavoidable for a non-focused target.
- **Reactive** (switch only on the mismatch signal) keeps the **same-vault open untouched** — one eval, guard matches, zero extra spawn/latency — preserving BI-057's behaviour and BI-060's normal-case-untouched ethos.
- One mechanism (`obsidian://open?vault=X`) uniformly covers **open-but-unfocused** (re-focus), **closed-but-registered** (bring up + focus), and even **app-down** (launch) — but app-down is reached through the *inherited* dispatch path (D3), not this branch (see "app-down unreachable here" below).
- Reuses the **already-sanctioned** `launchObsidian` spawn site (ADR-030) — **no third spawn site**, no new launcher.

**Alternatives considered**:
- **Single atomic `obsidian://open?vault=X&file=Y` URI** (no eval): opens the file cross-vault in one shot, but returns **no** placement, **no** typed file-not-found / unsupported-type, and no new-tab fidelity — fails the spec's observable contract (FR-008, FR-014, FR-019). Rejected as the *sole* mechanism; the vault-only URI is reused for the focus-switch.
- **Native `open` / `tab:open` CLI subcommand with `vault=`** routed through `dispatchCli` (would inherit recovery for free): BI-057 established there is **no** native `open` subcommand. OQ-1 re-probes whether any vault-addressed open command exists and reports placement; if one does and reports enough signal, it becomes a simpler route (fallback-up). Default: no such command → eval-composed route as above.
- **Unconditional focus-switch URI before every eval**: uniform but spawns an opener on *every* `open_file` call (including same-vault) and adds latency to the common case — violates the normal-case-untouched goal. Rejected in favour of the reactive design.
- **Thread requested-vault into the dispatch input so the inherited app-down launch targets it** (`target_mode:"specific"`, `vault=requested`, `command=eval`): a pure *optimization* (launches directly on the requested vault, saving one focus-switch round-trip in the app-down case). NOT required for correctness — the handler's focus-switch lands the requested vault regardless. Deferred to D3/OQ-1 as an optional refinement; default is to keep `active` mode and **not** touch the adapter.

**App-down is unreachable in this branch (key safety property)**: the `VAULT_NOT_FOCUSED` envelope is only produced when the eval actually *ran* (app up, wrong vault focused). If the app is **down**, the eval invocation throws the app-not-running signal, which the **inherited** `dispatchCli` recovery (D3) catches *before* the handler ever sees an envelope. Therefore the handler's focus-switch branch never fires against a down app → it never *launches* a down app → the `OBSIDIAN_AUTO_LAUNCH` opt-out (enforced in `dispatchCli`) is never bypassed.

---

## D2 — Placement detection: derive in-eval from (new_tab, alreadyOpen)

**Decision**: Determine the placement outcome deterministically **inside the eval**, before calling `openLinkText`, from two observable facts:
- `new_tab` (the caller's opt-in), and
- `alreadyOpen` = whether any existing workspace leaf already shows the target file's path.

Mapping:

| `new_tab` | `alreadyOpen` | placement |
|-----------|---------------|-----------|
| `true`    | (any)         | `new_tab_created` |
| `false`   | `true`        | `existing_tab_reused` |
| `false`   | `false`       | `active_tab_used` |

The eval computes `alreadyOpen` by scanning `app.workspace` leaves for one whose view's file path equals the resolved `f.path` **before** `openLinkText(f.path, '', new_tab)`, then returns `{ok:true, opened, new_tab, placement}`.

**Rationale**: `openLinkText` does not report whether it created or reused a leaf, but the outcome is fully determined by `new_tab` + the pre-open already-open check — `(path,'',false)` focuses an existing leaf if present (else opens in the active leaf); `(path,'',true)` always opens a fresh leaf (BI-057's settled new-tab semantics). Deriving from a pre-open check is more robust than diffing leaf counts post-hoc (which races layout settling).

**Alternatives**: post-open leaf-count delta (fragile, race-prone) — rejected. Returning no placement when unobservable — rejected (spec FR-008 requires exactly one value).

**Probe**: OQ-3 pins the exact leaf-inspection API (`getLeavesOfType` vs iterating `workspace.iterateAllLeaves`; reading `leaf.view?.file?.path`) and re-confirms the `openLinkText` reuse/new semantics against the test vault.

---

## D3 — Closed-vault / app-down recovery: inherited at the dispatch chokepoint

**Decision**: Do **not** add a bespoke launcher or per-tool app-down handling. `open_file` already routes its eval through `invokeCli → dispatchCli`, so it **inherits**:
- **ADR-030 / BI-060** application-launch recovery: an app-down eval invocation (`CLI_NON_ZERO_EXIT`, stderr `/unable to find Obsidian/i`) triggers `dispatchCli` to `launchObsidian` + bounded readiness poll; honors `OBSIDIAN_AUTO_LAUNCH`; surfaces `obsidian-not-running` on opt-out/exhaustion.
- **ADR-029 / BI-059** cold-start retry: an `eval`-command-not-found (`COLD_START_PATTERN`) on a warming vault triggers one re-spawn.

The only **new, tool-level** logic is the focus-switch + verify-poll for the **app-up-but-wrong-vault** case (D1), which the dispatch layer does **not** and should **not** handle (conflating "app down" with "wrong vault focused" would corrupt the app-down predicate). It reuses BI-060's bound constants and `launchObsidian` — no new bound, no new spawn site.

**Honest scope note (surfaced)**: the clarification's "recovery inherited with zero per-tool code" holds for the **app-down** and **cold-start** dimensions; the **focus-switch for an already-running app** is an unavoidable tool-level step because dispatch recovery is reactive to app-*down* only. This is the minimal, sanctioned addition (reused launcher + reused bound), not a re-implemented launcher.

**Optional optimization (OQ-1)**: thread `vault=requested` into the dispatch input so the inherited app-down launch targets the requested vault directly (saving one focus-switch round-trip). Default OFF (keep `active` mode, adapter untouched) unless the probe shows the extra round-trip materially hurts the app-down path.

---

## D4 — Error vocabulary: reuse only (no new code, no new reason)

**Decision** (locked by Clarification 2026-06-01):

| Condition | Surface |
|-----------|---------|
| Unknown / unregistered vault (typo) | `CLI_REPORTED_ERROR` + `details.code:"VAULT_NOT_FOUND"` + `details.reason:"unknown"` — **sole hard vault error**, resolved pre-eval via `resolveVaultRootOrRemap` |
| File absent in the requested vault | `CLI_REPORTED_ERROR` + `details.code:"FILE_NOT_FOUND"` |
| Type with no registered view | `CLI_REPORTED_ERROR` + `details.code:"UNSUPPORTED_FILE_TYPE"` (retained) |
| Focus-switch/launch unrecoverable (bound exhausted, or app-down + opt-out) | `CLI_NON_ZERO_EXIT` + `details.reason:"obsidian-not-running"` (**reused** from ADR-030) |
| Input validation (missing vault, both/neither locator, bracketed name, unsafe path, unknown field, non-bool new_tab) | `VALIDATION_ERROR` (retained) |
| Malformed eval envelope | `INTERNAL_ERROR` (retained) |

**`VAULT_NOT_FOCUSED` is removed from the *thrown* error surface** — it becomes an internal eval-envelope discriminator that drives the focus-switch (D1). The BI-057 `details.reason:"not-open"` **stops being emitted** by this tool but is **not** removed/renamed in the enum (ADR-015 additive-only). No new top-level code; no new reason (a new `registered-but-launch-failed` reason would be minted only if OQ-6 surfaces a state `obsidian-not-running` cannot express — default: it can, so reuse).

**Rationale**: Constitution Principle IV streak preserved; ADR-015 closed-enum honored; agent-actionability preserved (`unknown` → "register/typo-fix the vault"; `obsidian-not-running` → "start Obsidian"; `FILE_NOT_FOUND` → "fix the path").

---

## D5 — Locator resolution scoped to the requested (target) vault (FR-006a)

**Decision**: Keep BI-057's input schema **unchanged** (exactly-one-of `path`/`file`; static per ADR-003 / Principle III — acceptance never depends on runtime focus). Resolve the locator **only after** the focus-switch has landed (focused base path == requested), so:
- `path` → `app.vault.getFiles().find(x => x.path === a.path)` in the target vault.
- `file` (bare name) → `app.metadataCache.getFirstLinkpathDest(a.file, '')` in the **target** vault's link resolver.

A miss → `FILE_NOT_FOUND` (never a silent open of a same-named file in the pre-switch vault).

**Rationale**: the clarification flagged that the cold-start retry does **not** absorb a wrong-vault bare-name mis-resolution (ADR-029 excludes `…not found.`). Safety comes from *ordering*: resolution happens inside the verified-focused target vault. Because the eval that resolves the locator is the same eval that first verifies `basePath == expectedBase` (the verify-poll only "succeeds" past the guard when focus has landed), the resolution is structurally guaranteed to run in the target vault.

**Probe**: OQ-5 confirms `getFirstLinkpathDest` resolves against the focused (target) vault post-switch and that a miss yields `FILE_NOT_FOUND`.

---

## D6 — Focus-switch seam & module boundary

**Decision**: Add `launchFn?: LaunchFn` to `open_file`'s `ExecuteDeps`, defaulting to `launchObsidian` imported from `src/app-launcher/`. The handler calls `deps.launchFn({ vault: input.vault })` on the `VAULT_NOT_FOCUSED` signal. Injection is a **test seam** (drive the switch without spawning a real opener), mirroring how `_dispatch` injects `launchFn`.

**Rationale**: keeps `createServer` untouched (the default is wired in the `open_file` module, not the composition root), preserves DI testability, and adds a single one-directional `open_file → app-launcher` import edge (Principle I). `open_file` imports the `launchObsidian` **function value**, not `node:child_process` `spawn`, so ADR-030's two-spawn-site invariant is preserved.

**Implement-phase guardrail check**: confirm `architecture.test.ts` constrains (i) `spawn` imports to the two sanctioned files and (ii) `dispatchCli` callers to the two facades — and does **not** additionally restrict `launchObsidian` callers. If it does restrict launcher callers, switch to wiring the `launchFn` default one level up (still injected) so no new direct import is added. Default expectation (from the ADR-030 note wording — "any third *spawn import*… fails the test"): launcher *callers* are unconstrained, so the direct import is fine.

---

## D7 — Bound & verify-poll reuse

**Decision**: Reuse BI-060's exported constants for the focus-switch verify-poll — `LAUNCH_POLL_INTERVAL_MS` (750 ms) between re-evals and `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS` (30 000 ms) total — rather than minting new ones. On exhaustion, throw the reused `obsidian-not-running`.

**Rationale**: one source of truth for "how long do we wait for Obsidian to become ready", consistent with the app-down path; avoids a second tunable. **Probe** OQ-2 measures the focus-switch landing window; if it is reliably sub-second, a *smaller* poll interval may be adopted for snappier cross-vault opens (still bounded, never unbounded) — but the 30 s ceiling stays.

---

## T0 probe plan (implement-phase, against `Obsidian.com`)

Run at the `/speckit-implement` T0 step per `.memory/test-execution-instructions.md` (authorised `TestVault-Obsidian-CLI-MCP`, `Sandbox/` scratch, drive `Obsidian.com` not `.exe`). Each resolves a parameter the spec fixed behaviourally; defaults below ship if a probe is inconclusive.

- **OQ-1 — Native vault-addressed open & `vault=X eval` tolerance**: Does any native CLI command (`open`, `tab:open`, …) open a file in a *named* vault and report enough to derive placement? AND does `obsidian vault=X eval code=…` run the eval unchanged (B1) without erroring on the `vault=` prefix? *Default*: no native open command (BI-057) → eval-composed route (D1); keep `active` mode (D3 optimization off).
- **OQ-2 — Focus-switch landing window**: After `obsidian://open?vault=X`, how long until an `active` eval sees `basePath==X` for (a) an open-but-unfocused X, (b) a closed X? *Default*: poll at `LAUNCH_POLL_INTERVAL_MS`, ceiling `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS` (D7).
- **OQ-3 — Placement detection**: Confirm the (new_tab, alreadyOpen) → placement mapping (D2) and pin the leaf-inspection API; re-confirm `openLinkText(path,'',false)` focuses an existing leaf without duplicate and `(path,'',true)` always opens a fresh leaf. *Default*: D2 mapping.
- **OQ-4 — Cross-window focus**: Does the URI switch focus to a vault open in a **separate OS window**? *Default*: yes; if a platform can't, document the limitation in quickstart (spec edge case already flags this).
- **OQ-5 — Locator scoping**: Confirm `getFirstLinkpathDest`/`getFiles` resolve in the focused (target) vault post-switch; a miss → `FILE_NOT_FOUND`, never a wrong-vault open. *Default*: D5.
- **OQ-6 — Recovery composition & opt-out**: Confirm an app-down open inherits the dispatch launch (and whether it lands on the requested vault without the D3 optimization), and that `OBSIDIAN_AUTO_LAUNCH=0` yields `obsidian-not-running` with no launch. *Default*: D3/D4.

---

## Cross-references

- **Supersedes**: BI-057 FR-010/FR-011 → recorded in **ADR-031** (drafted with this plan; repo mirror gitignored, canonical queued vault-side).
- **Composes with**: ADR-029/BI-059 (cold-start retry), ADR-030/BI-060 (app-launch recovery, `launchObsidian`, `obsidian-not-running`, `OBSIDIAN_AUTO_LAUNCH`), ADR-015 (sub-discriminators), ADR-009 (eval-composition lineage), ADR-003 (static target/locator schema).
- **Upstream limitation**: B1 (`.architecture/Obsidian CLI - Upstream Issues and Limitations.md`).
