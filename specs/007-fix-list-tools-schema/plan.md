# Implementation Plan: Fix `tools/list` Schema Validation

**Branch**: `007-fix-list-tools-schema` | **Date**: 2026-05-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-fix-list-tools-schema/spec.md`

## Summary

The published 0.1.6 package fails MCP `tools/list` validation because [src/tools/read_note/schema.ts:8-10](../../src/tools/read_note/schema.ts#L8-L10) feeds a `z.discriminatedUnion` straight into `zodToJsonSchema`, which renders a top-level `{ "anyOf": [...] }` — no `"type": "object"` at the root, which the MCP `Tool` definition requires (FR-001 / FR-002).

Per Clarifications 2026-05-06 Q1 (FR-002a), the published descriptor must expose the two-branch shape via a nested `oneOf` / `anyOf` *inside* a top-level object envelope — but does **not** need to encode the runtime XOR / forbidden-keys rules. The runtime validator (`targetModeSchema.parse`) remains the single source of truth.

**Technical approach**:
1. **Add a generic envelope helper** at [src/tools/_shared.ts](../../src/tools/_shared.ts) — `toMcpInputSchema(zodSchema)` — that runs `zodToJsonSchema` and, if the raw output lacks `"type": "object"` at the top level, wraps it inside an object envelope (`type: "object"`, `additionalProperties: true`, top-level `oneOf` carrying the original branches). Single-`z.object` schemas pass through unchanged.
2. **Apply the helper at the target-mode primitive** — export `targetModeJsonSchema = toMcpInputSchema(targetModeSchema)` from [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) so every consumer that re-exports / extends the primitive inherits the fix automatically (per the spec's "consumers must inherit automatically" edge case).
3. **Re-point read_note's published schema** at [src/tools/read_note/schema.ts](../../src/tools/read_note/schema.ts) to import `targetModeJsonSchema` instead of computing its own `zodToJsonSchema(...)`. Keeps Principle III's single-source-of-truth contract intact (the zod schema remains authoritative; the JSON Schema is mechanically derived).
4. **Add Invariant (c) to the existing `registry consistency` block** in [src/server.test.ts](../../src/server.test.ts#L166-L189) — for every registered tool, `inputSchema.type === "object"` at the top level. This generalises automatically to every future typed tool (FR-006 / SC-004).
5. **Bump version 0.1.6 → 0.1.7** in [package.json](../../package.json) (FR-007).

Zero runtime-behaviour changes for `read_note`. Zero new error codes (FR-009). Zero changes to `targetModeSchema`'s zod runtime API (FR-004). Wire-level argument shapes are unchanged (FR-005).

## Technical Context

**Language/Version**: TypeScript 5.x, strict mode, `tsc --noEmit` clean. Constitution-mandated baseline.
**Primary Dependencies**: `@modelcontextprotocol/sdk` ^1.0.4 (MCP transport), `zod` (boundary validation, Principle III), `zod-to-json-schema` (JSON Schema rendering — already a dep, used at [src/tools/read_note/schema.ts:2](../../src/tools/read_note/schema.ts#L2) and elsewhere).
**Storage**: N/A — pure code-side fix; no persistent state involved.
**Testing**: `vitest` with `@vitest/coverage-v8`, co-located `*.test.ts` files (Constitution Principle II + Technical Standards). The merge-gating command is `vitest run`; coverage threshold lives in `vitest.config.ts`.
**Target Platform**: Node.js >= 22.11 LTS, Windows / macOS / Linux. Same as the rest of the project; the fix is platform-agnostic.
**Project Type**: Single project (CLI + MCP server in one TypeScript package). Fits Option 1 from the plan template.
**Performance Goals**: N/A — the helper runs once per tool registration (server boot), not per request. Boot-time cost is negligible.
**Constraints**:
  - **FR-002a binding**: published descriptor MUST be `{ type: "object", ..., oneOf | anyOf: [<branches>], additionalProperties: true }` (or a subset thereof for non-discriminated tools). Top-level `type === "object"` is non-negotiable.
  - **FR-004 binding**: `targetModeSchema`'s public runtime API surface (zod type, `parse` behaviour, inferred TS type, current export points) is frozen.
  - **Principle III binding**: published JSON Schema MUST be derived from the zod schema, not hand-written. Rules out the "hand-craft a parallel JSON Schema" tactic.
**Scale/Scope**: ≤ ~100 LOC added across 3 source files (helper + helper test + target-mode export + 1 test invariant), plus the version bump. No new modules created.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Compliance | How |
|---|-----------|------------|-----|
| I | Modular Code Organization | ✅ | Helper lives in [src/tools/_shared.ts](../../src/tools/_shared.ts) — already the canonical home of cross-tool shared utilities (`RegisteredTool`, `asToolError`). No new module created; no upward / cyclic imports introduced. The `target-mode` primitive's new companion export sits next to `targetModeSchema` in the same single-purpose module. |
| II | Public Surface Test Coverage | ✅ | `toMcpInputSchema` gets co-located tests at `src/tools/_shared.test.ts` (NEW file — covers the existing un-tested helpers in `_shared.ts` *plus* the new envelope helper). Co-located `target-mode.test.ts` extends to cover `targetModeJsonSchema`'s shape. The registry-consistency block in [src/server.test.ts](../../src/server.test.ts) gains Invariant (c). The `read_note` tool's existing tests are unchanged (no behavioural drift to test). Happy + boundary cases covered for every modified surface. |
| III | Boundary Input Validation with Zod | ✅ | `targetModeSchema` (the runtime zod) remains the single source of truth. The published JSON Schema is **mechanically derived** from it via `zodToJsonSchema` + the envelope helper — no parallel hand-written shape. The constitution's anti-drift clause ("redefining the same shape … is a violation") is satisfied because the helper consumes the zod schema directly. |
| IV | Explicit Upstream Error Propagation | ✅ N/A in spirit | The fix introduces zero new error codes (FR-009). The runtime error path through `UpstreamError` is not touched. The helper itself can throw a TypeError on a malformed input but that is a developer-time bug, not a user-surface error. |
| V | Attribution & Layered Composition Transparency | ✅ | All modified files already carry `// Original — no upstream.` headers; no upstream lineage is added by this fix. The new `_shared.test.ts` file gets the same header. |

**Coverage gate**: The new code paths come with tests; statements coverage should not regress. If `vitest run --coverage` reports a drop, the threshold in `vitest.config.ts` stays as-is (the gate ratchets upward, not downward, per Development Workflow #5).

**No Constitution Compliance violations to track. Complexity Tracking section is empty by design.**

## Project Structure

### Documentation (this feature)

```text
specs/007-fix-list-tools-schema/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # /speckit-specify + /speckit-clarify output
├── research.md          # Phase 0 output (this command)
├── data-model.md        # Phase 1 output (this command) — schema shapes only; no entities
├── quickstart.md        # Phase 1 output (this command) — verification scenarios
├── contracts/
│   └── envelope-helper.contract.md   # Phase 1 output — toMcpInputSchema interface contract
├── checklists/
│   └── requirements.md  # /speckit-specify output
└── tasks.md             # /speckit-tasks output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── target-mode/
│   ├── target-mode.ts            # MODIFIED — adds `targetModeJsonSchema` companion export.
│   └── target-mode.test.ts       # MODIFIED — extends with `targetModeJsonSchema` shape assertions.
├── tools/
│   ├── _shared.ts                # MODIFIED — adds `toMcpInputSchema(zodSchema)` helper.
│   ├── _shared.test.ts           # NEW — co-located tests for `toMcpInputSchema` (and the existing `asToolError`).
│   └── read_note/
│       └── schema.ts             # MODIFIED — re-exports `targetModeJsonSchema` instead of computing its own JSON Schema.
├── server.test.ts                # MODIFIED — adds Invariant (c) to `registry consistency` block.
└── (all other src/ files unchanged)

package.json                       # MODIFIED — version 0.1.6 → 0.1.7.
```

**Structure Decision**: Single-project TypeScript layout per Constitution Principle I and the existing repo convention. All test files are co-located with their source per Principle II ([src/tools/_shared.test.ts](../../src/tools/_shared.test.ts) is created NEW because [src/tools/_shared.ts](../../src/tools/_shared.ts) currently lacks co-located tests — that gap is fixed in this change since the file is being modified). The fix touches exactly four source files plus `package.json`; no new modules, no new top-level directories.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

(Empty — Constitution Check above passes all five principles with no deviations.)
