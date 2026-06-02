# Implementation Plan: Open Cross-Vault Files

**Branch**: `061-cross-vault-open` | **Date**: 2026-06-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/061-cross-vault-open/spec.md`

> **Aligned to canonical ADR-031** (vault-authored 2026-06-01, mechanism rewritten after the controlled-session probe). **B1 is false** — `eval` honours `vault=` and routes to the named vault — so the mechanism collapses to a **single vault-targeted eval**: `open_file = invokeCli({command:"eval", vault:requested, target_mode:"specific", code})`. The eval runs **in the requested vault**, resolves + reuse-focuses there. The earlier same-day focus-switch draft (guard-demote + `obsidian://` URI + verify-poll + `launchObsidian`) is a *superseded* alternative. Native `open`/`tab:open` remains rejected on tab-reuse. Cohort-wide B1 re-verification is deferred to **BI-0134** (out of scope here; `open_file` excluded).

## Summary

`open_file` (BI-057 / BI-0065) today opens a file only in Obsidian's **currently focused** vault — its in-eval focused-vault guard hard-errors (`VAULT_NOT_FOUND`/`reason:"not-open"`) when the requested vault is not focused (FR-010/FR-011), the single biggest limit on unattended file-opening. This feature **inverts that contract**: the open lands in the requested vault whether it is open-but-unfocused or closed-but-registered, switching focus to it, and adds a machine-verifiable `placement` outcome (`new_tab_created` | `existing_tab_reused` | `active_tab_used`) — folding in the BI-0129 tab-disposition capability.

**Technical approach** (per ADR-031, confined to `src/tools/open_file/**`, no kernel-node touch, **no spawn site**): issue a **single vault-targeted eval** — `invokeCli({command:"eval", vault: input.vault, target_mode:"specific", code})`. Because B1 is false (forcing-gate T0 probe, 2026-06-01), the eval **runs in the requested vault**: it resolves the locator there, derives placement, and opens the file via an explicit three-way branch (`new_tab`→new leaf; else-already-open→`setActiveLeaf(existing)` across **all** view types via `iterateAllLeaves`; else→`openLinkText` active), which opens the file **and switches focus to that vault** as a side effect. Recovery is **fully inherited and vault-correct** because the call carries `vault=requested`: a closed vault cold-launches and the ADR-029 retry recovers it (attempt-1 `COLD_START_PATTERN`); a down app triggers the ADR-030 launch of `obsidian://open?vault=requested` (no default-vault detour, no extra round). **Deleted vs BI-057 and the superseded draft**: the focused-vault guard, the `VAULT_NOT_FOCUSED` envelope, the `obsidian://` focus-switch, the verify-poll, and the `launchObsidian`/`launchFn` import. Error vocabulary unchanged: `VAULT_NOT_FOUND/reason:"unknown"` is the sole hard vault error; app-down reuses `CLI_NON_ZERO_EXIT/reason:"obsidian-not-running"` (ADR-030); **no new top-level code, no new `details.reason`** (`reason:"not-open"` retires from emission, ADR-015 additive-only).

This supersedes BI-057 FR-010/FR-011 (ADR-031). The explicit placement branch also **fixes a latent BI-0065 reuse bug** (`new_tab:false` on an already-open file currently replaces the active leaf via `openLinkText(…,false)` instead of focusing the existing tab — probe-confirmed). Native `open`/`tab:open` rejected on tab-reuse (OQ-1). Remaining implement-T0 detail: confirm complete intra-window leaf enumeration for the `iterateAllLeaves` placement check.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11 — unchanged.
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `zod`, the eval-composed cohort helpers (`_active-file.decodeEvalEnvelope`, `_shared.composeEvalCode`). **No new runtime dependency; no `app-launcher` import** (recovery is inherited inside `dispatchCli`).
**Storage**: N/A (the open mutates Obsidian workspace state, not project state).
**Testing**: `vitest` (`vitest run`, V8 coverage), co-located `*.test.ts`. T0 evidence in [contracts/t0-probe-findings.md](contracts/t0-probe-findings.md) (controlled session, 2026-06-01); per `.memory/test-execution-instructions.md`, drive `Obsidian.com`.
**Target Platform**: Windows (reference, probed), macOS, Linux. The mechanism is a plain `vault=X eval` through `dispatchCli`; cross-platform recovery rides ADR-029/030 (already cross-platform).
**Project Type**: Single project — MCP server (`src/**`).
**Performance Goals**: Same-vault open behaviour preserved (one eval, as today). Cross-vault open is the same single eval routed to X (no extra spawn). A closed-vault open pays the inherited ADR-029 cold-launch retry (one extra round-trip, first-call only).
**Constraints**: Recovery bounds entirely inherited from `dispatchCli` (no new bound); no new top-level code or `details.reason` (Principle IV / ADR-015); locator resolved in the requested vault by the routed eval (FR-006a); no Obsidian settings/config change (FR-021); no vault creation (FR-022); single placement value, no pane/leaf ids (FR-012/FR-023).
**Scale/Scope**: Changes confined to `src/tools/open_file/**` — `schema.ts` (output `+placement`; **remove** `VAULT_NOT_FOCUSED` from the eval envelope; input unchanged), `_template.ts` (**remove the focused-vault guard**; resolve in the routed vault; explicit placement branch via `iterateAllLeaves`), `handler.ts` (issue `eval` in `target_mode:"specific"` with `vault=requested`; **remove** the focus-switch/verify-poll/`launchFn`; map envelope → `{opened, vault, new_tab, placement}` / `FILE_NOT_FOUND` / `UNSUPPORTED_FILE_TYPE`), `index.ts` (description rewrite) + co-located tests. **No edits to `_dispatch.ts`, `cli-adapter.ts`, `logger.ts`, `server.ts`, `errors.ts`, `app-launcher.ts`.**

**Resolved unknowns**: the contract was settled by the 2026-06-01 clarification; the mechanism is settled by ADR-031 (vault-targeted eval) with OQ-1 resolved (B1 false; native rejected; recovery confirmed). The only implement-T0 detail is complete leaf enumeration for placement — **no NEEDS CLARIFICATION remains**.

## Constitution Check

*GATE: must pass before Phase 0 — re-checked after Phase 1 design (below).*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Change confined to the `src/tools/open_file/` per-surface module (`{schema, _template, handler, index}.ts` + tests). **No new import edge** (no `app-launcher`); stays in the eval-composed cohort routing through `invokeCli`. No upward/cyclic deps; `_dispatch`/`cli-adapter`/`logger`/`server` untouched. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | `open_file` is an existing MCP tool being modified → tests in the same change. Co-located: `schema.test.ts` (placement enum; envelope without `VAULT_NOT_FOCUSED`; input unchanged), `handler.test.ts` (specific-mode argv incl. `vault=`; success → `{opened, vault, new_tab, placement}`; placement variants incl. non-md reuse; `FILE_NOT_FOUND`; `UNSUPPORTED_FILE_TYPE`; unknown-vault pre-eval; inherited cold-start/app-down surface), `_template.test.ts` (recorded eval code — guard removed, placement branch), `index.test.ts` (registration/description). |
| **III. Boundary Input Validation with Zod** | **Y** | Input Zod schema **structurally unchanged** (vault required; exactly-one-of path/file; new_tab bool) — locator acceptance independent of runtime focus (FR-006a / Principle III). Output gains a `placement` closed enum (`z.infer`). |
| **IV. Explicit Upstream Error Propagation** | **Y** | No new top-level code. `VAULT_NOT_FOUND/reason:"unknown"` (sole hard vault error, pre-eval), `FILE_NOT_FOUND`, `UNSUPPORTED_FILE_TYPE` (retained), `VALIDATION_ERROR`/`INTERNAL_ERROR` (retained), app-down inherited `CLI_NON_ZERO_EXIT/reason:"obsidian-not-running"`. No silent fallback. |
| **V. Attribution & Layered Composition** | **Y** | `open_file` files keep `// Original — no upstream.` headers (updated). No lifted code. |
| **ADR-010** (native-CLI-wrapper tool naming) | **N/A** | `open_file` stays **eval-composed** (the native-subcommand route was probed and rejected — OQ-1, tab-reuse). No tool renamed/added. |
| **ADR-013 / ADR-014** (plugin cohort) | **N/A** | Not plugin-backed. |
| **ADR-015** (sub-discriminators via `details.reason`) | **Y / N/A** | No new `(code, details.code)` pair and no new `details.reason` (reuses `unknown` / `obsidian-not-running`; stops emitting `not-open`). Additive-only respected. |

**No `N` verdicts → no Complexity Tracking entry required.**

**Kernel-node attention (per CLAUDE.md)**: touches **none** of the four kernel nodes. `createLogger`/`createQueue`/`createServer` untouched; `invokeCli` supplies `queue.run`. `UpstreamError` used, not modified. **No spawn site** (the `launchObsidian` import the superseded draft needed is gone), so ADR-030's two-spawn-site invariant is trivially untouched. Lowest blast radius of any 061 draft — the design *deletes* machinery.

**ADR note**: supersedes BI-057 FR-010/FR-011 → **ADR-031 (Cross-Vault Open via Vault-Targeted Focus)**, canonical vault-side (repo mirror `.decisions/ADR-031` — gitignored). No Constitution Compliance row, no constitution amendment (one tool's behaviour, like ADR-029). The B1 reversal is homed in the upstream-limitations register + Tool Notes (per the user); ADR-029/030 carry dated amendment stanzas. Cohort-wide B1 re-verification → **BI-0134** (deferred, `open_file` excluded).

## Project Structure

### Documentation (this feature)

```text
specs/061-cross-vault-open/
├── plan.md              # This file (vault-targeted eval; native rejected — OQ-1; B1 false)
├── research.md          # Phase 0 — decisions D1–D9 (D1 vault-targeted eval; D9 controlled-session/B1-false)
├── data-model.md        # Phase 1 — eval schema/envelope/error/deps + handler flow (no focus-switch)
├── quickstart.md        # Phase 1 — manual validation
├── contracts/
│   ├── open-file-cross-vault-contract.md   # behavioural contract (vault-targeted eval, placement, errors)
│   ├── t0-probe-plan.md                     # implement-T0 (leaf enumeration; OQ-1 resolved)
│   └── t0-probe-findings.md                 # forcing-gate + controlled-session evidence (B1 false; recovery)
├── checklists/requirements.md               # spec quality checklist
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
src/tools/open_file/
├── schema.ts        # EDIT — output +placement enum; REMOVE VAULT_NOT_FOCUSED from the eval envelope; input UNCHANGED
├── schema.test.ts   # EDIT — placement enum; envelope without VAULT_NOT_FOCUSED; input unchanged
├── _template.ts     # EDIT — REMOVE the focused-vault guard; resolve in the routed vault; explicit placement
│                    #        branch (new leaf / setActiveLeaf existing via iterateAllLeaves / openLinkText active)
├── _template.test.ts# EDIT — recorded eval code (guard removed, placement branch)
├── handler.ts       # EDIT — invokeCli({command:"eval", vault:input.vault, target_mode:"specific", code});
│                    #        map envelope → {opened, vault, new_tab, placement} / FILE_NOT_FOUND / UNSUPPORTED_FILE_TYPE;
│                    #        unknown-vault pre-eval via resolveVaultRootOrRemap; NO focus-switch/poll/launchFn
├── handler.test.ts  # EDIT — specific-mode argv, success+placement, error roster, inherited recovery surface
├── index.ts         # EDIT — description rewrite (cross-vault + placement + error roster)
└── index.test.ts    # EDIT — registration/description
```

**Structure Decision**: Single project, **confined to the `open_file` surface**, eval-composed. The cross-vault concern is realised by routing the existing open-eval in `target_mode:"specific"` with `vault=requested` (which, B1 being false, runs in that vault) and adding the explicit placement branch — **deleting** the guard, the focus-switch, the verify-poll, and the launcher import. Lowest-blast-radius 061 design; recovery is inherited unchanged from `dispatchCli`.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated after data-model/contracts: input schema unchanged (III); output gains a closed enum, envelope loses `VAULT_NOT_FOCUSED` (III); no new top-level code/reason (IV); module confined with **no new edge** (I); every changed surface has co-located tests (II); headers retained (V); ADR-015 additive-only respected; ADR-010 N/A (eval-composed). **No gate regressed; no violations; Complexity Tracking empty.**

## Graphify structural check

Per the CLAUDE.md `/speckit-plan` rule. Grounded by direct source lookup (`_dispatch.ts`, `cli-adapter.ts`, `_active-file.ts`, `open_file/*`) + the controlled-session CLI probe.

**Affected community**: the **eval-composed typed-tool cohort** (`open_file` alongside `backlinks`/`links`, sharing `decodeEvalEnvelope`/`composeEvalCode`). All edits land here. The **runtime-spine** (`invokeCli → dispatchCli`) and **error-spine** (`UpstreamError`) communities are referenced, not restructured. **No new edge to `app-launcher`** (the superseded draft's `launchObsidian` import is gone).

**Kernel-node touch surface**: `createLogger` / `createQueue` / `UpstreamError` / `createServer` — **none touched**. Verifies the no-touch claim the post-implement step checks.

**Guardrail / invariant impact**: ADR-030's two-spawn-site invariant (`architecture.test.ts`) is **untouched** — `open_file` imports no spawn site and no launcher. ADR-029/030 unaffected.

**Post-implement structural verification** (after `/speckit-implement`, run `/graphify --update` first): (1) no new top-level error code/reason; (2) no production handler imports `createLogger`/`createQueue`/`createServer`; (3) `open_file` stays in the eval-composed cohort with **no** new edge to `app-launcher`; (4) `open_file` files structurally connected.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
