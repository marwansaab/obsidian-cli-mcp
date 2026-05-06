# Implementation Plan: Centralized Tool Registration and CLI Dispatch Bounds

**Branch**: `008-refactor` | **Date**: 2026-05-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-refactor/spec.md`

## Summary

Two architectural deepenings, shipped together because they touch overlapping seams (the register / publish / dispatch chain) and ADR-006 + ADR-007 explicitly schedule them as siblings.

**Part 1 — `registerTool` factory** (per [ADR-006](../../.decisions/ADR-006%20-%20Centralized%20Tool%20Registration.md)). A new `src/tools/_register.ts` introduces `registerTool(spec)` that owns the full publication pipeline: `toMcpInputSchema` envelope → `stripSchemaDescriptions` → `ZodError` → `VALIDATION_ERROR` marshalling → `UpstreamError` → structured-error envelope → response-format dispatch (`"json"` default; `"raw"` for help). A companion `assertToolDocsExist(tools[])` aggregator walks every registered tool's `docs/tools/{name}.md` file at server boot, collects every miss, and raises a single error listing all of them (per Clarifications 2026-05-07 Q4 / FR-005). Each tool collapses to `schema.ts` (zod only — no `*InputJsonSchema` export) + `handler.ts` + `index.ts` (a thin `registerTool({...})` call).

**Part 2 — `dispatchCli` primitive** (per [ADR-007](../../.decisions/ADR-007%20-%20Centralized%20CLI%20Bounds%20with%20Selective%20Override.md)). A new private `src/cli-adapter/_dispatch.ts` owns spawn-and-collect, argv assembly (using the documented `[binary, vault=..., command, kvs..., flags..., --copy]` order from `obsidian_exec.md:27`), the four-priority error classification (non-zero exit > `Error: no active file` > `Error:` prefix > success), the in-flight child registry, and always-on bounds. Two thin facades sit on top: `invokeCli(input)` (typed-tool surface, fixed 10 s / 10 MiB), and `invokeBoundedCli(input, overrides)` (escape-hatch surface, default 30 s / 10 MiB, `timeoutMs` overridable up to a 120 s ceiling — silently clamped per Clarifications 2026-05-07 Q1 / FR-011). The active-child slot moves from [src/tools/obsidian_exec/handler.ts:31](../../src/tools/obsidian_exec/handler.ts#L31) to `_dispatch.ts`, the exported function renames `killActiveChild` → `killInFlightChildren` (FR-016), and `src/server.ts:9` re-points to import it from the cli-adapter layer (FR-017, fixing the Principle-I downward-flow violation as a side effect).

**Cross-cutting** — Failure-only stderr logging discipline per Clarifications 2026-05-07 Q3 / FR-018a. The dispatch primitive emits ONE stderr line each for `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, and SIGINT/SIGTERM-driven kill; ZERO log lines on success path or `CLI_NON_ZERO_EXIT` / `ERR_NO_ACTIVE_FILE` / `CLI_REPORTED_ERROR` / `CLI_BINARY_NOT_FOUND` (those flow through the response envelope only). Today's `obsidian_exec`-only `call.start` / `call.end*` lifecycle logging is **removed** as a deliberate operator-observable signal change — see research item R3.

**Atomic registry insertion** per Clarifications 2026-05-07 Q5 / FR-015a. After `spawn()` returns, `_dispatch.ts` inserts the child into the registry **synchronously, before any `await` or microtask boundary**, closing the SIGINT-vs-spawn race that would otherwise leak orphans (the central guarantee of US3).

**Compatibility / release** — MCP wire surface unchanged for the three currently registered tools (FR-019); the `obsidian_exec` reachable error code set expands to include `ERR_NO_ACTIVE_FILE` per FR-021, called out in CHANGELOG.md and added to `docs/tools/obsidian_exec.md`'s error roster. Version bumps `0.1.7 → 0.2.0` (minor — see research R9).

## Technical Context

**Language/Version**: TypeScript 5.x, strict mode, `tsc --noEmit` clean. Constitution-mandated baseline (Constitution → Technical Standards → TypeScript config: `module: NodeNext`, `target: ES2024`, `strict: true`).

**Primary Dependencies**: `@modelcontextprotocol/sdk` ^1.0.4 (MCP transport), `zod` ^3.23.8 (boundary validation per Principle III), `zod-to-json-schema` ^3.23.5 (JSON Schema rendering, used inside `toMcpInputSchema`). No new runtime dependencies. The `node:child_process` `spawn` primitive is the only OS-level dependency for CLI dispatch.

**Storage**: N/A — no persistent state. The in-flight child registry is in-memory only and bounded by the FIFO single-flight queue's at-most-one invariant ([src/queue.ts](../../src/queue.ts)).

**Testing**: `vitest` ^4.1.5 with `@vitest/coverage-v8`, co-located `*.test.ts` files (Constitution Principle II + Technical Standards). Merge-gating command: `vitest run --coverage`. The aggregate statements coverage threshold lives in `vitest.config.ts` and ratchets by visible edit only (Development Workflow gate #5).

**Target Platform**: Node.js >= 22.11 LTS, Windows / macOS / Linux. Same as the rest of the project. The dispatch primitive is platform-agnostic; signal handling (`SIGINT`, `SIGTERM`, `SIGKILL`) follows Node's cross-platform semantics — on Windows, `child.kill('SIGTERM')` translates to terminating the process via the Windows API (no graceful cooperation), but the 2 s SIGKILL fallback exists regardless and is the load-bearing guarantee.

**Project Type**: Single project (CLI + MCP server in one TypeScript package). Fits Option 1 from the plan template; identical to features 001–007.

**Performance Goals**:
- Typed-tool calls bounded at **10 s / 10 MiB** (`TYPED_TOOL_TIMEOUT_MS` / `TYPED_TOOL_OUTPUT_CAP_BYTES`).
- Escape-hatch calls bounded at **30 s / 10 MiB** by default, **120 s** ceiling when `timeoutMs` is overridden (silently clamped above ceiling per FR-011).
- Synthetic-spawn timeout-fire latency: ≤ 10.5 s (SC-003).
- Resident-memory growth during a 10 MiB cap-exceeded test: < 20 MiB (SC-004).
- Boot-time `assertToolDocsExist` walk: O(N) `fs.existsSync` calls for N registered tools (3 today). Negligible.
- `dispatchCli` itself adds zero per-success-path logger overhead (zero stderr writes) — measurable as test assertion in SC-011.

**Constraints**:
- **FR-019 binding**: MCP wire surface (`name`, `description`, `inputSchema` shape) for `read_note`, `obsidian_exec`, `help` MUST be byte-equivalent to 0.1.7's output (modulo whitespace / property order). The `obsidianExecSchema.timeoutMs.max(120000)` zod constraint stays in place — the silent clamp at 120 s is a defense-in-depth implementation, unreachable from MCP today (research R2).
- **FR-018a binding**: dispatch primitive emits log lines ONLY for the three failure-lifecycle events. Success-path classification verdicts and four of the six failure codes (`CLI_NON_ZERO_EXIT`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR`, `CLI_BINARY_NOT_FOUND`) MUST NOT emit log lines from the dispatch primitive.
- **FR-015a binding**: registry insertion is synchronous with `spawn()`. No `await` or microtask boundary may interpose.
- **Principle III binding**: published JSON Schema MUST be derived from the zod schema via `toMcpInputSchema`; hand-rolled JSON Schemas are rejected. Each tool's `schema.ts` exports the zod schema only.
- **Principle I binding**: `src/server.ts` MUST NOT import from `src/tools/*/handler.ts`; the killInFlightChildren import re-points to `src/cli-adapter/`. Cross-module import direction stays downward.
- **ADR-007 asymmetry binding**: 10 s typed-tool timeout vs 30 s `obsidian_exec` default is an architectural signal, not a number to symmetrize. A future maintainer who "fixes" the gap without consulting ADR-007 violates the signal.

**Scale/Scope**: Estimated change footprint:
- ~7 new files: `_register.ts` + co-located test, `_dispatch.ts` + co-located test, `invoke-bounded-cli.ts` + co-located test, plus three per-tool `index.ts` (and three matching `index.test.ts`).
- ~4 files renamed/repurposed: `cli-adapter.ts` (becomes the `invokeCli` typed-tool facade), `cli-adapter.test.ts`, the three per-tool `tool.ts` → deleted, the three per-tool `tool.test.ts` → deleted (replaced by `index.test.ts`).
- ~6 files modified: three per-tool `schema.ts` (drop `*InputJsonSchema` exports), three per-tool `handler.ts` (route through new facades; remove duplicate spawn-and-collect from obsidian_exec/handler.ts), `server.ts` (import re-point + `assertToolDocsExist` invocation), `target-mode/target-mode.ts` (drop the `targetModeJsonSchema` companion per research R10), `logger.ts` (remove unused call.* methods, add dispatch.* methods), `package.json` (version bump), and `docs/tools/obsidian_exec.md` (add `ERR_NO_ACTIVE_FILE` per FR-021).
- ~1 new file: `CHANGELOG.md` at repo root, with a 0.2.0 section calling out the operator-observable changes.
- Total: ~600–800 LOC of source + tests added/modified, ~150 LOC removed (the per-tool publication boilerplate and duplicate spawn-and-collect).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Compliance | How |
|---|-----------|------------|-----|
| I | Modular Code Organization | ✅ | New modules each carry a single clear responsibility: `_register.ts` (publication pipeline), `_dispatch.ts` (spawn lifecycle + bounds + classification + registry), `invoke-bounded-cli.ts` (escape-hatch facade). Cross-module imports flow downward: server → tools → cli-adapter → external SDK / `node:child_process`. The Principle-I violation at [src/server.ts:9](../../src/server.ts#L9) (`import { killActiveChild } from "./tools/obsidian_exec/handler.js"`) is FIXED — the new import is `import { killInFlightChildren } from "./cli-adapter/cli-adapter.js"` (or a matching re-export point). The `{ schema, handler, index }.ts` per-surface layout pattern is preserved (the spec's "rename `tool.ts` → `index.ts`" is a within-pattern change, not a structural deviation). |
| II | Public Surface Test Coverage | ✅ | Every new module ships co-located tests in the same change set. `_register.test.ts` covers happy + boundary cases for every leg of the publication pipeline (envelope application, description stripping, ZodError → VALIDATION_ERROR, UpstreamError marshalling, response-format dispatch, doc-file aggregation). `_dispatch.test.ts` covers the four-priority classification, bounds enforcement, registry insertion atomicity, and the three failure-lifecycle log emissions. `invoke-bounded-cli.test.ts` covers default bounds, override application, ceiling clamp, and propagation to dispatchCli. The three new per-tool `index.test.ts` files cover the registered descriptor's published shape and the handler's response envelope on happy + error paths. The registry-consistency block in `src/server.test.ts` (three invariants) stays as defense-in-depth (FR-007). |
| III | Boundary Input Validation with Zod | ✅ | `registerTool(spec)` consumes the zod schema directly via the `spec.schema` field; the published JSON Schema is mechanically derived through `toMcpInputSchema(spec.schema)` (the only path). Each tool's `schema.ts` exports the zod schema only — no `zodToJsonSchema` invocation, no parallel hand-written JSON Schema. The constitution's anti-drift clause is satisfied because there is no parallel shape that *could* drift. The `obsidianExecSchema.timeoutMs.max(120000)` runtime constraint is preserved at the MCP boundary (research R2). |
| IV | Explicit Upstream Error Propagation | ✅ | `registerTool` centralizes `UpstreamError → asToolError(...)` and `ZodError → VALIDATION_ERROR` marshalling. `dispatchCli` raises `UpstreamError` for every classification verdict (`CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`); it does NOT swallow / mask any failure. No new error codes are introduced into `src/errors.ts` (FR-021 / SC-008 reworded). The `obsidian_exec` reachable code-set expansion (`ERR_NO_ACTIVE_FILE` newly reachable) is called out in CHANGELOG.md and `docs/tools/obsidian_exec.md` per FR-021. |
| V | Attribution & Layered Composition Transparency | ✅ | All new files carry the `// Original — no upstream. <one-line description>.` header per Principle V. No upstream lineage is added. README.md's Attributions section requirement remains a non-issue (no source-derived code in this project; this feature does not change that). |

**Coverage gate** (Development Workflow #5): The aggregate statements threshold in `vitest.config.ts` is the merge floor. New code paths come with co-located tests; coverage should not regress. If `vitest run --coverage` reports a drop, the threshold ratchets in the same change-set per the visible-edit rule (no PR ships a downgrade silently).

**No Constitution Compliance violations to track. Complexity Tracking section is empty by design.**

## Project Structure

### Documentation (this feature)

```text
specs/008-refactor/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # /speckit-specify + /speckit-clarify output (Sessions 1+2: Q1–Q6)
├── research.md          # Phase 0 output (this command) — R1–R12 decisions + alternatives
├── data-model.md        # Phase 1 output (this command) — ToolSpec, RegisteredTool, DispatchInput, registry shapes
├── quickstart.md        # Phase 1 output (this command) — verification scenarios for SC-001..SC-011
├── contracts/
│   ├── register-tool.contract.md         # registerTool({ ... }) interface contract + worked examples
│   ├── dispatch-cli.contract.md          # dispatchCli interface contract — argv order, classification, bounds, registry
│   ├── invoke-cli.contract.md            # invokeCli typed-tool facade contract (fixed bounds)
│   └── invoke-bounded-cli.contract.md    # invokeBoundedCli escape-hatch facade contract (clamping, override semantics)
├── checklists/
│   └── requirements.md  # /speckit-specify output (existing)
└── tasks.md             # Phase 2 output (/speckit-tasks command — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── cli-adapter/
│   ├── _dispatch.ts                # NEW — private dispatchCli + active-child cell + failure-lifecycle log emission + atomic registry insertion (FR-008..FR-014, FR-015..FR-016, FR-018a, FR-015a).
│   ├── _dispatch.test.ts           # NEW — co-located tests for dispatchCli (classification table, bounds, registry, atomicity, log emissions).
│   ├── cli-adapter.ts              # MODIFIED — repurposed as the invokeCli typed-tool facade (10 s / 10 MiB fixed bounds; calls into dispatchCli; queues via queue.run). Keeps the existing `target_mode`-aware locator strip.
│   ├── cli-adapter.test.ts         # MODIFIED — adapts to invokeCli's new bounds + queue + classification routes through dispatchCli.
│   ├── invoke-bounded-cli.ts       # NEW — invokeBoundedCli escape-hatch facade (default 30 s / 10 MiB; overrides bag with `timeoutMs` clamped at 120 s; calls into dispatchCli; queues via queue.run).
│   └── invoke-bounded-cli.test.ts  # NEW — co-located tests (default bounds, override application, 120 s clamp, propagation).
├── tools/
│   ├── _register.ts                # NEW — registerTool(spec) factory + assertToolDocsExist(tools[]) aggregator (FR-001..FR-005).
│   ├── _register.test.ts           # NEW — co-located tests for the publication pipeline + doc-file aggregation.
│   ├── _shared.ts                  # MODIFIED — `toMcpInputSchema` and `asToolError` retained; `RegisteredTool`/`ToolDescriptor`/`ToolCallHandler`/`ToolCallResult` retained. The `JsonSchemaObject` type may consolidate with the one from `src/help/strip-schema.ts` (cleanup, no API change).
│   ├── _shared.test.ts             # unchanged
│   ├── help/
│   │   ├── handler.ts              # unchanged
│   │   ├── handler.test.ts         # unchanged
│   │   ├── schema.ts               # MODIFIED — drops `helpInputJsonSchema` export (Principle III: zod-only).
│   │   ├── schema.test.ts          # MODIFIED — drops the `helpInputJsonSchema` test.
│   │   ├── tool.ts                 # DELETED — replaced by index.ts.
│   │   ├── tool.test.ts            # DELETED — replaced by index.test.ts.
│   │   ├── index.ts                # NEW — `createHelpTool(): RegisteredTool` factory wrapping `registerTool({ name, description, schema, handler, responseFormat: "raw" })`.
│   │   └── index.test.ts           # NEW — descriptor + handler tests via the registered surface.
│   ├── obsidian_exec/
│   │   ├── handler.ts              # MODIFIED — drops timeout/cap/active-child/spawn-and-collect logic (moved to _dispatch.ts); the handler becomes a thin transformer: parsed input → invokeBoundedCli call → output envelope. Keeps argv assembly only as a unit-testable transform if useful, otherwise inlined.
│   │   ├── handler.test.ts         # MODIFIED — drops the spawn / timeout / cap / kill tests (now in _dispatch.test.ts); keeps integration tests against invokeBoundedCli's behavior.
│   │   ├── schema.ts               # MODIFIED — drops `obsidianExecInputJsonSchema` export.
│   │   ├── schema.test.ts          # MODIFIED — drops the JSON-Schema export test.
│   │   ├── tool.ts                 # DELETED — replaced by index.ts.
│   │   ├── tool.test.ts            # DELETED — replaced by index.test.ts.
│   │   ├── index.ts                # NEW — `createObsidianExecTool(deps): RegisteredTool` factory wrapping `registerTool({ ..., responseFormat: "json" (default) })`.
│   │   └── index.test.ts           # NEW — descriptor + handler tests via the registered surface.
│   └── read_note/
│       ├── handler.ts              # MODIFIED — routes through `invokeCli` (the bounded typed-tool facade); behavior unchanged at the response-envelope level.
│       ├── handler.test.ts         # MODIFIED — adapts to invokeCli's new bounded behavior (the timeout/cap paths are now exercised against the typed-tool surface).
│       ├── schema.ts               # MODIFIED — re-exports `targetModeSchema` only (drops `readNoteInputJsonSchema` and the `targetModeJsonSchema` import).
│       ├── schema.test.ts          # MODIFIED — drops the JSON-Schema export test.
│       ├── tool.ts                 # DELETED — replaced by index.ts.
│       ├── tool.test.ts            # DELETED — replaced by index.test.ts.
│       ├── index.ts                # NEW — `createReadNoteTool(deps): RegisteredTool` factory wrapping `registerTool({ ..., responseFormat: "json" })`.
│       └── index.test.ts           # NEW — descriptor + handler tests.
├── target-mode/
│   ├── target-mode.ts              # MODIFIED — drops the `targetModeJsonSchema` companion (per research R10; unused once registerTool always applies the envelope helper).
│   └── target-mode.test.ts         # MODIFIED — drops the `targetModeJsonSchema` shape test.
├── logger.ts                       # MODIFIED — removes `callStart` / `callEndSuccess` / `callEndFailure` (unused after dispatch primitive's failure-only discipline) and adds `dispatchTimeout` / `dispatchCap` / `dispatchKill` (or one `dispatchEvent({ kind, ... })` method). `shutdown` event preserved (server.ts uses it).
├── logger.test.ts                  # MODIFIED — removes tests for the dropped methods; adds tests for the new dispatch.* methods.
├── server.ts                       # MODIFIED — tool array uses `create*Tool` factories; calls `assertToolDocsExist(tools)` synchronously after construction; imports `killInFlightChildren` from `cli-adapter` (Principle-I fix).
├── server.test.ts                  # MODIFIED — registry-consistency block stays (three invariants); test cases adapt to the new factory shapes; new tests for the boot-time aggregated-doc-miss error.
└── (every other src/ file unchanged)

docs/tools/obsidian_exec.md         # MODIFIED — error-codes section gains `ERR_NO_ACTIVE_FILE` (per FR-021).
package.json                        # MODIFIED — version 0.1.7 → 0.2.0.
CHANGELOG.md                        # NEW (repo root) — release notes section for 0.2.0 calling out:
                                    #   - typed-tool calls now bounded at 10 s / 10 MiB
                                    #   - typed-tool calls now serialize through the FIFO queue
                                    #   - obsidian_exec stops emitting per-call lifecycle stderr lines
                                    #   - obsidian_exec error roster expands to include ERR_NO_ACTIVE_FILE
                                    #   - registerTool factory is the only path from zod schema to MCP descriptor
```

**Structure Decision**: Single-project TypeScript layout per Constitution Principle I and the existing repo convention (Option 1 from the plan template). Tests are co-located with their source modules per Principle II — `_register.ts` → `_register.test.ts`, `_dispatch.ts` → `_dispatch.test.ts`, etc. No new top-level directories. The `src/cli-adapter/` directory gains two new files (`_dispatch.ts`, `invoke-bounded-cli.ts`); `src/tools/` gains one new file (`_register.ts`); each tool directory gains an `index.ts` + `index.test.ts` and loses `tool.ts` + `tool.test.ts`.

## Phase 0: Outline & Research

**Output**: [research.md](research.md) — twelve research items (R1–R12) covering:

- **R1**: where `dispatchCli` lives in the module tree
- **R2**: clamp-vs-zod-max ordering for `obsidian_exec`'s `timeoutMs`
- **R3**: fate of the existing `call.start` / `call.end*` logger events (operator-observable signal change)
- **R4**: target-mode locator stripping placement (above vs below dispatchCli)
- **R5**: `--copy` suffix routing in the unified argv
- **R6**: queue-wrapping of both facades (read_note now serializes with obsidian_exec)
- **R7**: in-flight registry data shape and `killInFlightChildren` export point
- **R8**: agent-context update target (CLAUDE.md SPECKIT block)
- **R9**: version bump direction (0.1.7 → 0.2.0 minor)
- **R10**: `targetModeJsonSchema` companion fate (drop)
- **R11**: `docs/tools/obsidian_exec.md` ERR_NO_ACTIVE_FILE addition placement
- **R12**: CHANGELOG.md introduction + section structure (no prior CHANGELOG exists in repo)

Every item resolves a "NEEDS CLARIFICATION" left implicit by the spec, with a Decision / Rationale / Alternatives format. No item escalates to a `/speckit-clarify` re-entry — all are plan-stage execution choices that the spec deliberately deferred.

## Phase 1: Design & Contracts

**Prerequisites**: research.md complete (12 decisions ratified).

**Outputs**:

1. **[data-model.md](data-model.md)** — type-level shapes for the new surfaces:
   - `ToolSpec<TSchema, TDeps>` (the declarative input to `registerTool`)
   - `RegisteredTool` (re-stated, unchanged from `_shared.ts`)
   - `DispatchInput` (the input to `dispatchCli` — argv components, timeout, output cap, optional `copy` flag)
   - `DispatchOutput` (the success envelope: `stdout`, `stderr`, `exitCode`, `argv`)
   - `InvokeCliInput` / `InvokeBoundedCliInput` / `InvokeBoundedCliOverrides`
   - `InFlightChildRegistry` (single-cell shape; plural-named `killInFlightChildren()` exported function)
   - The new `Logger` interface methods (`dispatchTimeout`, `dispatchCap`, `dispatchKill`) and JSON line shapes

2. **[contracts/](contracts/)** — four interface contracts:
   - **`register-tool.contract.md`** — input shape, output `RegisteredTool` envelope, behavior of each pipeline step, ZodError + UpstreamError marshalling examples, response-format dispatch, the `assertToolDocsExist` aggregator's error message format.
   - **`dispatch-cli.contract.md`** — argv order, the four-priority classification with examples for each verdict, bounds enforcement (timeout fires at the caller-supplied `timeoutMs`; output cap kills with SIGTERM → SIGKILL after 2 s), atomic registry insertion (no `await` between `spawn()` and registry write), failure-lifecycle log emission (one stderr line each for `dispatch.timeout`, `dispatch.cap`, `dispatch.kill`).
   - **`invoke-cli.contract.md`** — fixed bounds (10 s / 10 MiB), no override knobs, target-mode locator strip applied above dispatchCli, queue.run wrapping. Input includes `target_mode`; output is `{ stdout, stderr }` (matches today's adapter shape).
   - **`invoke-bounded-cli.contract.md`** — default bounds (30 s / 10 MiB), `overrides.timeoutMs` clamping at 120 s (silent), no output-cap override (FR-011), queue.run wrapping. Input is the `obsidian_exec` parsed shape; output includes `argv` (matches today's `obsidian_exec` output shape).

3. **[quickstart.md](quickstart.md)** — twelve verification scenarios mapped to SC-001 through SC-011 plus the doc-file aggregation drill:
   - SC-001 dummy-tool registration walk (~10-line `index.ts`)
   - SC-002 grep for direct `zodToJsonSchema` / `stripSchemaDescriptions` / `toMcpInputSchema` outside the registration entry point
   - SC-003 synthetic-spawn timeout fires within 10.5 s
   - SC-004 synthetic-spawn cap-exceeded ≤ 10 MiB partial; resident-memory growth < 20 MiB
   - SC-005 SIGINT during in-flight typed-tool call: SIGTERM → 2 s grace → SIGKILL; zero orphans
   - SC-006 `tools/list` byte-equivalence against 0.1.7 snapshot
   - SC-007 full pre-existing test suite passes
   - SC-008 `src/errors.ts` diff shows zero new identifiers; `docs/tools/*.md` diff shows obsidian_exec.md ERR_NO_ACTIVE_FILE addition only
   - SC-009 `grep src/server.ts` for tool-internal imports → none
   - SC-010 release tag lands
   - SC-011 dispatch primitive emits exactly one stderr line per failure-lifecycle event, zero on success
   - Doc-aggregation drill: rename `docs/tools/help.md` away, boot the server, assert error message lists all missing files

4. **Agent context update** — patch the SPECKIT-managed block in [CLAUDE.md](../../CLAUDE.md) so the active feature pointer references this plan: `Active feature: 008-refactor` with the seven-bullet plan summary. Block boundaries (`<!-- SPECKIT START -->` / `<!-- SPECKIT END -->`) are the only edits; no content outside those markers is touched.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

(Empty — Constitution Check above passes all five principles with no deviations. The two-part deepening is a structural simplification: it consolidates duplicated logic and removes more LOC than it adds. The Principle-I downward-flow violation at `server.ts:9` is FIXED as a side effect, not introduced.)
