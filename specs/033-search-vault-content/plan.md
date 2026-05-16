# Implementation Plan: Search Vault Content

**Branch**: `033-search-vault-content` | **Date**: 2026-05-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/033-search-vault-content/spec.md`

## Summary

Add the seventeenth typed-tool wrap, the project's first vault-text-search primitive, AND a **second** member of the multi-subcommand native-wrapper cohort (joining BI-019 `files` which routes between `obsidian files` and `obsidian files:listing`). User surface `search({ query, folder?, limit?, case_sensitive?, context_lines?, vault? })` returns `{ count, paths, truncated? }` (default mode) or `{ count, matches: [{path, line, text}], truncated? }` (line mode). Implementation routes between the upstream native subcommands `obsidian search` (default) and `obsidian search:context` (line mode) — keyed on `input.context_lines`. Both subcommands accept `format=json` natively (live-probe F1), so NO `eval` pivot is needed (departure from BI-028 architecture). Tool name `search` per ADR-010 single-word-verbatim-from-upstream. Zero new error codes, zero new ADRs, zero Constitution amendment. PATCH version bump 0.6.0 → 0.6.1.

## Technical Context

**Language/Version**: TypeScript (strict mode), `tsc --noEmit` clean. Node.js ≥ 22.11 (project floor).
**Primary Dependencies**: `zod`, `@modelcontextprotocol/sdk`, existing `src/cli-adapter/`, existing `src/upstream-error/`. NO new shared modules consumed; NO consumption of `src/tools/_eval-vault-closed-detection/` (this BI is native-wrapper, not eval-driven).
**Storage**: N/A — read-only invocation of upstream native subcommands.
**Testing**: `vitest run`, co-located `*.test.ts`. ~60 cases (~20 schema / ~35 handler / ~5 registration) per data-model.md test inventory.
**Target Platform**: Same as project (Windows / macOS / Linux per binary-resolver tri-platform support post-017).
**Project Type**: Single-project TypeScript library exposing an MCP server.
**Performance Goals**: ≤ 1 s end-to-end against a 10 000-note vault for typical queries (inherited from BI-028 SC-004 baseline; native search subcommand is upstream-optimised, no wrapper compute beyond JSON parse + flatten + sort).
**Constraints**: Zero new top-level error codes; zero new ADRs; zero new `details.code` strings (preserves the sixteen-tool zero-new-codes streak through BI-032). 008-refactor surface frozen — handler talks to `invokeCli` only; no cli-adapter edits.
**Scale/Scope**: Default-mode `paths` capped at 1000 entries (FR-022); explicit `limit` allows up to 10000 (FR-008 / Q3). Line-mode `matches` similarly capped. Per-line `text` capped at 500 chars + ellipsis (FR-024 / Q1 second-session). Underlying CLI's 10 MiB output cap is the post-cap safety net.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-evaluated post-Phase-1 design.*

| Principle / ADR | Satisfied? | Evidence |
|---|---|---|
| I — Modular Code Organization | YES | New module `src/tools/search/{schema,handler,index}.ts`. Three new co-located test files. Imports flow tool → adapter; no cyclic deps. |
| II — Public Surface Test Coverage | YES | ~60 co-located tests across happy-path / failure-or-boundary / inheritance cases (data-model.md Test Inventory). Co-located convention per Principle II. |
| III — Boundary Input Validation with Zod | YES | `searchInputSchema` is the single source of truth for both `inputSchema` publication and runtime parse. `z.infer` flows downstream. Strict schema rejects unknown keys (FR-011). No hand-rolled types. |
| IV — Explicit Upstream Error Propagation | YES | ZERO new top-level error codes. All failures flow through existing `UpstreamError` discriminators (`VALIDATION_ERROR`; `CLI_REPORTED_ERROR` with `details.stage: "json-parse"` / `"wire-parse"`; inherited `CLI_BINARY_NOT_FOUND` / `CLI_NON_ZERO_EXIT` / `VAULT_NOT_FOUND`). Zero-match sentinel converted to empty result per FR-012 (NOT an error). |
| V — Attribution & Layered Composition | YES | All new source files carry `// Original — no upstream.` headers. README Attributions section unchanged (no upstream code lifted; the wrapper invokes the upstream CLI but does not copy its source). |
| ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) | YES | Tool name `search` mirrors `obsidian search` subcommand name (R15 / F1). Internal routing to `search:context` for line mode is an implementation detail (BI-019 `files` precedent: single MCP tool routes to multiple upstream subcommands). |
| ADR-013 (Plugin-Namespace Tool Naming Convention) | N/A | This BI does NOT wrap a plugin API — wraps Obsidian core `search` / `search:context` subcommands. ADR-013 governs the plugin-backed cohort exclusively. |
| ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern) | N/A | Not plugin-backed. ADR-014's plugin-lifecycle failure roster (NOT_INSTALLED / NOT_READY / SOURCE_NOT_INDEXED) is N/A. |
| ADR-015 (Sub-Discriminators via details.reason for Multi-State Error Codes) | N/A | This BI introduces no NEW `(top-level-code, details.code)` pair with multiple sub-states. `CLI_REPORTED_ERROR.details.stage` carries `"json-parse"` / `"wire-parse"` strings but these are RE-USED from peer typed-tool conventions (BI-024 / BI-025 / BI-026 / BI-028 already use the `stage` sub-key); zero NEW sub-state values introduced. |
| ADR-003 (Enforce Target Mode in Typed Tools) | N/A | This BI does NOT use `target_mode` — vault-scoped query surface, parity with BI-014 `find_by_property` / BI-024 `properties` / BI-028 `tag`. FR-016 was restated by plan-stage Amendment 1 to drop the `mode` discriminator (project convention is `vault?`-only for vault-scoped query tools). |

**Constitution Check verdict**: PASS — no violations, no Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/033-search-vault-content/
├── plan.md                              # This file (/speckit-plan output)
├── spec.md                              # Feature spec (with Q1-Q5 + Session 2 Q1-Q3 + plan-stage Amendments 1-2)
├── research.md                          # Phase 0 (R1..R16 + F1..F8)
├── data-model.md                        # Phase 1 (schemas + two-subcommand router + post-process pipeline + test inventory)
├── contracts/
│   ├── search-input.contract.md         # Public input contract (field policy + JSON Schema + 8 examples + error roster)
│   └── search-handler.contract.md       # Handler invariants I-1..I-16
├── quickstart.md                        # Q-1..Q-40 verification scenarios (35 CI + 5 T0)
├── checklists/
│   └── requirements.md                  # Spec quality checklist (all-pass from /speckit-specify run)
└── tasks.md                             # (Phase 2 — /speckit-tasks; NOT created here)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── _register.ts                     # MODIFIED — register createSearchTool alphabetically (between rename and set_property)
│   ├── _register.test.ts                # MODIFIED — add invariants row + baseline reference (or auto-derived per BI-031)
│   ├── _register-baseline.json          # MODIFIED — roll forward via npm run baseline:write to include search entry
│   ├── search/                          # NEW MODULE
│   │   ├── schema.ts                    # input + output + wire (per-subcommand) schemas
│   │   ├── schema.test.ts               # ~20 schema cases
│   │   ├── handler.ts                   # two-subcommand router + post-process pipeline (~120 LOC)
│   │   ├── handler.test.ts              # ~35 handler cases
│   │   ├── index.ts                     # factory createSearchTool
│   │   └── index.test.ts                # ~5 registration cases
│   └── ... (existing tools)
├── server.ts                            # MODIFIED — add search tool import + tools-array entry
└── ... (rest unchanged)

docs/
└── tools/
    └── search.md                        # NEW — published tool docs (FR-020 / FR-014 contract: full input, both output shapes, error roster, ≥ 4 worked examples)

CHANGELOG.md                             # MODIFIED — 0.6.0 → 0.6.1 entry
package.json                             # MODIFIED — version bump
```

**Structure Decision**: Single-project layout per Principle I; no monorepo/web split needed. New module at `src/tools/search/` follows the existing per-surface convention (`{schema, handler, index}.ts` plus three co-located test files). Baseline roll-forward via existing `npm run baseline:write` per BI-022 / FR-018 machinery (BI-031 may have automated this further; consult `_register.ts` at implement time).

## Phase 0 — Outline & Research

Complete. See [research.md](research.md) for R1..R16 decisions and F1..F8 live-CLI probe findings.

Phase 0 NEEDS CLARIFICATION items: ZERO (all spec-stage Q1-Q5 plus Session-2 Q1-Q3 are locked in spec.md; plan-stage F1-F8 findings drove two spec amendments: FR-016 restated (mode/vault → plain `vault?`), FR-021 status documented as currently-non-firing-but-retained-as-defense).

## Phase 1 — Design & Contracts

Complete. Generated artifacts:

- [data-model.md](data-model.md) — input/output/wire schema shapes; two-subcommand routing; post-process pipeline (default mode + line mode); per-tool invariants table; module LOC budget (~985 TS LOC, ~60 test cases); test inventory; fixture seeding plan for T0; architectural delta map vs BI-028 / BI-030 cohorts.
- [contracts/search-input.contract.md](contracts/search-input.contract.md) — public input contract: zod schema, JSON Schema shape, field policy, 8 worked examples (A–H), 13-row error response roster, out-of-scope upstream surfaces table.
- [contracts/search-handler.contract.md](contracts/search-handler.contract.md) — handler invariants I-1..I-16: validation-before-dispatch, single invokeCli call, subcommand routing, parameter assembly invariants, folder normalisation, zero-match sentinel, staged parse, default + line post-process, `truncated` flag encoding, text cap, deterministic sort, locator-non-echo, output-schema validation, original-no-upstream attribution.
- [quickstart.md](quickstart.md) — 40 verification scenarios Q-1..Q-40 mapped to SC-001..SC-011; 35 CI cases (mocked `invokeCli`) + 5 T0 manual probes against real CLI.

### Agent context update

Update CLAUDE.md's plan reference between `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` markers to point to this plan (`specs/033-search-vault-content/plan.md`).

## Constitution Re-check (post-Phase-1)

Re-evaluated against the constitution after Phase 1 artifacts complete. Verdict: PASS — design artifacts confirm:
- Zero new top-level error codes (Principle IV preserved).
- Zero new ADRs.
- Zero new Constitution amendments.
- Zero new `(top-level-code, details.code)` pairs with sub-states (ADR-015 N/A holds).
- No plugin-backed surface (ADR-013, ADR-014 N/A hold).
- All new source files carry `// Original — no upstream.` headers per Principle V.
- 60 co-located tests per Principle II.
- `zod` is the single source of truth at the boundary per Principle III.

Same gate table as initial Constitution Check above; all cells unchanged.

## Complexity Tracking

(No Constitution Check violations; this section intentionally empty.)

## Release mechanics

- **Version bump**: 0.6.0 → 0.6.1 (PATCH; additive surface, no breaking changes, no schema field renames).
- **CHANGELOG.md**: new `## [0.6.1]` entry with:
  - the new tool announcement (`search` + `search:context` routing),
  - the architectural pivot note (native wrapper, NOT eval — BI-028 departure point),
  - the spec amendments (FR-016 restated, FR-021 defensive-clause status),
  - inherited limitations list (filename-match inflation, line-mode count divergence, conservative truncation, etc.).
- **Baseline regen**: `npm run baseline:write` rolls `src/tools/_register-baseline.json` forward to include the new `search` entry. Baseline test asserts post-regen fingerprint match.
- **Docs**: `docs/tools/search.md` (new) published in same commit. Tool-docs registry test auto-asserts existence.

## References

- [.specify/memory/constitution.md](../../.specify/memory/constitution.md) — v1.5.0 (unchanged by this BI).
- [.decisions/ADR-010 - Typed Tool Names Mirror Upstream CLI Subcommand.md](../../.decisions/) — enforced (tool name `search`).
- [.architecture/Obsidian CLI MCP - Architecture.md](../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) — canonical architecture; this BI ROLLS FORWARD with the BI-019 multi-subcommand-routing precedent now joined by a second member.
- Predecessor / sibling references:
  - BI-019 `files` ([specs/019-list-files/](../019-list-files/)) — multi-subcommand routing precedent (`files` / `files:listing`).
  - BI-024 `properties` ([specs/024-list-properties/](../024-list-properties/)) — native-wrapper vault-scoped-query precedent (`vault?`-only).
  - BI-028 `tag` ([specs/028-list-tagged-files/](../028-list-tagged-files/)) — eval-cohort precedent; this BI explicitly does NOT join (R1 native-architecture rationale).
  - BI-030 `move` ([specs/030-move-note/](../030-move-note/)) — native-wrapper file-scoped-write precedent.
