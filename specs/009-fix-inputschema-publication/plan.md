# Implementation Plan: Fix Empty Published `inputSchema` for `targetModeSchema` Consumers

**Branch**: `009-fix-inputschema-publication` | **Date**: 2026-05-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/009-fix-inputschema-publication/spec.md`

## Summary

`@marwansaab/obsidian-cli-mcp@0.2.0` ships `read_note` as a typed tool whose published `inputSchema` envelope is correct under the MCP SDK's `.catchall(z.unknown())` `Tool` validator (`{ type: "object", additionalProperties: true, oneOf: [<specific-branch>, <active-branch>], $schema }`) but fails when consumed by **strict-naive MCP clients** (e.g. Cowork) whose hand-rolled `Tool` schema validator strips unknown top-level keys (`oneOf`, `additionalProperties`) and surfaces the descriptor as `{ type: "object", properties: {} }`. The client then strips every outgoing argument against that hollow `properties: {}`, the runtime zod receives `{}`, and `read_note` returns `VALIDATION_ERROR` end-to-end.

**The fix is a shape WIDENING in `toMcpInputSchema`'s wrap branch** ([src/tools/_shared.ts](../../src/tools/_shared.ts#L100-L138)) — emit a top-level `properties` map (the union of every branch's top-level property names, leaf-`{}` widened) and a top-level `required` array (the intersection of every branch's required keys) ALONGSIDE the existing `oneOf`. Strict-naive clients read top-level `properties` and let property names through; strict-rich clients additionally read `oneOf` and apply per-branch constraints. The runtime zod (`targetModeSchema.parse`) remains the single source of truth for cross-field rules (XOR, forbidden-keys-in-active). See [research.md](research.md) decisions R1–R6 for the empirical evidence that contradicts the spec's working hypothesis (no `_shared.ts:102` predicate gap exists; the wrap branch is firing correctly today).

**Technical approach** (all changes additive — no public signature changes):

1. **Widen the wrap branch in [src/tools/_shared.ts](../../src/tools/_shared.ts)** to compute and emit top-level `properties` (union of branch top-level property names with `{}` leaf widening, except the `target_mode` discriminator which gets `{ type: "string" }`) and top-level `required` (intersection across branches). Handles `anyOf` / `oneOf` (Pattern (b) / re-export), `allOf` (Pattern (a) intersection — both arms walked), and the existing `stripInnerObjectType` per-branch normalization. R2 / R4 / R5.
2. **Add 4 co-located cases to [src/tools/_shared.test.ts](../../src/tools/_shared.test.ts)** covering: simple union, ZodEffects union (real `targetModeSchema`), Pattern (a) intersection, and the no-op branch (`obsidian_exec`-shape regression guard). R12.
3. **Extend the existing [src/tools/_register.test.ts](../../src/tools/_register.test.ts)** (created in feature 008 with `registerTool` + `assertToolDocsExist` tests) with new `describe` blocks: parameterised drift detector — registry walk via `createServer({ registerSignalHandlers: false })`; per-tool invariant case-table for `read_note` / `obsidian_exec` / `help`; in-process `InMemoryTransport` round-trip via `client.listTools()` to assert the SDK's wire output also satisfies the invariants; synthetic Pattern (a)/(b) fixtures registered through `registerTool` directly. R7 / R8.
4. **Bump version 0.2.0 → 0.2.1** in [package.json](../../package.json) and add a `0.2.1` entry to [CHANGELOG.md](../../CHANGELOG.md) (FR-011 / FR-012 / R10).
5. **Manual verification (out of CI)**: drive Cowork (strict-naive) and Claude Desktop (strict-rich, MCP SDK-shape) through `tools/list` → `read_note({ target_mode: "specific", vault, path })` → `read_note({ target_mode: "active" })` against a real Obsidian vault. Record the two passing scenarios in the `0.2.1` release notes (SC-001 / SC-002 / R9).

Zero changes to `targetModeSchema`'s zod runtime (FR-004). Zero new error codes (FR-010). Zero new ADRs (SC-008). Zero changes to the 008-refactor surface beyond `_shared.ts` (FR-016). The fix is structurally additive — the wrap branch's existing output keys (`type`, `oneOf`, `additionalProperties`, `$schema`) survive; new keys (`properties`, `required`) are added.

## Technical Context

**Language/Version**: TypeScript 5.6.x, strict mode, `tsc --noEmit` clean. Same as feature 008.
**Primary Dependencies**: `@modelcontextprotocol/sdk` ^1.0.4 (MCP transport — lockfile-resolved 1.29.0; `Tool.inputSchema` is `.catchall(z.unknown())` so the SDK preserves the wrap envelope verbatim, see [research.md](research.md) R1), `zod` ^3.23.8 (boundary validation — Principle III), `zod-to-json-schema` ^3.23.5 (lockfile-resolved 3.25.2; emits `{ anyOf: [...] }` for `ZodEffects<ZodDiscriminatedUnion>` at every reachable version, R1).
**Storage**: N/A — no persistent state.
**Testing**: `vitest` with `@vitest/coverage-v8`, co-located `*.test.ts` files (Constitution Principle II). The merge-gating command is `vitest run`; coverage threshold lives in `vitest.config.ts`.
**Target Platform**: Node.js >= 22.11 LTS, Windows / macOS / Linux. Platform-agnostic.
**Project Type**: Single project (CLI + MCP server in one TypeScript package). Same as features 001–008.
**Performance Goals**: N/A — the wrap-branch widening runs once per tool registration (server boot), not per request. Boot-time cost is bounded by the number of branches (today: 2 for `read_note`).
**Constraints**:
  - **FR-001 binding**: published `inputSchema` MUST expose `target_mode`, `vault`, `file`, `path` somewhere in its structure. Plan satisfies this AT TOP LEVEL (after R2 widening) AND inside `oneOf` branches.
  - **FR-005 binding**: `obsidian_exec`'s published shape (6 properties, `required: ["command"]`, `additionalProperties: false`) MUST not change. Plan satisfies this — flat-`z.object` schemas hit the no-op branch in `toMcpInputSchema` and are not touched by the widening.
  - **FR-009 binding**: published JSON Schema MUST be mechanically derived from zod. Plan satisfies — the helper consumes the zod schema directly via `zodToJsonSchema`; the widening is downstream of that single call.
  - **FR-013 binding**: `zodToJsonSchema` called exactly ONCE per registration. Plan satisfies — the wrap branch widens the existing `raw` output in-place (no second `zodToJsonSchema` call, no second `toMcpInputSchema` call from a different layer).
  - **Principle I binding**: `target-mode/` does not gain a dependency on `tools/`. Plan satisfies — fix is helper-only at `tools/_shared.ts`; `target-mode/` is untouched.
  - **Principle II binding**: tests co-located with the source they cover. Plan satisfies — `_shared.test.ts` and `_register.test.ts` updates ride alongside their respective source modules' edits in the same change.
**Scale/Scope**: ≤ ~60 new LOC in `_shared.ts` (the widening subroutines + the wrap-branch additions), ~80 LOC in `_shared.test.ts` (4 new cases), ~120 new LOC appended to the EXISTING `_register.test.ts` (parameterised drift detector + integration-layer round-trip + Pattern (a)/(b) synthetic fixtures — added as new `describe` blocks alongside feature 008's `registerTool` + `assertToolDocsExist` cases), ~5 LOC in `package.json` (version bump), ~12 LOC in `CHANGELOG.md` (0.2.1 entry).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Compliance | How |
|---|-----------|------------|-----|
| I | Modular Code Organization | ✅ | Fix is helper-only at [src/tools/_shared.ts](../../src/tools/_shared.ts) — already the canonical home of cross-tool shared utilities (`RegisteredTool`, `asToolError`, `toMcpInputSchema`). No new module created. The new internal subroutines (`unionTopLevelProperties`, `intersectionTopLevelRequired`, the discriminator-detection branch) are private functions in the same file. The drift detector extends the EXISTING [src/tools/_register.test.ts](../../src/tools/_register.test.ts) (created in feature 008 with `registerTool` + `assertToolDocsExist` tests) with new `describe` blocks; no new file is introduced. No upward imports introduced — `target-mode/` is not touched at all. |
| II | Public Surface Test Coverage | ✅ | `toMcpInputSchema` is the modified surface; its co-located test file `_shared.test.ts` gets the 4 new cases (R12) covering simple union, ZodEffects union, Pattern (a) intersection, and the no-op branch regression guard. `registerTool`'s published-descriptor contract is the new behavioural surface; its co-located test file `_register.test.ts` (already in place from feature 008) gets new `describe` blocks for the drift detector (Group 1 unit-layer + Group 2 SDK round-trip + Group 3 Pattern (a)/(b) synthetic fixtures). Happy + boundary cases covered for every modified surface. |
| III | Boundary Input Validation with Zod | ✅ | `targetModeSchema` (the runtime zod) remains the single source of truth (FR-004 / FR-009). The published JSON Schema is **mechanically derived** from it via `zodToJsonSchema` + the widened envelope helper — no parallel hand-written shape, no companion JSON Schema export. The constitution's anti-drift clause ("redefining the same shape … is a violation") is satisfied because the widening operates on the helper's existing single `zodToJsonSchema` call result. |
| IV | Explicit Upstream Error Propagation | ✅ N/A in spirit | Zero new error codes (FR-010). The runtime error path through `UpstreamError` and `VALIDATION_ERROR` is not touched. The widening helper itself is no-throws (matches feature 007 P4 — malformed inputs yield a well-formed but possibly unhelpful envelope; not a runtime validator). |
| V | Attribution & Layered Composition | ✅ | All modified files already carry `// Original — no upstream.` headers (verified in [src/tools/_shared.ts:1](../../src/tools/_shared.ts#L1) and [src/tools/_register.ts:1](../../src/tools/_register.ts#L1)). The new `_register.test.ts` gets the same header. No upstream lineage is added. |

**Coverage gate**: The new code paths come with tests; statements coverage MUST not regress. The new test file (`_register.test.ts`) increases the test surface; its statement coverage of the new widening is ≥ 95% (the widening is a tight, branch-light algorithm).

**No Constitution Compliance violations to track. Complexity Tracking section is empty by design.**

## Project Structure

### Documentation (this feature)

```text
specs/009-fix-inputschema-publication/
├── plan.md                              # This file (/speckit-plan output)
├── spec.md                              # /speckit-specify output
├── research.md                          # Phase 0 output (this command)
├── data-model.md                        # Phase 1 output — schema shapes; no entities
├── quickstart.md                        # Phase 1 output — twelve verification scenarios
├── contracts/
│   ├── envelope-helper.contract.md      # Phase 1 output — widened toMcpInputSchema contract (SUPERSEDES feature 007's same-named contract)
│   └── drift-detector.contract.md       # Phase 1 output — parameterised drift-detector contract
├── checklists/
│   └── requirements.md                  # /speckit-specify output
└── tasks.md                             # /speckit-tasks output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── tools/
│   ├── _shared.ts                       # MODIFIED — wrap branch widened (R2 + R4 + R5); ~60 new LOC
│   ├── _shared.test.ts                  # MODIFIED — 4 new cases (R12); ~80 new LOC
│   ├── _register.test.ts                # MODIFIED — extends feature 008's existing test file with 3 new `describe` blocks (Group 1 unit-layer drift detector + Group 2 SDK round-trip + Group 3 Pattern (a)/(b) synthetic fixtures); ~120 new LOC appended
│   └── (all other tools/ files unchanged)
└── (all other src/ files unchanged — target-mode/, server.ts, errors.ts, etc.)

CHANGELOG.md                              # MODIFIED — 0.2.1 entry above the 0.2.0 entry
package.json                              # MODIFIED — version 0.2.0 → 0.2.1
```

**Structure Decision**: Single-project TypeScript layout per Constitution Principle I and the existing repo convention. All test files are co-located with the source they exercise (Principle II). The fix touches exactly three source files (`_shared.ts`, `_shared.test.ts`, `_register.test.ts` — the latter pre-existing from feature 008 and extended with new `describe` blocks) and updates two manifest files (`package.json`, `CHANGELOG.md`). No new test files, no new top-level directories. No `target-mode/` edits — feature 007's rejected helper-only argument is now empirically the right answer (R6).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

(Empty — Constitution Check above passes all five principles with no deviations.)
