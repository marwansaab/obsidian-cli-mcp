# Implementation Plan: Report Active File (`get_active_file`)

**Branch**: `063-report-focused-file` | **Date**: 2026-06-29 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/063-report-focused-file/spec.md`

> **New eval-composition read tool** `get_active_file` — the read counterpart of `open_file`. It reports the active file (the note Obsidian currently has focused) of either the focused vault (`target_mode: "active"`) or a named vault (`target_mode: "specific"`, routed cross-vault), returning `{ active: { path, name, basename, extension } | null }`. The spec's original focused-vault-guard model was a defect (mirrored the superseded BI-057 `open_file`); ADR-031 falsified B1 (eval honours `vault=`) and BI-0134 verified it cohort-wide (`@marwansaab/obsidian-cli-mcp@0.8.6`). The corrected model is settled in the spec Clarifications (2026-06-29).

## Summary

`get_active_file` answers "which file does the user currently have focused, and what is its identity?" — a capability the surface lacks today. Active-mode tools across the cohort act on implicit focus state the agent cannot see first (the risk ADR-003 names); this tool makes that state explicit so an agent can confirm the active file before acting on it. Primary requirements: report the active file's `path` / `name` / `basename` / `extension` with the `name = basename + extension` derivation (FR-001..004); return a typed **success** `{ active: null }` when nothing is active (FR-005..006) — a deliberate divergence from the rest of the eval cohort, which raises `ERR_NO_ACTIVE_FILE`; address the vault via the ADR-003 `target_mode` union (`active` = focused vault, no `vault`; `specific` = named vault, `vault` required), routing **cross-vault** with no focused-vault guard (FR-009..011); inherit `dispatchCli` recovery for closed / app-down targets with no per-tool code (FR-012..013); zero new top-level error codes (FR-016 / Principle IV).

**Technical approach** (confined to a new `src/tools/get_active_file/**` module; eval-composition cohort; **no kernel-node touch beyond the sanctioned `server.ts` registration line**): a new tool module `{schema, _template, handler, index}.ts` + co-located tests.

- **Schema** — reuse the shared target-mode module: `applyTargetModeRefinementForFolderScoped(targetModeBaseSchema)` (vault required in `specific`, forbidden in `active`; `file`/`path` forbidden in **both** modes — the active file is the implicit target, there is no locator). This is byte-pattern parity with `files` (the existing no-file-locator target-mode tool). Output schema `{ active: FileInfo | null }`, `FileInfo = { path, name, basename, extension }` (all `.strict()`).
- **Template** — a plain frozen `obsidian eval` IIFE that reads `app.workspace.getActiveFile()` and returns `{ ok: true, active: f ? { path, name, basename, extension } : null }`. **No `composeEvalCode` payload** and no `__PAYLOAD_B64__` — the tool injects **no caller-supplied data** into the eval (active/specific routing is carried by `invokeCli`'s `vault`/`target_mode`, not the template), so there is no anti-injection surface (unlike `backlinks`, which interpolates `path`/`file`).
- **Handler** — `specific` mode: a pre-eval `resolveVaultRootOrRemap(vaultRegistry, input.vault, "get_active_file")` produces the typed `VAULT_NOT_FOUND/unknown` error for an unregistered vault (FR-010; the returned base path is discarded — same as `open_file`). Then `invokeCli({ command: "eval", vault: specific ? input.vault : undefined, parameters: { code }, flags: [], target_mode })`. Decode via the shared `decodeEvalEnvelope(stdout, schema, { toolName: "get_active_file", malformedCode: "CLI_REPORTED_ERROR" })`. On `ok:true` return `{ active }` (carrying `null` straight through — **no `ERR_NO_ACTIVE_FILE`**). Recovery (closed vault → ADR-029 cold-start retry; app down → ADR-030 launch) is inherited from `dispatchCli` and vault-correct because the call carries `vault=requested`.
- **Registration** — `server.ts` gains one `createGetActiveFileTool({ logger, queue, vaultRegistry })` line; `_register-baseline.json` gains a `get_active_file` entry (regenerated fingerprints). A **complete** `docs/tools/get_active_file.md` (+ a `docs/tools/index.md` catalogue row) is required **in the same change** — `createServer`'s `assertToolDocsExist` throws at boot, and `server.test.ts` asserts docs-parity, if a registered tool lacks its doc.

**Implement-time T0 probe (carried from the clarify directive)**: B1-false / cross-vault routing is verified cohort-wide for `vault=` (BI-0134), but the **active file is UI state**, not yet probed for this surface. A forcing-gate probe must confirm a `target_mode:"specific"` eval against an **unfocused** named vault returns *that vault's* `getActiveFile()` (not the focused window's). FR-011 / SC-006 depend on it. See [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md). The eval template and the rest of the design are unaffected by the probe outcome; only the cross-vault guarantee's scope is.

## Technical Context

**Language/Version**: TypeScript (strict, NodeNext, ES2024), Node.js ≥ 22.11 — unchanged.
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `zod`; the eval-composition cohort helpers `decodeEvalEnvelope` / `resolveVaultRootOrRemap` (`src/tools/_active-file.ts`), the `target-mode` module (`src/target-mode/target-mode.ts`), `invokeCli` (`src/cli-adapter/cli-adapter.ts`). **No new runtime dependency. No `composeEvalCode` (no payload). No `app-launcher` import** (recovery inherited inside `dispatchCli`).
**Storage**: N/A (a pure read of Obsidian workspace state; no project state).
**Testing**: `vitest` (`vitest run`, V8 coverage), co-located `*.test.ts`. Live-CLI T0 evidence per `.memory/test-execution-instructions.md` (drive `Obsidian.com`); probe plan in [contracts/t0-probe-plan.md](contracts/t0-probe-plan.md).
**Target Platform**: Windows (reference, probed), macOS, Linux. Mechanism is a plain `eval` through `dispatchCli`; cross-platform recovery rides ADR-029/030 (already cross-platform).
**Project Type**: Single project — MCP server (`src/**`).
**Performance Goals**: One `eval` round-trip in `active` mode (no extra spawn). `specific` mode adds one in-process registry lookup (no spawn) plus the same single `eval`. A closed-vault `specific` read pays the inherited ADR-029 cold-launch retry (one extra round-trip, first call only).
**Constraints**: Zero new top-level error code or `details.reason` (Principle IV / ADR-015); recovery bounds entirely inherited from `dispatchCli` (no new bound); no locator (`file`/`path`) in either mode; no echo of input in the response (read-vs-write echo convention); file-only result (no vault / pane / leaf info, FR-015/017/018); raw Unicode pass-through, no normalization (FR-004); read-only — never changes which file is active (FR-019).
**Scale/Scope**: One new module `src/tools/get_active_file/**` (`{schema, _template, handler, index}.ts` + four co-located `*.test.ts`), one `docs/tools/get_active_file.md`, one `server.ts` registration line, one `_register-baseline.json` entry. **No edits to** `_dispatch.ts`, `cli-adapter.ts`, `_active-file.ts`, `target-mode.ts`, `logger.ts`, `errors.ts`, `app-launcher.ts`.

**Resolved unknowns**: the contract is settled by the spec Clarifications (2026-06-29, Q1–Q4) and the corrected cross-vault model (ADR-031 / BI-0134). The sole empirical item — whether a vault-targeted eval returns the *named* vault's active file (UI state) — has a clear verification path (the implement-T0 probe) and a strong prior (B1 false cohort-wide); it is a verification gate, **not a design `NEEDS CLARIFICATION`**.

## Constitution Check

*GATE: must pass before Phase 0 — re-checked after Phase 1 design (below).*

| Gate | Verdict | Evidence |
|------|---------|----------|
| **I. Modular Code Organization** | **Y** | New per-surface module `src/tools/get_active_file/` (`{schema, _template, handler, index}.ts`). Imports flow tool → shared helpers (`_active-file`, `target-mode`, `_shared`) → adapter (`invokeCli`); no upward/cyclic deps. Reuses cohort helpers rather than forking. Only boot-spine touch is the sanctioned `server.ts` registration line. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | **Y** | New MCP tool → happy-path + failure/boundary tests in the same change, co-located: `schema.test.ts` (active vs specific refinement; vault required/forbidden per mode; file/path rejected both modes; unknown field), `_template.test.ts` (recorded eval string; field shape), `handler.test.ts` (active-mode argv no-vault; specific-mode argv with vault=; success → `{active:{...}}`; **`{active:null}` success when no file**; unknown-vault pre-eval → `VAULT_NOT_FOUND/unknown`; malformed eval → `CLI_REPORTED_ERROR`; inherited app-down surface), `index.test.ts` (registration/description). |
| **III. Boundary Input Validation with Zod** | **Y** | Input via the shared `target-mode` Zod refinement (single source of truth; `z.infer` downstream). Output `{ active: FileInfo \| null }` is a Zod schema (`z.infer`). No hand-rolled types; no `typeof`/`instanceof` at the boundary. |
| **IV. Explicit Upstream Error Propagation** | **Y** | **Zero new top-level codes.** Reuses `VAULT_NOT_FOUND/unknown` (via `resolveVaultRootOrRemap`/`remapVaultNotFound`), `CLI_REPORTED_ERROR` (malformed eval, via `decodeEvalEnvelope`), inherited `CLI_NON_ZERO_EXIT/obsidian-not-running` (app down) + `CLI_BINARY_NOT_FOUND`, and `VALIDATION_ERROR` (schema). The no-active-file state is a **success** `{active:null}` authorized by the spec (FR-005, Clarifications) — not a silent empty-result mask: it is the queried answer, reported explicitly. `get_active_file` does **not** emit `ERR_NO_ACTIVE_FILE`. |
| **V. Attribution & Layered Composition** | **Y** | New files carry `// Original — no upstream. <desc>` headers. No lifted code (cohort helpers are in-tree imports). |
| **ADR-010** (native-CLI-wrapper tool naming) | **N/A** | Eval-composed (no native `obsidian active-file` subcommand to mirror). Same disposition as `open_file`/`backlinks`. |
| **ADR-013 / ADR-014** (plugin cohort) | **N/A** | Not plugin-backed (reads core `app.workspace`, no `app.plugins`). |
| **ADR-015** (sub-discriminators via `details.reason`) | **Y / N/A** | Introduces no new `(top-level-code, details.code)` pair and no new `details.reason`; reuses `VAULT_NOT_FOUND/unknown` and `obsidian-not-running`. Additive-only respected. |

**No `N` verdicts → no Complexity Tracking entry required.**

**Kernel-node attention (per CLAUDE.md)**: touches **none** of the four kernel nodes' definitions. `createLogger` / `createQueue` are injected via `RegisterDeps` (the handler never constructs or imports them — DI discipline preserved); `UpstreamError` is used as a value type, not modified; `createServer` is the boot spine — it gains one `createGetActiveFileTool(...)` registration line, the sanctioned extension point every tool uses (not a kernel-node modification). **No spawn site / `app-launcher` import.** Blast radius: one new leaf module in the eval-composed cohort + one boot-spine registration line.

**ADR note**: no new ADR required. The cross-vault model is governed by the existing ADR-031 (B1 false; the `get_active_file` design applies it as a new cohort member, consistent with BI-0134's cohort-wide finding). The one deliberate cohort divergence — no-active-file as a **success** rather than `ERR_NO_ACTIVE_FILE` — is justified by the tool's purpose (report presence/absence) and recorded in the spec Clarifications + this plan; it adds no error vocabulary, so it needs no ADR.

## Project Structure

### Documentation (this feature)

```text
specs/063-report-focused-file/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D9
├── data-model.md        # Phase 1 — entities, schema/envelope/output, handler flow
├── quickstart.md        # Phase 1 — manual validation scenarios
├── contracts/
│   ├── get-active-file-contract.md   # behavioural contract (modes, fields, errors, no-active success)
│   └── t0-probe-plan.md              # implement-T0 — cross-vault active-file UI-state probe
├── checklists/requirements.md         # spec quality checklist (clarify-updated)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
src/tools/get_active_file/
├── schema.ts         # NEW — applyTargetModeRefinementForFolderScoped(targetModeBaseSchema) input;
│                     #       output { active: { path, name, basename, extension } | null } (strict);
│                     #       eval-envelope { ok:true, active: FileInfo | null }
├── schema.test.ts    # NEW — mode refinement (vault per mode; file/path rejected both modes; unknown field)
├── _template.ts      # NEW — frozen eval IIFE reading getActiveFile() → {ok:true, active:{4 fields}|null};
│                     #       NO __PAYLOAD_B64__ / composeEvalCode (no caller data injected)
├── _template.test.ts # NEW — recorded eval string; field mapping (name=basename+extension; no-ext; multi-dot)
├── handler.ts        # NEW — specific: resolveVaultRootOrRemap pre-eval (VAULT_NOT_FOUND/unknown); invokeCli
│                     #       eval (vault per mode, target_mode); decodeEvalEnvelope → { active } / null
├── handler.test.ts   # NEW — active argv (no vault); specific argv (vault=); success+null; unknown-vault;
│                     #       malformed eval; inherited app-down surface
├── index.ts          # NEW — createGetActiveFileTool(deps); GET_ACTIVE_FILE_TOOL_NAME; description
└── index.test.ts     # NEW — registration/description/schema wiring

src/server.ts                       # EDIT — import + createGetActiveFileTool({ logger, queue, vaultRegistry })
src/tools/_register-baseline.json   # EDIT — add get_active_file entry (regenerated fingerprints)
docs/tools/get_active_file.md       # NEW — help() content (modes, fields, no-active, errors, timing caveat)
                                    #       REQUIRED at boot: assertToolDocsExist throws + server.test docs-parity
docs/tools/index.md                 # EDIT — add **get_active_file** catalogue row
```

**Structure Decision**: Single project, new leaf module in the **eval-composed typed-tool cohort**, mirroring `backlinks` (read, target-mode) and `open_file` (cross-vault, `resolveVaultRootOrRemap` pre-eval). The cross-vault concern is realised by routing the eval in `target_mode:"specific"` with `vault=requested` (B1 false → runs in that vault); the active-mode concern by `target_mode:"active"` (no vault). No shared helper is modified — `get_active_file` consumes `decodeEvalEnvelope`, `resolveVaultRootOrRemap`, and the folder-scoped target-mode refinement as-is.

## Phase 0: Research → research.md

Decisions resolving the design (full detail in [research.md](research.md)):

- **D1 — Eval-composition, new module.** No native subcommand → eval cohort. Mirrors `backlinks`/`open_file`.
- **D2 — `target_mode` (active|specific), no locator.** Reuse `applyTargetModeRefinementForFolderScoped(targetModeBaseSchema)`; `get_active_file` is the strongest active-file concept (ADR-003), the inverse of the optional-`vault?` category (ARCH-014). Rejects implicit-vault default. (Spec Q1.)
- **D3 — No-active-file is a SUCCESS `{active:null}`.** Deliberate divergence from the cohort's `ERR_NO_ACTIVE_FILE`; justified by the tool's purpose (FR-005/US2). Output discriminates on `active === null`.
- **D4 — Dedicated template, no payload / no `composeEvalCode`.** No caller data crosses into the eval → no injection surface. Returns the four `TFile` fields directly (`path`,`name`,`basename`,`extension`).
- **D5 — Cross-vault via vault-targeted eval; no guard.** Specific mode routes `vault=requested` (B1 false, ADR-031/BI-0134). No focused-vault guard; `not-open` not emitted. (Spec Q1/FR-011.)
- **D6 — Unknown vault via pre-eval `resolveVaultRootOrRemap`.** Produces `VAULT_NOT_FOUND/unknown` (FR-010), like `open_file`; base path discarded.
- **D7 — Recovery inherited, no per-tool code.** ADR-029/030 via `dispatchCli`; cross-vault guarantee test-locked to open-but-unfocused; post-launch-focus caveat documented. (Spec Q2/FR-012/013.)
- **D8 — Unicode pass-through raw.** No normalization (none exists in `src`). (Spec Q3/FR-004.)
- **D9 — Active-file-UI-state implement-T0 probe.** Verify a vault-targeted eval returns the named vault's active file; strong prior (B1 false cohort-wide), clear path. (Clarify directive.)

**Output**: research.md with all decisions recorded. No `NEEDS CLARIFICATION` remains.

## Phase 1: Design & Contracts

- **data-model.md** — entities (Active file; Active-file result; File-name parts; Target mode; Vault identifier), the input/output/envelope Zod shapes, and the handler control flow (active vs specific; success-null path; error roster).
- **contracts/get-active-file-contract.md** — the behavioural contract: the two modes, the four fields + derivation, the `{active:null}` success, and the full typed-error roster with `details` shapes.
- **contracts/t0-probe-plan.md** — the implement-time forcing-gate probe (D9) and the field-shape characterisation cases (multi-dot, no-ext, non-ASCII).
- **quickstart.md** — manual validation scenarios mapped to the user stories.
- **Agent context** — update the plan reference inside the `<!-- SPECKIT START/END -->` markers in `CLAUDE.md` to this plan.

## Phase 1 re-check (post-design Constitution Check)

Re-evaluated after data-model/contracts: input is the shared target-mode Zod refinement, output a strict Zod object (III); zero new top-level codes/reasons, no-active-file is an authorized success not a masked empty (IV); new module confined to the eval cohort with no shared-helper edit and only the sanctioned `server.ts` line (I); every new surface has a co-located test (II); `// Original — no upstream.` headers on all new files (V); ADR-010/013/014 N/A, ADR-015 additive-only respected. **No gate regressed; no violations; Complexity Tracking empty.**

## Graphify structural check

Per the CLAUDE.md `/speckit-plan` rule. Grounded by direct source lookup (`_active-file.ts`, `target-mode.ts`, `backlinks/*`, `open_file/*`, `server.ts`, `_register-baseline.json`).

**Affected community**: the **eval-composed typed-tool cohort** (`backlinks` / `links` / `open_file`, sharing `decodeEvalEnvelope` + the target-mode refinement). The new module lands here. The **runtime spine** (`invokeCli → dispatchCli`) and **error spine** (`UpstreamError`) communities are *referenced, not restructured*. The **boot spine** (`server.ts → _register → createXTool`) gains one node (`createGetActiveFileTool`) at the sanctioned registration point.

**Kernel-node touch surface**: `createLogger` / `createQueue` / `UpstreamError` / `createServer` — **none modified**. `createLogger`/`createQueue` injected (not imported by the handler); `UpstreamError` used as a value; `createServer` extended via the registration line only. Verifies the no-touch claim the post-implement step checks.

**Guardrail / invariant impact**: ADR-030's two-spawn-site invariant (`architecture.test.ts`) untouched — no spawn site / `app-launcher` import. The FR-018 registry-stability baseline (`_register-baseline.json` + its test) intentionally changes (a new tool is added) — the baseline is regenerated; this is the expected, reviewed path for adding a tool, not drift.

**Post-implement structural verification** (after `/speckit-implement`, run `/graphify --update` first): (1) no new top-level error code / `details.reason` (no new error-class node outside `src/errors.ts`); (2) the `get_active_file` handler does **not** import `createLogger`/`createQueue`/`createServer`; (3) `get_active_file` lands in the eval-composed cohort community (not a surprise placement) with **no** edge to `app-launcher`; (4) all four new production-ish files structurally connected (test files weakly connected by design).

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
