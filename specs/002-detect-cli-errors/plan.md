# Implementation Plan: Detect CLI Errors

**Branch**: `002-detect-cli-errors` | **Date**: 2026-05-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [specs/002-detect-cli-errors/spec.md](./spec.md)

## Summary

Patch the `obsidian_exec` MCP-bridge handler so that an exit-zero invocation whose stdout begins with the literal `Error:` prefix surfaces as a structured `UpstreamError` with the new stable code `CLI_REPORTED_ERROR` (FR-001..FR-007) instead of being framed as a success. Add the new code to `Logger.ErrorCode` and to the bridge's call-end failure log line (FR-013). Update the published MCP tool description to mention the new code (FR-009). Document `CLI_REPORTED_ERROR` in the canonical errors contract and the README error-codes table (FR-008, FR-011), reconciling two latent table-vs-source-of-truth gaps in the same edit: add the `CLI_NON_ZERO_EXIT.details.exitCode/signal` rows that the v0.1 contract's prose already promises (FR-014), and register two live-but-undocumented codes `VALIDATION_ERROR` and `TOOL_NOT_FOUND` (FR-015). Five co-located vitest cases exercise the detection logic; the v0.1 84.3% statements coverage floor must not regress (FR-010, FR-012). Constitution Principles I–V continue to bind: no new modules introduced, no new dependencies, no `throw new Error` at the boundary, every new code path has a co-located test, and no upstream code is lifted.

## Technical Context

**Language/Version**: TypeScript 5.6+ in strict mode; runtime Node.js >= 22.11 (LTS floor per constitution). No change from 001.

**Primary Dependencies**: No new runtime dependencies. The detection logic is pure standard-library (`String.prototype.split`, `String.prototype.trim`, `String.prototype.trimStart`, `String.prototype.startsWith`). Vitest + `@vitest/coverage-v8` continue to be the test framework (per constitution amendment 1.1.0; the 001 plan's reference to `node:test` is stale — code already uses vitest).

**Storage**: N/A — same as 001. The bridge holds no persistent state.

**Testing**: Vitest, co-located `*.test.ts` per Principle II. Five new tests added to [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) per FR-010(a)-(e). One typecheck-only consequence: extending the `Logger.ErrorCode` union in [src/logger.ts](../../src/logger.ts) to include `"CLI_REPORTED_ERROR"` ripples through the existing logger interface without affecting any `*.test.ts` assertion (the union is referenced only by the `callEndFailure` parameter type).

**Target Platform**: Windows host (per CLAUDE.md). The Q2 clarification's `stdout.split('\n', 1)[0].trim()` algorithm absorbs any trailing `\r` from Windows CRLF line endings, so test fixtures author the same expected `details.message` regardless of platform.

**Project Type**: Single library (Node.js MCP server). Same as 001.

**Performance Goals**: O(1) per-call overhead — one `String.prototype.trimStart` plus one `String.prototype.startsWith` plus (on the failure branch only) one `String.prototype.split` + `.trim()`. Measured against 001's ~tens-of-ms spawn overhead per call, the new check is below noise.

**Constraints**: All 001 constraints carry through unchanged:
- Stdout sacred (logger writes to stderr only).
- 10 MiB hard cap per captured stream.
- 2-second SIGTERM → SIGKILL grace.
- No orphan children on cleanly-signaled shutdown.
- Zero `throw new Error` at boundary surfaces.

**Scale/Scope**: Same per-process model as 001. This feature adds no new request volume or memory footprint.

No `NEEDS CLARIFICATION` items remain — six clarifications across two `/speckit-clarify` sessions on 2026-05-05 (Q1: `details.exitCode` shape; Q2: message-trim algorithm; Q3: defect-repair posture; Q4: `CLI_NON_ZERO_EXIT` contract patch; Q5: in-place contract location; Q6: `VALIDATION_ERROR` + `TOOL_NOT_FOUND` contract additions) closed every gap surfaced by the structured taxonomy scan.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | How this plan satisfies it |
|-----------|-------|----------------------------|
| **I. Modular Code Organization** | Y | No new modules introduced. The detection logic is added to the existing `runOnce` function in [src/tools/obsidian_exec/handler.ts](../../src/tools/obsidian_exec/handler.ts); the function already owns the exit-classification branch (`if (code === 0)` at line 216) so the new sub-branch belongs there by the principle's "single responsibility" rule. The `ErrorCode` union extension lands in the existing [src/logger.ts](../../src/logger.ts) (its single responsibility — emit JSON-lines call-end events — already includes encoding the failure code, so adding a new union member doesn't grow scope). Imports continue to flow strictly downward. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | Y | The `obsidian_exec` MCP tool's surface gains a new reachable error code. FR-010 mandates five co-located vitest cases under [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts): (a) version-success (no false positive), (b) nonexistent-command (CLI_REPORTED_ERROR raised), (c) file-not-found (CLI_REPORTED_ERROR raised), (d) eval-throws (CLI_REPORTED_ERROR raised), (e) search-results-containing-`Error:` (no false positive). All five reuse the spawn-mock harness already established by 001's tests. The aggregate statements coverage floor (84.3% per FR-012) is the merge gate. |
| **III. Boundary Input Validation with Zod** | Y | This feature does not change the `obsidian_exec` input shape — no schema edits. The existing zod boundary at [src/tools/obsidian_exec/schema.ts](../../src/tools/obsidian_exec/schema.ts) and its single-source-of-truth invariant continue unchanged. |
| **IV. Explicit Upstream Error Propagation** | Y | The new `CLI_REPORTED_ERROR` is a member of the existing `UpstreamError.code` enumeration (Assumptions row 4), constructed via the existing `UpstreamError` constructor with `cause: null` (FR-002) and a structured `details` payload (FR-003). No new error class is introduced. Plain `throw new Error(...)` is forbidden in the new branch — the implementation is `reject(new UpstreamError({...}))` matching how every other reachable failure path in `runOnce` already works. |
| **V. Attribution & Layered Composition Transparency** | Y | No new modules introduced (no new files); the existing `// Original — no upstream.` headers on `handler.ts`, `logger.ts`, `tool.ts`, and the test files cover all touched code. No upstream code is lifted. The README's "Attributions" section, if not yet present, is not gated by this feature (no upstream code introduced); the FR-011 README edit MUST take care not to remove or shadow any existing attribution. |

**Technical Standards check** (from constitution's "Technical Standards & Stack Constraints" section):

| Standard | Compliance |
|----------|-----------|
| TypeScript strict, NodeNext, ES2024+, `tsc --noEmit` clean | No `tsconfig.json` changes. The `ErrorCode` union extension and the `details` payload literal are typecheck-clean against the existing `Logger` and `UpstreamError` shapes. |
| Node.js >= 22.11 in `engines.node` | No change from 001. |
| `zod` is the only runtime input validator | N/A for this change — no boundary input edits. |
| `@modelcontextprotocol/sdk` sole MCP transport | N/A — no transport changes. |
| `citty` is the sole CLI parsing library | N/A — no CLI surface in this feature. |
| Vitest + `@vitest/coverage-v8`, `*.test.ts` co-located, statements threshold ratchets via single-source vitest.config.ts edit | Confirmed. FR-012 explicitly mandates the floor remain ≥ 84.3%. No `branches`/`functions`/`lines`/`perFile` keys introduced. |
| `eslint` flat config, zero warnings; Prettier the formatter | Confirmed. |
| Dependencies justified | Zero new runtime or dev dependencies. |

**Result**: All principles and technical standards satisfied. **No Complexity Tracking entries required.** No `N` markers in the per-PR Constitution Compliance checklist will be needed.

**Post-Phase 1 re-check**: Phase 1 added the data-model entry for the new code, the errors-contract patch document, the tool-description patch document, and the quickstart walkthrough. None of those introduce new modules, dependencies, or boundary surfaces beyond what this Constitution Check already covers — they document the same shapes from a different angle. Re-check result: **all five principles still Y; no Complexity Tracking entries needed.**

## Project Structure

### Documentation (this feature)

```text
specs/002-detect-cli-errors/
├── plan.md                                      # This file (/speckit-plan command output)
├── spec.md                                      # /speckit-specify + 6 clarifications across 2 sessions on 2026-05-05
├── research.md                                  # Phase 0 output (this command)
├── data-model.md                                # Phase 1 output (this command)
├── quickstart.md                                # Phase 1 output (this command)
├── contracts/                                   # Phase 1 output (this command)
│   ├── errors.contract-patch.md                 # Diff to apply against specs/001-add-cli-bridge/contracts/errors.contract.md (FR-008, FR-014, FR-015)
│   └── obsidian_exec.tool-patch.md              # Description-text update for the published MCP tool (FR-009)
├── checklists/                                  # /speckit-specify output (already written)
└── tasks.md                                     # Phase 2 output (/speckit-tasks command — NOT created here)
```

### Source Code (repository root) — modified files only

```text
obsidian-cli-mcp/
├── README.md                                    # FR-011: error-codes table gains a CLI_REPORTED_ERROR row
├── src/
│   ├── logger.ts                                # FR-013: extend `ErrorCode` union to include `"CLI_REPORTED_ERROR"`
│   └── tools/
│       └── obsidian_exec/
│           ├── handler.ts                       # FR-001..FR-007: insert detection in the `if (code === 0)` branch (line ~216). FR-014 implementation tweak: add `exitCode` and `signal` to the existing CLI_NON_ZERO_EXIT details payload at line 227 so MCP clients can observe them after `cause` is dropped during serialization.
│           ├── handler.test.ts                  # FR-010: five new co-located vitest cases (US1 ×3 + US2 ×2)
│           └── tool.ts                          # FR-009: append `CLI_REPORTED_ERROR` mention to OBSIDIAN_EXEC_DESCRIPTION
└── specs/001-add-cli-bridge/
    └── contracts/
        └── errors.contract.md                   # FR-008, FR-014, FR-015: in-place edit per Q5 clarification — adds CLI_REPORTED_ERROR row, fixes CLI_NON_ZERO_EXIT row, adds VALIDATION_ERROR + TOOL_NOT_FOUND rows
```

**Structure Decision**: Same single-library MCP-server layout as 001. This feature touches four source files plus three documentation surfaces (the canonical contract under `specs/001-add-cli-bridge/contracts/`, the README, and the new patch artifacts under `specs/002-detect-cli-errors/contracts/`). No directory-level changes. The `errors.contract-patch.md` artifact captures the *contribution* this feature makes to the canonical contract while the canonical itself stays in 001's directory per the Q5 clarification (no file moves, no fragmentation).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Table intentionally empty.
