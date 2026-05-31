# Implementation Plan: Open Cross-Vault Files

**Branch**: `061-cross-vault-open` | **Date**: 2026-06-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/061-cross-vault-open/spec.md`

## Summary

`open_file` (BI-057) today opens a file only in Obsidian's **currently focused** vault — its in-eval focused-vault guard hard-errors (`VAULT_NOT_FOUND`/`reason:"not-open"`) when the requested vault is not focused (FR-010/FR-011), the single biggest limit on unattended file-opening. This feature **inverts that contract**: the open switches focus to the requested vault whether it is open-but-unfocused or closed-but-registered, and adds a machine-verifiable `placement` outcome (`new_tab_created` | `existing_tab_reused` | `active_tab_used`) to the response so new-tab-vs-reuse no longer needs a human watching Obsidian.

**Technical approach** (confined to `src/tools/open_file/**`, no kernel-node touch): the in-eval guard's mismatch branch is **demoted from a hard error to a `VAULT_NOT_FOCUSED` switch-signal**. On that signal the handler fires ADR-030's vault-targeted `obsidian://open?vault=<requested>` opener (reusing `launchObsidian` — the second sanctioned spawn site, **no new spawn site**) and re-runs the eval in a **bounded verify-poll** (reusing BI-060's `LAUNCH_POLL_INTERVAL_MS` / `OBSIDIAN_LAUNCH_READINESS_TIMEOUT_MS`) until the focused base path matches the requested vault or the bound elapses. Application-readiness (app-down launch + cold-start retry) is **inherited from `dispatchCli`** (ADR-030 / ADR-029) with zero new dispatch code. Because the `VAULT_NOT_FOCUSED` envelope is only produced when the app actually ran the eval, the focus-switch branch is unreachable while the app is down — so it never launches a down app and the `OBSIDIAN_AUTO_LAUNCH` opt-out stays enforced upstream. The locator is resolved **inside the now-focused target vault** (FR-006a), so a bare name never resolves against the pre-switch vault. Error vocabulary is unchanged: `VAULT_NOT_FOUND/reason:"unknown"` stays the sole hard vault error; an unrecoverable focus/launch reuses `CLI_NON_ZERO_EXIT/reason:"obsidian-not-running"` (ADR-030); **no new top-level code and no new `details.reason`** (Principle IV; ADR-015 additive-only — `reason:"not-open"` stops being emitted, not renamed).

This supersedes BI-057's FR-010/FR-011 — a deliberate architectural event recorded in a new **ADR-031** (see below). Mechanism/timing parameters (placement detection, switch-landing window, cross-window focus, the `vault=X eval` tolerance) are pinned by implement-phase **T0 live-CLI probes** against the production `Obsidian.com` shim per [research.md](research.md) and [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md); each has a reasonable default stated here.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11 — unchanged.
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `zod`, the existing eval-composed cohort helpers (`_active-file.decodeEvalEnvelope`, `_shared.composeEvalCode`), and `launchObsidian` (`src/app-launcher/`, shipped in BI-060). **No new runtime dependency.**
**Storage**: N/A (in-memory; the open mutates Obsidian workspace state, not project state).
**Testing**: `vitest` (`vitest run`, V8 coverage), co-located `*.test.ts`. Manual real-CLI scenarios in [quickstart.md](quickstart.md); implement-phase T0 probes per [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md) and `.memory/test-execution-instructions.md`.
**Target Platform**: Windows, macOS, Linux. The focus-switch reuses BI-060's OS-agnostic URI opener; Windows is the plan-time reference host. macOS/Linux flagged for user validation in quickstart.
**Project Type**: Single project — MCP server (`src/**`).
**Performance Goals**: **Same-vault open is untouched** — one eval, guard matches, zero extra spawn/latency (preserves BI-057 behaviour and BI-060's normal-case-untouched ethos). The focus-switch + verify-poll cost is paid **only** on a genuine cross-vault open (reactive, like the cold-start/app-down patterns).
**Constraints**: Bounded recovery (at most the BI-060 readiness bound, then `obsidian-not-running`); no new top-level error code or `details.reason` (Principle IV / ADR-015); locator resolution scoped to the requested vault (FR-006a); no Obsidian settings/config change (FR-021); no new vault creation (FR-022); single placement value, no pane/leaf ids (FR-012/FR-023).
**Scale/Scope**: Changes confined to `src/tools/open_file/**` — `schema.ts` (+`placement` on output & eval envelope), `_template.ts` (guard→switch-signal, locator-in-target-vault, in-eval placement derivation), `handler.ts` (focus-switch + verify-poll; demote `VAULT_NOT_FOCUSED`; map unrecoverable→`obsidian-not-running`; inject `launchFn`), `index.ts` (description rewrite; thread `launchFn` default) + their co-located tests. One new import edge `open_file → app-launcher`. **No edits to `_dispatch.ts`, `cli-adapter.ts`, `logger.ts`, `server.ts`, `errors.ts`.**

**Resolved unknowns**: the spec's clarification session (2026-06-01) settled the contract (unconditional switch; locator parity with target-vault scoping; app-down inherited; reused error literals). Remaining items are implement-phase T0 probes (OQ-1…OQ-6 in research.md), each with a stated default — **no NEEDS CLARIFICATION remains**.

## Constitution Check

*GATE: must pass before Phase 0 — re-checked after Phase 1 design (below).*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Change confined to the `src/tools/open_file/` per-surface module (`{schema, _template, handler, index}.ts` + tests). One new **one-directional** import edge `open_file → app-launcher` (tool → service; no cycle — `app-launcher` imports nothing from `tools/`). No upward/cyclic deps; `_dispatch`/`cli-adapter`/`logger`/`server` untouched. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | `open_file` is an existing MCP tool being modified → tests land in the same change. Co-located updates: `schema.test.ts` (placement enum on output/envelope; locator schema unchanged), `handler.test.ts` (guard-match open + placement variants; `VAULT_NOT_FOCUSED`→focus-switch+poll→success; bound-exhaustion→`obsidian-not-running`; unknown-vault pre-eval; file-not-found; unsupported-type; locator-in-target-vault), `_template.test.ts` (recorded eval code), `index.test.ts` (registration/description). |
| **III. Boundary Input Validation with Zod** | **Y** | The Zod input schema is the single source of truth and is **structurally unchanged** (vault required; exactly-one-of path/file; new_tab bool). Per FR-006a / Principle III, locator acceptance does **not** depend on runtime focus state. The output schema gains a `placement` enum (closed set), keeping the published shape Zod-derived (`z.infer`). |
| **IV. Explicit Upstream Error Propagation** | **Y** | No new top-level code. Failures stay `UpstreamError`: `VAULT_NOT_FOUND/reason:"unknown"` (sole hard vault error), `FILE_NOT_FOUND`, `UNSUPPORTED_FILE_TYPE` (retained), `VALIDATION_ERROR`/`INTERNAL_ERROR` (retained), and the unrecoverable focus/launch reuses `CLI_NON_ZERO_EXIT/reason:"obsidian-not-running"` (ADR-030). The demoted `VAULT_NOT_FOCUSED` is an **internal eval-envelope signal**, never surfaced as a swallowed success. No silent fallback. |
| **V. Attribution & Layered Composition** | **Y** | All `open_file` files carry `// Original — no upstream.` headers (retained/updated). The reused `obsidian://` URI opener is a BI-060/ADR-030 facility, cited in the handler header. |
| **ADR-010** (native-CLI-wrapper tool naming) | **N/A** | No new typed tool; `open_file` is eval-composed (no upstream `open` subcommand — established by BI-057). |
| **ADR-013** (plugin-namespace tool naming) | **N/A** | Not plugin-backed. |
| **ADR-014** (plugin-backed runtime-dependency pattern) | **N/A** | Not plugin-backed. |
| **ADR-015** (sub-discriminators via `details.reason`) | **Y / N/A** | Introduces **no new** `(code, details.code)` pair and **no new** `details.reason` (reuses `unknown` and `obsidian-not-running`; stops emitting `not-open`). Additive-only closed-enum rule respected — Y on compliance, N/A on "adds a new sub-state". |

**No `N` verdicts → no Complexity Tracking entry required.**

**Kernel-node attention (per CLAUDE.md)**: this plan touches **none** of the four kernel nodes. `createLogger` — **NOT touched** (no new Logger event; the focus-switch reuses the existing eval round-trip; the inherited dispatch recovery already logs `dispatchRecovery`). `createQueue` — **NOT touched** (`invokeCli` already wraps the eval in `queue.run`). `UpstreamError` — **USED, not modified** (reuses existing codes/reasons; no new error-class node). `createServer` — **NOT touched** (the `launchFn` focus seam is defaulted in the `open_file` module, not the composition root). This explicit no-touch claim is what the post-implement structural verification checks against. Blast radius is lower than BI-060 (which touched `createLogger`).

**ADR note**: this feature **supersedes BI-057 FR-010/FR-011** (the no-vault-switch contract and the focused-vault guard) — a deliberate architectural event that warrants a new **ADR-031 (Cross-Vault Open via Vault-Targeted Focus)**. Authoring an ADR is a deliberate act; ADR-031 is drafted as part of this plan (repo mirror `.decisions/ADR-031 - ….md` — gitignored, canonical authoring queued vault-side per the read-only-source rule, mirroring the ADR-029/ADR-030 pattern) and surfaced to the user. It records: the guard demotion, the focus-switch mechanism (reuse of ADR-030's opener + the two-spawn-site invariant), the placement-outcome addition, and the error-taxonomy invariance (no new code/reason; `not-open` retires from emission under ADR-015 additive-only).

## Project Structure

### Documentation (this feature)

```text
specs/061-cross-vault-open/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D7 + T0 probe plan (OQ-1…OQ-6)
├── data-model.md        # Phase 1 — schema/envelope/error/deps + focus-switch state machine
├── quickstart.md        # Phase 1 — manual validation (Win reference; macOS/Linux flagged)
├── contracts/
│   ├── open-file-cross-vault-contract.md   # behavioural contract (switch, placement, locator scoping, errors)
│   └── t0-probe-plan.md                     # implement-phase live-CLI probe plan + reasonable defaults
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
src/tools/open_file/
├── schema.ts        # EDIT — add `placement` enum to openFileOutputSchema + the ok:true eval envelope;
│                    #        input schema UNCHANGED (locator static per FR-006a / Principle III)
├── schema.test.ts   # EDIT — placement enum accept/reject; output shape; input schema unchanged
├── _template.ts     # EDIT — guard mismatch returns VAULT_NOT_FOCUSED switch-signal (not error);
│                    #        locator resolves in the (now-focused) target vault; derive placement
│                    #        in-eval from (new_tab, alreadyOpen) BEFORE openLinkText
├── _template.test.ts# EDIT — recorded eval code string
├── handler.ts       # EDIT — on VAULT_NOT_FOCUSED: launchObsidian({vault}) + bounded verify-poll;
│                    #        success returns {opened, vault, new_tab, placement};
│                    #        bound-exhausted → CLI_NON_ZERO_EXIT/reason:"obsidian-not-running" (reuse);
│                    #        inject launchFn (default launchObsidian); remove not-open error mapping
├── handler.test.ts  # EDIT — focus-switch+poll, placement variants, error roster, locator-in-target-vault
├── index.ts         # EDIT — description rewrite (cross-vault + placement + new error roster); thread launchFn
└── index.test.ts    # EDIT — registration/description assertions

src/app-launcher/app-launcher.ts   # REUSED (imported) — launchObsidian({vault}); NO edit
```

**Structure Decision**: Single project, additive, **confined to the `open_file` surface**. The cross-vault concern is realised entirely inside `src/tools/open_file/**` by (a) demoting the in-eval guard to a switch-signal, (b) composing the existing `launchObsidian` opener via an injected `launchFn` seam, and (c) inheriting app-readiness from the unchanged `dispatchCli`. This deliberately avoids touching the dispatch/adapter/logger/server spine — the lowest-blast-radius design that still delivers the cross-vault + placement contract.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated after the data-model/contracts were written: input schema structurally unchanged (III holds); output gains a closed Zod enum (III holds); no new top-level code or reason (IV holds); modular boundaries intact with one one-directional new edge (I holds); every changed surface has enumerated co-located tests (II holds); headers retained (V holds); ADR-015 additive-only respected. **No gate regressed; no violations; Complexity Tracking remains empty.**

## Graphify structural check

Per the CLAUDE.md `/speckit-plan` rule — affected communities + kernel-node touch surface. Scope includes `src/**` and `*.test.ts`, so the full rule applies. Grounded by **direct source lookup** of the dispatch (`_dispatch.ts`), adapter (`cli-adapter.ts`), launcher (`app-launcher.ts`), shared (`_active-file.ts`), and `open_file` modules (the relevant symbols were all named in the spec/conversation, so per CLAUDE.md the cold-start report is skipped in favour of targeted lookup).

**Affected community**: the **eval-composed typed-tool cohort** (where `open_file` sits alongside `backlinks` / `links`, sharing `_active-file.decodeEvalEnvelope` and `_shared.composeEvalCode`). All edits land in this community; the new `open_file → app-launcher` edge connects it to the **app-launcher community** (BI-060). The **runtime-spine** (`invokeCli → dispatchCli`) and **error-spine** (`UpstreamError`) communities are *referenced, not restructured* — `open_file` continues to route through them unchanged and reuse existing error triples.

**Kernel-node touch surface** (the four god-nodes):
- **`createLogger` — NOT touched** (no new Logger event; reuses the existing eval round-trip; dispatch already logs recovery).
- **`createQueue` — NOT touched** (`invokeCli` supplies `queue.run`).
- **`UpstreamError` — USED, not modified** (existing codes/reasons; the post-implement "no new error-class node outside `src/errors.ts`" check stays satisfied).
- **`createServer` — NOT touched** (focus seam defaulted in the `open_file` module; composition root unchanged).

**Guardrail / invariant impact**: ADR-030's two-sanctioned-spawn-site invariant (`architecture.test.ts`) is **preserved** — `open_file` imports `launchObsidian` (a function value), **not** `node:child_process` `spawn`, so it is a new *caller* of the launcher, not a third spawn site. **Implement-phase check**: confirm `architecture.test.ts` constrains spawn imports + `dispatchCli` callers only (not `launchObsidian` callers); if it also constrains launcher callers, inject the focus seam without importing `app-launcher` directly (default wired one level up) — noted in research D6.

**Post-implement structural verification** (after `/speckit-implement`, before BI complete — run `/graphify --update` first): (1) `ErrorCode`/reason set unchanged — no new top-level code, no new `details.reason`; (2) no production handler imports `createLogger`/`createQueue`/`createServer` factories — `open_file` still receives them injected; (3) the `open_file` edits stay in the eval-composed cohort community; the one new edge is `open_file → app-launcher`, not into the dispatch internals; (4) `open_file` files remain structurally connected (not orphaned); test files weakly connected as expected.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
