# Implementation Plan: Add Context Search

**Branch**: `035-context-search` | **Date**: 2026-05-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/035-context-search/spec.md`

## Summary

Add a new typed-tool wrapper, `context_search`, around the native `obsidian search:context --format json` subcommand. The tool returns each match's vault-relative path, 1-based line number, and matching line text in a single call — collapsing the dominant "path-only search → per-file read → line locator" three-call grep pattern to one call.

The new tool is structurally parallel to the existing BI-033 `search` tool's line-mode branch (`useLines === true`). Two behavioural divergences from `search`:

1. **FR-013 folder-existence check**: missing-folder surfaces a structured `CLI_REPORTED_ERROR` (inherited from `_dispatch.ts:308-318` priority (c) catching upstream `Error: Folder "X" not found.` stdout) rather than `count=0`. Implemented as a post-empty probe via `obsidian folder` — only fires when `search:context` returns the zero-match sentinel AND `folder` was supplied.
2. **FR-012 CRLF strip**: each matching line's `text` field has a single trailing `\r` stripped before the 500-character cap is measured — eliminates Windows/macOS/Linux snapshot-test drift; preserves Markdown-significant whitespace.

The existing `search` tool's input schema, output schemas, and handler code are unchanged. The `search` help text is updated to mark `context_lines` as `deprecated — prefer the dedicated context_search tool` and to add a one-sentence cross-pointer. Full removal of `context_lines` is deferred to a future BI.

Zero new top-level error codes (Constitution Principle IV streak extends to the eighteenth tool). Zero new `details.code` values (ADR-015 N/A). Tool name `context_search` follows ADR-010 strict reversal of the composite `search:context` upstream subcommand (parallels `read_property` / `set_property`).

## Technical Context

**Language/Version**: TypeScript (strict mode), `tsc --noEmit` clean. ES2024 target per `tsconfig.json`.
**Primary Dependencies**: `zod` (boundary validation, Principle III); `@modelcontextprotocol/sdk` (MCP transport); inherited project infrastructure (`invokeCli` from `src/cli-adapter/`, `UpstreamError` from `src/errors.ts`, `registerTool` from `src/tools/_register.ts`, `Logger` + `Queue` injected via `ExecuteDeps`).
**Storage**: N/A (stateless wrapper; reads live vault state via `obsidian` CLI).
**Testing**: `vitest` with `@vitest/coverage-v8`. Co-located `*.test.ts` per Principle II (per-surface module layout). Mocked `invokeCli` is the single test seam (parity with BI-033 R12).
**Target Platform**: Node.js >= 22.11 (constitution-required floor); cross-platform Windows / macOS / Linux per the project's BI-017 cross-platform support.
**Project Type**: TypeScript library exposing an MCP server surface (single project; constitution v1.5.0 Section "Technical Standards & Stack Constraints").
**Performance Goals**: Single-CLI-call latency dominated by upstream `obsidian search:context` cost — typically <500ms for moderate vaults. Cold-error folder-not-found path adds one extra CLI call (`obsidian folder`) — ~50-100ms additional. No new performance gates introduced.
**Constraints**: 10-second `invokeCli` timeout per call (TYPED_TOOL_TIMEOUT_MS); 10 MiB output cap per call (TYPED_TOOL_OUTPUT_CAP_BYTES). Both inherited unchanged. The 500-char per-line text cap (FR-012) bounds output well below the 10 MiB ceiling on the happy path.
**Scale/Scope**: Single MCP tool wrapper (one `src/tools/context_search/` module with `{schema, index, handler}.ts` + co-located tests). Adds the eighteenth typed-tool registration. One help-content update for the new tool plus a documentation-only update on the existing `search` tool's help entry.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.5.0 (ratified 2026-05-03, last amended 2026-05-15) — five Principles + four ADR-gates. Pre-research evaluation per [research.md](research.md) "Constitution Compliance pre-evaluation" section:

| Gate | Status | Evidence |
|------|--------|----------|
| Principle I (Modular Code Organization) | **Y** | New `src/tools/context_search/` with `{schema, index, handler}.ts` + co-located tests. Imports flow one-directionally: `context_search/handler.ts → search/handler.ts` (re-uses `stripBoundarySlashes` helper, R6) and `context_search/handler.ts → search/schema.ts` (re-uses wire-shape `searchContextWireSchema`, R8). No upward / cyclic dependencies. |
| Principle II (Public Surface Test Coverage) | **Y** | New typed-tool surface ships with happy-path + failure-or-boundary tests co-located as `handler.test.ts` / `schema.test.ts` / `index.test.ts`. Test inventory in research R12 covers 8 BI-033-parity points + 4 BI-035-specific points (single-call vs two-call path correctness, CRLF strip variants, wire-shape staged-failure cases). |
| Principle III (Boundary Input Validation with Zod) | **Y** | Strict zod input schema `contextSearchInputSchema`. Single source of truth — `z.infer` for downstream types. Schema is the published MCP `inputSchema`. `.strict()` rejects unknown keys. `superRefine` enforces non-empty-post-trim on `query` (parity with `searchInputSchema`). |
| Principle IV (Explicit Upstream Error Propagation) | **Y** | Zero new top-level error codes. FR-013 folder-not-found inherits `CLI_REPORTED_ERROR` from the dispatch classifier (`_dispatch.ts:308-318`). FR-014 vault-not-found inherits `CLI_REPORTED_ERROR` from the cli-adapter classifier (`cli-adapter.ts:87-97`). Wire-parse / json-parse failures emit `CLI_REPORTED_ERROR(details.stage: ...)` parity with BI-033. The zero-new-codes streak extends to the eighteenth tool. |
| Principle V (Attribution & Layered Composition) | **Y** | All new source files carry `Original — no upstream.` headers per the project's convention. No upstream code is lifted (handler logic, while structurally parallel to BI-033, is the project's own code — not external). README's Attributions section unchanged. |
| ADR-010 (Typed Tool Names Mirror Upstream CLI Subcommand) | **Y** | Tool name `context_search` is the strict reversal of `obsidian search:context` (namespace `search`, action `context` → `<action>_<namespace>` = `context_search`). Parallels `read_property` (`property:read`) and `set_property` (`property:set`). See research R2 for the full ADR-010 application trace. |
| ADR-013 (Plugin-Namespace Tool Naming Convention) | **N/A** | Native-CLI wrapper; no plugin involvement. |
| ADR-014 (Plugin-Backed Typed Tools Runtime-Dependency Pattern) | **N/A** | Native-CLI wrapper; no plugin runtime-dependency lifecycle states. |
| ADR-015 (Sub-Discriminators via details.reason for Multi-State Error Codes) | **N/A** | No new `(top-level-code, details.code)` pair introduced. The folder-not-found path reuses `CLI_REPORTED_ERROR` with no `details.code` field at all (the dispatch classifier emits `details.message` carrying the upstream verbatim string). The vault-not-found path reuses the cli-adapter's inherited classifier. No multi-state-sub-discrimination is needed. |

All nine gates pass. **No Complexity Tracking entries required.** Post-design re-evaluation in [Phase 1 Outputs](#phase-1-outputs) confirms the gates remain satisfied — the design does not introduce any deviation from the pre-research baseline.

## Project Structure

### Documentation (this feature)

```text
specs/035-context-search/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — R1..R14 decisions, F1..F4 probes
├── data-model.md        # Phase 1 output — entity shapes, input/output schemas, wire shapes
├── quickstart.md        # Phase 1 output — caller-facing walkthroughs
├── contracts/           # Phase 1 output — zod schemas reflected as JSON-schema-style contracts
│   ├── input.md         # context_search input schema
│   ├── output.md        # context_search output schema
│   └── errors.md        # error envelope roster (inherited)
└── tasks.md             # Phase 2 output (/speckit-tasks command — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── _register.ts                       # MODIFY: add createContextSearchTool registration
│   ├── _register.test.ts                  # MODIFY: assert eighteenth tool registers
│   ├── _register-baseline.json            # MODIFY: add "context_search" to the FR-018 registry-stability baseline
│   ├── context_search/                    # NEW MODULE
│   │   ├── schema.ts                      # NEW: contextSearchInputSchema + contextSearchOutputSchema (zod)
│   │   ├── schema.test.ts                 # NEW: ~22 schema test cases (parity with search/schema.test.ts minus context_lines)
│   │   ├── handler.ts                     # NEW: executeContextSearch (two-call path for FR-013)
│   │   ├── handler.test.ts                # NEW: ~14 handler test cases (12 from BI-033 R12 + 4 BI-035-specific + CRLF variants)
│   │   ├── index.ts                       # NEW: createContextSearchTool factory + description
│   │   └── index.test.ts                  # NEW: registration smoke test (parity with search/index.test.ts)
│   ├── search/
│   │   ├── index.ts                       # MODIFY: SEARCH_DESCRIPTION gains the deprecation cross-pointer
│   │   ├── handler.ts                     # NO CHANGE
│   │   ├── schema.ts                      # NO CHANGE
│   │   └── *.test.ts                      # NO CHANGE (existing tests continue to pass)
│   └── help/
│       └── <content-file>                 # MODIFY: add context_search help block; mark search.context_lines deprecated
├── cli-adapter/                           # NO CHANGE (inherited)
├── errors.ts                              # NO CHANGE (zero new codes)
└── server.ts                              # NO CHANGE (createContextSearchTool wires through _register.ts unchanged)

specs/
└── 035-context-search/                    # this BI's docs (above)

.specify/
└── feature.json                           # ALREADY rotated to 035-context-search (post-scaffold commit a2c93de)

CLAUDE.md                                  # MODIFY at end of Phase 1: rotate plan reference to specs/035-context-search/plan.md
```

**Structure Decision**: single project (TypeScript MCP server). Selected because the constitution + every prior BI uses this structure; no app split, no monorepo. New tool slots into the existing `src/tools/` per-surface directory layout (Principle I `{schema, tool, handler}.ts` pattern, instantiated in this project as `{schema, index, handler}.ts` — `index.ts` is the per-tool factory entry, mirroring every other tool directory's shape).

## Implementation order (advisory; binding ordering lives in `tasks.md` produced by `/speckit-tasks`)

The plan recommends the following implementation order. The full dependency-ordered task list is produced by `/speckit-tasks`; the order below is a sketch for the reviewer.

1. **Schemas first** (`context_search/schema.ts` + `schema.test.ts`) — the input contract is the most-cited reference for handler tests. Test parity with `search/schema.test.ts` minus the `context_lines` field; +1 case for the output schema's `matches` shape with `truncated?: true` literal.
2. **Handler shell** (`context_search/handler.ts`) — single-call happy path first (zero new infrastructure); mock-based tests for the BI-033-parity points (R12 1-8).
3. **Handler extensions** — CRLF strip (R5) + post-empty folder-existence probe (R4). Tests for the four BI-035-specific points (R12 9-12) + CRLF variants.
4. **Registration** (`context_search/index.ts` + `_register.ts` modification + baseline JSON update). The `_register-baseline.json` change is the FR-018 lock that catches future drift in this name.
5. **Help-tool content** — new `context_search` help block; `search` help block deprecation marker on `context_lines` + cross-pointer.
6. **`search`'s `SEARCH_DESCRIPTION` constant** — one-line append referencing `context_search`. No other touches to `search`'s source.
7. **Quality gates** — `npm run lint`, `npm run typecheck`, `npm run build`, `vitest run`, coverage thresholds.

## Phase 0 outputs

[research.md](research.md) — 14 decisions (R1..R14) + 4 live-probe findings (F1..F4) + Constitution Compliance pre-evaluation + kernel-node graph-grounding analysis. Two spec corrections folded back into [spec.md](spec.md) (tool name; folder-existence-check mechanism).

## Phase 1 outputs

[data-model.md](data-model.md) — entity shapes, wire shapes, input/output zod-derived contracts, test inventory.

[contracts/input.md](contracts/input.md), [contracts/output.md](contracts/output.md), [contracts/errors.md](contracts/errors.md) — published-shape contracts for the MCP wire.

[quickstart.md](quickstart.md) — caller-facing walkthroughs (minimal happy path; folder-scoped; capped+truncated; folder-not-found error).

**Agent-context update** — [CLAUDE.md](../../CLAUDE.md) plan reference rotated from `specs/034-fix-unicode-lookups/plan.md` to `specs/035-context-search/plan.md` (between the `<!-- SPECKIT START -->` / `<!-- SPECKIT END -->` markers, or the equivalent project-specific location — the project's CLAUDE.md uses a direct `plan.md` reference at the top; rotation replaces that reference).

**Post-design Constitution Check** — re-evaluated after Phase 1 artifacts above. All nine gates still pass; no design step introduced any deviation. Specifically: (i) the data-model uses zod as the single source of truth (Principle III); (ii) contracts/ duplicates no shape that isn't already in zod (no drift hazard); (iii) the error envelope roster is verbatim the inherited cli-adapter envelopes (Principle IV zero-new-codes preserved); (iv) the new module's import direction stays one-way to existing modules (Principle I no cycles).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. All nine Constitution gates pass on both the pre-research and post-design evaluations. No `N` entries on the Compliance checklist; no Complexity Tracking rows.
