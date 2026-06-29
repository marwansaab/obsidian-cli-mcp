# Implementation Plan: Fix Views Base

**Branch**: `064-fix-views-base` | **Date**: 2026-06-29 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/064-fix-views-base/spec.md`

> **Modify the existing `views_base` typed tool** (it is NOT a new tool). Two defects, both rooted in the native `base:views` subcommand: (1) **US1** — `base:views` emits each view name with a trailing type label, so the listed name is not the name `query_base` accepts; the wrapper currently just line-splits, passing the label through. (2) **US2** — `base:views` is active-mode-only, so an agent cannot list the views of a Base it discovered by name without a human focusing it first. The clarify phase settled the contract (named Base = vault-relative `.base` path; clean names; distinguishable failures). This plan settles the **mechanism**, corrected per the user's plan-time direction: **native, focus-then-active** — reuse the shipped `open_file` (BI-0065) focus capability to make the named `.base` the active file, then run active-mode `base:views`, then strip the label. This delivers US2 **regardless** of whether `base:views path=` works; a forcing-gate T0 probe re-tests `path=` (distrusting the 054 R-003 negative) only to decide "native via `path=`" vs "native via focus-first" — both native. Full eval-composition is a documented fallback, used only if focus-then-active proves racy.

## Summary

`views_base` answers "what views does this Base define?" The names it returns must be the names `query_base` accepts, and an agent must be able to ask about a Base by name without a human in the loop. Today it fails both: the returned names carry a trailing type label (US1), and it reads only the focused file (US2).

**Primary requirements** (from spec, post-clarify): clean, query-ready view names with internal spaces/punctuation preserved (FR-001..003 / SC-001/003); an optional `base_path` naming the target Base by its vault-relative `.base` path — the `bases`/`query_base` identifier — overriding the open Base (FR-004 / SC-002); the no-argument open-Base path unchanged (FR-005/006 / SC-005); distinguishable, cohort-consistent failures for named-not-found vs no-base-open vs invalid-locator vs malformed, never a silent substitution of the open Base (FR-007..010 / SC-004/006); names-only and read-only (FR-011); zero new top-level error codes (Principle IV).

**Technical approach** (confined to `src/tools/views_base/**` + the `_register-baseline.json` fingerprint regen + the docs update; the tool stays in the **native-CLI-wrapper Bases family**; **no kernel-node touch**):

- **Mechanism — native, focus-then-active (primary).** When `base_path` is supplied, focus that `.base` as the active file in the target vault using the proven cross-vault open capability (`open_file`/BI-0065 mechanism: a `target_mode:"specific"` eval with `vault=requested`, B1-false per ADR-031/BI-0134; or `active` when no `vault` is given), then run active-mode `base:views`, then label-strip. When `base_path` is omitted, the existing active-mode `base:views` runs against the already-focused Base. **Both modes share one enumeration + strip path.**
- **US1 — label-strip.** Replace the pass-through line-split with a precise strip of the injected type label, anchored to the known Bases view-type token set so legitimate internal/trailing punctuation is never removed (FR-003). The exact label shape is captured by the T0 probe (P1) before the strip is finalised; the current test fixtures (clean `"All\nActive\n"`) are corrected to the real emission.
- **US2 addressing + validation.** New optional `base_path` (vault-relative `.base` path) validated byte-for-byte like `query_base`'s `base_path` (`INVALID_BASE_PATH` sub-issues: empty / too-long / path-traversal / wrong-extension — Principle III, FR-012). Optional `vault` keeps cohort parity but now routes the focus eval cross-vault (it is no longer silently-ignored for the named path).
- **Errors.** Reuse `CLI_REPORTED_ERROR` sub-discriminators + `VALIDATION_ERROR`; **zero new top-level codes**. For cohort consistency with `query_base` (which reports a missing `.base` as `BASE_NOT_FOUND`), named-not-found and no-base-open both surface as `BASE_NOT_FOUND` distinguished by a new `details.reason` (`named-missing` vs `not-open`) — ADR-015 additive-only. The focus arm's upstream `FILE_NOT_FOUND` is remapped to `BASE_NOT_FOUND/named-missing` rather than leaked, so the cohort uses one base-not-found code.

**T0 forcing-gate probe (implement-time, drives `Obsidian.com` per `.memory/test-execution-instructions.md`)**: P1 real `base:views` label shape (+ a punctuation-bearing Base); P2 re-test `base:views path=`/`vault=` against a **non-focused** `.base` in an **unfocused** vault (distrust R-003); P3 focus-then-active reliability (no race); P4 (only if P2+P3 fail) in-eval Bases view-enumeration API for the fallback. See [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md). The probe decides which native arm ships; the spec contract and error roster are arm-independent.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11 — unchanged.
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `zod`; `invokeCli` (`src/cli-adapter/cli-adapter.ts`); the cross-vault focus capability proven by `open_file` (BI-0065; `composeEvalCode` + a frozen focus template, the same `app.workspace` open mechanism, B1-false per ADR-031); `_active-file.ts` helpers (`resolveVaultRootOrRemap` / `remapVaultNotFound`, `FOCUSED_VAULT_TEMPLATE` / `parseFocusedVault`, `resolveVaultDisplayName`, `assertCanonicalPath`); `isStructurallySafePath` (`src/path-safety/schema.ts`). **No new runtime dependency.**
**Storage**: N/A (reads Obsidian/​vault state; no project state).
**Testing**: `vitest` (`vitest run`, V8 coverage), co-located `*.test.ts`. Live-CLI T0 evidence per `.memory/test-execution-instructions.md` (drive `Obsidian.com`, authorised TestVault); probe plan in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md).
**Target Platform**: Windows (reference, probed), macOS, Linux. Cross-platform recovery rides ADR-029/030 (inherited via `dispatchCli`).
**Project Type**: Single project — MCP server (`src/**`).
**Performance Goals**: Open Base (no `base_path`): one `base:views` round-trip (unchanged). Named Base: one focus eval + one `base:views` (two queue-serialised round-trips); `+vault` to a closed vault pays the inherited ADR-029 cold-launch once. `path=` native arm (if P2 passes) collapses to a single round-trip.
**Constraints**: Zero new top-level error code (Principle IV); a new `BASE_NOT_FOUND` `details.reason` distinguishes named-missing vs not-open (ADR-015 additive); names-only output (shape `{views, count}` unchanged); read-only with respect to vault contents (FR-011 — resolving a named Base may change which file is focused, an accepted, spec-disclosed focus side effect of the named path; no vault content is created/modified/deleted; the open Base path changes nothing); label-strip must preserve legitimate punctuation (FR-003); no tool→tool upward import (Principle I — the focus step composes shared eval primitives, it does not import the `open_file` module).
**Scale/Scope**: One existing module `src/tools/views_base/**` (`schema.ts` + `handler.ts` + `index.ts` + their co-located `*.test.ts`; the focus-first arm adds `_template.ts` + `_template.test.ts`), one `docs/tools/views_base.md` rewrite, one `_register-baseline.json` fingerprint regen for `views_base`, and **one sanctioned DI line in `server.ts`** (the existing `createViewsBaseTool({...})` registration gains a `vaultRegistry` argument so the named+`vault` arm emits a typed `VAULT_NOT_FOUND/unknown` — composition-root injection, not a structural change to `createServer`). **No edits to** `cli-adapter.ts`, `_dispatch.ts`, `errors.ts`, `logger.ts`, `queue.ts`, or any sibling tool module.

**Resolved unknowns**: the contract is settled by the spec Clarifications (2026-06-29). The mechanism is settled by the user's plan-time direction (native, focus-then-active primary; eval fallback). The remaining items are **empirical verification gates**, not design `NEEDS CLARIFICATION`: the real label shape (P1), whether `path=` works now (P2), and focus-then-active reliability (P3) — each with a clear T0 verification path and a defined arm per outcome.

## Constitution Check

*GATE: must pass before Phase 0 — re-checked after Phase 1 design (below).*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Change confined to the existing per-surface module `src/tools/views_base/` (`{schema, handler, index}.ts`). Imports flow tool → shared helpers (`_active-file`, `_shared` `composeEvalCode`, `path-safety`) → adapter (`invokeCli`); no upward/cyclic deps. The focus step reuses the open **mechanism** via shared eval primitives — it does **not** import the sibling `open_file` module (that would be a tool→tool upward edge). If DRY pressure favours a shared `focus-base` helper, it lands in `_active-file.ts` (the cohort's shared-eval home), consumed downward by both — never a sibling import. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | Modified MCP tool → new/updated happy-path + failure/boundary tests in the same change, co-located: `schema.test.ts` (base_path INVALID_BASE_PATH sub-issues: empty/too-long/traversal/wrong-extension; base_path optional; vault still optional; unknown field; updated `properties` key list), `handler.test.ts` (open-Base happy + **label-strip**; punctuation-preserving names; named-Base focus-then-active happy; named-not-found; no-base-open; invalid vault; malformed; vault routing), `index.test.ts` (description no longer asserts "Active-mode-only"; cohort cross-pointers; base_path surfaced). |
| **III. Boundary Input Validation with Zod** | **Y** | New `base_path` validated via zod `superRefine` mirroring `query_base` (single source of truth; `z.infer` downstream; `INVALID_BASE_PATH` `params` sub-discrimination per ADR-015). Output schema `{views, count}` unchanged (strict, refined). No hand-rolled types; no `typeof`/`instanceof` at the boundary. |
| **IV. Explicit Upstream Error Propagation** | **Y** | **Zero new top-level codes.** Reuses `VALIDATION_ERROR` (schema), `CLI_REPORTED_ERROR` with `details.code` sub-discriminators (`BASE_NOT_FOUND` + `details.reason: "not-open"` = no Base open; `BASE_NOT_FOUND` + `details.reason: "named-missing"` = named Base not found — one base-not-found code, cohort-consistent with `query_base`, the focus arm's upstream `FILE_NOT_FOUND` remapped not leaked; `BASE_MALFORMED` if it occurs; `VAULT_NOT_FOUND/unknown` via `remapVaultNotFound`), and inherited `CLI_*` recovery surfaces. No silent fallback to the open Base on a named-Base failure (FR-009). |
| **V. Attribution & Layered Composition** | **Y** | Modified files keep their `// Original — no upstream.` headers (updated one-line intent). No lifted code (cohort helpers are in-tree downward imports). |
| **ADR-010** (native-CLI-wrapper tool naming) | **Y / N/A** | No rename and no new tool. `views_base` stays a native `base:views` wrapper in the Bases family (name unchanged; existing `index.test` ADR-010 assertion preserved). |
| **ADR-013 / ADR-014** (plugin cohort) | **N/A** | Not plugin-backed — Bases is core, reached via the native `base:views` subcommand and core `app.workspace` (no `app.plugins`). |
| **ADR-015** (sub-discriminators via `details.reason`) | **Y** | A new `BASE_NOT_FOUND` `details.reason` (`named-missing` vs `not-open`) is introduced so the two base-not-found states stay distinguishable under one `(CLI_REPORTED_ERROR, BASE_NOT_FOUND)` pair — the textbook ADR-015 multi-state case. Additive-only; zero new top-level codes; existing `BASE_NOT_FOUND` consumers keying on `details.code` are unaffected. |

**No `N` verdicts → no Complexity Tracking entry required.**

**Kernel-node attention (per CLAUDE.md)**: touches **none** of the four kernel nodes' definitions. `createLogger` / `createQueue` are injected via `ExecuteDeps` (the handler never constructs/imports them — DI discipline preserved); `UpstreamError` is used as a value type, not modified; `createServer` is **not structurally changed** — its existing `views_base` registration line gains one `vaultRegistry` DI argument (a composition-root injection, the sanctioned extension point; no new registration line). Blast radius: one existing leaf module in the native Bases family + its baseline fingerprint + its doc + one DI argument at the composition root.

**ADR note**: no new ADR required for the **native** arms. The cross-vault focus rides existing ADR-031 (B1 false) as a new consumer of the proven capability (cohort-wide per BI-0134). The eval-composition **fallback** (only if P2+P3 both fail) would make `views_base` the lone eval member of the native Bases family and, if it enumerated views by reading `.base` YAML client-side, would brush against the BI-041 "no client-side `.base` parse" norm — **that path, if taken, requires a new ADR**; flagged here so the decision is deliberate, not silent.

## Project Structure

### Documentation (this feature)

```text
specs/064-fix-views-base/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D10 + probe-gated decision tree
├── data-model.md        # Phase 1 — entities, schema deltas, handler flow, error roster
├── quickstart.md        # Phase 1 — manual validation scenarios mapped to US1/US2/US3
├── contracts/
│   ├── views_base-contract.md   # behavioural contract (modes, clean-names, errors)
│   └── t0-probe-plan.md         # implement-T0 forcing-gate probe (P1–P4) + decision tree
├── checklists/requirements.md   # spec quality checklist (clarify-updated)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
src/tools/views_base/
├── schema.ts        # EDIT — add optional base_path (vault-relative .base, INVALID_BASE_PATH
│                    #        sub-issues mirroring query_base); vault stays optional; output unchanged
├── schema.test.ts   # EDIT — base_path validation cases; updated toMcpInputSchema key list (vault, base_path)
├── handler.ts       # EDIT — branch on base_path: focus-then-active (named) vs active (open); label-strip;
│                    #        error mapping (named-not-found / no-base-open / malformed / vault / invalid)
├── handler.test.ts  # EDIT — corrected label-strip fixtures; named-Base focus path; the full error roster
├── index.ts         # EDIT — description rewrite (named Base + cross-vault + new errors); drop active-only claim
└── index.test.ts    # EDIT — description assertions updated (no "Active-mode-only"); base_path mention

src/server.ts                       # EDIT — one sanctioned DI line: createViewsBaseTool({ ..., vaultRegistry })
src/tools/_register-baseline.json   # EDIT — regenerate views_base description+schema fingerprints (reviewed)
docs/tools/views_base.md            # EDIT — rewrite: base_path, cross-vault, clean names, new error roster
```

**Structure Decision**: Single project; modify the existing leaf module in the **native-CLI-wrapper Bases family** (`bases` / `query_base` / `create_base` / `views_base`). The named-Base capability is realised by composing the **proven cross-vault focus mechanism** (BI-0065) with the existing active-mode `base:views`, keeping `views_base` native rather than promoting it into the eval-composed cohort. No sibling-tool import; no shared helper is modified unless a downward `_active-file.ts` `focus-base` extraction is chosen at data-model time.

## Phase 0: Research → research.md

Decisions resolving the design (full detail in [research.md](research.md)):

- **D1 — Modify, don't add.** `views_base` exists and is registered; this BI changes its schema/handler/description + tests + baseline + doc. No new tool, no `server.ts` line.
- **D2 — Native mechanism, not eval-composition.** Keep `views_base` in the native Bases family. Eval-composition is fallback-only (D9) to avoid making it the lone eval member of its family.
- **D3 — US2 via focus-then-active (primary).** Reuse the BI-0065 cross-vault open mechanism to focus the named `.base`, then active `base:views`. Delivers US2 even if `base:views path=` never works. (User plan-time directive.)
- **D4 — Re-probe `path=`; distrust 054 R-003.** R-003 ("`base:views` ignores `path=`, active-only") is a candidate misobservation of the class BI-0134 reversed (B1) and Best-Practices F4 (vault=-focused-name slip). T0 P2 re-tests with forcing methodology (Obsidian.com, non-focused `.base`, `vault=`-unfocused). If `path=` works → simpler single-call native specific-mode; else focus-first. Both native — do **not** fork the spec on the unverified negative.
- **D5 — US1 label-strip, punctuation-safe.** Strip the injected type label anchored to the known Bases view-type token set (FR-003); never a blind trailing-token trim. Exact shape from T0 P1; correct the stale clean-name fixtures.
- **D6 — `base_path` validation mirrors `query_base`.** Optional; `INVALID_BASE_PATH` sub-issues (empty/too-long/traversal/wrong-extension) via zod `superRefine` (Principle III; FR-012). Omitted → open-Base active mode (FR-005).
- **D7 — `vault` routes the focus eval cross-vault.** For the named path, `vault` is honoured (B1 false, ADR-031) — no longer the silently-ignored parameter the open-Base path inherits. Unknown vault → `VAULT_NOT_FOUND/unknown` via `remapVaultNotFound`.
- **D8 — Error roster, zero new top-level codes.** named-not-found (`BASE_NOT_FOUND/named-missing`) vs no-base-open (`BASE_NOT_FOUND/not-open`) vs invalid-locator (`VALIDATION_ERROR`/`INVALID_BASE_PATH`) vs malformed (`BASE_MALFORMED`) vs bad-vault (`VAULT_NOT_FOUND/unknown`). One base-not-found code with a `details.reason` discriminator, cohort-consistent with `query_base` (ADR-015 additive). No silent open-Base substitution (FR-009).
- **D9 — Eval-composition fallback (only if P3 fails).** If focus-then-active is racy/unreliable, do the load+enumerate atomically in one eval. Accepts the lone-eval-member cohort cost; a client-side `.base`-YAML read would require a new ADR (BI-041 norm).
- **D10 — Empty-views quirk left as-is.** Obsidian materialises a default view for an empty set; the listing reports whatever the chosen mechanism reports. Documented known edge (spec out-of-scope), not fixed.

**Output**: research.md with all decisions recorded. No `NEEDS CLARIFICATION` remains; the open items are T0 verification gates with defined per-outcome arms.

## Phase 1: Design & Contracts

- **data-model.md** — entities (View name; Views listing result; Base locator; Vault identifier); the schema delta (input gains optional `base_path`; output unchanged); the handler control flow (open vs named; focus-then-active; label-strip; the full typed-error roster with `details` shapes); the conditional `details.reason` rule.
- **contracts/views_base-contract.md** — the behavioural contract: the two modes, clean-names guarantee (label removed, punctuation preserved, query-acceptance equivalence), cross-vault routing, and the typed-error roster distinguishing all failure causes.
- **contracts/t0-probe-plan.md** — the implement-time forcing-gate probe (P1 label shape; P2 `path=`/`vault=` re-test; P3 focus-then-active reliability; P4 eval-API fallback) and the mechanism decision tree.
- **quickstart.md** — manual validation scenarios mapped to US1/US2/US3.
- **Agent context** — update the plan reference inside the `<!-- SPECKIT START/END -->` markers in `CLAUDE.md` to this plan.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated after data-model/contracts: input is the shared zod `superRefine` (single source of truth, `z.infer` downstream; III); output unchanged strict object (III); zero new top-level codes, one additive `BASE_NOT_FOUND` `details.reason`, no silent open-Base substitution (IV); change confined to the native Bases-family module with no sibling import and only one sanctioned `createServer` DI argument (I); every modified surface keeps co-located happy + failure tests (II); `// Original — no upstream.` headers retained (V); ADR-010 unchanged, ADR-013/014 N/A, ADR-015 additive-only. **No gate regressed; no violations; Complexity Tracking empty.**

## Graphify structural check

Per the CLAUDE.md `/speckit-plan` rule. Grounded by direct source lookup (`views_base/*`, `query_base/*`, `open_file/*`, `_active-file.ts`, `cli-adapter.ts`, `server.ts`, `_register-baseline.json`); the relevant symbols were all named in the spec/conversation, so per CLAUDE.md the scoped lookups (not the report) are the correct interface.

**Affected community**: the **native-CLI-wrapper Bases family** (`bases` / `query_base` / `create_base` / `views_base`). The change lands here. The cross-vault focus reuses the **eval-composed cohort's** proven capability (`open_file`) at the mechanism level (shared eval primitives), **without** adding a structural edge into the `open_file` module. The **runtime spine** (`invokeCli → dispatchCli`) and **error spine** (`UpstreamError`) are referenced, not restructured.

**Kernel-node touch surface**: `createLogger` / `createQueue` / `UpstreamError` — **none modified** (injected, not imported by the handler; `UpstreamError` used as a value). `createServer` gains **one sanctioned DI argument** (`vaultRegistry`) on the existing `views_base` registration line — a composition-root injection, not a structural change; no new registration line. The post-implement step verifies the handler imports none of these and that `createServer`'s change is the single DI argument.

**Guardrail / invariant impact**: the FR-018 registry-stability baseline (`_register-baseline.json` + its test) **intentionally** changes — `views_base`'s description+schema fingerprints move because the tool gains `base_path` and a rewritten description. This is the expected, reviewed path for modifying a tool's published surface, not drift; the baseline is regenerated in the same change. ADR-030's two-spawn-site invariant is untouched (no new spawn site / `app-launcher` import — recovery inherited via `dispatchCli`).

**Post-implement structural verification** (after `/speckit-implement`, run `/graphify --update` first): (1) no new top-level error code (no new error-class node outside `src/errors.ts`); any new `details.reason` is a string literal, not a node. (2) the `views_base` handler does **not** import `createLogger`/`createQueue`/`createServer`, and does **not** import the `open_file` module (no sibling tool→tool edge). (3) `views_base` stays in the Bases-family community (no surprise migration into the eval cohort) unless D9 fallback was taken — if so, record the deliberate migration. (4) all modified production files remain structurally connected (test files weakly connected by design).

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
