# Implementation Plan: Verify Lifecycle Errors

**Branch**: `094-verify-lifecycle-errors` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/094-verify-lifecycle-errors/spec.md`

## Summary

This item adds in-process checks for the `smart_connections_similar` tool. Each check puts the tool into one Smart Connections lifecycle state, or a combination of states, on demand, and confirms the failure the agent receives and the documented order of precedence. The states are not installed, target missing (no note focused in active mode), not a note, not ready and not indexed. Each check calls the registered tool. Only the spawned `obsidian` process is replaced, by a stand-in that runs the eval code the handler actually sent against a simulated vault and plugin (C-001; research D1, D2). Specific mode is covered in full, and active mode by three no-focused-note checks (C-002). A one-off swap-and-drop exercise, recorded in `exercise.md`, shows that the checks catch a reordered or dropped detection step (C-003; research D6).

No production code changes. The test harness gains one spawn factory, `makeEvalRunnerSpawn`, and one vm helper, `runEvalCode`, which `runEvalTemplate` now uses.

## Technical Context

**Language/Version**: TypeScript (strict), Node.js ≥ 22.11 runtime (dev toolchain ≥ 22.13)

**Primary Dependencies**: none new. The checks use `vitest`, `node:vm` (already used by the template suites), and the existing `@modelcontextprotocol/server` registration through `createSmartConnectionsSimilarTool`.

**Storage**: N/A

**Testing**: `vitest run`, with tests co-located per Principle II. The new file is `src/tools/smart_connections_similar/handler.lifecycle.test.ts`.

**Target Platform**: the CI matrix on Linux and Windows (constitution gate 9). No Obsidian is needed.

**Project Type**: an MCP server (stdio), single project

**Performance Goals**: the new checks add well under 5 s to `npm test` (SC-004). Each check is one in-process tool call with a vm run, so the cost is milliseconds.

**Constraints**: the published surface stays byte-identical (FR-013), with no edit to `_template.ts`, `handler.ts`, `schema.ts`, `index.ts` or `docs/tools/smart_connections_similar.md`, and the FR-018 fingerprint stays unchanged. Expected values are literals, not imported (research D5). No committed mutation tests (C-003).

**Scale/Scope**: 24 checks (contract §S, §P, §A) in one new test file, plus one factory and one helper in two existing test-support modules.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Evidence |
|---|---|---|
| Principle I (Modular Code Organization) | Y | The new spawn factory sits with the other two in `src/tools/_handler-test-fixtures.ts` (standing rule item 9). The vm helper sits in `src/tools/_eval-template-fixtures.ts` (item 45). The import direction is `_handler-test-fixtures` → `_eval-template-fixtures` → `_shared`, all downward or sideways at `src/tools/`, with no cycle. No production import changes. |
| Principle II (Public Surface Test Coverage) | Y | No surface is added or changed. The item adds happy-path (L6, L7) and failure/boundary checks for `smart_connections_similar`, co-located beside the tool. |
| Principle III (Boundary Input Validation with Zod) | N/A | No schema touched. The checks pass through the existing boundary parse by calling `tool.handler`. |
| Principle IV (Explicit Upstream Error Propagation) | N/A | No error path changes and no new codes. The checks verify that existing `UpstreamError` classifications reach the agent as `isError` results. |
| Principle V (Attribution & Layered Composition) | Y | The new test file carries an `// Original — no upstream.` header. The two touched fixture modules keep their headers, extended to name the new export. |
| ADR-010 | N/A | No typed tool added or renamed. |
| ADR-013 | N/A | No plugin-backed tool added or renamed. |
| ADR-014 | N/A (verifies it) | No plugin-backed tool added. This item is the executable proof of ADR-014's in-eval lifecycle stages and their precedence chain in both modes. |
| ADR-015 | N/A | No new `(code, details.code)` pair or sub-state. `reason: "api-missing"` is asserted as is. |
| MCP Tool Surface Standards | N/A | No published tool, schema or server instruction changes (V4 in quickstart). |
| Security Defaults | N/A | No write path, escape hatch or destructive tool touched. The template's internal `eval` is exercised only in-process under `node:vm`. |

**Gate result**: PASS. No `N`, so no Complexity Tracking entry.

**Re-check after Phase 1**: PASS, unchanged. The design adds only test-support code. Research D5 found no departure from the documentation (FR-014), so no defect is raised to the owner.

### CodeGraph structural check

Queries run at plan time: `smart_connections_similar handler.ts _template.ts …`, `runEvalTemplate _eval-template-fixtures.ts executeSmartConnectionsSimilar mapEnvelopeError`, and `evalOut mintAnswerTag findAnswer evalPayload codePayload _handler-test-fixtures.ts invokeEval`.

- **Symbols exercised (read, not changed)**:
  - `JS_TEMPLATE` (`smart_connections_similar/_template.ts`): stages S1–S5 in the documented order.
  - `executeSmartConnectionsSimilar` and `mapEnvelopeError` (`handler.ts`): `ERR_NO_ACTIVE_FILE` for `NO_ACTIVE_FILE`, and `CLI_REPORTED_ERROR` with `details.code` otherwise, with `reason: "api-missing"` on not-ready.
  - `createSmartConnectionsSimilarTool` (`index.ts`), `invokeEval` → `wrapEvalCode` / `findAnswer` (cli-adapter), `decodeEvalEnvelope` (`_active-file.ts`), and `asToolError` (`_shared.ts`).
- **Symbols changed (test support only)**:
  - `runEvalTemplate` is re-expressed over the new `runEvalCode`. It is among the more widely used test helpers, called by every `_template.test.ts` suite, so its signature and result stay identical and V2 in quickstart re-runs those suites as the regression check.
  - `_handler-test-fixtures.ts` gains `makeEvalRunnerSpawn`, which reuses the private `makeChild`. `makeQueuedSpawn`, `makeStubSpawn` and `renderStubStdout` are untouched.
- **Affected modules**: `src/tools/_eval-template-fixtures.ts`, `src/tools/_handler-test-fixtures.ts`, and the new `src/tools/smart_connections_similar/handler.lifecycle.test.ts`. Blast radius: the template suites that call `runEvalTemplate`. No production module and no other tool.
- **Kernel nodes**: the plan touches none of `createLogger()`, `createQueue()`, `UpstreamError` or `createServer()`. The new test calls `createQueue()` and `silentLogger()` (which wraps `createLogger`) the way every handler suite does, from test code only. `UpstreamError` is only observed, never constructed by new code. `createServer()` is not reached, because the tool is built directly. Post-implement verification checks this no-touch claim.

## Project Structure

### Documentation (this feature)

```text
specs/094-verify-lifecycle-errors/
├── plan.md              # This file
├── research.md          # Phase 0: D1–D6
├── data-model.md        # Phase 1: E1–E6 (simulated state, outcomes, exercise record)
├── quickstart.md        # Phase 1: V1–V5
├── contracts/
│   └── lifecycle-checks-contract.md   # §H harness, §S/§P/§A check matrix, §M exercise
├── checklists/
│   └── requirements.md  # spec quality checklist
├── exercise.md          # written during implement (C-003 record)
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/tools/
├── _eval-template-fixtures.ts           # + runEvalCode(code, app); runEvalTemplate re-expressed over it
├── _handler-test-fixtures.ts            # + makeEvalRunnerSpawn(app) (third spawn factory)
└── smart_connections_similar/
    ├── _template.ts                     # unchanged (exercise edits reverted)
    ├── handler.ts                       # unchanged
    └── handler.lifecycle.test.ts        # NEW: L1–L7, P1–P5, A1–A3
```

**Structure Decision**: single project. The checks are co-located with the tool, as with `handler.note-name.test.ts` and `handler.line-endings.test.ts`. Shared test support stays in the two existing `src/tools/_*fixtures.ts` modules, which are excluded from coverage and kept vitest-free.

## Implementation notes for tasks

- **Order**: `runEvalCode` first, then `makeEvalRunnerSpawn`. Run V2 before writing the new file, so a harness regression is not mistaken for a lifecycle failure. Then write the check matrix and run V1, then the exercise (V5), then V3/V4.
- **Approval scope** (standing rule item 5): no existing test assertion changes. If any existing suite fails after the harness change, stop and raise it. Do not edit that test.
- **Docs-as-code**: no `docs/tools/**` edit is expected. The `/speckit-docs-as-code` pass decides whether the help page should state the not-indexed detail form and the not-ready `details.reason` (research D5).

## Complexity Tracking

No Constitution Check violations; nothing to justify.
