---
description: "Task list for 008-refactor — Centralized Tool Registration and CLI Dispatch Bounds"
---

# Tasks: Centralized Tool Registration and CLI Dispatch Bounds

**Input**: Design documents from [`/specs/008-refactor/`](.)
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Co-located `*.test.ts` files per Constitution Principle II (NON-NEGOTIABLE — public surface coverage in same change-set). Tests are NOT requested as a separate red-green TDD loop; instead, every implementation task lands with its co-located test file in the same task. Verify-fails-first is not part of this feature's contract.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. US1 (registerTool factory) and US2 (dispatchCli primitive) are independent; US3 (SIGINT) layers on top of US2's `_dispatch.ts` (deliberate non-independence called out in spec's prioritization rationale — US3's "Why this priority" notes the bug is invisible during normal operation, so it ships AFTER the dispatch primitive lands in US2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in this list)
- **[Story]**: Which user story this task belongs to (US1 / US2 / US3 / US4)
- File paths are repo-relative

## Path Conventions

Single-project TypeScript layout per Constitution Principle I. All paths are relative to the repo root [`c:\Github\obsidian-cli-mcp\`](../../). Source code lives under [src/](../../src/); co-located tests live alongside their source modules per Principle II.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

No setup tasks — the repository's TypeScript / vitest / zod tooling is already configured (predecessor features 001–007). This feature introduces no new dependencies. Skip directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

No foundational tasks. US1 (registerTool) and US2 (dispatchCli) are independently implementable — they do not share a common prerequisite beyond the existing `src/tools/_shared.ts` helpers (`asToolError`, `toMcpInputSchema`, `RegisteredTool` types) which are unchanged by this feature. US3 layers on top of US2's `_dispatch.ts`; US4 is verification-only and runs after US1+US2+US3 land.

**Checkpoint**: Foundation ready (already in place from predecessors) — user story implementation can begin.

---

## Phase 3: User Story 1 — Adding a new typed tool is a six-line registration plus its actual content (Priority: P1) 🎯 MVP

**Goal**: Introduce `registerTool(spec)` factory + `assertToolDocsExist(tools[])` aggregator. Collapse each tool's `tool.ts` boilerplate into a thin `index.ts` calling the factory. Drop the now-redundant `*InputJsonSchema` exports and the `targetModeJsonSchema` companion (R10).

**Independent Test**: Per spec US1 — add a hypothetical typed tool through the new pipeline and confirm: (a) `schema.ts` zod-only, (b) `index.ts` ≤ ~10 lines, (c) appears in `tools/list` with `inputSchema.type === "object"` and stripped descriptions, (d) valid input succeeds, (e) invalid input → `VALIDATION_ERROR`, (f) handler `UpstreamError` → structured envelope. Plus: rename a `docs/tools/{name}.md` away → boot fails with aggregated message naming the missing file.

### Implementation for User Story 1

- [ ] T001 [US1] Implement `registerTool(spec)` + `assertToolDocsExist(tools, docsDir)` in [src/tools/_register.ts](../../src/tools/_register.ts) per [contracts/register-tool.contract.md](contracts/register-tool.contract.md) — pipeline: `toMcpInputSchema` → `stripSchemaDescriptions` → wrapped handler with `ZodError` → `VALIDATION_ERROR` and `UpstreamError` → `asToolError` marshalling → response-format dispatch (`"json"` default; `"raw"` passthrough). Aggregator walks every tool's `docs/tools/{name}.md`, collects every miss, raises one error listing all (FR-005 / Q4).
- [ ] T002 [US1] Co-located tests in [src/tools/_register.test.ts](../../src/tools/_register.test.ts) covering: descriptor envelope shape (top-level `type: "object"`); descriptions stripped at every nested depth; `responseFormat: "json"` wraps in `{ content: [{ type: "text", text: JSON.stringify(...) }] }`; `responseFormat: "raw"` passes through; `ZodError` → `VALIDATION_ERROR` envelope with `details.issues`; `UpstreamError` → `asToolError`; non-Error throw re-thrown; `assertToolDocsExist` aggregates ALL misses (synthetic fixture) per FR-005 / Q4.
- [ ] T003 [P] [US1] Drop `targetModeJsonSchema` export from [src/target-mode/target-mode.ts](../../src/target-mode/target-mode.ts) per R10 and remove its co-located test from [src/target-mode/target-mode.test.ts](../../src/target-mode/target-mode.test.ts).
- [ ] T004 [P] [US1] Drop `helpInputJsonSchema` export from [src/tools/help/schema.ts](../../src/tools/help/schema.ts) (zod-only export per FR-006) and remove the matching test from [src/tools/help/schema.test.ts](../../src/tools/help/schema.test.ts).
- [ ] T005 [P] [US1] Drop `obsidianExecInputJsonSchema` export from [src/tools/obsidian_exec/schema.ts](../../src/tools/obsidian_exec/schema.ts) (FR-006); leave the existing `.max(120000)` zod constraint on `timeoutMs` unchanged (R2). Remove the matching test from [src/tools/obsidian_exec/schema.test.ts](../../src/tools/obsidian_exec/schema.test.ts).
- [ ] T006 [P] [US1] Drop `readNoteInputJsonSchema` export AND the `targetModeJsonSchema` import from [src/tools/read_note/schema.ts](../../src/tools/read_note/schema.ts) (FR-006 + R10); the file should re-export `targetModeSchema` only. Remove the matching test from [src/tools/read_note/schema.test.ts](../../src/tools/read_note/schema.test.ts). Depends on T003.
- [ ] T007 [US1] Create [src/tools/help/index.ts](../../src/tools/help/index.ts) with `createHelpTool(): RegisteredTool` calling `registerTool({ name: "help", description, schema: helpInputSchema, handler: executeHelp, responseFormat: "raw" })` per [contracts/register-tool.contract.md Example B](contracts/register-tool.contract.md). Add co-located tests in [src/tools/help/index.test.ts](../../src/tools/help/index.test.ts) covering descriptor + handler via the registered surface. Depends on T001, T002, T004.
- [ ] T008 [US1] Delete [src/tools/help/tool.ts](../../src/tools/help/tool.ts) and [src/tools/help/tool.test.ts](../../src/tools/help/tool.test.ts) (replaced by index.ts/index.test.ts). Depends on T007.
- [ ] T009 [US1] Create [src/tools/obsidian_exec/index.ts](../../src/tools/obsidian_exec/index.ts) with `createObsidianExecTool(deps): RegisteredTool` calling `registerTool({ ..., responseFormat: "json" })`. Add co-located tests in [src/tools/obsidian_exec/index.test.ts](../../src/tools/obsidian_exec/index.test.ts) covering descriptor + happy/error handler paths via the registered surface. Depends on T001, T002, T005.
- [ ] T010 [US1] Delete [src/tools/obsidian_exec/tool.ts](../../src/tools/obsidian_exec/tool.ts) and [src/tools/obsidian_exec/tool.test.ts](../../src/tools/obsidian_exec/tool.test.ts). Depends on T009.
- [ ] T011 [US1] Create [src/tools/read_note/index.ts](../../src/tools/read_note/index.ts) with `createReadNoteTool(deps): RegisteredTool` calling `registerTool({ ..., responseFormat: "json" })` per [contracts/register-tool.contract.md Example A](contracts/register-tool.contract.md). Add co-located tests in [src/tools/read_note/index.test.ts](../../src/tools/read_note/index.test.ts) covering descriptor + handler via the registered surface. Depends on T001, T002. (T011 imports the unchanged `readNoteInputSchema` zod export; T006's drop of `readNoteInputJsonSchema` is independent — both can land in the same change-set without strict ordering.)
- [ ] T012 [US1] Delete [src/tools/read_note/tool.ts](../../src/tools/read_note/tool.ts) and [src/tools/read_note/tool.test.ts](../../src/tools/read_note/tool.test.ts). Depends on T011.
- [ ] T013 [US1] Refactor [src/server.ts](../../src/server.ts) to construct the tool array using `create*Tool(deps)` factories (one entry each for help, obsidian_exec, read_note) and invoke `assertToolDocsExist(tools, "docs/tools")` synchronously after construction (FR-005). Depends on T007, T009, T011.
- [ ] T014 [US1] Update [src/server.test.ts](../../src/server.test.ts): preserve the registry-consistency block's three invariants (a) no name duplication, (b) every tool has `docs/tools/{name}.md`, (c) every `inputSchema.type === "object"` per FR-007; add a new test driving `assertToolDocsExist` with a synthetic missing-doc fixture and asserting the aggregated boot-failure error message names ALL missing files (FR-005 / Q4 drill from quickstart Scenario 2); add a wire-shape assertion (FR-019 / SC-006) that pins each registered tool's published descriptor against MCP `Tool` schema validation (AJV-based or equivalent) plus a structural property-set comparison verifying byte-equivalence to 0.1.7's output (modulo whitespace / property order) for `read_note`, `obsidian_exec`, and `help` — covers quickstart Scenario 9. Depends on T013.

**Checkpoint**: User Story 1 fully functional and testable independently. All three currently-registered tools register through `registerTool`; their published `tools/list` descriptors are byte-equivalent to 0.1.7 (FR-019); `index.ts` files are ≤ ~10 lines (SC-001); zero direct `zodToJsonSchema`/`stripSchemaDescriptions`/`toMcpInputSchema` calls outside `_register.ts` and `_shared.ts` (SC-002).

---

## Phase 4: User Story 2 — Typed tools cannot hang or OOM the host on a misbehaving binary (Priority: P1)

**Goal**: Introduce `dispatchCli` private primitive with always-on bounds + four-priority classification + atomic in-flight registry. Two facades on top: `invokeCli` (typed-tool, fixed 10s/10MiB) and `invokeBoundedCli` (escape-hatch, default 30s/10MiB, `timeoutMs` overridable up to a 120s silently-clamped ceiling). Refactor `obsidian_exec/handler.ts` to route through `invokeBoundedCli`. Logger interface gains `dispatch.*` failure-lifecycle methods and drops `call.*` lifecycle methods (R3).

**Independent Test**: Per spec US2 — synthetic spawn that never exits → `CLI_TIMEOUT` within ~10.5s (SC-003); synthetic spawn emitting 11 MiB → `CLI_OUTPUT_TOO_LARGE` with partial ≤ 10 MiB and host RSS growth < 20 MiB (SC-004); argv order matches `[binary, vault=..., command, kvs..., flags..., --copy]` regardless of facade (FR-012).

### Implementation for User Story 2

- [ ] T015 [US2] Update [src/logger.ts](../../src/logger.ts) per data-model §9 + R3: drop `callStart`, `callEndSuccess`, `callEndFailure` methods (and the corresponding `call.start`/`call.end` JSON event shapes); add `dispatchTimeout(event)`, `dispatchCap(event)`, `dispatchKill(event)` methods emitting one stderr JSON line per call per the shapes specified in data-model §9. Preserve the existing `shutdown(event)` method. Update co-located [src/logger.test.ts](../../src/logger.test.ts) to drop tests for removed methods and add tests asserting the new `dispatch.*` JSON line shapes.
- [ ] T016 [US2] Implement [src/cli-adapter/_dispatch.ts](../../src/cli-adapter/_dispatch.ts) per [contracts/dispatch-cli.contract.md](contracts/dispatch-cli.contract.md): export `dispatchCli(input, deps): Promise<DispatchOutput>` with argv assembly per FR-012 (`[binary, vault=..., command, kvs..., flags..., --copy]`); four-priority classification per FR-014 (non-zero exit > `Error: no active file` > `Error:` prefix > success); always-on bounds (timeout `setTimeout` → SIGTERM, then 2s grace → SIGKILL; output cap chunk-checked → same SIGTERM/SIGKILL ladder; both timers `unref()`); module-level `inFlightChild: ChildProcess | null` cell with insertion synchronous-with-spawn (FR-015a — NO `await` between `spawnFn(...)` and `inFlightChild = child`); export `killInFlightChildren()` returning boolean and emitting one `dispatch.kill` stderr line; failure-lifecycle log emissions for `dispatch.timeout` / `dispatch.cap` only (FR-018a — zero emissions on success and on the four non-bounds failure verdicts). Depends on T015.
- [ ] T017 [US2] Co-located tests in [src/cli-adapter/_dispatch.test.ts](../../src/cli-adapter/_dispatch.test.ts): argv assembly (vault/command/parameters/flags/copy combinations, pinned against documented order); classification table — every row of [contracts/dispatch-cli.contract.md](contracts/dispatch-cli.contract.md) under "four-priority error classification" asserts via synthetic spawn fixtures (`CLI_BINARY_NOT_FOUND`, `CLI_NON_ZERO_EXIT`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR`, success, `CLI_TIMEOUT`, `CLI_OUTPUT_TOO_LARGE`); bounds (timeout fires within `timeoutMs + 500ms`; cap-overflow truncates to `outputCapBytes`); log emission counts — exactly ONE `dispatch.timeout` line on timeout fire, ONE `dispatch.cap` on cap fire, ZERO on every success path and on the four non-bounds failure verdicts (SC-011 dedicated assertion). Depends on T016.
- [ ] T018 [P] [US2] Repurpose [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) as `invokeCli` typed-tool facade per [contracts/invoke-cli.contract.md](contracts/invoke-cli.contract.md): export constants `TYPED_TOOL_TIMEOUT_MS = 10_000` and `TYPED_TOOL_OUTPUT_CAP_BYTES = 10 * 1024 * 1024` (NOT part of public interface — no override knob per FR-013); apply locator-strip when `target_mode === "active"` (drop `vault`/`file`/`path` from `parameters` before handing off); wrap dispatch through `deps.queue.run(...)` per R6; route to `dispatchCli` with the fixed bounds; project output to `{ stdout, stderr }` (drop `exitCode`/`argv` for the typed-tool surface); re-export `killInFlightChildren` for `server.ts` to import (R7 / FR-017). Depends on T016.
- [ ] T019 [P] [US2] Implement [src/cli-adapter/invoke-bounded-cli.ts](../../src/cli-adapter/invoke-bounded-cli.ts) per [contracts/invoke-bounded-cli.contract.md](contracts/invoke-bounded-cli.contract.md): export constants `OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS = 30_000`, `OBSIDIAN_EXEC_OUTPUT_CAP_BYTES = 10 * 1024 * 1024`, `OBSIDIAN_EXEC_MAX_TIMEOUT_MS = 120_000`; compute `effectiveTimeoutMs = Math.min(overrides.timeoutMs ?? DEFAULT, MAX)` — silent clamp per Q1 / FR-011 (NO `VALIDATION_ERROR`, NO warning, NO log line on clamp); no locator-strip (escape-hatch trusts caller params); wrap dispatch through `deps.queue.run(...)`; pass `--copy` through when `input.copy === true`; pass-through `{ stdout, stderr, exitCode, argv }` from dispatch. Depends on T016.
- [ ] T020 [US2] Update [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts): preserve classification tests (now exercising the path through `dispatchCli`); add bounds tests (synthetic 11s spawn → `CLI_TIMEOUT` within ~10.5s — SC-003 binding; synthetic 11 MiB spawn → `CLI_OUTPUT_TOO_LARGE` with partial ≤ 10 MiB — SC-004 binding); add locator-strip test (`target_mode: "active"` with `parameters: { vault: "x", file: "y" }` → dispatchCli receives `parameters: {}` and undefined `vault`); add queue-serialization test (two `invokeCli` calls overlap → second waits — R6 binding). Depends on T018.
- [ ] T021 [US2] Co-located tests in [src/cli-adapter/invoke-bounded-cli.test.ts](../../src/cli-adapter/invoke-bounded-cli.test.ts): default 30s timeout fires; `overrides.timeoutMs: 90_000` honored (`details.timeoutMs === 90000`); silent clamp at 120s — `overrides.timeoutMs: 200_000` against 121s synthetic spawn → `CLI_TIMEOUT` with `details.timeoutMs === 120000`, NO `VALIDATION_ERROR`, NO warning, NO extra log line beyond the single `dispatch.timeout` emitted by `dispatchCli` (Q1 / FR-011 binding from quickstart Scenario 7); `--copy` flag handling; queue-serialization between two overlapping `invokeBoundedCli` calls. Depends on T019.
- [ ] T022 [US2] Refactor [src/tools/obsidian_exec/handler.ts](../../src/tools/obsidian_exec/handler.ts) to route through `invokeBoundedCli`: drop `child_process.spawn`, the local timeout/cap timers, the active-child slot at line 31 (now in `_dispatch.ts`), and ALL `logger.callStart` / `logger.callEndSuccess` / `logger.callEndFailure` invocations (R3 — those events are removed). Handler becomes a thin transformer: parsed input → `invokeBoundedCli({ command, parameters, vault, flags, copy }, { timeoutMs: input.timeoutMs }, deps)` → wrap in `{ stdout, stderr, exitCode, argv }` `ObsidianExecOutput` envelope. Depends on T019.
- [ ] T023 [US2] Update [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts): drop direct spawn / timeout / cap / kill tests (those now live in `_dispatch.test.ts` and `invoke-bounded-cli.test.ts`); keep integration tests asserting the handler's response envelope on happy + each error-classification path via the `invokeBoundedCli` surface; drop `logger.callStart` / `logger.callEnd*` assertions (those events no longer emitted per R3). Depends on T022.
- [ ] T024 [US2] Update [src/tools/read_note/handler.test.ts](../../src/tools/read_note/handler.test.ts) to assert the new bounded behavior reachable through `invokeCli`: a synthetic-spawn timeout test (11s hang → `CLI_TIMEOUT` within ~10.5s); a synthetic-spawn cap test (11 MiB → `CLI_OUTPUT_TOO_LARGE`). The existing classification tests continue to pass — they exercise the same four-priority logic via the `invokeCli` → `dispatchCli` path. Depends on T018.

**Checkpoint**: User Story 2 fully functional and testable independently. Typed tools (`read_note`) and the escape hatch (`obsidian_exec`) BOTH bounded via `dispatchCli`. SC-003 and SC-004 measurable via the new tests. Argv order unified per FR-012.

---

## Phase 5: User Story 3 — SIGINT during any in-flight CLI dispatch cleanly terminates the child (Priority: P2)

**Goal**: Re-point `src/server.ts`'s shutdown import from the tool-internal `killActiveChild` to the cli-adapter's `killInFlightChildren` (FR-017 — fixes the Principle-I downward-flow violation at server.ts:9 as a side effect). Verify atomic registry insertion (FR-015a / Q5) and end-to-end SIGINT handling.

**Independent Test**: Per spec US3 — start a typed-tool call against a synthetic 5s spawn; mid-flight invoke shutdown; verify SIGTERM is delivered, then SIGKILL after 2s grace if still alive; shutdown handler reports `inFlightKilled: true`; zero orphan processes after shutdown (SC-005).

**Note on prerequisites**: US3 cannot land before US2's `_dispatch.ts` is in place (the registry it relies on is built in T016). This is deliberate — US3 layers behavioral verification on top of US2's primitive. The spec's prioritization rationale acknowledges this ordering ("Below Stories 1 and 2 because the bug is invisible to a working user during normal operation").

### Implementation for User Story 3

- [ ] T025 [US3] Re-point [src/server.ts](../../src/server.ts):9 — change `import { killActiveChild as defaultKillActiveChild } from "./tools/obsidian_exec/handler.js"` to `import { killInFlightChildren } from "./cli-adapter/cli-adapter.js"` per FR-017 / SC-009 / R7. Update every call site of the old name to `killInFlightChildren`. Confirm via grep that NO `import { ... } from "./tools/*/handler.js"` remains in `src/server.ts` (downward-flow restored). Depends on T018.
- [ ] T026 [US3] Update [src/server.test.ts](../../src/server.test.ts) to verify the new import path (assert via a string-grep test against the file content that `src/server.ts` imports `killInFlightChildren` from `"./cli-adapter/cli-adapter.js"` and contains NO `from "./tools/*/handler.js"` substring) and to drive the shutdown handler end-to-end: with a mid-flight in-flight child → `triggerShutdown` reports `inFlightKilled: true`; with no in-flight child → reports `inFlightKilled: false`; shutdown is idempotent under double-invocation (FR-018 — semantics unchanged). Depends on T025.
- [ ] T027 [US3] Add atomic-insertion test (FR-015a / Q5) in [src/cli-adapter/_dispatch.test.ts](../../src/cli-adapter/_dispatch.test.ts) per quickstart Scenario 8: synthetic spawn returns a child handle; immediately schedule `process.emit("SIGINT")` on the next tick; assert `inFlightChild !== null` at the moment `killInFlightChildren()` runs and returns `true`. If insertion were async, this test would observe `inFlightChild === null` and fail. Depends on T017.
- [ ] T028 [US3] Add `killInFlightChildren`-mid-flight test in [src/cli-adapter/_dispatch.test.ts](../../src/cli-adapter/_dispatch.test.ts) per quickstart Scenario 6: start a synthetic 5s spawn; mid-flight call `killInFlightChildren()`; assert (a) child receives SIGTERM, (b) SIGKILL delivered after 2s grace if still alive, (c) exactly ONE `dispatch.kill` stderr JSON line emitted with the killed child's PID and command, (d) `killInFlightChildren()` returned `true`, (e) zero orphan processes (Node `child_process` introspection or process-listing equivalent). Plus the no-child-in-flight case → returns `false`, no log emitted. Depends on T017.

**Checkpoint**: User Story 3 fully functional and testable independently. Mid-flight SIGINT cleanly kills the typed-tool child (today's gap — typed-tool calls leak). Principle-I import-direction violation at server.ts:9 fixed. SC-005 and SC-009 measurable.

---

## Phase 6: User Story 4 — Future drift is structurally prevented (Priority: P3)

**Goal**: Guardrail-level verifications that confirm the centralization holds — single path from zod to published JSON Schema; single path from the dispatch primitive to the Obsidian binary; no new error code identifiers.

**Independent Test**: Per spec US4 — grep verifications return zero results; the registry-consistency block in `server.test.ts` continues to assert all three invariants for the registered set.

### Implementation for User Story 4

- [ ] T029 [P] [US4] Grep verification (manual or scripted): zero direct calls to `zodToJsonSchema`, `stripSchemaDescriptions`, or `toMcpInputSchema` outside [src/tools/_register.ts](../../src/tools/_register.ts), [src/tools/_shared.ts](../../src/tools/_shared.ts), and their `*.test.ts` files (SC-002 binding). Document the verification commands and outputs in this task's commit message.
- [ ] T030 [P] [US4] Grep verification: zero `child_process.spawn` (or `spawn` from `node:child_process`) invocations against the Obsidian binary outside [src/cli-adapter/_dispatch.ts](../../src/cli-adapter/_dispatch.ts). Test fixtures using synthetic spawns are exempt — the constraint is about real invocations of the binary, not test scaffolding.
- [ ] T031 [P] [US4] Grep verification: zero `from "./tools/*/handler.js"` imports in [src/server.ts](../../src/server.ts) (SC-009 / FR-017 binding from quickstart Scenario 12). The `from "./tools/*/index.js"` imports are EXPECTED — they're the public factory entry points.
- [ ] T032 [P] [US4] Diff verification: `git diff main -- src/errors.ts` produces an empty diff (SC-008 post-Q6 wording — zero new error code identifiers); `git diff main -- docs/tools/` produces changes only in [docs/tools/obsidian_exec.md](../../docs/tools/obsidian_exec.md) for the FR-021 mandated `ERR_NO_ACTIVE_FILE` addition. No other `docs/tools/*.md` file's reachable-codes section changes.

**Checkpoint**: All four guardrails confirmed. The architecture survives future tool-author mistakes — a new tool that hand-rolls JSON Schema, spawns the binary directly, or imports from another tool's handler MUST deliberately work around the seams rather than accidentally bypass them.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation updates, version bump, CHANGELOG introduction, full pre-merge validation.

- [ ] T033 [P] Update [docs/tools/obsidian_exec.md](../../docs/tools/obsidian_exec.md) to add `ERR_NO_ACTIVE_FILE` to the error-codes section per R11 / FR-021. Use the standard description (matching the wording in [docs/tools/read_note.md](../../docs/tools/read_note.md)'s entry for the same code). Append a one-line note that this code is reachable when stdout begins with the `Error: no active file` literal (newly reachable through `obsidian_exec` per FR-021).
- [ ] T034 [P] Create [CHANGELOG.md](../../CHANGELOG.md) at the repo root following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format per R12. Initial section `## [0.2.0] - 2026-05-07` with subsections **Added** / **Changed** / **Removed** enumerating: `registerTool` factory; `dispatchCli` primitive; `invokeBoundedCli` facade; `assertToolDocsExist` aggregator; atomic registry insertion (FR-015a); failure-only stderr logging (FR-018a); `ERR_NO_ACTIVE_FILE` newly reachable through `obsidian_exec` (FR-021); typed-tool calls now bounded (10s/10MiB) and queue-serialized; argv order unified to documented `[binary, vault=..., command, kvs..., flags..., --copy]`; `killActiveChild` renamed `killInFlightChildren` (internal); `call.start`/`call.end*` per-call stderr events removed; `targetModeJsonSchema` companion removed; per-tool `tool.ts` boilerplate collapsed into `index.ts`. Optionally include a `[0.1.7] - 2026-05-06` retrospective entry summarizing feature 007's fix (defer-by-judgment per R12).
- [ ] T035 [P] Bump version in [package.json](../../package.json) from `0.1.7` to `0.2.0` per R9 / FR-020 (minor pre-1.0 SemVer bump for operator-observable behavior changes).
- [ ] T036 Run the full quickstart.md validation: every scenario from [quickstart.md](quickstart.md) Scenarios 1–12 plus the doc-aggregation drill — confirm each green. Scenario coverage: 1 (`_register.ts` unit tests / SC-001+SC-002), 2 (doc-aggregation drill / FR-005 / Q4), 3 (`dispatchCli` classification table / FR-014), 4 (typed-tool 10.5s timeout / SC-003), 5 (typed-tool 10 MiB cap / SC-004), 6 (SIGINT mid-dispatch / SC-005), 7 (invokeBoundedCli 120s silent clamp / Q1+FR-011), 8 (atomic registry insertion / FR-015a / Q5), 9 (`tools/list` byte-equivalence / SC-006+FR-019), 10 (full pre-existing suite / SC-007), 11 (`src/errors.ts` zero-diff + obsidian_exec.md addition only / SC-008+FR-021), 12 (Principle-I server.ts:9 fix / SC-009+FR-017), plus SC-011 dispatch-primitive log-emission count. The end-to-end manual smoke (quickstart §"End-to-end manual smoke") is recommended before tag but not strictly required for merge. Depends on T015–T035, T038, T039.
- [ ] T037 Run the merge-gating commands: `npm run typecheck`, `npm run lint`, `npm run build`, and `npx vitest run --coverage`. Confirm: zero TypeScript errors; zero lint errors; build succeeds; full pre-existing test suite passes (SC-007); aggregate statements coverage threshold in [vitest.config.ts](../../vitest.config.ts) NOT regressed (Development Workflow gate #5 — if it does, the threshold ratchets in the same change-set per the visible-edit rule). Depends on T036.
- [ ] T038 [P] Verify every new `src/` file carries the `// Original — no upstream. <one-line description>.` header per Constitution Principle V. Targets: [src/tools/_register.ts](../../src/tools/_register.ts), [src/cli-adapter/_dispatch.ts](../../src/cli-adapter/_dispatch.ts), [src/cli-adapter/invoke-bounded-cli.ts](../../src/cli-adapter/invoke-bounded-cli.ts), [src/tools/help/index.ts](../../src/tools/help/index.ts), [src/tools/obsidian_exec/index.ts](../../src/tools/obsidian_exec/index.ts), [src/tools/read_note/index.ts](../../src/tools/read_note/index.ts) — and their co-located `*.test.ts` files. Constitution V: "Modules without ANY header... are a violation regardless of whether they are in fact original." Plan-level commitment in plan.md Constitution Check Principle V row. Document the grep command and outputs in this task's commit message. Depends on T001, T007, T009, T011, T016, T019.
- [ ] T039 [P] Verify SC-001's "≤ ~10 lines for index.ts" claim — run `wc -l src/tools/{help,obsidian_exec,read_note}/index.ts` and confirm each file is ≤ 15 LOC (allowing modest slack above the spec's "~10" target for imports + types). If any file exceeds, surface the slip and either tighten the file or amend the SC-001 measurement. Depends on T007, T009, T011.
- [ ] T040 Tag the release per SC-010: bump performed in T035, then run `git tag v0.2.0 && git push --tags`, and (once merged to main) `npm publish` plus `gh release create v0.2.0 --notes-from-tag`. CHANGELOG.md's `[0.2.0]` section serves as the binding release-notes content. Post-merge action — runs after T037 passes and the PR lands on main. Depends on T037.

**Final Checkpoint**: Feature merged and released. T040 completes the SC-010 binding.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: empty — proceed to Phase 2.
- **Foundational (Phase 2)**: empty — proceed to Phase 3.
- **User Stories (Phase 3+)**:
  - **US1 (Phase 3)** is independent of US2/US3/US4 — it does NOT need `_dispatch.ts` to exist.
  - **US2 (Phase 4)** is independent of US1 — it does NOT need `registerTool` to exist (the dispatch primitive is consumed by the existing `obsidian_exec/handler.ts` and `read_note/handler.ts`, which can route through the new facades regardless of whether they're registered via `registerTool` or via the legacy `tool.ts` pattern).
  - **US3 (Phase 5)** depends on US2 — the `killInFlightChildren` re-export from `cli-adapter.ts` (T018) is required for `server.ts` to re-point its import (T025).
  - **US4 (Phase 6)** depends on US1 + US2 + US3 — it verifies the post-feature codebase satisfies the drift-prevention guarantees.
- **Polish (Phase 7)**: depends on all four user stories landing.

### User Story Dependencies

- **US1 (P1, MVP)**: independent — can complete and ship as the first slice of value (centralized registration without bounded dispatch). Realistically, US1 + US2 ship together because the spec frames them as a coordinated deepening, but US1 IS independently testable per its acceptance criteria.
- **US2 (P1)**: independent of US1 in the implementation graph; ships in parallel.
- **US3 (P2)**: depends on US2 (must land after T018).
- **US4 (P3)**: depends on US1 + US2 + US3 (verification-only, runs last).

### Within Each User Story

US1 ordering:
- T001 (registerTool implementation) → T002 (registerTool tests) — both block T007 / T009 / T011.
- T003 (target-mode.ts drop) blocks T006 (read_note schema, which imported targetModeJsonSchema).
- T004 / T005 / T006 are parallel (different files).
- T007 / T009 / T011 (per-tool index.ts + co-located test) are parallel (different files); each depends on T001+T002 and on its sibling schema task.
- T008 / T010 / T012 (per-tool tool.ts deletion) each depend on the sibling index.ts being in place.
- T013 (server.ts factory wiring) depends on T007 + T009 + T011.
- T014 (server.test.ts updates) depends on T013.

US2 ordering:
- T015 (logger interface change) is the gate for T016.
- T016 (`_dispatch.ts` implementation) → T017 (`_dispatch.test.ts`).
- T018 (cli-adapter.ts repurpose to invokeCli) and T019 (invoke-bounded-cli.ts) are parallel — both depend on T016.
- T020 (cli-adapter.test.ts) depends on T018; T021 (invoke-bounded-cli.test.ts) depends on T019; both are parallel.
- T022 (obsidian_exec/handler.ts refactor) depends on T019.
- T023 (obsidian_exec/handler.test.ts) depends on T022.
- T024 (read_note/handler.test.ts) depends on T018; parallel with T022/T023.

US3 ordering:
- T025 (server.ts import re-point) depends on T018.
- T026 (server.test.ts shutdown verification) depends on T025.
- T027 (atomic insertion test) and T028 (kill-in-flight test) both depend on T017 — parallel with each other and with T025/T026.

US4 ordering:
- T029 / T030 / T031 / T032 are all parallel (independent grep / diff verifications); collectively depend on US1 + US2 + US3 being complete.

Polish ordering:
- T033 / T034 / T035 are parallel (different files).
- T038 (Principle V header verification) depends on T001 + T007 + T009 + T011 + T016 + T019; parallel with T033 / T034 / T035 since it touches no source.
- T039 (LOC verification for SC-001) depends on T007 + T009 + T011; parallel with T033 / T034 / T035 / T038.
- T036 (quickstart validation) depends on T015–T035, T038, T039.
- T037 (merge-gating commands) depends on T036.
- T040 (release tag + publish — post-merge) depends on T037 plus PR-merged-to-main.

### Parallel Opportunities

**Within US1**:
- After T001+T002 land, the three per-tool tracks (T004/T007/T008 for help; T005/T009/T010 for obsidian_exec; T006/T011/T012 for read_note) can run in parallel by different developers.
- The four schema-drop tasks (T003, T004, T005, T006) are all parallel.

**Within US2**:
- T018 (invokeCli) and T019 (invokeBoundedCli) are parallel after T016 + T017 land.
- T020/T021 are parallel after their respective implementations.
- T022/T023 (obsidian_exec handler) and T024 (read_note handler.test) are parallel — different files, different tools.

**Within US3**:
- T027 / T028 (both `_dispatch.test.ts` additions) are parallel with T025 / T026 (server.ts work).

**Across user stories**:
- US1 (Phase 3) and US2 (Phase 4) can run fully in parallel once Phase 2 (empty) is acknowledged. A two-developer split — one on US1, one on US2 — is the natural team strategy for this feature.

---

## Parallel Example: User Story 1

```bash
# Independent schema-drop tasks (different files):
Task: T003 — Drop targetModeJsonSchema from src/target-mode/target-mode.ts + test
Task: T004 — Drop helpInputJsonSchema from src/tools/help/schema.ts + test
Task: T005 — Drop obsidianExecInputJsonSchema from src/tools/obsidian_exec/schema.ts + test
# (T006 must wait for T003 since read_note/schema.ts imports targetModeJsonSchema from target-mode.ts)

# After T001 + T002 land — parallel per-tool index.ts creation:
Task: T007 — Create src/tools/help/index.ts + index.test.ts
Task: T009 — Create src/tools/obsidian_exec/index.ts + index.test.ts
Task: T011 — Create src/tools/read_note/index.ts + index.test.ts (after T006 lands)
```

## Parallel Example: User Story 2

```bash
# After T016 (dispatchCli) lands — parallel facade implementations:
Task: T018 — Repurpose src/cli-adapter/cli-adapter.ts as invokeCli facade
Task: T019 — Implement src/cli-adapter/invoke-bounded-cli.ts

# Their test files in parallel:
Task: T020 — Update src/cli-adapter/cli-adapter.test.ts (after T018)
Task: T021 — Add src/cli-adapter/invoke-bounded-cli.test.ts (after T019)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

Per the spec's prioritization, US1 is the dominant ergonomic motivation (the 20+ planned typed tools backlog). A degenerate MVP path:

1. Phase 1 (none) → Phase 2 (none) — foundation already in place.
2. Phase 3 (US1) — registerTool + per-tool index.ts collapses + server.ts wiring.
3. **STOP and VALIDATE**: typed tools register through registerTool; tools/list byte-equivalent to 0.1.7 (FR-019); index.ts ≤ ~10 lines (SC-001); zero direct zodToJsonSchema calls (SC-002).
4. Ship 0.2.0-alpha if a partial release is desired.

In practice, US1 + US2 ship together per the spec's framing — both deepenings touch overlapping seams (register / publish / dispatch chain) and ADR-006 + ADR-007 explicitly schedule them as siblings. The MVP-only path is a contingency, not the recommended cut.

### Incremental Delivery

1. Setup + Foundational → already in place (no work).
2. US1 + US2 in parallel → land both → 0.2.0-rc1.
3. US3 (depends on US2) → land after US2 stabilizes → 0.2.0-rc2.
4. US4 (verifications) → land last as a single sweep.
5. Polish (docs, CHANGELOG, version bump, full validation) → 0.2.0 release.

### Parallel Team Strategy

With two developers:

1. Developer A: US1 (Phase 3) — registerTool factory + per-tool collapses.
2. Developer B: US2 (Phase 4) — dispatchCli primitive + bounded facades.
3. Both converge on US3 — the server.ts re-point and atomic-insertion tests are small.
4. Either developer handles US4 verifications + Polish.

US1 and US2 touch disjoint files (US1: `_register.ts`, per-tool `index.ts`/`schema.ts`/`tool.ts`, `target-mode.ts`, `server.ts` factory wiring; US2: `_dispatch.ts`, `cli-adapter.ts`, `invoke-bounded-cli.ts`, `logger.ts`, per-handler refactors). The only file BOTH stories touch is `src/server.ts` — US1 changes the tool array construction; US3 (not US2) changes the kill-import line. The two edits are at different sections of server.ts and merge cleanly.

---

## Notes

- [P] tasks operate on disjoint file sets and have no dependency on incomplete tasks in this list.
- [Story] label maps each task to its user story for traceability.
- Co-located `*.test.ts` files ship in the same task as their source modules (Constitution Principle II — public surface coverage in same change-set).
- Verify-fails-first (TDD red phase) is NOT part of this feature's contract — Principle II is a "tests-shipped-with-code" rule, not a red-green-refactor mandate.
- Commit after each task or logical group per the project's `/speckit-git-commit` flow.
- Stop at any user-story checkpoint to validate that story independently.
- Avoid: vague tasks, same-file conflicts (verify [P] markers respect file-disjointness), cross-story dependencies that break independence beyond the documented US3 → US2 layering.
