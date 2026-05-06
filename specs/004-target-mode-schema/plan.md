# Implementation Plan: Target Mode Schema Primitives

**Branch**: `004-target-mode-schema` | **Date**: 2026-05-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [specs/004-target-mode-schema/spec.md](./spec.md)

## Summary

Introduce a new shared schema-primitive module at [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) (with co-located vitest at [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts)) that exports the zod discriminated-union `target_mode` contract committed to in [ADR-003](../../.decisions/ADR-003%20-%20Enforce%20Target%20Mode%20in%20Typed%20Tools.md). Spec Clarification 2026-05-06 Q1 specified three schemas as the public surface; plan-stage analysis surfaced a zod-3 type-system constraint that required a small expansion to **ten exports total** to make Pattern (b) actually work (see research.md P4 + the Q1 amendment in spec.md): five schemas (`targetModeSpecificBaseSchema`, `targetModeActiveBaseSchema`, `targetModeSpecificSchema`, `targetModeActiveSchema`, `targetModeSchema`), two refinement helpers (`applyTargetModeSpecificRefinement`, `applyTargetModeActiveRefinement`), and three inferred types (`TargetModeSpecific`, `TargetModeActive`, `TargetMode`). Pattern (a) consumers (uniform extension across both branches) intersect the union via `targetModeSchema.and(z.object({...}))` — one line. Pattern (b) consumers (per-branch divergent fields) `.extend()` the BASE schemas, re-apply the corresponding refinement helper, then re-build their own `z.discriminatedUnion` — still concise because the helpers wrap the verbose `.superRefine` body. Per Clarification Q2, the active-mode forbidden-key error messages are custom prose that name the offending key AND identify "active mode" but contain no recovery directives — recovery guidance lives in `docs/tools/*.md` (BI-030) and per-tool MCP tool descriptions, not in the shared primitive. The primitive is **internal**: not registered as an MCP tool, makes no CLI calls, performs no filesystem access, and has no `inputSchema` of its own at the MCP boundary. It is a pure validation building block. Sixteen co-located vitest cases (per FR-012) drive every Story 1–3 acceptance scenario through `safeParse`; Story 4 type assertions are expressed inline via vitest's `expectTypeOf`. The Constitution's Principles I (single-purpose module), II (co-located tests covering happy + failure + boundary paths), III (zod is the single source of truth, types via `z.infer`), and V (original-contribution headers) all bind `Y`; Principle IV is `N/A` since the primitive makes no upstream calls that can produce errors. The plan resolves five plan-stage decisions deferred from the spec (module path, exact zod API for both refinements, exact export names + the necessary expansion to ten exports for Pattern (b) compatibility, type-system test mechanism) in the Phase 0 Research section below.

## Technical Context

**Language/Version**: TypeScript 5.6+ in strict mode; runtime Node.js >= 22.11 (LTS floor per constitution). Same as 001/002/003.

**Primary Dependencies**: No new runtime dependencies. The primitive uses only existing project deps: `zod` ^3.23.8 (constitutionally mandated as the boundary validator) and `zod-to-json-schema` ^3.23.5 (for the FR-006 round-trip assertion in tests; downstream typed-tool BIs use it for their MCP `inputSchema` registration). Vitest ^4.1.5 + `@vitest/coverage-v8` ^4.1.5 continue as the test framework (per constitution v1.1.0).

**Storage**: N/A. The primitive is stateless — no module-level state; each `safeParse` / `parse` call is independent.

**Testing**: Vitest, co-located `*.test.ts` per Principle II. Sixteen runtime cases at [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) per FR-012: six from Story 1 (specific-mode validation), five from Story 2 (active-mode validation + invalid discriminator), five from Story 3 (composition Pattern (a) AC#1–4 + Pattern (b) AC#5). Story 4's three type-narrowing scenarios are expressed via vitest's built-in `expectTypeOf` (no runtime cost — `expectTypeOf` compiles to no-op at runtime; failures surface at compile time and at vitest test-collection time). The vitest aggregate statements coverage floor (84.3% per [vitest.config.ts](../../vitest.config.ts), pinned by feature 002 and reaffirmed by 003) MUST not regress — FR-013 mandates this. The new module + 16 tests are net-additive and exhaustively exercise the schema's branches; pre-implementation projection is the actual statements coverage moves up by ≥ 0.4 pp.

**Target Platform**: Windows host (per [CLAUDE.md](../../CLAUDE.md) and the 001/002/003 baselines). The primitive is platform-agnostic — no `process`, `fs`, `child_process`, or path-handling code lives in it (FR-009 forbids those imports). Tests run cross-platform under vitest.

**Project Type**: Single library (Node.js MCP server). Same as 001/002/003.

**Performance Goals**: O(N) over the input record's key count for the active-mode forbidden-key check, O(1) for the discriminator lookup, O(1) for the specific-mode "exactly one of" refinement. Both refinements are constant-time over the field set; total parse cost is bounded by zod's intrinsic dispatch overhead (~µs per call). Below the noise floor relative to the LLM round-trip latency the typed tools sit behind.

**Constraints**: No CLI invocation, no filesystem access, no network calls, no logger. The module is a pure schema definition + zod refinements + type re-exports. FR-009 enforces this via an SC-008 grep-mechanical assertion against the source file's import statements.

**Scale/Scope**: Three exported schemas + three exported `z.infer`-derived types + (optionally) one literal-union type for the discriminator value set. ≲ 60 LOC source, ≲ 220 LOC tests including the 16 acceptance scenarios, the 13 edge cases from the spec's Edge Cases section, and the four `expectTypeOf` assertions for Story 4. The first typed-tool BI (e.g., `read_note`) will be the empirical validator of the composability story per spec Assumptions row 14.

No `NEEDS CLARIFICATION` items remain — the spec's Clarification 2026-05-06 session pinned the two highest-impact decisions (composition export shape, error-message specificity), and the four remaining plan-stage deferrals (module path, exact zod API for the two refinements, exact export names, type-system test mechanism) are resolved in [research.md](./research.md) below.

**Plan-stage decisions resolved during this Phase 0** (see [research.md](./research.md) for full rationale):

- **P1 (FR-001, module path)**: `src/target-mode/target-mode.ts` and `src/target-mode/target-mode.test.ts`. Matches the per-surface module-layout convention (parallel to `src/cli-adapter/`). No `src/schemas/` directory introduced — there is no other shared schema primitive yet to motivate one (YAGNI).
- **P2 (FR-004, active-mode forbidden-key zod API)**: `.superRefine()` on the active-branch z.object. `.superRefine()` lets the implementation iterate over the three forbidden keys with `Object.hasOwn(input, key)`, emit one zod issue per offender via `ctx.addIssue({ path: [key], message: <custom> })`, and produce per-key paths in the resulting `ZodError.issues`. `.refine()` rejected (single issue, single path); `.never().optional()` rejected (zod default messages don't satisfy Q2's two-semantic-element requirement without a verbose custom `errorMap`).
- **P3 (FR-003, "exactly one of" zod API)**: `.superRefine()` on the specific-branch z.object — same API as P2 for module-internal consistency. Issues are emitted with `path: []` (object-level) when both `file` and `path` are missing, and `path: ["file"]` + `path: ["path"]` (two issues) when both are present. Tests assert `.message` includes the literal phrase `"exactly one of"` (per the spec FR-003 recommendation, which this plan upgrades to a binding requirement for searchability).
- **P4 (FR-001/FR-010, export names + export-surface expansion)**: Spec Q1's three-export answer is correct as the *primary* surface but is incomplete — zod 3.x's `.extend()` is a `ZodObject` method, not a `ZodEffects` method, so per-branch divergent extension (Pattern (b)) cannot work if the per-branch exports are `ZodEffects`-wrapped (refined). Plan-stage upgrades the export count to **ten** so Pattern (b) is actually achievable: **five schemas** — `targetModeSpecificBaseSchema` (z.object, no refinement; Pattern (b) extension target), `targetModeActiveBaseSchema` (z.object, no refinement; Pattern (b) extension target), `targetModeSpecificSchema` (`base.superRefine(...)`, the canonical specific-branch parser; also a discriminated-union branch), `targetModeActiveSchema` (`base.superRefine(...)`, the canonical active-branch parser; also a discriminated-union branch), `targetModeSchema` (`z.discriminatedUnion("target_mode", [...])` over the two refined branches; the primary export); **two helper functions** — `applyTargetModeSpecificRefinement(s)` and `applyTargetModeActiveRefinement(s)` (each takes a ZodObject returned from `.extend()` and returns the refined ZodEffects, so Pattern (b) downstream tools can `.extend()` the base then `apply…Refinement` then re-build); **three inferred types** — `TargetModeSpecific`, `TargetModeActive`, `TargetMode` (the union). Naming: schemas in camelCase + `Schema` suffix matching [src/tools/obsidian_exec/schema.ts](../../src/tools/obsidian_exec/schema.ts) precedent; types in PascalCase matching project convention. The literal-union type for the discriminator value set is NOT exported separately — `TargetMode["target_mode"]` recovers it without a parallel declaration (Principle III: no parallel hand-written types). The expansion is propagated into the spec's Clarifications section as a Q1 amendment so all downstream readers see the same export inventory.
- **P5 (FR-012, type-system test mechanism)**: vitest's built-in `expectTypeOf` (from `vitest`'s `import { expectTypeOf } from "vitest"`). Compiles to no-op at runtime; type assertions surface at compile time AND at vitest test-collection time, integrated into the same dashboard as the runtime assertions. No separate `*.type.test.ts` file, no `// @ts-expect-error` dance for negative cases. Vitest 4.x (the project's pinned major) supports `expectTypeOf` natively.

**ADR-003 alignment**: [.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md](../../.decisions/ADR-003%20-%20Enforce%20Target%20Mode%20in%20Typed%20Tools.md) is the design decision this feature implements. The plan respects ADR-003's two-branch contract verbatim. No ADR amendment, no new ADR. The [Architecture document](../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) names BI-029 as the implementation of this primitive; this feature IS BI-029.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | How this plan satisfies it |
|-----------|-------|----------------------------|
| **I. Modular Code Organization** | Y | One new module at [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) with a single responsibility — define, refine, and export the `target_mode` zod discriminated union and its inferred types. The `{schema, command, handler}` per-surface convention does not strictly apply: the module is a shared primitive (one of two existing shared primitives in the project, alongside the 003 cli-adapter), not a per-surface module — there is no `command.ts` or `handler.ts` to ship because the primitive is not a tool. Cross-module imports flow strictly downward: typed-tool schema → primitive → zod. The primitive MUST NOT import from `src/tools/*`, `src/cli-adapter/*`, `src/server.ts`, or `src/logger.ts` — that would invert the direction or introduce a runtime dependency the primitive doesn't need. SC-008 enforces this via grep. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | Y | The primitive is internal — it has no MCP tool surface of its own, so the strict "happy + failure-or-boundary" rule applies indirectly: every typed-tool consumer that lands later carries its own surface tests, AND the primitive itself has its own co-located test set covering all reachable code paths. FR-012 mandates 16 runtime vitest cases at [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) — six Story 1 (specific-mode happy + failures), five Story 2 (active-mode happy + failures + invalid discriminator), five Story 3 (Pattern (a) AC#1–4 + Pattern (b) AC#5). Plus 13 supplementary cases for the spec's Edge Cases section. Plus three `expectTypeOf` assertions for Story 4. Total: 32 test bodies. The aggregate statements coverage floor (84.3% per FR-013) is the merge gate. |
| **III. Boundary Input Validation with Zod** | Y | This module IS a zod boundary primitive — it exists specifically to be the single source of truth for `target_mode` validation that every typed tool composes against. The schema is the canonical type per `z.infer`; FR-010 + SC-003 together enforce that no hand-written `interface TargetMode…` or `type TargetMode…` exists in this module or anywhere downstream that would re-declare the schema's shape. The primitive does not register as an MCP boundary itself (FR-008) — that is each typed tool's job — but it IS the boundary's implementation. Principle III is fully satisfied. |
| **IV. Explicit Upstream Error Propagation** | N/A | The primitive makes no upstream calls — no `child_process`, no `fs`, no network — so no `UpstreamError` is constructed by it. zod's own `ZodError` is what consumers receive on parse failure; that is the language-of-validation, not an upstream-system error. Per the constitution's principle text, Principle IV binds "Errors raised by upstream systems" — and there are none here. The PR's Constitution Compliance checklist will record `N/A` for Principle IV with the justification "pure validation primitive; no upstream system to error from" per FR-014. |
| **V. Attribution & Layered Composition Transparency** | Y | The new [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) and [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts) MUST carry `// Original — no upstream. <one-line description>.` headers per FR-011. No upstream code is lifted — the discriminated-union shape is derived from ADR-003 and the zod-refinement patterns are project-internal craft. The README's "Attributions" section is not gated by this feature (no upstream code introduced). |

**Technical Standards check** (from constitution's "Technical Standards & Stack Constraints" section):

| Standard | Compliance |
|----------|-----------|
| TypeScript strict, NodeNext, ES2024+, `tsc --noEmit` clean | No `tsconfig.json` changes. The new module + test typecheck against existing `zod` and `vitest` types only. |
| Node.js >= 22.11 in `engines.node` | No change. |
| `zod` is the only runtime input validator | Confirmed and reinforced — this primitive IS an exemplar of the principle. |
| `@modelcontextprotocol/sdk` sole MCP transport | N/A — no transport changes; primitive is not registered as an MCP tool (FR-008). |
| `citty` is the sole CLI parsing library | N/A — no CLI surface in this feature. |
| Vitest + `@vitest/coverage-v8`, `*.test.ts` co-located, statements threshold ratchets via single-source vitest.config.ts edit | Confirmed. FR-013 explicitly mandates the floor (84.3% per [vitest.config.ts](../../vitest.config.ts)) MUST not regress. No `branches`/`functions`/`lines`/`perFile` keys introduced. |
| `eslint` flat config, zero warnings; Prettier the formatter | Confirmed. |
| Dependencies justified | Zero new runtime or dev dependencies. `zod` and `zod-to-json-schema` are pre-existing. |

**Result**: All applicable principles (I, II, III, V) and technical standards satisfied. Principle IV is `N/A` with documented justification (no upstream system in scope). **No Complexity Tracking entries required.** Per FR-014, the per-PR Constitution Compliance checklist will be `Y / Y / Y / N/A / Y`.

**Post-Phase 1 re-check**: Phase 1 added [data-model.md](./data-model.md) (the three exported schemas + their inferred types + the `safeParse` outcome shapes), [contracts/target-mode.contract.md](./contracts/target-mode.contract.md) (the canonical interface contract for the three exports), and [quickstart.md](./quickstart.md) (eight verification scenarios). None introduce new modules, dependencies, or boundary surfaces beyond what this Constitution Check already covers — they document the same shapes from a different angle. Re-check result: **Principles I, II, III, V still `Y`; Principle IV still `N/A`; no Complexity Tracking entries needed.**

## Project Structure

### Documentation (this feature)

```text
specs/004-target-mode-schema/
├── plan.md                                      # This file (/speckit-plan command output)
├── spec.md                                      # /speckit-specify + 2 clarifications in 1 session on 2026-05-06
├── research.md                                  # Phase 0 output (this command)
├── data-model.md                                # Phase 1 output (this command)
├── quickstart.md                                # Phase 1 output (this command)
├── contracts/                                   # Phase 1 output (this command)
│   └── target-mode.contract.md                  # The primitive's three-schema interface contract (exports, refinement rules, composition patterns, test requirements)
├── checklists/
│   └── requirements.md                          # /speckit-specify quality checklist (already in tree)
└── tasks.md                                     # Phase 2 output (/speckit-tasks command — NOT created here)
```

### Source Code (repository root) — affected files

```text
obsidian-cli-mcp/
└── src/
    └── target-mode/                             # NEW directory
        ├── target-mode.ts                       # FR-001..FR-011: the primitive — three exported schemas (specific/active branches + discriminated union), three exported inferred types, two `.superRefine()` chains (specific-branch "exactly one of" rule, active-branch forbidden-key rule). Bears `// Original — no upstream.` header.
        └── target-mode.test.ts                  # FR-012: 16 runtime vitest cases (Story 1 ×6, Story 2 ×5, Story 3 ×5) + 13 supplementary edge cases + 3 `expectTypeOf` assertions (Story 4). Bears `// Original — no upstream.` header.
```

No edits to `README.md` (no new error code introduced — the primitive raises `ZodError` on parse failure, not `UpstreamError`; the README's error-codes table covers the eight `UpstreamError.code` values from features 001/002/003 unchanged). No edits to the canonical errors contract at [specs/001-add-cli-bridge/contracts/errors.contract.md](../001-add-cli-bridge/contracts/errors.contract.md). No edits to `src/server.ts` (FR-008: primitive is not an MCP tool). No edits to `src/logger.ts` (the primitive emits no log lines and references no `Logger.ErrorCode` member — same posture as 003 chose for the adapter).

ADR-003 already names this primitive's contract; no amendment required. The Architecture document already lists BI-029 as the implementation of this primitive; no amendment required.

**Structure Decision**: Same single-library MCP-server layout as 001/002/003, with one new top-level module directory under `src/`. The new `src/target-mode/` follows the project's per-surface layout (one source + one co-located test) with the same two intentional deviations from the `{schema, command, handler}` triplet as `src/cli-adapter/`: (a) no separate `schema.ts` because this module IS the schema, and (b) no `command.ts`/`tool.ts`/`handler.ts` because the primitive is not registered as an MCP tool (FR-008). The `contracts/` directory contains exactly one artifact (`target-mode.contract.md`) — there is no `errors.contract-patch.md` because no `UpstreamError.code` is introduced. The src tree gains exactly two new files; no existing source file is modified.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Principle IV's `N/A` status is documented by the principle's own text scope ("Errors raised by upstream systems") rather than a deviation; it is not a complexity entry. Table intentionally empty.
