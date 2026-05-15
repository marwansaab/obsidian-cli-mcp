# Implementation Plan: Extract Registration Stub Fixture

**Branch**: `031-extract-registration-fixture` | **Date**: 2026-05-15 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/031-extract-registration-fixture/spec.md`

## Summary

Extract the duplicated `makeStubSpawn()` helper currently declared in 17 `src/tools/*/index.test.ts` files into a single shared module at `src/tools/_registration-stub.ts`. Sixteen callers re-point to the shared module via a renamed import that preserves their existing call-site identifier (`makeStubSpawn`). The seventeenth caller (`obsidian_exec/index.test.ts`) keeps its extended local declaration verbatim and does NOT import from the shared fixture. The handler-layer `handler.test.ts` stubs (Family A) are out-of-scope and remain untouched.

The extraction is a mechanical refactor with three measurable surfaces: (1) the byte-distinct `makeStubSpawn` body count in the tree drops from five (the 788-byte template, the three 789-byte pid-only variants, and the 971-byte `obsidian_exec` variant) to two; (2) the vitest test inventory (file count, case count, case names, pass/fail outcomes) is byte-stable pre vs post; (3) the registry-stability baseline at `src/tools/_register-baseline.test.ts` continues to pass without regeneration because nothing about the tool descriptor / schema / registration order changes.

Two plan-stage decisions own the surface this BI delivers: **R1** locks the exact path within `src/` at `src/tools/_registration-stub.ts` (mirroring the existing `_register.ts` / `_register-baseline.ts` / `_shared.ts` underscore-prefix shared-support-module precedent — same directory level, same naming shape, same `// Original — no upstream.` header convention). **R2** locks the per-caller import shape at the renamed-at-import-site pattern (`import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js"`), which keeps every call-site identifier byte-stable and reduces the per-file diff to a deletion of the local function block plus a small set of now-unused-import cleanups (see R3).

## Technical Context

**Language/Version**: TypeScript 5.x, strict mode (`tsc --noEmit` clean is a constitutional gate per Constitution Workflow point 2)
**Primary Dependencies**: `vitest` (test runner + V8 coverage), `node:*` built-ins (`EventEmitter`, `Readable`, `child_process.SpawnOptions`) — all already in-tree and used by every consuming `index.test.ts` file today
**Storage**: N/A — no persistent state; the fixture is a pure factory function over in-process child-process stubs
**Testing**: `vitest run` (CI gate per constitution); co-located `_registration-stub.test.ts` will ship alongside the fixture per Principle II to document the contract (mirrors the `_register-baseline.ts` / `_register-baseline.test.ts` pairing precedent from BI-022)
**Target Platform**: Node.js >= 22.11 (per `engines.node` + Constitution Technical Standards); the fixture uses only Node-built-in primitives already in use by every existing `makeStubSpawn` body
**Project Type**: library/cli — the obsidian-cli-mcp MCP server; this refactor touches only its internal test infrastructure
**Performance Goals**: N/A — test-helper code, runs once per consuming test, no production hot path
**Constraints**: (a) the shared fixture MUST live inside `tsconfig.json`'s `rootDir: "src"` (R1 satisfies); (b) it MUST NOT match the vitest `test.include: ["src/**/*.test.ts"]` glob so it does not execute as a test itself (R1 satisfies — `_registration-stub.ts` has no `.test.ts` suffix); (c) including the new module under `coverage.include: ["src/**"]` MUST NOT push the `statements: 91.3` floor down (R5 verifies — the helper's statements are executed by every consuming test file at runtime, so they enter the numerator and denominator together; net impact on the metric is flat-to-positive); (d) `tsconfig`'s `noUnusedLocals: true` and `noUnusedParameters: true` force a now-unused-import cleanup per consuming file (R3 specifies the exact set)
**Scale/Scope**: 1 new source file (~30 LOC product + ~80 LOC co-located test); 16 modified `index.test.ts` files (each loses ~22 lines + 3-to-4 import lines, gains 1 import line); zero production-code touch; zero schema / handler / descriptor / docs / package.json edits beyond an optional CHANGELOG entry. No tool added; no error code added; no ADR amendment.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Verdict | Evidence |
|------|---------|----------|
| Principle I — Modular Code Organization | Y | One new module with a single responsibility (factory for a `SpawnLike` test stub). Import direction is downward only: `_registration-stub.ts` imports the `SpawnLike` type from `cli-adapter/_dispatch.js` (one layer below it); 16 caller test files at `src/tools/<name>/index.test.ts` import the factory from one layer up (`../_registration-stub.js`). No upward or cyclic dependencies. The module is module-private support code per the `_`-prefix convention. |
| Principle II — Public Surface Test Coverage (NON-NEGOTIABLE) | Y | No public MCP surface is added, renamed, or modified. The 16 consuming registration tests continue to exercise their respective tools' descriptors with byte-equivalent stubs; the registry-stability baseline at `src/tools/_register-baseline.test.ts` passes without regeneration. The new shared module is itself test infrastructure, but per the project's precedent (`_register-baseline.ts` + `_register-baseline.test.ts`) ships with a co-located unit test covering both happy-path invocation and a boundary case (negative exitCode, empty stdout — see R6). |
| Principle III — Boundary Input Validation with Zod | N/A | No new MCP boundary surface; no new validation point. The fixture's options bag is a TypeScript type, validated structurally by the compiler. |
| Principle IV — Explicit Upstream Error Propagation | N/A | No new error surface; no new `UpstreamError` code; no new `details.code` or `details.reason` discriminator. The fixteen-tool zero-new-top-level-codes streak is preserved trivially because no error path is touched. |
| Principle V — Attribution & Layered Composition Transparency | Y | The new module carries the project's `// Original — no upstream.` header per FR-009 (spec) and per the precedent set by every existing module in `src/tools/` and `src/cli-adapter/`. No upstream is being lifted. |
| ADR-010 — Typed Tool Names Mirror Upstream CLI Subcommand | N/A | No typed tool added, renamed, or modified. |
| ADR-013 — Plugin-Namespace Tool Naming Convention | N/A | No plugin-backed typed tool added, renamed, or modified. |
| ADR-014 — Plugin-Backed Typed Tools Runtime-Dependency Pattern | N/A | No plugin-backed typed tool added; no plugin-lifecycle error path introduced. |
| ADR-015 — Sub-Discriminators via details.reason for Multi-State Error Codes | N/A | No new `(top-level-code, details.code)` pair introduced; no new `details.reason` sub-state added to existing pairs. |

**Initial Constitution Check verdict: PASS.** All four N/A entries are paired with the appropriate "PR touches no surface this principle/ADR governs" rationale per the constitution's "Any `N` MUST be paired with..." prose. No Complexity Tracking entry is required.

## Project Structure

### Documentation (this feature)

```text
specs/031-extract-registration-fixture/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — R1..R7 plan-stage decisions
├── data-model.md        # Phase 1 output — fixture API shape, per-caller diff shape
├── quickstart.md        # Phase 1 output — Q-1..Q-N verification scenarios mapped to SC-001..SC-008
├── contracts/
│   └── registration-stub.contract.md  # Phase 1 output — module-private TypeScript contract
├── checklists/
│   └── requirements.md  # Already exists from /speckit-specify
├── spec.md              # Already exists from /speckit-specify
└── tasks.md             # Phase 2 output (NOT created by /speckit-plan)
```

### Source Code (repository root)

The refactor touches one new source file and 16 existing test files. The production-code surface (everything under `src/` not ending `.test.ts`, plus everything in `src/cli-adapter/`, plus `src/server.ts`, plus the tool factories at `src/tools/*/index.ts`, plus the schemas at `src/tools/*/schema.ts`, plus the handlers at `src/tools/*/handler.ts`) is **not modified**.

```text
src/
├── cli-adapter/
│   └── _dispatch.ts          # Source of the SpawnLike type that the new fixture imports — UNCHANGED
├── tools/
│   ├── _registration-stub.ts        # NEW — shared fixture, exports makeRegistrationStubSpawn(opts?)
│   ├── _registration-stub.test.ts   # NEW — co-located unit test, ~5-7 cases per Principle II
│   ├── _register.ts                 # Existing shared support module — UNCHANGED (precedent for _ prefix)
│   ├── _register.test.ts            # UNCHANGED (the durable invariants + baseline test)
│   ├── _register-baseline.{ts,test.ts,json} # UNCHANGED (registry-stability machinery)
│   ├── _shared.{ts,test.ts}         # UNCHANGED
│   ├── _eval-vault-closed-detection/ # UNCHANGED (BI-027/BI-029 shared module precedent)
│   ├── delete/index.test.ts         # MODIFIED — drop local makeStubSpawn, import fixture
│   ├── files/index.test.ts          # MODIFIED — drop local makeStubSpawn, import fixture
│   ├── find_by_property/index.test.ts # MODIFIED
│   ├── links/index.test.ts          # MODIFIED
│   ├── move/index.test.ts           # MODIFIED
│   ├── outline/index.test.ts        # MODIFIED
│   ├── properties/index.test.ts     # MODIFIED
│   ├── read/index.test.ts           # MODIFIED
│   ├── read_heading/index.test.ts   # MODIFIED
│   ├── read_property/index.test.ts  # MODIFIED
│   ├── rename/index.test.ts         # MODIFIED
│   ├── set_property/index.test.ts   # MODIFIED
│   ├── smart_connections_query/index.test.ts   # MODIFIED
│   ├── smart_connections_similar/index.test.ts # MODIFIED
│   ├── tag/index.test.ts            # MODIFIED
│   ├── tree/index.test.ts           # MODIFIED
│   └── obsidian_exec/index.test.ts  # UNCHANGED — local extended stub retained per FR-006
└── ... (everything else UNCHANGED)
```

**Structure Decision**: Use the existing `src/tools/_<name>.ts` shared-support-module convention (precedent: `_register.ts`, `_register-baseline.ts`, `_shared.ts`). The fixture lives at `src/tools/_registration-stub.ts` because (a) it is consumed by `src/tools/*/index.test.ts` only — no consumer outside the tools cohort; (b) the `_` prefix marks it as module-private support code distinct from registered tool surfaces; (c) the location satisfies all four constraints in Technical Context (`rootDir`, non-test, coverage-safe, type-resolution-safe).

## Phase 0: Outline & Research (deferred to `research.md`)

Seven plan-stage decisions R1..R7 will be documented in [research.md](research.md). They are listed here for traceability:

- **R1** — Shared fixture file path (locked at `src/tools/_registration-stub.ts`; alternative locations rejected with rationale).
- **R2** — Per-caller import shape (locked at `import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js"`; alternative shapes rejected).
- **R3** — Now-unused-import cleanup per caller (the spec's "one new import line" understates the actual diff; `noUnusedLocals: true` forces removal of `SpawnOptions`, `EventEmitter`, `Readable`, and the `SpawnLike` type-import from each consuming file). This decision documents the exact per-file editing protocol.
- **R4** — Fixture options shape (locked at `{ stdout?: string; exitCode?: number }` per FR-002; the `child.pid` literal divergence in five callers is absorbed via unification on `pid = 7`).
- **R5** — Coverage-floor impact analysis (the new module enters the coverage numerator AND denominator via the 16 consuming tests' runtime invocations; expected net effect on `statements: 91.3` is flat-to-positive; a numeric measurement post-implement confirms).
- **R6** — Co-located `_registration-stub.test.ts` shape (mirror `_register-baseline.test.ts`; ~5-7 cases covering: default invocation, opts.stdout only, opts.exitCode only, both fields, the `SpawnLike` shape contract, the setImmediate lifecycle order).
- **R7** — `obsidian_exec` carve-out treatment (NO refactor; FR-006 enforces local-declaration retention; documented in research with the multi-flag-bag rationale).

**Output**: research.md with R1..R7 each in Decision / Rationale / Alternatives Considered format.

## Phase 1: Design & Contracts

**Prerequisites**: research.md complete

1. **Data model** → [data-model.md](data-model.md):
   - The fixture's options shape (TypeScript-only, no zod — it is internal test infrastructure, not an MCP boundary).
   - The fixture's return type (the existing `SpawnLike` from `src/cli-adapter/_dispatch.ts`).
   - Per-caller diff template (before/after import block + removed function block, in the order the editing protocol will apply it).
   - The 16-caller table mapping each `src/tools/<name>/index.test.ts` to its current byte-distinct body class (788/e92c, 789/ae069, 789/f6753, 789/7841) so reviewers can verify the consolidation absorbed the right divergences.

2. **Interface contracts** → [contracts/registration-stub.contract.md](contracts/registration-stub.contract.md):
   - The fixture's TypeScript public-export signature.
   - The runtime invariants the returned `SpawnLike` MUST satisfy (child has stdout / stderr Readable streams; pid is set; kill returns true; the setImmediate ordering of stdout-push, null-push, exit-emit).
   - The test seam pattern: how each consumer instantiates and assigns the stub via the `spawnFn` dep.

3. **Quickstart** → [quickstart.md](quickstart.md):
   - Q-1..Q-N verification scenarios mapped to SC-001..SC-008. All scenarios are CI-runnable (no live-CLI probes needed because the refactor does not touch the binary surface — the `_eval-vault-closed-detection/` / `obsidian` precedent of needing T0 manual cases does not apply here).

4. **Agent context update**:
   - Rotate the active-narrative block in `CLAUDE.md`. The 030 active narrative becomes a Predecessor block; the 031 block becomes the active narrative. Same pattern every prior BI follows.

**Output**: data-model.md, contracts/registration-stub.contract.md, quickstart.md, updated `CLAUDE.md` agent-context block.

## Post-Phase-1 Constitution Re-Check

Re-evaluated after Phase 1 design artefacts land. Expected verdict: **PASS** with the same nine-gate row table above. The Phase 1 design does not introduce any new surface; it elaborates the mechanical refactor protocol. No Complexity Tracking entries anticipated.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No entries. Initial Constitution Check passes with Y on Principles I, II, V and N/A on the rest (with rationale inline in the gate table). Phase 1 re-check expected to retain the same verdict.
