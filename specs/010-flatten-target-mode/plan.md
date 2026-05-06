# Implementation Plan: Flatten `targetModeSchema` and Retire the Wrap-Branch Envelope Helper

**Branch**: `010-flatten-target-mode` | **Date**: 2026-05-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/010-flatten-target-mode/spec.md`

## Summary

`@marwansaab/obsidian-cli-mcp@0.2.1` (feature 009) ships a working compatibility shim — ~140 lines of envelope synthesis in [src/tools/_shared.ts](../../src/tools/_shared.ts) (wrap branch, `oneOf` rewrite, top-level `properties` union, top-level `required` intersection, Pattern (a) `allOf` walking, leaf widening with cross-branch string-discriminator surfacing) plus a three-group drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts) — to bridge `targetModeSchema`'s `ZodEffects<ZodDiscriminatedUnion>` shape through the zod → JSON Schema → MCP `inputSchema` pipeline. The shim is correct and shipping. This feature deletes it by changing the input shape.

**The fix is to re-encode `targetModeSchema` as a flat `z.object({...}).strict().superRefine(...)`** — same per-mode rules, same accepted/rejected inputs, same `VALIDATION_ERROR` payload semantics — and let `zodToJsonSchema` emit the natural single-flat-object output that satisfies every observed MCP client class directly. Per clarification C7 + research R2, the encoding splits across two exports plus a helper: a bare `targetModeBaseSchema` (`ZodObject`, composable via `.extend({...})` — research R2 establishes `.extend()` as canonical because `.merge()` resets `unknownKeys` to `"strip"`), an `applyTargetModeRefinement` helper that attaches the per-mode rules to any extended base, and the canonical refined `targetModeSchema = applyTargetModeRefinement(targetModeBaseSchema)`. Pattern (a) consumers do `applyTargetModeRefinement(targetModeBaseSchema.extend({...}))`; Pattern (b) is removed from the canonical roster (clarification C4).

**Technical approach** (substantive deletions plus narrowly-targeted additions):

1. **Rewrite [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts)** to the flat encoding. Three exports survive: `targetModeBaseSchema`, `applyTargetModeRefinement`, `targetModeSchema`. Six exports delete per FR-017: `targetModeSpecificBaseSchema`, `targetModeActiveBaseSchema`, `targetModeSpecificSchema`, `targetModeActiveSchema`, `applyTargetModeSpecificRefinement`, `applyTargetModeActiveRefinement`. The `refineSpecificBranch` / `refineActiveBranch` private functions inline into the `applyTargetModeRefinement` body (a single `superRefine` dispatcher branching on `input.target_mode`). The `TargetMode` type flattens to `{ target_mode: "specific" | "active"; vault?: string; file?: string; path?: string }` (no index signature — `.strict()` omits it).

2. **Delete the wrap branch in [src/tools/_shared.ts](../../src/tools/_shared.ts)**. `toMcpInputSchema` shrinks from 285 lines (wrap branch + `unionTopLevelProperties` + `intersectionTopLevelRequired` + `stripInnerObjectType` + comments) to a one-line delegate `return zodToJsonSchema(zodSchema, { $refStrategy: "none" }) as JsonSchemaObject`. The `RegisteredTool` types, `asToolError`, and `JsonSchemaObject` interface survive verbatim. Target post-feature: ~75 LOC (SC-007).

3. **Delete the wrap-branch tests in [src/tools/_shared.test.ts](../../src/tools/_shared.test.ts)**. Six cases delete (the wrap-branch behaviours: anyOf-to-oneOf rewrite, inner-type strip, top-level properties union, required intersection, Pattern (a) allOf walking, $schema preservation). One case survives (no-op for flat z.object input — now the only branch). The `asToolError` and `JsonSchemaObject` cases survive.

4. **Consolidate the drift detector at [src/tools/_register.test.ts](../../src/tools/_register.test.ts)** from three groups to one. Group 1 (unit-layer registry walk) survives in simplified form. Group 2 (SDK round-trip) survives as a single `it.each` over the same invariants. Group 3 (Pattern (a)/(b) synthetic fixtures) deletes — Pattern (b) fixture is gone outright (FR-009); Pattern (a) fixture is rewritten using the flat-extension idiom `applyTargetModeRefinement(targetModeBaseSchema.extend({ note_text: z.string() }))` and folded into Group 1's invariant table. Per-tool invariants pin `additionalProperties: false` for `read_note` (FR-006). Target post-feature: ~270 LOC (SC-008, down from 473).

5. **Update [src/tools/read_note/handler.ts](../../src/tools/read_note/handler.ts)** with `input.vault!` non-null assertion + single-line comment naming the `superRefine` runtime invariant (clarification C1). Two-line edit (one for the assertion, one for the comment).

6. **Migrate the six existing per-mode-export-consuming test cases in [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts)** to call `targetModeSchema` directly with the matching `target_mode` literal. Rule-semantics assertions preserved verbatim per FR-003. The other 25 cases pass without modification.

7. **Amend ADR-003 in place** ([.decisions/ADR-003 - Enforce Target Mode in Typed Tools.md](../../.decisions/ADR-003%20-%20Enforce%20Target%20Mode%20in%20Typed%20Tools.md)). Line 20 wording changes from "discriminated union" to "flat `z.object` with a `superRefine`". Bump `updated:` frontmatter to `2026-05-07`. Add an "Amendment 2026-05-07" stanza at the bottom recording why the encoding changed (publication-pipeline simplification per feature 010). Rationale, Status, and Consequences sections preserved verbatim. NO new ADR (clarification C5).

8. **Bump version 0.2.1 → 0.2.2** in [package.json](../../package.json) and add a `0.2.2` entry to [CHANGELOG.md](../../CHANGELOG.md). The entry names the simplification, credits feature 009 as the predecessor that shipped the working shim, notes the new flat-extension pattern, and explicitly flags the strict-mode behaviour change carved out by FR-002 (clarification C3) — unknown top-level keys now produce `VALIDATION_ERROR` at parse time instead of being silently passed through.

9. **Manual verification (out of CI)**: drive Cowork (strict-naive) and Claude Desktop (strict-rich, MCP SDK-shape) through `tools/list` → `read_note({ target_mode: "specific", vault, path })` → `read_note({ target_mode: "active" })` against a real Obsidian vault. Verify the wire descriptor is the post-010 flat shape (no `oneOf`/`allOf`/`anyOf`). Record the two passing scenarios in the `0.2.2` release notes (SC-001 / SC-002 / SC-003).

Zero new error codes (FR-010). Zero new ADRs (SC-013; ADR-003 amended in place). Zero changes to the 008-refactor surface outside of `target-mode.ts` and `_shared.ts` (FR-016) — `dispatchCli`, `invokeCli`, `invokeBoundedCli`, the in-flight registry, the four-priority error classification, the always-on bounds, `assertToolDocsExist`, and the `obsidian_exec` argv-assembly contract are all frozen. The fix is a NET deletion: ~140 LOC removed from `_shared.ts`, ~200 LOC removed from `_register.test.ts`, ~60 LOC removed from `target-mode.ts` (six exports going away outweigh the new helper), plus ~5 LOC added to `read_note/handler.ts`, ~5 LOC for the version bump and changelog, and ~10 LOC for the ADR-003 amendment.

## Technical Context

**Language/Version**: TypeScript 5.6.x, strict mode, `tsc --noEmit` clean. Same as features 008 / 009.
**Primary Dependencies**: `@modelcontextprotocol/sdk` ^1.0.4 (MCP transport — lockfile-resolved 1.29.0). `zod` ^3.23.8 (boundary validation — Principle III; the flat-object + `.strict()` + `.superRefine` pattern is its primary supported shape, see research R2). `zod-to-json-schema` ^3.23.5 (lockfile-resolved 3.25.2; emits `{ type: "object", properties: {...}, required: [...], additionalProperties: false }` for `ZodEffects<ZodObject>` over a `.strict()` `ZodObject`, see research R1).
**Storage**: N/A — no persistent state.
**Testing**: `vitest` with `@vitest/coverage-v8`, co-located `*.test.ts` files (Constitution Principle II). The merge-gating command is `vitest run`; coverage threshold lives in `vitest.config.ts`.
**Target Platform**: Node.js >= 22.11 LTS, Windows / macOS / Linux. Platform-agnostic.
**Project Type**: Single project (CLI + MCP server in one TypeScript package). Same as features 001–009.
**Performance Goals**: N/A — the publication pipeline runs once per tool registration (server boot), not per request. Boot-time cost shrinks (one `zodToJsonSchema` call vs. one call plus the wrap-branch synthesis).
**Constraints**:
  - **FR-001 binding**: `targetModeSchema` MUST be `ZodEffects<ZodObject>` over a `.strict()` `ZodObject` (the constructor-name predicate). Plan satisfies — `applyTargetModeRefinement(targetModeBaseSchema)` returns exactly that shape.
  - **FR-002 binding**: runtime semantics preserved EXCEPT for the deliberate strict-mode carve-out (unknown top-level keys → `VALIDATION_ERROR`). Plan satisfies — the per-mode rule bodies (`refineSpecificBranch`, `refineActiveBranch`) inline verbatim into the new `superRefine` dispatcher; `.strict()` adds the unknown-key rejection at the zod-parser level (zod issue code `unrecognized_keys`).
  - **FR-006 binding**: published `inputSchema` for `read_note` is a flat `{ type: "object", properties: { 4 keys typed }, required: ["target_mode"], additionalProperties: false }` with no `oneOf` / `allOf` / `anyOf`. Plan satisfies — `zodToJsonSchema` emits exactly this for the flat-strict-superRefine input (research R1).
  - **FR-007 binding**: `obsidian_exec`'s published shape unchanged. Plan satisfies — `obsidian_exec/schema.ts` is not touched; `_shared.ts` shrinkage doesn't affect the flat-`z.object` no-op path (which becomes the only path).
  - **FR-014 binding**: published JSON Schema mechanically derived from zod. Plan satisfies — the one-line `toMcpInputSchema` delegates to `zodToJsonSchema`; no parallel hand-written shape, no companion JSON Schema export.
  - **FR-016 binding**: 008-refactor surface frozen outside `target-mode.ts` and `_shared.ts`. Plan satisfies — `_register.ts` is unchanged structurally (one-line edit if `_shared.ts` becomes a one-line delegate, possibly inlined; otherwise zero changes); `dispatchCli`/`invokeCli`/`invokeBoundedCli`/registry/error-classification/bounds are not touched.
  - **Principle I binding**: `target-mode/` does not gain a dependency on `tools/`. Plan satisfies — the flatten is internal to `target-mode/target-mode.ts`; the new helper is consumed by `tools/read_note/index.ts` (downward import, already present).
  - **Principle II binding**: tests co-located. Plan satisfies — `target-mode.test.ts` ships with `target-mode.ts`; `_shared.test.ts` ships with `_shared.ts`; `_register.test.ts` ships with `_register.ts`.
  - **Principle III binding**: zod is the single source of truth. Plan reaffirms — the flatten makes the derivation TRIVIAL (one `zodToJsonSchema` call, no envelope synthesis layer).

**Scale/Scope**: NET ~400 LOC deletion (~140 from `_shared.ts` + ~200 from `_register.test.ts` + ~60 from `target-mode.ts` minus ~30 new for the helper) + ~25 LOC additions (handler.ts assertion + comment, ADR-003 amendment stanza, package.json bump, CHANGELOG entry). The flatten is the largest standing single-feature deletion in the project's history; that's the point.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Compliance | How |
|---|-----------|------------|-----|
| I | Modular Code Organization | ✅ | The flatten stays at the `target-mode/` layer; the wrap-branch deletion stays at `tools/_shared.ts`. No new modules. No upward imports introduced — `target-mode/` does not gain a dependency on `tools/`. The new `applyTargetModeRefinement` helper is co-located with `targetModeBaseSchema` in [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts), the canonical home of the primitive. The drift-detector consolidation stays in [src/tools/_register.test.ts](../../src/tools/_register.test.ts). |
| II | Public Surface Test Coverage | ✅ | Every modified surface ships its tests in the same change: (a) `target-mode.ts` (flat schema + base + helper) — `target-mode.test.ts` updated, 25 cases pass without modification, 6 migrated to call `targetModeSchema` directly with the matching `target_mode` literal; helper happy-path + boundary case added (covers Pattern (a) extension + the dispatcher behaviour for both modes); (b) `_shared.ts` (wrap branch deleted) — `_shared.test.ts` updated, 6 wrap-branch cases delete, 1 no-op case survives, `asToolError` + `JsonSchemaObject` cases survive; (c) `_register.test.ts` (drift detector consolidated) — three groups collapsed to one, Pattern (a) fixture rewritten using flat-extension idiom; (d) `read_note/handler.ts` (one-line non-null assertion edit) — covered by existing handler tests, no new cases needed since runtime behaviour is unchanged. The flat schema's strict-mode behaviour change adds one new boundary case in `target-mode.test.ts` covering "unknown top-level key produces `VALIDATION_ERROR` with `code: 'unrecognized_keys'`." |
| III | Boundary Input Validation with Zod | ✅ | The flat encoding REAFFIRMS Principle III by making the publication-pipeline derivation trivial. `targetModeSchema` (the runtime zod) remains the single source of truth (FR-002 / FR-014). The published JSON Schema is now mechanically derived via a one-line `zodToJsonSchema` delegate — no parallel hand-written shape, no envelope helper, no companion JSON Schema export. The constitution's anti-drift clause is satisfied trivially: the flat schema's `properties` map IS the published `properties` map (no synthesis layer between them). |
| IV | Explicit Upstream Error Propagation | ✅ N/A in spirit | Zero new error codes (FR-010). The runtime error path through `UpstreamError` and `VALIDATION_ERROR` is preserved; the per-issue path/code/message contract per FR-002 is unchanged for documented inputs. The strict-mode carve-out adds zod's existing `unrecognized_keys` issue code (not a new project error code) at the parse boundary; downstream `UpstreamError` propagation is untouched. |
| V | Attribution & Layered Composition | ✅ | All modified files already carry `// Original — no upstream.` headers (verified in [src/target-mode/target-mode.ts:1](../../src/target-mode/target-mode.ts#L1), [src/tools/_shared.ts:1](../../src/tools/_shared.ts#L1), [src/tools/_register.test.ts:1](../../src/tools/_register.test.ts#L1)). No new files; no new upstream lineage. The `// Original — no upstream.` header on `target-mode.ts` is preserved verbatim — the flatten is an internal re-encoding, not a derivation from another project. |

**Coverage gate**: The new code paths come with tests; statements coverage MUST not regress. The deletion of ~340 LOC of test code (wrap-branch tests + Pattern (b) fixture + Pattern (a) `allOf` fixture + the per-mode-export tests that consume the deleted exports) plus ~140 LOC of source code shrinks both the numerator (covered statements) and the denominator (total statements). The post-feature aggregate statements coverage is projected to rise (less code, similar test thoroughness — the surviving tests cover the surviving code paths exhaustively because the surviving code is small enough to be exhaustively tested). The `vitest.config.ts` threshold ratchets upward in lock-step (one-line visible edit per the constitution's Development Workflow gate #5).

**No Constitution Compliance violations to track. Complexity Tracking section is empty by design.**

## Project Structure

### Documentation (this feature)

```text
specs/010-flatten-target-mode/
├── plan.md                              # This file (/speckit-plan output)
├── spec.md                              # /speckit-specify output
├── research.md                          # Phase 0 output (this command)
├── data-model.md                        # Phase 1 output — schema shapes; export inventory
├── quickstart.md                        # Phase 1 output — verification scenarios mapped to SC-001..SC-013
├── contracts/
│   ├── flat-target-mode.contract.md     # Phase 1 output — flat-schema export contract (SUPERSEDES feature 004's target-mode.contract.md)
│   └── drift-detector.contract.md       # Phase 1 output — consolidated post-010 drift-detector contract (SUPERSEDES feature 009's same-named contract)
├── checklists/
│   └── requirements.md                  # /speckit-specify output (deferred — generated on demand if /speckit-checklist invoked)
└── tasks.md                             # /speckit-tasks output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── target-mode/
│   ├── target-mode.ts                   # REWRITTEN — flat z.object().strict().superRefine(); 3 exports survive (base, helper, refined); 6 exports deleted; ~30 net LOC removed
│   └── target-mode.test.ts              # MODIFIED — 6 cases migrated to call targetModeSchema directly; 25 cases pass without modification; 1-2 new cases for the new helper + strict-mode boundary
├── tools/
│   ├── _shared.ts                       # SHRUNK — wrap branch deleted, helpers deleted; toMcpInputSchema becomes a one-line delegate (or deleted entirely if _register.ts inlines the call); ~140 LOC removed
│   ├── _shared.test.ts                  # SHRUNK — 6 wrap-branch cases deleted, 1 no-op case survives, asToolError + JsonSchemaObject cases survive
│   ├── _register.test.ts                # CONSOLIDATED — three groups collapsed to one; Pattern (b) fixture deleted; Pattern (a) fixture rewritten using flat-extension idiom; ~200 LOC removed
│   ├── read_note/
│   │   └── handler.ts                   # MODIFIED — `input.vault!` non-null assertion + single-line comment; 2-line edit
│   └── (all other tools/ files unchanged — obsidian_exec, help)
└── (all other src/ files unchanged — server.ts, errors.ts, cli-adapter/, queue.ts, logger.ts, etc.)

.decisions/
└── ADR-003 - Enforce Target Mode in Typed Tools.md   # AMENDED IN PLACE — line 20 wording change + Amendment 2026-05-07 stanza + updated frontmatter

CHANGELOG.md                              # MODIFIED — 0.2.2 entry above the 0.2.1 entry
package.json                              # MODIFIED — version 0.2.1 → 0.2.2
vitest.config.ts                          # MODIFIED (conditional) — coverage threshold ratchets upward in lock-step
```

**Structure Decision**: Single-project TypeScript layout per Constitution Principle I and the existing repo convention. All test files are co-located with the source they exercise (Principle II). The flatten touches exactly four source files (`target-mode.ts`, `_shared.ts`, `_register.test.ts` extension via consolidation, `read_note/handler.ts`), updates two config files (`package.json`, optionally `vitest.config.ts`), updates one decision record (`ADR-003`), and adds one CHANGELOG entry. No new test files, no new top-level directories.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

(Empty — Constitution Check above passes all five principles with no deviations. The flatten is a NET deletion that strengthens Principle III and reduces the surface area subject to Principles I/II.)
