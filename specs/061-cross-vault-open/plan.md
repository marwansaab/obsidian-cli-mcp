# Implementation Plan: Open Cross-Vault Files

**Branch**: `061-cross-vault-open` | **Date**: 2026-06-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/061-cross-vault-open/spec.md`

> **Aligned to canonical ADR-031** (vault-authored 2026-06-01). The mechanism is the **eval-composed reactive focus-switch** (reuse ADR-030's vault-targeted opener). **OQ-1 is RESOLVED (forcing-gate T0 probe, 2026-06-01 — [contracts/t0-probe-findings.md](contracts/t0-probe-findings.md)): the native `open`/`tab:open` route is REJECTED** — native `open` opens in the active leaf (`openLinkText(…,false)`) with no focus-existing affordance, so it cannot deliver `existing_tab_reused` (FR-008/FR-010/US4-AC2); only an eval can. The same probe exposed a latent `new_tab:false` reuse bug in the shipped `open_file` (BI-0065), fixed by the explicit placement branch.

## Summary

`open_file` (BI-057 / BI-0065) today opens a file only in Obsidian's **currently focused** vault — its in-eval focused-vault guard hard-errors (`VAULT_NOT_FOUND`/`reason:"not-open"`) when the requested vault is not focused (FR-010/FR-011), the single biggest limit on unattended file-opening. This feature **inverts that contract**: the open switches focus to the requested vault whether it is open-but-unfocused or closed-but-registered, and adds a machine-verifiable `placement` outcome (`new_tab_created` | `existing_tab_reused` | `active_tab_used`) — folding in the BI-0129 tab-disposition-reporting capability.

**Technical approach** (per ADR-031, confined to `src/tools/open_file/**`, no kernel-node touch): **demote the in-eval focused-vault guard from a hard error to a `VAULT_NOT_FOCUSED` switch-signal**. On that signal the handler fires ADR-030's vault-targeted `obsidian://open?vault=<requested>` opener (reusing `launchObsidian` via an injected `launchFn` seam — a function-value import, **no new spawn site**) and re-runs the eval in a **bounded verify-poll** (reusing BI-060/BI-0133's `LAUNCH_POLL_INTERVAL_MS` / `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS`) until the focused base path matches the requested vault or the bound elapses. App-down launch (ADR-030) and cold-start retry (ADR-029) are **inherited from `dispatchCli`**; the focus-switch for the app-up-but-wrong-vault case is the one genuinely new tool-level piece (ADR-029 FR-013 carved exactly this out for the tool's own guard). The locator resolves **inside the verified-focused target vault** (FR-006a); a bare name never resolves against the pre-switch vault. `placement` is derived **in-eval** from `new_tab` + a pre-open already-open check (the eval runs in the target vault after the switch, so it can inspect `app.workspace` directly — a property the external native route lacks). Error vocabulary unchanged: `VAULT_NOT_FOUND/reason:"unknown"` stays the sole hard vault error; unrecoverable focus/launch reuses `CLI_NON_ZERO_EXIT/reason:"obsidian-not-running"` (ADR-030); **no new top-level code, no new `details.reason`** (`reason:"not-open"` retires from emission, ADR-015 additive-only).

This supersedes BI-057 FR-010/FR-011 (ADR-031). **OQ-1 resolved — native route rejected** (it cannot focus an existing tab → fails `existing_tab_reused`; the eval's `iterateAllLeaves → setActiveLeaf` is the only no-duplicate-reuse mechanism). Placement is derived in-eval via an explicit three-way branch (`new_tab`→new leaf; else-already-open→`setActiveLeaf`; else→`openLinkText` active). The remaining deferred probes (switch-landing window, cross-window/cross-platform focus, app-down requested-vault targeting, closed-vault cold-start signature) are recovery/timing details inherited regardless of route ([contracts/t0-probe-plan.md](contracts/t0-probe-plan.md)).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11 — unchanged.
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `zod`, the eval-composed cohort helpers (`_active-file.decodeEvalEnvelope`, `_shared.composeEvalCode`), and `launchObsidian` (`src/app-launcher/`, BI-060). **No new runtime dependency.**
**Storage**: N/A (the open mutates Obsidian workspace state, not project state).
**Testing**: `vitest` (`vitest run`, V8 coverage), co-located `*.test.ts`. Implement-phase T0 probes per [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md) and `.memory/test-execution-instructions.md` (drive `Obsidian.com`).
**Target Platform**: Windows (reference), macOS, Linux. The focus-switch reuses BI-060's OS-agnostic URI opener; cross-window/cross-platform re-confirmed at T0.
**Project Type**: Single project — MCP server (`src/**`).
**Performance Goals**: **Same-vault open untouched** — one eval, guard matches, zero extra spawn/latency (preserves BI-057 + BI-060 normal-case-untouched ethos). Focus-switch + verify-poll paid **only** on a genuine cross-vault open (reactive).
**Constraints**: Bounded recovery (inherited BI-060 bound, then `obsidian-not-running`); no new top-level code or `details.reason` (Principle IV / ADR-015); locator resolved in the verified target vault (FR-006a); no Obsidian settings/config change (FR-021); no vault creation (FR-022); single placement value, no pane/leaf ids (FR-012/FR-023).
**Scale/Scope**: Changes confined to `src/tools/open_file/**` — `schema.ts` (+`placement` on output & eval envelope), `_template.ts` (guard→switch-signal, locator-in-target-vault, in-eval placement derivation), `handler.ts` (focus-switch + verify-poll; demote `VAULT_NOT_FOCUSED`; map unrecoverable→`obsidian-not-running`; inject `launchFn`), `index.ts` (description rewrite; thread `launchFn` default) + their co-located tests. One new import edge `open_file → app-launcher`. **No edits to `_dispatch.ts`, `cli-adapter.ts`, `logger.ts`, `server.ts`, `errors.ts`.**

**Resolved unknowns**: the contract was settled by the 2026-06-01 clarification; the mechanism is settled by ADR-031 (eval-composed reactive switch) with OQ-1 resolved against native (forcing-gate T0 probe). Remaining items are deferred implement-T0 probes (switch-landing timing, cross-platform/cross-window focus, app-down vault targeting, closed-vault cold-start signature), each with a stated default — **no NEEDS CLARIFICATION remains**.

## Constitution Check

*GATE: must pass before Phase 0 — re-checked after Phase 1 design (below).*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Change confined to the `src/tools/open_file/` per-surface module (`{schema, _template, handler, index}.ts` + tests). One new **one-directional** edge `open_file → app-launcher` (tool → service; no cycle). `_dispatch`/`cli-adapter`/`logger`/`server` untouched. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | `open_file` is an existing MCP tool being modified → tests in the same change. Co-located: `schema.test.ts` (placement enum on output/envelope; locator schema unchanged), `handler.test.ts` (guard-match open + placement variants; `VAULT_NOT_FOCUSED`→focus-switch+poll→success; bound-exhaustion→`obsidian-not-running`; unknown-vault pre-eval; file-not-found; locator-in-target-vault), `_template.test.ts` (recorded eval code), `index.test.ts` (registration/description). |
| **III. Boundary Input Validation with Zod** | **Y** | Input Zod schema **structurally unchanged** (vault required; exactly-one-of path/file; new_tab bool) — locator acceptance independent of runtime focus (FR-006a / Principle III). Output gains a `placement` closed enum (`z.infer`). |
| **IV. Explicit Upstream Error Propagation** | **Y** | No new top-level code. `VAULT_NOT_FOUND/reason:"unknown"` (sole hard vault error), `FILE_NOT_FOUND`, `UNSUPPORTED_FILE_TYPE` (retained), `VALIDATION_ERROR`/`INTERNAL_ERROR` (retained), unrecoverable focus/launch reuses `CLI_NON_ZERO_EXIT/reason:"obsidian-not-running"`. The demoted `VAULT_NOT_FOCUSED` is an internal eval-envelope signal, never a swallowed success. |
| **V. Attribution & Layered Composition** | **Y** | `open_file` files keep `// Original — no upstream.` headers (updated). The reused `obsidian://` opener is a BI-060/ADR-030 facility, cited. |
| **ADR-010** (native-CLI-wrapper tool naming) | **N/A** | `open_file` stays **eval-composed** (the native-subcommand route was probed and rejected — OQ-1, tab-reuse). No tool renamed/added. |
| **ADR-013 / ADR-014** (plugin cohort) | **N/A** | Not plugin-backed. |
| **ADR-015** (sub-discriminators via `details.reason`) | **Y / N/A** | No new `(code, details.code)` pair and no new `details.reason` (reuses `unknown` / `obsidian-not-running`; stops emitting `not-open`). Additive-only respected. |

**No `N` verdicts → no Complexity Tracking entry required.**

**Kernel-node attention (per CLAUDE.md)**: touches **none** of the four kernel nodes. `createLogger` (no new event), `createQueue` (`invokeCli` supplies `queue.run`), `createServer` (the `launchFn` seam is defaulted in the `open_file` module, not the composition root) — all untouched. `UpstreamError` used, not modified. This explicit no-touch claim is what the post-implement structural verification checks.

**ADR note**: supersedes BI-057 FR-010/FR-011 → **ADR-031 (Cross-Vault Open via Vault-Targeted Focus)**, authored canonically vault-side (repo mirror `.decisions/ADR-031` — gitignored). No Constitution Compliance checklist row and no constitution amendment (per ADR-031 Implementation — one tool's behaviour, like ADR-029).

## Project Structure

### Documentation (this feature)

```text
specs/061-cross-vault-open/
├── plan.md              # This file (eval-composed reactive switch; native rejected — OQ-1)
├── research.md          # Phase 0 — decisions D1–D8 + OQ-1 RESOLVED (native rejected; forcing-gate probe)
├── data-model.md        # Phase 1 — eval schema/envelope/error/deps + focus-switch state machine
├── quickstart.md        # Phase 1 — manual validation (Win reference; macOS/Linux flagged)
├── contracts/
│   ├── open-file-cross-vault-contract.md   # behavioural contract (switch, placement, locator scoping, errors)
│   ├── t0-probe-plan.md                     # implement-T0 probes (deferred: timing/targeting/cross-platform)
│   └── t0-probe-findings.md                 # forcing-gate probe (2026-06-01) — OQ-1 resolved, native rejected
├── checklists/requirements.md               # spec quality checklist
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
src/tools/open_file/
├── schema.ts        # EDIT — add `placement` enum to openFileOutputSchema + the ok:true eval envelope; input UNCHANGED
├── schema.test.ts   # EDIT — placement enum; input unchanged
├── _template.ts     # EDIT — guard mismatch returns VAULT_NOT_FOCUSED switch-signal (not error);
│                    #        locator resolves in the (now-focused) target vault; derive placement in-eval
│                    #        from (new_tab, alreadyOpen) BEFORE openLinkText
├── _template.test.ts# EDIT — recorded eval code string
├── handler.ts       # EDIT — on VAULT_NOT_FOCUSED: launchFn({vault}) + bounded verify-poll;
│                    #        success returns {opened, vault, new_tab, placement};
│                    #        bound-exhausted → CLI_NON_ZERO_EXIT/reason:"obsidian-not-running" (reuse);
│                    #        inject launchFn (default launchObsidian); remove not-open error mapping
├── handler.test.ts  # EDIT — focus-switch+poll, placement variants, error roster, locator-in-target-vault
├── index.ts         # EDIT — description rewrite (cross-vault + placement + error roster); thread launchFn
└── index.test.ts    # EDIT — registration/description

src/app-launcher/app-launcher.ts   # REUSED (imported) — launchObsidian({vault}); NO edit
```

**Structure Decision**: Single project, additive, **confined to the `open_file` surface**. The cross-vault concern is realised by (a) demoting the in-eval guard to a switch-signal, (b) composing the existing `launchObsidian` opener via an injected `launchFn` seam, (c) inheriting app-readiness from the unchanged `dispatchCli`. Lowest-blast-radius design that still delivers cross-vault + placement.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated after data-model/contracts: input schema unchanged (III); output gains a closed enum (III); no new top-level code/reason (IV); module confined with one one-directional new edge (I); every changed surface has co-located tests (II); headers retained (V); ADR-015 additive-only respected; ADR-010 stays N/A (eval-composed). **No gate regressed; no violations; Complexity Tracking empty.**

## Graphify structural check

Per the CLAUDE.md `/speckit-plan` rule. Grounded by direct source lookup (`_dispatch.ts`, `cli-adapter.ts`, `app-launcher.ts`, `_active-file.ts`, `open_file/*`) + the live T0 CLI probe.

**Affected community**: the **eval-composed typed-tool cohort** (`open_file` alongside `backlinks`/`links`, sharing `decodeEvalEnvelope`/`composeEvalCode`). All edits land here; the new `open_file → app-launcher` edge connects it to the **app-launcher community** (BI-060). The **runtime-spine** (`invokeCli → dispatchCli`) and **error-spine** (`UpstreamError`) communities are referenced, not restructured.

**Kernel-node touch surface**: `createLogger` / `createQueue` / `UpstreamError` / `createServer` — **none touched** (standard injected deps; reused error triples). Verifies the no-touch claim the post-implement step checks.

**Guardrail / invariant impact**: ADR-030's two-spawn-site invariant (`architecture.test.ts`) **preserved** — `open_file` imports `launchObsidian` (a function value), not `node:child_process` `spawn`. Implement-phase check: confirm `architecture.test.ts` constrains spawn imports + `dispatchCli` callers only, not `launchObsidian` callers (research D6).

**Post-implement structural verification** (after `/speckit-implement`, run `/graphify --update` first): (1) no new top-level error code/reason; (2) no production handler imports `createLogger`/`createQueue`/`createServer`; (3) edits stay in the eval-composed cohort, one new edge to `app-launcher` (not into dispatch internals); (4) `open_file` files structurally connected.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
