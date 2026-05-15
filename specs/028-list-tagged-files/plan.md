# Implementation Plan: List Tagged Files

**Branch**: `028-list-tagged-files` | **Date**: 2026-05-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/028-list-tagged-files/spec.md`

## Summary

Add the fourteenth typed-tool wrap, the project's first TAG-INDEX retrieval primitive, AND the sixth member of the eval-driven typed-tool cohort. User surface `tag({ tag, vault?, total? })` returns `{ count, paths }` (default) or bare integer (count-only). Implementation routes through the upstream `eval` subcommand (NOT the native `obsidian tag` subcommand, per live-probe finding F3) and walks `app.metadataCache.fileCache × .metadataCache` to compute matching paths. Wrapper-side ASCII lower-fold inside the eval JS template restores the case-insensitive matching that Obsidian's tag-pane UX delivers but the native CLI does NOT (live-probe finding F2 contradicted Q1's defer-to-upstream premise; Q1's explicit conditional fired). Tool name `tag` per ADR-010 single-word-verbatim-from-upstream. Zero new error codes, zero new ADRs, zero Constitution amendment. PATCH version bump 0.5.5 → 0.5.6.

## Technical Context

**Language/Version**: TypeScript (strict mode), tsc --noEmit clean. Node.js ≥ 22.11 (project floor).
**Primary Dependencies**: `zod`, `@modelcontextprotocol/sdk`, existing `src/cli-adapter/`, existing `src/upstream-error/`, existing `src/tools/_eval-vault-closed-detection/` (third consumer).
**Storage**: N/A — read-only walk of Obsidian's in-memory metadataCache via `eval`.
**Testing**: `vitest run`, co-located `*.test.ts`. 53 cases (16 schema / 32 handler / 5 registration).
**Target Platform**: Same as project (Windows / macOS / Linux per binary-resolver tri-platform support post-017).
**Project Type**: Single-project TypeScript library exposing an MCP server.
**Performance Goals**: ≤1s end-to-end against a 10 000-note vault (SC-004). Eval JS template walk is O(N) over file count.
**Constraints**: Zero new top-level error codes; zero new ADRs; zero new `details.code` strings (preserves the thirteen-tool zero-new-codes streak through BI-027). 008-refactor surface frozen — handler talks to `invokeCli` only; no cli-adapter edits.
**Scale/Scope**: Vault sizes up to ~50 000 notes characterised; the 10 MiB inherited cli-adapter output cap protects against runaway results.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-evaluated post-Phase-1 design.*

| Principle / ADR | Satisfied? | Evidence |
|----------------|-----------|---------|
| I — Modular Code Organization | YES | New module `src/tools/tag/{schema,handler,index}.ts`. Three new co-located test files. Imports flow tool → adapter; no cyclic deps. |
| II — Public Surface Test Coverage | YES | 53 co-located tests across happy-path / failure-or-boundary / inheritance cases. Co-located convention per Principle II. |
| III — Boundary Input Validation with Zod | YES | `tagInputSchema` is the single source of truth for both `inputSchema` publication and runtime parse. `z.infer` flows downstream; no hand-rolled types. |
| IV — Explicit Upstream Error Propagation | YES | ZERO new top-level error codes. All failures flow through existing `UpstreamError` discriminators (VALIDATION_ERROR; CLI_REPORTED_ERROR with `details.reason` for VAULT_NOT_FOUND, `details.stage` for parse failures, etc.). Defer-to-upstream pattern locked at Q3 / FR-005 / FR-006. |
| V — Attribution & Layered Composition | YES | All new source files carry `// Original — no upstream.` headers. README Attributions section unchanged (no upstream lifted). |
| ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) | YES | Tool name `tag` mirrors `obsidian tag` subcommand name (R15). |
| ADR-013 (Plugin-Namespace Tool Naming Convention) | N/A | This BI does NOT wrap a plugin API — wraps Obsidian's core metadataCache. ADR-013 governs the plugin-backed cohort exclusively. |
| ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern) | N/A | This BI does NOT wrap a plugin. ADR-014's plugin-lifecycle failure roster (NOT_INSTALLED/NOT_READY/NOT_INDEXED) is N/A. |
| ADR-015 (Sub-Discriminators via details.reason) | N/A | This BI introduces no NEW `(top-level-code, details.code)` pair with multiple sub-states, AND adds no new sub-states to existing pairs (`VAULT_NOT_FOUND.reason: "unknown"/"not-open"` are consumed via inherited classifier + shared detector, both already existing). |
| ADR-003 (Enforce Target Mode in Typed Tools) | N/A | This BI does NOT use `target_mode` — vault-only surface, parity with BI-024. ADR-003 governs per-file typed tools and explicitly does NOT apply here. |

**Constitution Check verdict**: PASS — no violations, no Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/028-list-tagged-files/
├── plan.md                              # This file (/speckit-plan output)
├── spec.md                              # Feature spec (with Q1-Q5 + plan-stage amendments)
├── research.md                          # Phase 0 (R1..R15 + F1..F8)
├── data-model.md                        # Phase 1 (schemas + frozen JS template + test inventory)
├── contracts/
│   ├── tag-input.contract.md            # Public input contract
│   └── tag-handler.contract.md          # Handler invariants I-1..I-12
├── quickstart.md                        # Q-1..Q-30 verification scenarios
├── checklists/
│   └── requirements.md                  # Spec quality checklist
└── tasks.md                             # (Phase 2 — /speckit-tasks; NOT created here)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── _eval-vault-closed-detection/    # SHARED (BI-026 origin, BI-027 lift) — third consumer
│   │   ├── detector.ts                  # (unchanged)
│   │   ├── registry-parser.ts           # (unchanged)
│   │   └── index.ts                     # (unchanged)
│   ├── _register.ts                     # MODIFIED — register createTagTool alphabetically
│   ├── _register.test.ts                # MODIFIED — add invariants row + baseline reference
│   ├── _register-baseline.json          # MODIFIED — roll forward to include tag entry
│   ├── tag/                             # NEW MODULE
│   │   ├── schema.ts                    # input + output + envelope schemas
│   │   ├── schema.test.ts               # 16 schema cases
│   │   ├── handler.ts                   # frozen JS template + multi-stage parse
│   │   ├── handler.test.ts              # 32 handler cases
│   │   ├── index.ts                     # factory createTagTool
│   │   └── index.test.ts                # 5 registration cases
│   └── ... (existing tools)
├── server.ts                            # MODIFIED — add tag tool import + tools-array entry
└── ... (rest unchanged)

docs/
└── tools/
    └── tag.md                           # NEW — published tool docs

CHANGELOG.md                             # MODIFIED — 0.5.5 → 0.5.6 entry
package.json                             # MODIFIED — version bump
```

**Structure Decision**: Single-project layout per Principle I; no monorepo/web split needed. New module at `src/tools/tag/` follows the existing per-surface convention (`{schema, handler, index}.ts` plus three co-located test files). Baseline roll-forward via existing `npm run baseline:write` per BI-022 / FR-018 machinery.

## Phase 0 — Outline & Research

Complete. See [research.md](research.md) for R1..R15 decisions and F1..F8 live-CLI/metadataCache findings.

Phase 0 NEEDS CLARIFICATION items: ZERO (all clarify-session Q1-Q5 locked in spec; plan-stage F1-F8 findings drove two spec amendments that updated FR-008 + added FR-019..FR-021).

## Phase 1 — Design & Contracts

Complete. Generated artifacts:

- [data-model.md](data-model.md) — input/output/envelope schema shapes; frozen JS template (~40 LOC); base64 payload assembly; per-tool invariants; module LOC budget; 53-case test inventory; fixture seeding plan for T0.
- [contracts/tag-input.contract.md](contracts/tag-input.contract.md) — public input contract: zod schema, JSON Schema shape, field policy, 8 worked examples (A–H), 11-row error response roster, out-of-scope upstream surfaces table.
- [contracts/tag-handler.contract.md](contracts/tag-handler.contract.md) — handler invariants I-1..I-12: validation-before-dispatch, single invokeCli call shape, base64 payload assembly, frozen template byte-stability, stage-0 closed-vault via shared module, five-stage parse, envelope-error mapping, cross-mode count invariant, vault flow-through, output schema validation at boundary, original-no-upstream attribution.
- [quickstart.md](quickstart.md) — 30 verification scenarios Q-1..Q-30 mapped to SC-001..SC-013; 21 CI cases + 5 T0 manual + 4 inspection/structural.

### Agent context update

Update CLAUDE.md's `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` block (and the active-narrative section) to point to this plan and reflect BI-028 as the active feature. Predecessor BI-027 narrative rotates to "RETAINED FOR CONTEXT".

## Constitution Re-check (post-Phase-1)

Re-evaluated against the constitution after Phase 1 artifacts complete. Verdict: PASS — design artifacts confirm zero new error codes, zero new ADRs, zero new Principles, zero new compliance rows. Same gate table as initial Constitution Check above; all cells unchanged.

## Complexity Tracking

(No Constitution Check violations; this section intentionally empty.)

## Release mechanics

- **Version bump**: 0.5.5 → 0.5.6 (PATCH; additive surface, no breaking changes, no schema field renames).
- **CHANGELOG.md**: new `## [0.5.6]` entry with the new tool announcement, the plan-stage amendments to spec, and the inherited limitations list.
- **Baseline regen**: `npm run baseline:write` rolls `src/tools/_register-baseline.json` forward to include the new `tag` entry. Baseline test asserts post-regen fingerprint match.
- **Docs**: `docs/tools/tag.md` (new) published in same commit. Tool-docs registry test auto-asserts existence.

## References

- [.specify/memory/constitution.md](../../.specify/memory/constitution.md) — v1.5.0 (unchanged by this BI).
- [.decisions/ADR-010 - Typed Tool Names Mirror Upstream CLI Subcommand.md](../../.decisions/) — enforced (tool name `tag`).
- [.architecture/Obsidian CLI MCP - Architecture.md](../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) — canonical forward-going architecture document. Rolled forward in this plan run to reference `tag` as the sixth eval-cohort member AND the first tag-index primitive (NOT plugin-backed).
- Predecessor cohort members (all eval-driven):
  - BI-014 `find_by_property` ([specs/014-find-by-property/](../014-find-by-property/))
  - BI-015 `read_heading` ([specs/015-read-heading/](../015-read-heading/))
  - BI-025 `links` ([specs/025-list-links/](../025-list-links/))
  - BI-026 `smart_connections_similar` ([specs/026-smart-connections-similar/](../026-smart-connections-similar/))
  - BI-027 `smart_connections_query` ([specs/027-smart-connections-query/](../027-smart-connections-query/))
- Shared module consumed: [src/tools/_eval-vault-closed-detection/](../../src/tools/_eval-vault-closed-detection/) (BI-026 origin, BI-027 lift, BI-028 third consumer).
