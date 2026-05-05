---
description: "Task list for feature 003-cli-adapter"
---

# Tasks: CLI Adapter

**Input**: Design documents from [specs/003-cli-adapter/](./)
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED for this feature. FR-016 mandates ten co-located vitest cases at `src/cli-adapter/cli-adapter.test.ts` — three happy-path (a–c), three failure-path (d–f), four boundary-path (g–j). All ten use a stub `spawnFn` injected via `deps.spawnFn` per Q1; no real CLI binary involved. Coverage floor of 84.3% statements per FR-017 enforces the merge gate.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4); omitted for setup/foundational/polish
- File paths in descriptions are repository-relative

## Path conventions

This is a single-library MCP server (per [plan.md](./plan.md#project-structure)). Source lives at `src/`, tests are co-located as `*.test.ts` per Constitution Principle II. The new module lives at a new top-level directory `src/cli-adapter/` parallel to `src/tools/`. The canonical errors contract lives at `specs/001-add-cli-bridge/contracts/errors.contract.md` (edited in place per the 002 Q5 precedent — no file moves).

---

## Phase 1: Setup

**Purpose**: Verify the baseline so any failure we observe later is attributable to this feature, not pre-existing state.

- [X] T001 Verify baseline at HEAD: run `npm run lint && npm run typecheck && npm run build && npm test` and confirm all four pass. Capture the baseline statements-coverage number from the vitest report to compare against the post-implementation number in T023; the floor is 84.3% per FR-017 / [vitest.config.ts](../../vitest.config.ts), and the actual number is expected to move *up* (~0.3-0.5pp) once T013's exhaustively-tested module lands.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Module scaffolding that BLOCKS every US1/US2/US3/US4 task. Without the file existing with its types and the `UpstreamError` re-export, none of the subsequent test files typecheck, and T020's US4 verification has nothing to verify.

**⚠️ CRITICAL**: T003-T020 cannot land until T002 lands.

- [X] T002 Create the module scaffolding for the new CLI adapter:
   - Create directory `src/cli-adapter/`.
   - Create [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) with: (1) original-contribution header `// Original — no upstream. Centralised CLI invocation primitive: argv assembly, active-mode target-locator strip, four-priority error classification.` per FR-014; (2) imports from `node:child_process` (`spawn` as `nodeSpawn`, `type ChildProcess`, `type SpawnOptions`); (3) import of `UpstreamError` from `../errors.js`; (4) type exports per [contracts/cli-adapter.contract.md](./contracts/cli-adapter.contract.md) §Exports — `TargetMode`, `InvokeCliInput`, `InvokeCliDeps`, `InvokeCliSuccess`; (5) re-export `export { UpstreamError } from "../errors.js";` per FR-011; (6) stub `export async function invokeCli(input: InvokeCliInput, deps?: InvokeCliDeps): Promise<InvokeCliSuccess>` whose body throws `new Error("invokeCli not implemented")` so subsequent tasks fill it in. The stub satisfies the type signature so US1 test files typecheck.
   - Create [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) with: (1) original-contribution header `// Original — no upstream. Co-located vitest cases for the cli-adapter module (FR-016 a–j).` per FR-014; (2) the import line `import { describe, it, expect, vi } from "vitest";` plus `import { invokeCli, UpstreamError, type InvokeCliInput, type InvokeCliDeps } from "./cli-adapter.js";` — this single import line both exercises FR-011 / Story 4 AC #1 (re-export verification at typecheck time) and provides the symbols T005-T019 will assert against; (3) one `describe("invokeCli", () => { ... })` block as the empty harness.
   - Run `npm run typecheck` after creating both files to confirm the scaffolding is clean. Verifies FR-001, FR-002 (signature shape only — body is stub), FR-011, FR-014.

**Checkpoint**: Foundation ready — US1/US2/US3/US4 implementation can begin.

---

## Phase 3: User Story 1 - Specific-mode CLI invocation routes through one centralised primitive (Priority: P1) 🎯 MVP

**Goal**: A typed-tool consumer hands the adapter a structured `(command, parameters, flags, target_mode: "specific")` request and receives `{ stdout, stderr }` on success. The adapter is the single place in the codebase where the CLI's documented argv conventions are encoded — positional command first, `vault=…` hoisted to the first key=value position, remaining `key=value` pairs in insertion order, then bare-word flags.

**Independent Test**: With a stub spawn function injected via `deps.spawnFn`, calling `invokeCli({ command: "read", parameters: { vault: "MyVault", file: "Note" }, flags: [], target_mode: "specific" })` against a stub child that exits `0` with stdout `"# Note body\n"` results in (a) the stub spawn being invoked with binary `"obsidian"` and argv `["read", "vault=MyVault", "file=Note"]` in exactly that order, and (b) the adapter resolving `{ stdout: "# Note body\n", stderr: "" }`. Verifiable by running just T005 (and T006) with `npx vitest run src/cli-adapter/cli-adapter.test.ts`.

### Implementation for User Story 1

- [X] T003 [US1] Implement the argv-assembly helper in [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) per FR-005. Add a private (non-exported) function that takes the post-strip parameters record, the flags array, and the command string, and returns `[command, ...vaultPrefix, ...remainingKvParams, ...flags]`. The vault-hoist uses an object destructure `const { vault, ...rest } = parameters` so vault hoists to the first key=value position regardless of insertion order (FR-005 invariant; spec Story 1 AC #4). `vaultPrefix` is `["vault=" + String(vault)]` if and only if `vault !== undefined`; otherwise `[]`. `remainingKvParams` is `Object.entries(rest).filter(([, v]) => v !== undefined).map(([k, v]) => k + "=" + String(v))`. Flags appended verbatim. Sequential after T002 (same file).

- [X] T004 [US1] Implement the spawn-and-collect skeleton inside `invokeCli` in [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) per FR-006, FR-007, FR-008(d). Replace the stub body with: (1) resolve binary path via `(deps?.env ?? process.env).OBSIDIAN_BIN ?? "obsidian"` per FR-006 and the [handler.ts:60-61](../../src/tools/obsidian_exec/handler.ts#L60-L61) precedent; (2) call the assembleArgv helper from T003; (3) return `new Promise<InvokeCliSuccess>((resolve, reject) => { ... })` that calls `(deps?.spawnFn ?? nodeSpawn)(binary, argv, { shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })`, accumulates stdout/stderr chunks into `Buffer[]` arrays, and on the `close` event computes `Buffer.concat(...).toString("utf8")` for each stream; (4) implement only priority (d) for now — `if (code === 0) { resolve({ stdout, stderr }); return; }`. Wire the empty close path so US1's happy-path test passes; later tasks add priorities (a)-(c) and ENOENT handling. Sequential after T003 (same file).

### Tests for User Story 1 ⚠️

- [X] T005 [US1] Add a co-located vitest case to [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) for FR-016(a) / Story 1 AC #1: with a stub `spawnFn` whose synthesised child exits `0` with stdout `"# Note body\n"`, calling `invokeCli({ command: "read", parameters: { vault: "MyVault", file: "Note" }, flags: [], target_mode: "specific" }, { spawnFn })` MUST result in (a) `spawnFn` being invoked with binary `"obsidian"` and argv `["read", "vault=MyVault", "file=Note"]` and options containing `shell: false`, and (b) the returned promise resolving with `{ stdout: "# Note body\n", stderr: "" }`. Build a small helper (e.g., `function makeStubChild({ stdout, stderr, exitCode, signal })`) that returns a `ChildProcess`-shaped EventEmitter with `.stdout` / `.stderr` `Readable`-like streams emitting the configured chunks then `close`-ing the parent at the end. The same helper feeds every test in this file. Sequential after T004 (same file).

- [X] T006 [US1] Add a co-located vitest case to [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) for FR-016(g) / Story 1 AC #3: with a stub `spawnFn` whose child exits `0`, calling `invokeCli({ command: "read", parameters: { vault: "V", file: undefined, query: "q" }, flags: [], target_mode: "specific" }, { spawnFn })` MUST invoke spawn with argv `["read", "vault=V", "query=q"]` (the `file: undefined` entry produces zero argv tokens; vault hoisted first, query follows in insertion order). Sequential after T005 (same file).

**Checkpoint**: US1 fully functional and testable independently. The MVP is shippable here for the *specific-mode* path: a typed-tool consumer can call `invokeCli` with a `target_mode: "specific"` request and get correct argv assembly + happy-path `{ stdout, stderr }`. US2/US3 add active mode and the failure paths.

---

## Phase 4: User Story 2 - Active-mode invocations strip target-locator keys before assembling argv (Priority: P1)

**Goal**: When the caller signals `target_mode: "active"`, the adapter strips the keys `vault`, `file`, and `path` from the `parameters` record before assembling argv. Centralising the strip in the adapter ensures every typed tool that supports an active-mode call benefits without each one having to remember the rule.

**Independent Test**: With a stub `spawnFn` injected, calling `invokeCli({ command: "read", parameters: { vault: "MyVault", file: "Note", lines: 5 }, flags: [], target_mode: "active" })` against a stub child that exits `0` results in `spawnFn` being invoked with argv `["read", "lines=5"]` exactly — no `vault=…` token, no `file=…` token, only the non-target-locator key preserved. Verifiable by running T008 / T009 against the post-T007 implementation.

### Implementation for User Story 2

- [X] T007 [US2] Implement the active-mode target-locator strip in [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) per FR-003. Inside `invokeCli` before the assembleArgv call, branch on `input.target_mode`: when `"active"`, build a stripped record `const stripped: typeof input.parameters = {}; for (const [k, v] of Object.entries(input.parameters)) { if (k !== "vault" && k !== "file" && k !== "path") stripped[k] = v; }` and pass `stripped` to assembleArgv; when `"specific"`, pass `input.parameters` directly. The strip is a top-level case-sensitive key match per [research.md](./research.md) v0.1.x baselines and Edge Cases — no recursion into nested values; substring matches like `"vault_id"` are NOT stripped. Sequential after T004 (same file).

### Tests for User Story 2 ⚠️

- [X] T008 [US2] Add a co-located vitest case to [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) for FR-016(b) / Story 2 AC #1: with a stub `spawnFn` whose child exits `0`, calling `invokeCli({ command: "read", parameters: { vault: "V", file: "F", lines: 5 }, flags: [], target_mode: "active" }, { spawnFn })` MUST invoke spawn with argv `["read", "lines=5"]` (both target-locator keys stripped, `lines` preserved as a non-target-locator key) and resolve. Sequential after T006 (same file).

- [X] T009 [US2] Add a co-located vitest case to [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) for FR-016(c) / Story 2 AC #2: with a stub `spawnFn` whose child exits `0`, calling `invokeCli({ command: "read", parameters: { path: "some/path.md", query: "term" }, flags: [], target_mode: "active" }, { spawnFn })` MUST invoke spawn with argv `["read", "query=term"]` (`path` stripped; `query` preserved). Sequential after T008 (same file).

**Checkpoint**: US1 + US2 both work independently. argv assembly is verifiably symmetric across the two modes — specific forwards everything, active strips the documented three target-locator keys and preserves the rest.

---

## Phase 5: User Story 3 - Layered error classification surfaces the right `UpstreamError` for each failure mode (Priority: P1)

**Goal**: When the spawned CLI process closes, the adapter classifies the outcome in strict priority order: (a) non-zero exit code → `CLI_NON_ZERO_EXIT`; (b) exit `0` with stdout starting `Error: no active file` → `ERR_NO_ACTIVE_FILE`; (c) exit `0` with stdout starting `Error:` (any other suffix) → `CLI_REPORTED_ERROR`; (d) otherwise resolve. Spawn-time `ENOENT` (binary not on PATH) is a separate concern that maps to `CLI_BINARY_NOT_FOUND`. Each thrown `UpstreamError` preserves the input `command`, the captured streams, and the exit-code state so the calling tool handler has full diagnostic context.

**Independent Test**: With three stub spawn outcomes — (a) child exits `1` with `stderr: "boom"`, (b) child exits `0` with stdout `"Error: no active file\n"`, (c) child exits `0` with stdout `"Error: File not found\n"` — three identically-shaped `invokeCli` calls produce three distinctly-coded `UpstreamError`s: `CLI_NON_ZERO_EXIT`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR`. Plus the boundary tests: `(d, ERR_NO_ACTIVE_FILE) beats (e, CLI_REPORTED_ERROR)` per priority order, `(a, CLI_NON_ZERO_EXIT) beats (b, ERR_NO_ACTIVE_FILE)` even when stdout would have triggered the latter, and a signal-only termination (`code === null, signal !== null`) classifies as `CLI_NON_ZERO_EXIT` with `details.exitCode: -1`. All seven assertions pass after T013, T019.

### Implementation for User Story 3

- [X] T010 [US3] Implement priority (a) in the close-event handler of `invokeCli` in [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) per FR-008(a) and Q3. Insert before the existing T004 priority (d) `if (code === 0)` check: `const exitCode = code ?? -1; if (code !== 0) { reject(new UpstreamError({ code: "CLI_NON_ZERO_EXIT", cause: { exitCode, signal }, details: { command: input.command, stdout, stderr, exitCode, signal } })); return; }`. The `code ?? -1` sentinel is the Q3-pinned coercion for signal-only termination per the [handler.ts:238](../../src/tools/obsidian_exec/handler.ts#L238) precedent — when the child terminates by signal, `code === null` and the sentinel `-1` lands in `details.exitCode` while `details.signal` carries the signal name. Sequential after T007 (same file).

- [X] T011 [US3] Implement priority (b) in the close-event handler of `invokeCli` in [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) per FR-008(b). After T010's priority (a) check, before the priority (d) resolve: compute `const trimmedHead = stdout.trimStart();` once; then `if (trimmedHead.startsWith("Error: no active file")) { const message = stdout.split("\n", 1)[0]!.trim(); reject(new UpstreamError({ code: "ERR_NO_ACTIVE_FILE", cause: null, details: { command: input.command, stdout, stderr, exitCode: 0, message }, message: 'No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.' })); return; }`. The `.message` override is the P2 plan-stage decision verbatim per [research.md](./research.md) — both recovery paths named, with the exact `target_mode` string and its allowed value spelled out. The `parsedFirstLine` algorithm (`stdout.split('\n', 1)[0].trim()`) matches FR-009 / spec 002 FR-003 verbatim. Sequential after T010 (same file).

- [X] T012 [US3] Implement priority (c) in the close-event handler of `invokeCli` in [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) per FR-008(c). After T011's priority (b) check (which is critical — priority c MUST be evaluated AFTER priority b so `Error: no active file. <suffix>` always classifies as ERR_NO_ACTIVE_FILE per FR-016(h)): `if (trimmedHead.startsWith("Error:")) { const message = stdout.split("\n", 1)[0]!.trim(); reject(new UpstreamError({ code: "CLI_REPORTED_ERROR", cause: null, details: { command: input.command, stdout, stderr, exitCode: 0, message } })); return; }`. Reuse the same `parsedFirstLine` algorithm as T011 (the two error paths share one parser per FR-009). Sequential after T011 (same file).

- [X] T013 [US3] Implement spawn-time `ENOENT` handling in `invokeCli` in [src/cli-adapter/cli-adapter.ts](../../src/cli-adapter/cli-adapter.ts) per FR-010, mirroring the existing handler at [handler.ts:82-91](../../src/tools/obsidian_exec/handler.ts#L82-L91) and [:155-163](../../src/tools/obsidian_exec/handler.ts#L155-L163). Wrap the spawn call in `try { child = spawnFn(binary, argv, options); } catch (err: unknown) { const errnoCode = (err as NodeJS.ErrnoException).code; if (errnoCode === "ENOENT") { reject(new UpstreamError({ code: "CLI_BINARY_NOT_FOUND", cause: err, details: { binaryAttempted: binary, PATH: env.PATH } })); return; } reject(err); return; }`. Non-`ENOENT` native spawn errors propagate as-is (NOT wrapped in `UpstreamError`) per FR-010 — the caller receives the native error and decides whether to map it. Sequential after T012 (same file).

### Tests for User Story 3 ⚠️

- [X] T014 [US3] Add a co-located vitest case to [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) for FR-016(d) / Story 3 AC #1: with a stub `spawnFn` whose child exits `1` with `stderr: "boom"`, the returned promise MUST reject with `UpstreamError` whose `code === "CLI_NON_ZERO_EXIT"`, `cause` deep-equal to `{ exitCode: 1, signal: null }`, and `details` containing `command` matching the input command string, `stderr: "boom"`, `exitCode: 1`, `signal: null`. Sequential after T009 (same file).

- [X] T015 [US3] Add a co-located vitest case to [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) for FR-016(e) / Story 3 AC #2: with a stub `spawnFn` whose child exits `0` with stdout `"Error: no active file\n"`, the returned promise MUST reject with `UpstreamError` whose `code === "ERR_NO_ACTIVE_FILE"`, `cause === null`, `details` deep-equal to `{ command, stdout: "Error: no active file\n", stderr: "", exitCode: 0, message: "Error: no active file" }`, and `.message` strictly equal to the recovery-instruction string `'No active file in Obsidian. Open a note in the editor, or call this tool with target_mode: "specific" and an explicit vault/file.'` (verbatim — the P2 plan-stage wording is locked by this assertion). Sequential after T014 (same file).

- [X] T016 [US3] Add a co-located vitest case to [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) for FR-016(f) / Story 3 AC #3: with a stub `spawnFn` whose child exits `0` with stdout `"Error: File not found\n"`, the returned promise MUST reject with `UpstreamError` whose `code === "CLI_REPORTED_ERROR"`, `cause === null`, and `details.message === "Error: File not found"`. Sequential after T015 (same file).

- [X] T017 [US3] Add a co-located vitest case to [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) for FR-016(h) / Story 3 AC #6 — boundary priority (b) beats (c): with a stub `spawnFn` whose child exits `0` with stdout `"Error: no active file. Open one or use specific mode.\n"`, the returned promise MUST reject with `code === "ERR_NO_ACTIVE_FILE"` (priority b), NOT `"CLI_REPORTED_ERROR"` (priority c). Also assert `details.message === "Error: no active file. Open one or use specific mode."` (the longer first line preserved verbatim, trailing `\n` trimmed). This is the most important priority-discrimination test — without it, a regression in priority ordering would silently misclassify the most common active-mode failure mode. Sequential after T016 (same file).

- [X] T018 [US3] Add a co-located vitest case to [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) for FR-016(i) / Story 3 AC #5 — boundary priority (a) beats (b): with a stub `spawnFn` whose child exits `1` with stdout `"Error: no active file\n"`, the returned promise MUST reject with `code === "CLI_NON_ZERO_EXIT"` (priority a — exit-code precedence), NOT `"ERR_NO_ACTIVE_FILE"` (priority b — would have fired had the exit been 0). Sequential after T017 (same file).

- [X] T019 [US3] Add a co-located vitest case to [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts) for FR-016(j) — boundary signal-only termination (Q3 clarification): with a stub `spawnFn` whose synthesised child closes with `(code: null, signal: "SIGTERM")` (and empty stdout/stderr), the returned promise MUST reject with `UpstreamError` whose `code === "CLI_NON_ZERO_EXIT"`, `cause` deep-equal to `{ exitCode: -1, signal: "SIGTERM" }` (sentinel via `code ?? -1`), and `details` containing `exitCode: -1` and `signal: "SIGTERM"`. The stub's `makeStubChild` helper from T005 needs to support emitting `(null, "SIGTERM")` as the close arguments — extend the helper signature in this task if it does not already. Sequential after T018 (same file).

**Checkpoint**: All four reachable rejection paths (`CLI_NON_ZERO_EXIT`, `ERR_NO_ACTIVE_FILE`, `CLI_REPORTED_ERROR`, `CLI_BINARY_NOT_FOUND`) plus the success path are exhaustively tested. The adapter is feature-complete; the priority machine is proven via FR-016(h)/(i)/(j) boundary cases; the recovery message wording is locked by T015's verbatim assertion.

---

## Phase 6: User Story 4 - Re-exported `UpstreamError` keeps tool-handler imports compact (Priority: P3)

**Goal**: Typed-tool consumers can import both the runtime entry point and the `UpstreamError` class from the adapter module via a single import line, satisfying FR-011 / Story 4 AC #1.

**Independent Test**: A consumer module compiles and runs with a single import line of the form `import { invokeCli, UpstreamError } from "../cli-adapter/cli-adapter.js"` — no separate import from `src/errors.ts` is required for the `instanceof` check. Verifiable at typecheck time.

### Implementation for User Story 4

- [X] T020 [US4] Verify the FR-011 / Story 4 AC #1 re-export contract. The contract is satisfied structurally by T002's `export { UpstreamError } from "../errors.js";` line and the corresponding test-file import at the top of [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts). This task adds an explicit confirmation: run `npm run typecheck` against the full project and confirm both files compile, then add a single one-line vitest case `it("re-exports UpstreamError from src/errors.ts", () => { expect(UpstreamError).toBeDefined(); expect(UpstreamError.name).toBe("UpstreamError"); });` inside the existing `describe("invokeCli", ...)` block — a runtime sentinel that catches a future regression where someone replaces the re-export with a local class definition (which would still typecheck but break `instanceof` chains across module boundaries). Sequential after T019 (same file). NOTE: per [data-model.md](./data-model.md) "Test coverage map," this case is supplementary; it does not appear in the strict FR-016(a)–(j) enumeration but adds defence-in-depth for the re-export contract that AC #1 mandates.

**Checkpoint**: All four user stories independently functional. Story 4's AC is verified both at typecheck (the import line works) and at runtime (the re-exported class is the canonical one).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation edits that consolidate the eight-code surface across the canonical contract and the README, plus the merge-gate verification.

- [X] T021 [P] Apply the three edits from [contracts/errors.contract-patch.md](./contracts/errors.contract-patch.md) in-place against [specs/001-add-cli-bridge/contracts/errors.contract.md](../001-add-cli-bridge/contracts/errors.contract.md) per the Q5 (002) precedent. Edits in order: (1) insert a new `### ERR_NO_ACTIVE_FILE` section after the existing `### TOOL_NOT_FOUND` section (before the `## Serialization to MCP` heading), with the eight-row field-shape table; (2) update the serialization prose at line 143 to name `ERR_NO_ACTIVE_FILE` alongside the other `cause: null` codes; (3) extend the test-coverage requirements list at the bottom to cite `cli-adapter.test.ts` with its four code paths. After applying, validate against the five acceptance criteria in the patch document's "Validation" section: the contract MUST list eight codes total, the new section MUST have eight rows, the serialization-prose update MUST name ERR_NO_ACTIVE_FILE, the test-coverage list MUST cite cli-adapter.test.ts, and there MUST be no remaining contradictions between table and prose. Verifies FR-012.

- [X] T022 [P] Update the README error-codes table in [README.md](../../README.md) (currently lines 107-115) per FR-013. Insert a new row after the `CLI_REPORTED_ERROR` row (line 113) so the family-of-codes detected via the `Error:` stdout-prefix is adjacent in the table:

   ```markdown
   | `ERR_NO_ACTIVE_FILE` | CLI exits 0 with stdout that, after leading-whitespace trim, starts with `Error: no active file` | `command`, `stdout`, `stderr`, `exitCode`, `message` |
   ```

   Note: the README groups by detection-mechanism (Error:-prefix detection) rather than by prefix family (CLI_* vs ERR_*), so adjacency to `CLI_REPORTED_ERROR` is correct despite the prefix difference. The `ERR_*` prefix is deliberate per ADR-004 — recoverable user-action signal, distinct from the CLI_* failure family. Parallel with T021 (different file).

- [X] T023 Run the full quality-gate suite: `npm run lint && npm run typecheck && npm run build && npm test`. Confirm zero lint warnings, zero typecheck errors, build success, and all tests green (including T005, T006, T008, T009, T014-T019, T020). Confirm aggregate statements coverage is at or above the FR-017 floor (84.3%, captured as the baseline in T001). Report the post-implementation coverage number alongside the baseline — per [research.md](./research.md) projection, it should move *up* by ~0.3-0.5pp. Verify [src/server.ts](../../src/server.ts)'s tool-registration list is unchanged from its pre-feature state per FR-015 (the adapter is internal, no MCP registration). **Verify SC-002 (argv assembly single-sourced)**: run `grep -rn "from \"node:child_process\"" src/ --include="*.ts" --exclude="*.test.ts"` and confirm exactly two matches — `src/tools/obsidian_exec/handler.ts` (legacy, out-of-scope per spec) and `src/cli-adapter/cli-adapter.ts` (this feature). Any third match in `src/tools/*/handler.ts` would mean a typed-tool handler had bypassed the adapter, violating SC-002; fail T023 and investigate before merging. Verify the FR-018 Constitution Compliance checklist: all five principles `Y`. If any gate fails, fix and re-run before marking T023 complete. Final task — must be the last one.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)**: No dependencies — runs first to capture baseline coverage.
- **Foundational (T002)**: Depends on T001. **BLOCKS US1, US2, US3, US4** — every subsequent task references symbols defined in T002.
- **US1 (T003-T006)**: T003 depends on T002. T004 depends on T003 (calls assembleArgv). T005/T006 depend on T004 (need `invokeCli` to dispatch through the spawn) and are sequential with each other (same test file).
- **US2 (T007-T009)**: T007 depends on T004 (modifies `invokeCli` body). T008/T009 depend on T007 and are sequential (same test file, queueing after T006).
- **US3 (T010-T019)**: T010 depends on T007 (close handler exists in `invokeCli` body). T011 depends on T010. T012 depends on T011 (priority-order constraint — c MUST be evaluated after b). T013 depends on T012. T014-T019 depend on T013 (all impl branches done) and are sequential (same test file, queueing after T009).
- **US4 (T020)**: Depends on T019 (sequential within test file).
- **Polish (T021-T023)**: T021 and T022 are parallel (different files) and independent of US1/US2/US3/US4 implementation tasks (they only consume the implementation, they don't depend on it). T023 is the last task and depends on everything else.

### Critical path

`T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T023`

T021 and T022 hang off the side as parallel branches — they can land any time after T002 but before T023.

### User story dependencies

- US1 depends on T002 (foundational).
- US2 depends on T002 + T004 (specific-mode argv assembly is the foundation that active mode adds a strip in front of).
- US3 depends on T002 + T007 (the active-mode strip lands before the close-handler priorities so the close-handler can be implemented once against the final argv-assembly chain).
- US4 depends on T002's re-export line + T019 (sequential within the same test file).

### Parallel opportunities

- **Polish phase**: T021 (errors.contract.md edit) and T022 (README.md edit) can land in parallel — different files.
- **Tests within a story**: All FR-016 test cases live in the same `cli-adapter.test.ts` file, so they cannot literally run in parallel (would conflict). They are sequential within the file but can be batched into a single edit if the implementer prefers (one big "add 9 test cases" task instead of T005-T019 split). Splitting is the project precedent (002 split each test case into its own task) and supports clearer git-commit grouping.
- **No within-`cli-adapter.ts` parallelism**: every implementation task (T003, T004, T007, T010-T013) edits the single source file and must run sequentially.

### Within each user story

- T003 (assembleArgv) before T004 (spawn skeleton uses argv from helper).
- T004 (spawn skeleton) before T005, T006 (US1 tests need the impl to dispatch through).
- T007 (active strip) before T008, T009 (US2 tests need the strip to fire).
- T010 (priority a) before T011, T012 (priority order matters; T010's `if (code !== 0) return` short-circuit must precede T011/T012's exit-zero checks).
- T011 (priority b) before T012 (priority c) — strict ordering so `Error: no active file` always wins over `Error:`.
- T013 (ENOENT) after T012 — wraps the existing spawn call in try/catch.
- T014-T019 (US3 tests) after T013 — all impl branches must exist before tests can assert.
- T020 (US4 verification) after T019 — same test file, sequential.
- T021/T022 (Polish docs) after T002 (need the type names + final code names settled). Independent of T003-T019.
- T023 (final gate) after everything.

---

## Parallel example — Polish phase

```bash
# Land both documentation edits in parallel (different files):
Task: "Apply errors.contract-patch.md edits to specs/001-add-cli-bridge/contracts/errors.contract.md (T021)"
Task: "Add ERR_NO_ACTIVE_FILE row to README.md error-codes table (T022)"
# Then T023 verifies everything together.
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. T001 (baseline) → T002 (module scaffolding) → T003 (assembleArgv) → T004 (spawn skeleton + priority d) → T005 / T006 (US1 tests).
2. **STOP and VALIDATE**: run `npx vitest run src/cli-adapter/` — the two new test cases should be green; the rest of the project's tests should still pass; coverage should not regress below 84.3%. If yes, the MVP is shippable for the *specific-mode happy path* — typed-tool consumers using only specific mode can already build on it.
3. Optional: ship the MVP if the first typed-tool BI (e.g., `read_note` against specific-mode reads) has a hard ship deadline. Otherwise continue to US2/US3/US4.

### Incremental delivery

1. Setup + Foundational (T001-T002) → foundation ready.
2. US1 (T003-T006) → MVP shippable (specific mode + happy path).
3. US2 (T007-T009) → active mode also works. Demo: a stub call with `target_mode: "active"` and target-locator keys correctly strips them.
4. US3 (T010-T019) → all four error codes + priority discrimination + ENOENT mapping. Demo: exhaustive failure-mode coverage; the recovery-instruction message for `ERR_NO_ACTIVE_FILE` is verbatim-locked by T015.
5. US4 (T020) → re-export contract verified at runtime (defence-in-depth).
6. Polish (T021-T023) → documentation consolidation + merge gates pass.

### Sequential strategy (single-developer)

The single-file constraint on `cli-adapter.ts` (every impl task edits it) and on `cli-adapter.test.ts` (every test task edits it) makes parallel execution impractical for a single developer. The recommended order is the critical path: `T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023`. T021 and T022 can be batched at any point after T002 — landing them earlier reduces context-switch cost when the developer revisits the code at T023.

---

## Notes

- [P] tasks = different files, no dependencies. Most US1/US2/US3/US4 tasks cannot use [P] because they share `cli-adapter.ts` (impl) or `cli-adapter.test.ts` (tests).
- [Story] label maps task to specific user story for traceability.
- The MVP is genuinely the US1 phase: the spec exists to ship a centralised primitive that future typed tools build on; the first typed tool that lands (e.g., `read_note`) primarily exercises specific mode, so US1 alone unblocks the next BI.
- US2 / US3 / US4 are co-required for completeness — without active-mode strip, the future `target_mode: "active"` callers fail; without classification, every CLI failure looks the same; without re-export, every typed tool needs two import lines instead of one.
- Verify tests fail before implementing where possible (TDD). The test cases in T005/T006 describe behaviour the stub `invokeCli` does not yet exhibit; running them against the post-T002 stub should produce useful red. Same for T008/T009 against post-T004 (no active strip yet) and T014-T019 against post-T009 (no error classification yet).
- Commit after each task or logical group per CONTRIBUTING.md.
- Stop at any checkpoint to validate the active story independently.
- Avoid: vague tasks (every task names a file), same-file conflicts (sequenced explicitly above), cross-story dependencies that break independence (US3's T010 is the one cross-story coupling — it modifies the same `cli-adapter.ts` as US1's T004 and US2's T007 — and is explicitly sequenced after T007).
