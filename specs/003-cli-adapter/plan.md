# Implementation Plan: CLI Adapter

**Branch**: `003-cli-adapter` | **Date**: 2026-05-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from [specs/003-cli-adapter/spec.md](./spec.md)

## Summary

Introduce a new internal module at [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) (with co-located vitest at [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts)) that centralises Obsidian CLI invocation for every typed MCP tool that will follow. The module exposes one async runtime entry point (`invokeCli` — see Plan-stage decisions below) accepting `(input: { command, parameters, flags, target_mode }, deps?: { spawnFn?, env? })` — the two-arg shape pinned by Q1 mirroring the existing `executeObsidianExec` precedent at [handler.ts:51](../../src/tools/obsidian_exec/handler.ts#L51). The adapter assembles argv with the documented vault-hoisting rule (FR-005), strips target-locator keys (`vault`, `file`, `path`) when `target_mode === "active"` (FR-003), spawns the binary with `shell: false` (FR-006), collects full stdout/stderr to `close`, and classifies the outcome with a four-priority machine (FR-008): non-zero exit → `CLI_NON_ZERO_EXIT`; exit-0 with `Error: no active file` prefix → the new `ERR_NO_ACTIVE_FILE` (matching the deliberate naming in [ADR-004](../../.decisions/ADR-004%20-%20Centralized%20Obsidian%20CLI%20Adapter.md) — `ERR_*` marks this code as a recoverable user-action signal, distinct from the `CLI_*` failure family); exit-0 with any other `Error:` prefix → `CLI_REPORTED_ERROR` (reused from feature 002); otherwise resolve `{ stdout, stderr }`. Signal-only termination resolves `details.exitCode` to the sentinel `-1` per Q3 clarification, mirroring [handler.ts:238](../../src/tools/obsidian_exec/handler.ts#L238). Spawn-time `ENOENT` is mapped to `CLI_BINARY_NOT_FOUND` (FR-010); other native spawn errors propagate as-is. Ten co-located vitest cases (FR-016 a–j) drive the adapter through a stub `spawnFn`. The new code is registered in the canonical errors contract at [specs/001-add-cli-bridge/contracts/errors.contract.md](../001-add-cli-bridge/contracts/errors.contract.md) (FR-012) and the README error-codes table (FR-013). The existing `obsidian_exec` handler is unchanged per the Out-of-Scope section. Constitution Principles I–V continue to bind: one new module with one responsibility, co-located tests with full happy/failure/boundary coverage, no zod schema needed (internal — Principle III applies at the calling tool's boundary), every rejection is `UpstreamError`, and an original-contribution header per Principle V.

## Technical Context

**Language/Version**: TypeScript 5.6+ in strict mode; runtime Node.js >= 22.11 (LTS floor per constitution). Same as 001/002.

**Primary Dependencies**: No new runtime dependencies. The adapter uses pure standard-library primitives (`node:child_process` `spawn`, `Buffer.concat`, `String.prototype` methods). Vitest + `@vitest/coverage-v8` continue as the test framework (per constitution v1.1.0).

**Storage**: N/A. The adapter is stateless — no module-level mutable state; each call spawns its own child and resolves on `close`. The existing `obsidian_exec` handler keeps its module-level `activeChild` variable for the `killActiveChild` shutdown path; the adapter does not participate in that lifecycle (Out-of-Scope: streaming, queue, abort).

**Testing**: Vitest, co-located `*.test.ts` per Principle II. Ten new cases at [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) per FR-016(a)–(j): three happy-path cases (specific mode, active-mode vault+file strip, active-mode path strip), three failure-path cases (`CLI_NON_ZERO_EXIT`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR`), four boundary-path cases (undefined parameter values, `ERR_NO_ACTIVE_FILE` beats `CLI_REPORTED_ERROR` priority, non-zero exit beats stdout-prefix priority, signal-only termination). All ten use a stub `spawnFn` injected via `deps.spawnFn` per Q1 — no real CLI binary involved. The `Logger.ErrorCode` union in [src/logger.ts](../../src/logger.ts) is **not** extended this feature: the adapter has no internal logger per spec Assumptions, and `ERR_NO_ACTIVE_FILE` is emitted by the future typed-tool callers (each of which decides its own logging in its own BI). The aggregate statements coverage floor (constitution v1.1.0 §Development Workflow #5) MUST not regress; FR-017 mandates this.

**Target Platform**: Windows host (per CLAUDE.md and the 002 baseline). The signal-name string `"SIGTERM"` in the FR-016(j) test fixture is platform-portable for the stub-spawn harness — the test synthesises `(code: null, signal: "SIGTERM")` directly so the platform's actual spawn signal semantics are not exercised. The CRLF-line-ending edge case is preserved from 002's `stdout.split('\n', 1)[0].trim()` algorithm (FR-009).

**Project Type**: Single library (Node.js MCP server). Same as 001/002.

**Performance Goals**: O(1) overhead beyond `spawn` (one record-clone for active-mode strip, one O(N) loop over `parameters` entries for argv assembly, one final string compare on the `Error:`/`Error: no active file` prefix). Below the noise floor relative to ~tens-of-ms spawn turnaround.

**Constraints**: No timeout, no output cap, no queue, no streaming, no logger. All five are intentional Out-of-Scope per spec — the adapter is the centralised primitive, not the everything-bagel. Callers add what they need; the existing `obsidian_exec` handler retains all five for its untyped-escape-hatch role.

**Scale/Scope**: One spawn-and-await cycle per call. Concurrent invocations supported (no shared state); future typed-tool BIs may layer their own queue or `AbortController` on top. No `activeChild` module-level variable in the adapter.

No `NEEDS CLARIFICATION` items remain — three clarifications in one `/speckit-clarify` session on 2026-05-05 (Q1: adapter signature + spawn test seam; Q2: error code name — final answer `ERR_NO_ACTIVE_FILE` matching ADR-004; Q3: `code ?? -1` sentinel for signal-only termination) closed every gap surfaced by the structured taxonomy scan. Three deferred items (FR-001 export name, FR-008(b) recovery-message wording, FR-017 coverage-floor numeric value) were correctly held at plan stage and are resolved below.

**Plan-stage decisions resolved during this Phase 0**:

- **FR-001 export name**: `invokeCli` is the canonical export name. Rationale: imperative verb-noun matches the project's existing naming (`executeObsidianExec`, `killActiveChild`); `Cli` is the established acronym (per `OBSIDIAN_EXEC_*` prefix); no other adapter or service in the repo carries this verb so collisions are nil.
- **FR-008(b) recovery-message wording**: `"No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: \"specific\" and an explicit vault/file."` — matches the spec's "or substantively equivalent" parenthetical; both recovery paths (open file vs. switch to specific mode) are named.
- **FR-017 coverage-floor numeric value**: 84.3% statements (the floor pinned by feature 002 in [vitest.config.ts](../../vitest.config.ts)). The new module + its ten tests are net-additive; pre-implementation projection is the actual statements coverage moves *up* by ~0.3–0.5pp once the new code path is exercised (the adapter is small and exhaustively tested). The merge-gate floor stays as-is at 84.3% and ratchets via a separate visible edit if/when the actual-vs-floor delta exceeds the project's ratchet rhythm.

**ADR-004 / Architecture alignment**: [.decisions/ADR-004 - Centralized Obsidian CLI Adapter.md](../../.decisions/ADR-004%20-%20Centralized%20Obsidian%20CLI%20Adapter.md) and [.architecture/Obsidian CLI MCP - Architecture.md](../../.architecture/Obsidian%20CLI%20MCP%20-%20Architecture.md) both name this code `ERR_NO_ACTIVE_FILE`; this feature respects that naming. The `ERR_*` prefix is deliberate — it marks the code as a recoverable user-action signal (the user/agent corrects in-conversation by opening a note or switching to `target_mode: "specific"`), semantically distinct from the `CLI_*` family which represents CLI-process failures with no in-conversation recovery. An interim /speckit-clarify Q2 answer (2026-05-05) renamed for cosmetic prefix uniformity but was reversed during /speckit-plan when the deliberate semantic split was reaffirmed. No ADR amendment, no Architecture amendment, no new ADR.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | How this plan satisfies it |
|-----------|-------|----------------------------|
| **I. Modular Code Organization** | Y | One new module at [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) with a single responsibility — invoke the Obsidian CLI with documented argv conventions and classify the outcome as success or `UpstreamError`. The `{schema, command, handler}` per-surface convention does not apply because the adapter is internal: no schema (Principle III is satisfied by calling tools), no command/tool registration (FR-015). The module is a shared primitive consumed by future typed-tool surfaces, each of which will follow the per-surface layout itself. Cross-module imports flow strictly downward: tool/command → adapter → external SDK (`node:child_process`). The adapter MUST NOT import from `src/tools/*` or `src/server.ts` — that would invert the direction. |
| **II. Public Surface Test Coverage (NON-NEGOTIABLE)** | Y | The adapter is internal — it has no MCP tool surface of its own, so the strict "happy + failure-or-boundary" rule applies indirectly: every typed-tool consumer that lands later carries its own surface tests, AND the adapter itself has its own co-located test set covering all reachable code paths. FR-016 mandates ten co-located vitest cases at [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) — three happy-path (a–c), three failure-path (d–f: `CLI_NON_ZERO_EXIT`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR`), four boundary-path (g–j: undefined values, priority discrimination ×2, signal-only termination). All ten use a stub `spawnFn` injected via `deps.spawnFn` per Q1 — no real CLI binary needed. The aggregate statements coverage floor (84.3% per FR-017) is the merge gate. |
| **III. Boundary Input Validation with Zod** | Y | This module is **internal** — no MCP tool registration, no CLI command parsing, no boundary surface to validate at. Per Principle III, "internal helpers MAY trust their inputs," and per spec Assumptions, callers (typed tool handlers) zod-validate at their own boundary before invoking the adapter. The adapter forwards already-typed `parameters` opaquely; values are constrained to primitives (`string \| number \| boolean \| undefined`) by FR-002's TypeScript type, not by a runtime check. No zod schema in `src/cli-adapter/`. |
| **IV. Explicit Upstream Error Propagation** | Y | Every adapter rejection is an `UpstreamError`. The four reachable rejection paths — `CLI_NON_ZERO_EXIT` (FR-008(a)), `ERR_NO_ACTIVE_FILE` (FR-008(b)), `CLI_REPORTED_ERROR` (FR-008(c)), `CLI_BINARY_NOT_FOUND` (FR-010) — all use `new UpstreamError({...})` with structured `details`. No `throw new Error(...)`, no `null`, no swallowed exception. Non-`ENOENT` native spawn errors propagate as-is per FR-010 (the caller decides how to map them — same precedent as [handler.ts:92-93](../../src/tools/obsidian_exec/handler.ts#L92-L93)); this is the principle's documented exception path for unknown native errors that wrapping would obscure. |
| **V. Attribution & Layered Composition Transparency** | Y | The new [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) and [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) MUST carry `// Original — no upstream. <one-line description>.` headers per FR-014. No upstream code is lifted — the argv-assembly rule and the four-priority classification machine are derived from project-internal precedent (handler.ts) and from the spec's Acceptance Criteria, not from any external project. The README's "Attributions" section is not gated by this feature (no upstream code introduced). |

**Technical Standards check** (from constitution's "Technical Standards & Stack Constraints" section):

| Standard | Compliance |
|----------|-----------|
| TypeScript strict, NodeNext, ES2024+, `tsc --noEmit` clean | No `tsconfig.json` changes. The new module + test typecheck against existing `UpstreamError` ([src/errors.ts](../../src/errors.ts)) and `node:child_process` types. The `target_mode: "specific" \| "active"` literal union (FR-002) is a single new exported type. |
| Node.js >= 22.11 in `engines.node` | No change. |
| `zod` is the only runtime input validator | N/A — adapter is internal, no boundary input. |
| `@modelcontextprotocol/sdk` sole MCP transport | N/A — no transport changes; adapter is not registered as an MCP tool (FR-015). |
| `citty` is the sole CLI parsing library | N/A — no CLI surface in this feature. |
| Vitest + `@vitest/coverage-v8`, `*.test.ts` co-located, statements threshold ratchets via single-source vitest.config.ts edit | Confirmed. FR-017 explicitly mandates the floor (84.3% per 002) MUST not regress. No `branches`/`functions`/`lines`/`perFile` keys introduced. |
| `eslint` flat config, zero warnings; Prettier the formatter | Confirmed. |
| Dependencies justified | Zero new runtime or dev dependencies. |

**Result**: All principles and technical standards satisfied. **No Complexity Tracking entries required.** Per FR-018, the per-PR Constitution Compliance checklist will be all `Y`.

**Post-Phase 1 re-check**: Phase 1 added the data-model entry for the new code, the cli-adapter contract document, the errors-contract patch, and the quickstart walkthrough. None introduce new modules, dependencies, or boundary surfaces beyond what this Constitution Check already covers — they document the same shapes from a different angle. Re-check result: **all five principles still Y; no Complexity Tracking entries needed.**

## Project Structure

### Documentation (this feature)

```text
specs/003-cli-adapter/
├── plan.md                                      # This file (/speckit-plan command output)
├── spec.md                                      # /speckit-specify + 3 clarifications in 1 session on 2026-05-05
├── research.md                                  # Phase 0 output (this command)
├── data-model.md                                # Phase 1 output (this command)
├── quickstart.md                                # Phase 1 output (this command)
├── contracts/                                   # Phase 1 output (this command)
│   ├── cli-adapter.contract.md                  # The adapter's public interface (signature, deps, return shape, error codes, test requirements)
│   └── errors.contract-patch.md                 # Diff to apply to specs/001-add-cli-bridge/contracts/errors.contract.md (FR-012 — adds ERR_NO_ACTIVE_FILE row)
└── tasks.md                                     # Phase 2 output (/speckit-tasks command — NOT created here)
```

### Source Code (repository root) — affected files

```text
obsidian-cli-mcp/
├── README.md                                    # FR-013: error-codes table gains a ERR_NO_ACTIVE_FILE row
├── src/
│   └── cli-adapter/                             # NEW directory
│       ├── cli-adapter.ts                       # FR-001..FR-011, FR-014: the adapter module — argv assembly, active-mode strip, spawn-and-collect, four-priority classification, ENOENT mapping, UpstreamError re-export. Bears `// Original — no upstream.` header.
│       └── cli-adapter.test.ts                  # FR-016(a)..(j): ten co-located vitest cases — three happy + three failure + four boundary. Bears `// Original — no upstream.` header.
└── specs/001-add-cli-bridge/
    └── contracts/
        └── errors.contract.md                   # FR-012: in-place edit per the established 002 precedent — adds ERR_NO_ACTIVE_FILE section + extends test-coverage requirements list to include cli-adapter.test.ts
```

ADR-004 and the Architecture document already use `ERR_NO_ACTIVE_FILE` — no amendments required.

**Structure Decision**: Same single-library MCP-server layout as 001/002, with one new top-level module directory under `src/`. The new `src/cli-adapter/` follows the project's per-surface layout (one source + one co-located test) with two intentional deviations from the `{schema, command, handler}` triplet: (a) no `schema.ts` because the adapter is internal and has no zod boundary (Principle III is satisfied by the calling tool's schema), and (b) no `command.ts` / `tool.ts` because the adapter does not register as an MCP tool (FR-015) — there is nothing to expose. The 003-cli-adapter `contracts/` directory contains exactly two artifacts: the adapter's own interface contract (new) and the errors-contract patch (mirroring the 002 pattern). No directory-level changes elsewhere; the `obsidian_exec` handler is unmodified per the Out-of-Scope clause.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Table intentionally empty.
