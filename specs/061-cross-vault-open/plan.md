# Implementation Plan: Open Cross-Vault Files

**Branch**: `061-cross-vault-open` | **Date**: 2026-06-01 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/061-cross-vault-open/spec.md`

> **Revised 2026-06-01 after a live T0 probe** (user-requested `tab:open`). The probe showed the Obsidian CLI has **native `open`/`tab:open` commands that honour `vault=` and switch focus cross-vault** (B1 does not apply to them). `open_file` is therefore **reimplemented as a thin native-CLI wrapper**, not the eval-composed focus-switch design first drafted. See [research.md](research.md) "T0 FINDINGS" + "Superseded approach".

## Summary

`open_file` (BI-057) today opens a file only in Obsidian's **currently focused** vault — its in-eval focused-vault guard hard-errors (`VAULT_NOT_FOUND`/`reason:"not-open"`) when the requested vault is not focused (FR-010/FR-011), the single biggest limit on unattended file-opening. This feature **inverts that contract**: the open switches focus to the requested vault whether it is open-but-unfocused or closed-but-registered, and adds a machine-verifiable `placement` outcome (`new_tab_created` | `existing_tab_reused` | `active_tab_used`) to the response.

**Technical approach** (confined to `src/tools/open_file/**`, no kernel-node touch): **reimplement `open_file` over the native `open` command** routed through the existing `invokeCli → dispatchCli` path in `target_mode:"specific"` with `vault=<requested>`, the caller's `path=`/`file=` locator, and the `newtab` flag when `new_tab` is true. The native command **switches focus to the requested vault and opens the file atomically** — the T0 probe confirmed `vault=X open/tab:open` switches the focused vault cross-vault (B1 applies only to `eval`, not to these native commands). This **deletes** the eval template, the in-eval guard, the eval envelope, the `obsidian://` URI focus-switch, and the verify-poll from the original draft. Cross-vault recovery is **inherited with zero per-tool code**: app-down launch (ADR-030, targeting the requested vault via the specific-mode `vault=`) and cold-start retry (ADR-029) both apply, and with no eval envelope the BI-059 FR-013 carve-out no longer bites. The locator resolves **natively in the target vault** (FR-006a satisfied by construction). Error vocabulary is unchanged: `Vault not found.`→`VAULT_NOT_FOUND/reason:"unknown"` (sole hard vault error), `Error: File "…" not found.`→`FILE_NOT_FOUND`, app-down→`obsidian-not-running` — all via existing classification; **no new top-level code, no new `details.reason`** (`reason:"not-open"` retires from emission, ADR-015 additive-only). `placement` is derived from the `new_tab` flag + a target-vault "already open?" check (D2), since the native command's stdout is only `Opened: <path>`.

This supersedes BI-057 FR-010/FR-011 (ADR-031) and moves `open_file` from the eval-composed cohort into the **native-CLI-wrapper cohort** — which brings **ADR-010** (tool name mirrors the native subcommand) into scope as a **documented deviation** (the established `open_file` name is retained; see Complexity Tracking). Remaining mechanism details (placement detection, unsupported-type signal, `Opened:` path fidelity, cross-window focus, app-down vault targeting) are pinned by implement-phase T0 probes OQ-A…OQ-E ([research.md](research.md)).

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11 — unchanged.
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `zod`, `invokeCli` (the native-CLI facade). **No new runtime dependency. No `app-launcher` import** (recovery is inherited inside `dispatchCli`, which already owns the launcher).
**Storage**: N/A (the open mutates Obsidian workspace state, not project state).
**Testing**: `vitest` (`vitest run`, V8 coverage), co-located `*.test.ts`. Implement-phase T0 probes per [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md) and `.memory/test-execution-instructions.md` (drive `Obsidian.com`). Plan-time probe already run (research "T0 FINDINGS").
**Target Platform**: Windows (reference, probed), macOS, Linux. The native command is OS-agnostic; cross-window focus re-confirmed at OQ-D.
**Project Type**: Single project — MCP server (`src/**`).
**Performance Goals**: Same-vault open behaviour preserved (a single native `open` call, as today's typed tools). Cross-vault open adds the native switch (one call) + the placement pre-check (at most one extra `tabs` call, only for `new_tab=false`).
**Constraints**: Recovery bounds entirely inherited from `dispatchCli` (no new bound); no new top-level code or `details.reason` (Principle IV / ADR-015); locator resolved in the requested vault natively (FR-006a); no Obsidian settings/config change (FR-021); no vault creation (FR-022); single placement value, no pane/leaf ids in the response (FR-012/FR-023).
**Scale/Scope**: Changes confined to `src/tools/open_file/**` — `schema.ts` (output `+placement`; **remove** the eval-envelope schema; input unchanged), `handler.ts` (rewrite: native `invokeCli({command:"open", vault, parameters:{path|file}, flags:[newtab?], target_mode:"specific"})`, parse `Opened:`, derive placement, map native error strings), `index.ts` (description rewrite; ADR-010 deviation note), **delete `_template.ts` + `_template.test.ts`**, + co-located test rewrites. **No edits to `_dispatch.ts`, `cli-adapter.ts`, `logger.ts`, `server.ts`, `errors.ts`, `app-launcher.ts`.**

**Resolved unknowns**: the contract was settled by the 2026-06-01 clarification; the **mechanism** was settled by the 2026-06-01 T0 probe (native route). Remaining OQ-A…OQ-E are bounded implement-T0 details, each with a stated default — **no NEEDS CLARIFICATION remains**.

## Constitution Check

*GATE: must pass before Phase 0 — re-checked after Phase 1 design (below).*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | Change confined to `src/tools/open_file/` (`{schema, handler, index}.ts` + tests); `_template.ts` deleted. Joins the native-CLI-wrapper cohort (like `read`/`files`/`move`), routing through `invokeCli`. No new cross-module edge; no upward/cyclic deps. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | `open_file` is an existing MCP tool being modified → tests in the same change. Co-located rewrites: `schema.test.ts` (placement enum; input unchanged; envelope schema removed), `handler.test.ts` (native argv assembly incl. `vault=`/`newtab`; `Opened:` parse → `opened`/`vault`/`placement`; placement variants; `Vault not found.`→`VAULT_NOT_FOUND/unknown`; `Error: File … not found.`→`FILE_NOT_FOUND`; app-down→`obsidian-not-running`), `index.test.ts` (registration/description). `_template.test.ts` deleted with the template. |
| **III. Boundary Input Validation with Zod** | **Y** | Input Zod schema **structurally unchanged** (vault required; exactly-one-of path/file; new_tab bool) — locator acceptance independent of runtime focus (FR-006a / Principle III). Output gains a `placement` closed enum (`z.infer`). The eval-envelope schema is removed (no eval). |
| **IV. Explicit Upstream Error Propagation** | **Y** | No new top-level code. Native error strings map to existing `UpstreamError` triples: `VAULT_NOT_FOUND/reason:"unknown"`, `FILE_NOT_FOUND`, inherited `obsidian-not-running`; `VALIDATION_ERROR` retained. No silent fallback; the `Opened:` success is parsed, not assumed. |
| **V. Attribution & Layered Composition** | **Y** | `open_file` files keep `// Original — no upstream.` headers (updated to describe the native wrapper). No lifted code. |
| **ADR-010** (typed tool name mirrors native subcommand) | **N (deviation)** | `open_file` now wraps the native `open` subcommand but **retains its established name** rather than renaming to `open`. Justified in Complexity Tracking (backward-compat of a shipped public surface; wraps a pair `open`/`open newtab`/`tab:open`, no clean 1:1 mirror). Recorded in ADR-031. |
| **ADR-013 / ADR-014** (plugin cohort) | **N/A** | Not plugin-backed. |
| **ADR-015** (sub-discriminators via `details.reason`) | **Y / N/A** | No new `(code, details.code)` pair and no new `details.reason` (reuses `unknown` / `obsidian-not-running`; stops emitting `not-open`). Additive-only respected. |

**One `N` (ADR-010) → Complexity Tracking entry required (below).**

**Kernel-node attention (per CLAUDE.md)**: touches **none** of the four kernel nodes. `createLogger`/`createQueue`/`createServer` untouched (standard injected deps; `invokeCli` supplies `queue.run`). `UpstreamError` used, not modified (existing codes/reasons). Blast radius lower than BI-060; the native route is *simpler* than the superseded eval design (no launcher import, no poll).

**ADR note**: supersedes BI-057 FR-010/FR-011 → **ADR-031 (Reimplement open_file over native cross-vault `open`)**, drafted with this plan (repo mirror `.decisions/ADR-031` — gitignored, canonical queued vault-side, per the ADR-029/030 pattern) and surfaced to the user. ADR-031 records the native-wrapper mechanism, the supersession, the placement-derivation, and the ADR-010 naming deviation.

## Project Structure

### Documentation (this feature)

```text
specs/061-cross-vault-open/
├── plan.md              # This file (revised to the native-wrapper route)
├── research.md          # Phase 0 — T0 FINDINGS (native route) + decisions D1–D8 + OQ-A…OQ-E + superseded approach
├── data-model.md        # Phase 1 — native-wrapper schema/argv/error/placement model
├── quickstart.md        # Phase 1 — manual validation (Win probed; macOS/Linux flagged)
├── contracts/
│   ├── open-file-cross-vault-contract.md   # behavioural contract (native open, placement, errors)
│   └── t0-probe-plan.md                     # implement-T0 probes (+ the plan-time findings already captured)
├── checklists/requirements.md               # spec quality checklist
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
src/tools/open_file/
├── schema.ts        # EDIT — output +placement enum; input UNCHANGED; REMOVE eval-envelope schema
├── schema.test.ts   # EDIT — placement enum; input unchanged; envelope assertions removed
├── handler.ts       # REWRITE — native invokeCli({command:"open", vault, {path|file}, flags:[newtab?], specific});
│                    #           parse "Opened: <path>" → opened; derive placement (D2); map native error strings
├── handler.test.ts  # REWRITE — argv, success parse, placement variants, error mapping, recovery inheritance
├── index.ts         # EDIT — description rewrite (cross-vault + placement + native errors); ADR-010 deviation note
├── index.test.ts    # EDIT — registration/description
├── _template.ts     # DELETE — no eval
└── _template.test.ts# DELETE
```

**Structure Decision**: Single project. `open_file` is reimplemented as a native-CLI wrapper over `open`, confined to its own module, joining the native-wrapper cohort. This is **simpler** than both BI-057 (eval-composed) and the superseded eval-focus-switch draft — it deletes the eval template/envelope and inherits all recovery from `dispatchCli`.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated after data-model/contracts: input schema unchanged (III); output gains a closed enum, eval envelope removed (III); no new top-level code/reason (IV); module confined, eval template deleted (I); every changed surface has co-located tests (II); headers updated (V); ADR-015 additive-only respected; ADR-010 deviation documented with a Complexity Tracking entry. **No gate regressed beyond the documented ADR-010 deviation.**

## Graphify structural check

Per the CLAUDE.md `/speckit-plan` rule. Grounded by **direct source lookup** (`_dispatch.ts`, `cli-adapter.ts`, `_active-file.ts`, `open_file/*`) plus the live T0 CLI probe.

**Affected community**: `open_file` **moves out of the eval-composed cohort** (it no longer uses `decodeEvalEnvelope`/`composeEvalCode`/`_template`) **into the native-CLI-wrapper cohort** (`read`/`files`/`move`/`rename` — the `invokeCli` consumers). The **runtime-spine** (`invokeCli → dispatchCli`) and **error-spine** (`UpstreamError`) communities are referenced unchanged. The `_template.ts` node is **removed** from the graph.

**Kernel-node touch surface**: `createLogger` / `createQueue` / `UpstreamError` / `createServer` — **none touched** (standard injected deps; reused error triples). Verifies the no-touch claim the post-implement step checks.

**Guardrail / invariant impact**: ADR-030's two-spawn-site invariant is **untouched** (no `app-launcher` import at all in the native route — recovery stays inside `dispatchCli`). The ADR-029/030 `architecture.test.ts` is unaffected.

**Post-implement structural verification** (after `/speckit-implement`, run `/graphify --update` first): (1) `ErrorCode`/reason set unchanged — no new top-level code, no new reason; (2) no production handler imports `createLogger`/`createQueue`/`createServer`; (3) `open_file` now sits in the native-wrapper cohort, `_template` node gone, no edge into eval-cohort helpers; (4) `open_file` files structurally connected (not orphaned).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **ADR-010 deviation** — tool keeps the name `open_file` while wrapping the native `open` subcommand (name does not mirror the subcommand) | `open_file` is an **established, shipped public MCP surface** (BI-057); renaming to `open` is a breaking change for every existing caller. It also wraps a *pair* of native affordances (`open` / `open newtab` / sibling `tab:open`), so there is no clean 1:1 subcommand name to mirror. The descriptive `open_file` name remains the clearest agent-facing name and is file-type-neutral. | **Rename to `open`**: breaks backward compatibility for a public surface and collides conceptually with the bare native verb while still not capturing the new-tab pairing. The naming is documented in ADR-031 instead, preserving the convention's intent (mirror native *behaviour*/routing) without the breaking rename. |
