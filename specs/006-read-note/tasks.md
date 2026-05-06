---
description: "Task list for feature 006-read-note"
---

# Tasks: Read Note Typed MCP Tool

**Input**: Design documents from [specs/006-read-note/](./)
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/read-note.contract.md](./contracts/read-note.contract.md), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED for this feature. FR-013 mandates co-located vitest cases for the schema, handler, and tool surfaces. Total: **23 new test bodies** distributed across `src/tools/read_note/{schema,handler,tool}.test.ts` (9 schema + 9 handler + 5 tool per [data-model.md §5](./data-model.md#5-test-coverage-map)) plus **2 existing assertions in `src/server.test.ts`** that automatically pick up `read_note` once it's registered (no edits to that file required). The aggregate statements coverage floor (per [vitest.config.ts](../../vitest.config.ts), pinned by feature 002 and reaffirmed by 003 + 004 + 005) MUST not regress per FR-014; pre-implementation projection is +0.3 pp.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5, US6); omitted for setup/foundational/polish
- File paths in descriptions are repository-relative

## Path conventions

This is a single-library MCP server (per [plan.md](./plan.md#project-structure)). Source lives at `src/`, tests are co-located as `*.test.ts` per Constitution Principle II. This BI introduces:

- A new per-surface module folder at `src/tools/read_note/` (matching the `src/tools/obsidian_exec/` and `src/tools/help/` layouts: `schema.ts`, `handler.ts`, `tool.ts`, plus their `*.test.ts` siblings).

Modified existing files: [src/server.ts](../../src/server.ts) (registers `read_note` alongside `obsidian_exec` and `help`; alphabetical order per P3), [docs/tools/read_note.md](../../docs/tools/read_note.md) (replaced from BI-030 stub to populated body per P5). The errors contract at [specs/001-add-cli-bridge/contracts/errors.contract.md](../001-add-cli-bridge/contracts/errors.contract.md) is unchanged (zero new error codes — the entire failure surface is already covered by 001/002/003 codes).

---

## Phase 1: Setup

**Purpose**: Verify the baseline so any failure observed later is attributable to this feature, not pre-existing state.

- [ ] T001 Verify baseline at HEAD: run `npm run lint && npm run typecheck && npm run build && npm test` and confirm all four pass. Capture the baseline statements-coverage number from the vitest report (the floor is in [vitest.config.ts](../../vitest.config.ts); the actual moves with each feature) to compare against the post-implementation number in T024 — actual is expected to move *up* (~0.3 pp) once the 22 new test bodies + the small new source land. If any of the four commands fails, STOP — diagnose pre-existing state before proceeding (this task exists specifically to catch baseline drift).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the new per-surface module directory and write the schema + handler-skeleton + tool-skeleton files. T002 (schema, complete) blocks every user story because every test imports from it. T003 + T004 (skeletons) block their respective story phases because the test files import their exports.

**⚠️ CRITICAL**: T005–T020 cannot land until T002–T004 land.

- [ ] T002 Create `src/tools/read_note/` directory and author [src/tools/read_note/schema.ts](../../src/tools/read_note/schema.ts) per FR-002 + FR-003 + FR-004 + FR-005 + P1. The complete file body (~30 LOC including imports + header):
    1. `// Original — no upstream. read_note input schema: re-export of the target-mode primitive (BI-029) — read_note adds zero tool-specific fields, so the primitive IS the schema.` (Constitution Principle V).
    2. Import `targetModeSchema` and `type TargetMode` from `../../target-mode/target-mode.js`.
    3. Import `zodToJsonSchema` from `zod-to-json-schema`.
    4. Export `readNoteInputSchema = targetModeSchema`.
    5. Export `type ReadNoteInput = TargetMode`.
    6. Export `readNoteInputJsonSchema = zodToJsonSchema(readNoteInputSchema, { $refStrategy: "none" }) as Record<string, unknown>`.
  This satisfies FR-002 (the documented FR-002 deviation per P1 — Pattern (b) is structurally infeasible given ZodEffects-in-discriminatedUnion; re-export is structurally equivalent for the zero-extra-fields case), FR-003 (no `.describe()` calls — verifiable by grep against `\.describe(` in the file), FR-004 (JSON Schema export named `readNoteInputJsonSchema`), and FR-005 (inferred type, no hand-written interface). Verifies SC-004 + SC-005 by inspection. Run `npm run typecheck` to confirm the file typechecks.

- [ ] T003 [P] Author [src/tools/read_note/handler.ts](../../src/tools/read_note/handler.ts) skeleton per FR-006 + FR-007 + FR-017 + the [data-model.md §2 contract](./data-model.md#2-handler-io--executereadnote). Initial body (~50 LOC including imports + header) MUST satisfy the SC-007 ≲50-line ceiling. Required exports:
    - `// Original — no upstream. read_note handler: routes the validated input through invokeCli (BI-028) inside the shared queue + emits FR-017 log events.` (Principle V).
    - Imports: `randomUUID` from `node:crypto`; `invokeCli`, `type SpawnLike` from `../../cli-adapter/cli-adapter.js`; `UpstreamError` from `../../errors.js`; `type Logger` from `../../logger.js`; `type Queue` from `../../queue.js`; `type ReadNoteInput` from `./schema.js`.
    - `export interface ExecuteDeps { logger: Logger; queue: Queue; spawnFn?: SpawnLike; env?: NodeJS.ProcessEnv; }` (mirrors obsidian_exec's `ExecuteDeps` shape at [src/tools/obsidian_exec/handler.ts:24-29](../../src/tools/obsidian_exec/handler.ts#L24-L29)).
    - `export interface ReadNoteOutput { content: string; }`.
    - `export async function executeReadNote(input: ReadNoteInput, deps: ExecuteDeps): Promise<ReadNoteOutput>` — full body per the data-model.md §2 behaviour (callId, startedAt, queueDepth, locator + vault derivation, callStart emit, queue.run wrapping invokeCli, callEndSuccess on success, callEndFailure on UpstreamError, re-throw without log on other exceptions). The full implementation lands in this single task (not deferred to later phases) — it's small enough that splitting across phases creates more friction than value, and US1/US2/US3/US5 phases focus on writing TESTS against this implementation per the project's tests-with-implementation principle (Constitution Principle II — tests + surface land in the same change, where "change" is the PR not the commit).
  Verifies SC-003 (no direct `child_process.spawn` — verifiable by grep) + SC-007 (handler ≲50 LOC). Run `npm run typecheck` to confirm the file typechecks.

- [ ] T004 [P] Author [src/tools/read_note/tool.ts](../../src/tools/read_note/tool.ts) per FR-008 + FR-009 + FR-016 + P2 + the [data-model.md §3 contract](./data-model.md#3-registerdeps--registerreadnotetool). Body (~70 LOC including imports + header):
    - `// Original — no upstream. read_note MCP tool registration: returns a RegisteredTool wrapping executeReadNote with zod input parse + UpstreamError propagation.` (Principle V).
    - Imports: `ZodError` from `zod`; `executeReadNote, type ExecuteDeps, type ReadNoteOutput` from `./handler.js`; `readNoteInputSchema, readNoteInputJsonSchema` from `./schema.js`; `UpstreamError` from `../../errors.js`; `stripSchemaDescriptions, type JsonSchemaObject` from `../../help/strip-schema.js`; `asToolError, type RegisteredTool` from `../_shared.js`; type imports for `Logger`, `Queue`.
    - `export const READ_NOTE_TOOL_NAME = "read_note";`.
    - `export const READ_NOTE_DESCRIPTION = ...` — the pinned 270-char string per P2 (verb-led, both branches named, references `help({ tool_name: "read_note" })`).
    - `export interface RegisterDeps extends Omit<ExecuteDeps, never> { logger: Logger; queue: Queue; }` (mirrors obsidian_exec's `RegisterDeps` at [src/tools/obsidian_exec/tool.ts:18-21](../../src/tools/obsidian_exec/tool.ts#L18-L21)).
    - `export function registerReadNoteTool(deps: RegisterDeps): RegisteredTool` returning `{ descriptor: { name: READ_NOTE_TOOL_NAME, description: READ_NOTE_DESCRIPTION, inputSchema: stripSchemaDescriptions(readNoteInputJsonSchema as JsonSchemaObject) as Record<string, unknown> }, handler: async (args) => { /* parse via readNoteInputSchema, asToolError on ZodError as VALIDATION_ERROR, executeReadNote on success returning text-envelope { content: [{ type: "text", text: JSON.stringify({ content: result.content }) }] }, asToolError on UpstreamError, re-throw on other */ } }`.
  Mirrors the [obsidian_exec/tool.ts](../../src/tools/obsidian_exec/tool.ts) precedent line-by-line in shape; the only domain differences are the tool name, the description, and the result-mapping step. Verifies FR-008, FR-009, FR-016 by inspection. Run `npm run typecheck` to confirm the file typechecks.

**Checkpoint**: Foundation ready — US4/US1/US2/US3/US5/US6 implementation can begin. The `src/tools/read_note/` directory exists with schema.ts (complete), handler.ts (complete), and tool.ts (complete). All three typecheck. The remaining work is writing the test bodies + wiring `read_note` into `src/server.ts` + replacing `docs/tools/read_note.md` from stub to populated body.

---

## Phase 3: User Story 4 — Schema layer rejects malformed inputs before any CLI call (Priority: P1)

**Story goal**: The zod schema is the gatekeeper that catches malformed inputs at the boundary so internal code (the adapter, the CLI) never sees them. Per Constitution Principle III, this story validates that boundary integrity is preserved.

**Independent test**: Run `vitest run src/tools/read_note/schema.test.ts` — all 9 cases pass; no CLI subprocess is spawned during the test (verifiable by the absence of any spawn fixtures in the test file).

This phase lands first among the user stories because it has zero handler dependencies (no stub adapter needed) and it surfaces any Pattern (b) deviation issues from T002 immediately. Per the [data-model.md test coverage map](./data-model.md#5-test-coverage-map), one of the schema tests (case #8) also covers Story 3 AC#2 (forbidden-key-in-active mode) — that's an intentional overlap because the schema is the bedrock for both stories.

### Tests + verification for User Story 4

> **NOTE**: Schema is fully implemented in T002, so the tests written here verify behaviour against existing code. No "tests fail first → impl makes them green" cycle is needed (the cycle's value is exposing missing impl; here the impl is a re-export of code that already passes BI-029's tests).

- [ ] T005 [US4] Author [src/tools/read_note/schema.test.ts](../../src/tools/read_note/schema.test.ts) — 9 test cases per [data-model.md §5 schema tests table](./data-model.md#srctoolsread_noteschematestts-9-cases). Test bodies use `import { readNoteInputSchema } from "./schema.js"` and `readNoteInputSchema.safeParse(...)`. Each test asserts (a) `result.success === true|false`, (b) for failure cases the issue path and message contents per the table, (c) NO mock of any `child_process` / `node:fs` / network call (the schema is pure — there's nothing to mock). The file MUST carry the `// Original — no upstream.` header. Run `npx vitest run src/tools/read_note/schema.test.ts` and confirm all 9 cases pass.

**Checkpoint**: User Story 4 complete. Schema tests green; FR-002 (Pattern (b) deviation per P1) verified by behaviour; FR-003 + FR-005 verified by inspection; the schema's "exactly one of" + "vault required in specific" + "no vault/file/path in active" contracts all confirmed.

---

## Phase 4: User Story 1 — Specific-mode read by `file` (wikilink) returns the note's raw text (Priority: P1) 🎯 MVP

**Story goal**: Headline value of the feature. An MCP client calls `read_note({ target_mode: "specific", vault: "MyVault", file: "Recipe" })` and receives `{ content: "<the raw text of Recipe.md>" }`.

**Independent test**: Run `vitest run src/tools/read_note/handler.test.ts -t "specific+file"` (and the empty-stdout boundary test). With a stub `spawnFn`, the handler returns the verbatim stdout; the adapter is invoked with argv `["read", "vault=MyVault", "file=Recipe"]`; the three FR-017 log events are captured.

### Tests + verification for User Story 1

- [ ] T006 [US1] Author handler tests #1 (specific+file happy path, Story 1 AC#1 IT) and #8 (empty stdout boundary, Story 1 AC#2) at [src/tools/read_note/handler.test.ts](../../src/tools/read_note/handler.test.ts). The file MUST carry the `// Original — no upstream.` header. Each test:
    1. Constructs a stub `Logger` (a plain object with three captured methods — `callStart`, `callEndSuccess`, `callEndFailure` — plus `shutdown: vi.fn()` to satisfy the `Logger` shape) and a real `Queue` via `createQueue()` from `../../queue.js`.
    2. Constructs a stub `SpawnLike` that, when called, records the `(binary, args)` it received, and returns a stub `ChildProcess`-shaped object (an `EventEmitter` with `stdout` and `stderr` `Readable`-like interfaces) that emits the test's pre-canned stdout chunk and an `exit` event with the test's exit code. Use the same EventEmitter-stub pattern present at [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) (or [src/cli-adapter/cli-adapter.test.ts](../../src/cli-adapter/cli-adapter.test.ts)) for consistency.
    3. Calls `await executeReadNote(input, { logger, queue, spawnFn })`.
    4. Asserts the result shape (`{ content: <expected> }`), the recorded argv (`["read", "vault=MyVault", "file=Recipe"]` for case #1; same plus empty stdout for case #8), and the logger captures (`callStart` once with the FR-017 payload + `locator: "file"`; `callEndSuccess` once with `stdoutBytes` matching `Buffer.byteLength(<stdout>, "utf8")`; `callEndFailure` not called).
  Run `npx vitest run src/tools/read_note/handler.test.ts -t "specific\\+file|empty"` and confirm both cases pass.

**Checkpoint**: User Story 1 complete. The MVP is functional — an agent can call `read_note({target_mode:"specific", vault:"V", file:"F"})` and receive the file's text via the test path. FR-006 (correct argv assembly through invokeCli) + FR-007 (verbatim stdout in `content` field) + FR-017 (three log events) all verified by handler test #1 and #8.

---

## Phase 5: User Story 2 — Specific-mode read by `path` (vault-relative path) returns the note's raw text (Priority: P1)

**Story goal**: When an agent has the exact vault-relative path (e.g., `Templates/Recipe.md`), it uses `path` instead of `file`. Same handler, different parameter; argv shape `["read", "vault=...", "path=..."]`.

**Independent test**: Run `vitest run src/tools/read_note/handler.test.ts -t "specific\\+path"`.

### Tests + verification for User Story 2

- [ ] T007 [US2] Add handler test #2 (specific+path happy path, Story 2 AC#1 IT) to [src/tools/read_note/handler.test.ts](../../src/tools/read_note/handler.test.ts). Uses the same stub Logger/Queue/SpawnLike helper that T006 introduced (extract to a `beforeEach`/`describe`-shared helper if not already factored out — keep the test file under ~150 LOC). Asserts:
    - Result `{ content: "<template body>" }`.
    - Recorded argv `["read", "vault=MyVault", "path=Templates/Recipe.md"]` (vault hoisted; path second per the cli-adapter's argv-assembly contract).
    - `callStart` payload's `locator === "path"`.
  Run `npx vitest run src/tools/read_note/handler.test.ts -t "specific\\+path"` and confirm the case passes. **No handler.ts changes** — the existing implementation handles file and path symmetrically through the same `parameters` derivation in T003.

**Checkpoint**: User Story 2 complete. Both specific-mode locators verified end-to-end; argv-assembly differences (file= vs path=) confirmed working through the adapter's contract; test file now has 3 cases.

---

## Phase 6: User Story 3 — Active-mode read returns the focused note's text without forwarding any vault/file/path (Priority: P1)

**Story goal**: `target_mode: "active"` reads whatever note is currently open in Obsidian. Handler routes empty `parameters: {}` through the adapter, which produces argv `["read"]` (no key=value tokens).

**Independent test**: Run `vitest run src/tools/read_note/handler.test.ts -t "active"`.

### Tests + verification for User Story 3

- [ ] T008 [US3] Add handler test #3 (active happy path, Story 3 AC#1 IT) and test #6 (ERR_NO_ACTIVE_FILE propagates, Story 3 AC#3) to [src/tools/read_note/handler.test.ts](../../src/tools/read_note/handler.test.ts). Both tests use the shared stub helper. Assertions:
    - Test #3: input `{ target_mode: "active" }`; stub stdout `"<active body>"`; result `{ content: "<active body>" }`; recorded argv `["read"]` (NO `vault=`, NO `file=`, NO `path=` tokens — verified by exact-array-equality assertion); `callStart` payload's `vault === null` and `locator === "active"`.
    - Test #6: input `{ target_mode: "active" }`; stub stdout `"Error: no active file\n"`, exit 0 (the cli-adapter's classification recipe per [003 spec FR-008(b)](../003-cli-adapter/spec.md)); the call rejects with an `UpstreamError` whose `code === "ERR_NO_ACTIVE_FILE"`; the adapter's `details.message` is preserved (per [003 contract](../003-cli-adapter/contracts/cli-adapter.contract.md) — verify by spot-checking `.details`); `callEndFailure` was called with `{ errorCode: "ERR_NO_ACTIVE_FILE", durationMs: <number>, callId: <uuid> }`.
  The forbidden-key-in-active-mode case (Story 3 AC#2) is covered at the schema layer in T005 case #8 — no handler test needed for it (the schema rejects before the handler runs). Run `npx vitest run src/tools/read_note/handler.test.ts -t "active"` and confirm both cases pass.

**Checkpoint**: User Story 3 complete. Active-mode end-to-end works; the active-branch-stripping contract from the adapter is observed; the ERR_NO_ACTIVE_FILE recovery message propagates verbatim. Handler test file now has 5 cases.

---

## Phase 7: User Story 5 — CLI failures (non-existent file, non-zero exit, in-band Error) flow through `UpstreamError` (Priority: P1)

**Story goal**: Every adapter failure surfaces to the MCP client with the adapter's classified `code`, `message`, and `details` preserved. Read_note does not classify, swallow, mask, or rewrite.

**Independent test**: Run `vitest run src/tools/read_note/handler.test.ts -t "CLI"`.

### Tests + verification for User Story 5

- [ ] T009 [US5] Add handler tests #4 (CLI_NON_ZERO_EXIT, Story 5 AC#1), #5 (CLI_REPORTED_ERROR, Story 5 AC#2), #7 (CLI_BINARY_NOT_FOUND, Story 5 AC#3), and **#9 (non-`UpstreamError` re-throw, Story 5 AC#4)** to [src/tools/read_note/handler.test.ts](../../src/tools/read_note/handler.test.ts). Four tests, each with a different stub-spawn behaviour:
    - **Test #4**: stub child exits `1` with stderr `"file not found"`; the call rejects with `UpstreamError` carrying `code: "CLI_NON_ZERO_EXIT"`, `details.exitCode: 1`, `details.argv` containing the read+vault+file tokens; `callEndFailure({ errorCode: "CLI_NON_ZERO_EXIT" })` fired.
    - **Test #5**: stub child exits `0` with stdout `"Error: File not found\n"`; rejects with `code: "CLI_REPORTED_ERROR"`, `details.message: "Error: File not found"` (trim/first-line-only per the cli-adapter's classification per [003 contract](../003-cli-adapter/contracts/cli-adapter.contract.md)); `callEndFailure({ errorCode: "CLI_REPORTED_ERROR" })` fired.
    - **Test #7**: stub `spawnFn` throws `Object.assign(new Error("ENOENT"), { code: "ENOENT" })` (matches the obsidian_exec / cli-adapter ENOENT-classification path); rejects with `code: "CLI_BINARY_NOT_FOUND"`, `details.binaryAttempted` defined; `callEndFailure({ errorCode: "CLI_BINARY_NOT_FOUND" })` fired.
    - **Test #9** (Story 5 AC#4 — re-throw of unclassified exceptions, per FR-013 (i)): construct a stub `spawnFn` that throws a plain `new Error("synthetic non-UpstreamError")` (NOT an `UpstreamError` subclass; NOT an ENOENT-shaped object). Call the handler and assert the rejection is the SAME `Error` instance verbatim (`expect(rejection).toBe(syntheticError)` — reference-equality on the thrown object), NOT an `UpstreamError`, NOT an `asToolError` envelope. Additionally assert `stubLogger.callEndFailure` was NOT called and `stubLogger.callEndSuccess` was NOT called (re-throw is reserved for unclassified exceptions and intentionally bypasses the structured-error log per the obsidian_exec precedent at [src/tools/obsidian_exec/tool.ts:59](../../src/tools/obsidian_exec/tool.ts#L59)). This test exists specifically to prevent a regression where a future refactor adds `catch (err) { logger.callEndFailure(...); throw err; }` and accidentally widens the failure-event contract.
  Each test asserts the handler does NOT swallow / mask / rewrite — for tests #4/#5/#7, `details` carries the adapter's structured fields verbatim; for test #9, the original exception is propagated verbatim. Run `npx vitest run src/tools/read_note/handler.test.ts -t "CLI|re-throw"` and confirm all four pass. **Total handler.test.ts cases now: 9 — phase complete.**

**Checkpoint**: User Story 5 complete. Constitution Principle IV (every boundary failure flows through `UpstreamError` with a stable code) verified by behaviour. Zero new error codes were introduced (per spec Assumptions) — the canonical errors contract at [specs/001-add-cli-bridge/contracts/errors.contract.md](../001-add-cli-bridge/contracts/errors.contract.md) is unchanged.

---

## Phase 8: User Story 6 — Tool registration emits a stripped JSON Schema and a `help`-aware top-level description (Priority: P2)

**Story goal**: Per ADR-005 (BI-030), every tool registered with the server passes its `zod-to-json-schema` output through the strip utility before publishing, AND its top-level `description` is a concise verb-led summary that mentions `help("read_note")`. Read_note's registration site satisfies both.

**Independent test**: Run `vitest run src/tools/read_note/tool.test.ts` AND `vitest run src/server.test.ts`. Both pass; the existing registry-consistency block at `src/server.test.ts` (per BI-030 FR-017 / SC-011) automatically picks up `read_note` once it's added to `src/server.ts`'s `tools` array.

### Tests + verification for User Story 6

- [ ] T010 [US6] Wire `read_note` into [src/server.ts](../../src/server.ts) per FR-010 + FR-016 + FR-017 + P3. Edit the `tools` array at [src/server.ts:49-52](../../src/server.ts#L49-L52) to:
    ```typescript
    import { registerReadNoteTool } from "./tools/read_note/tool.js";
    // ...
    const tools: RegisteredTool[] = [
      registerHelpTool(),
      registerObsidianExecTool({ logger, queue }),
      registerReadNoteTool({ logger, queue }),
    ];
    ```
    Note the alphabetical order per P3 (`help`, `obsidian_exec`, `read_note`) — the existing order is `obsidian_exec` then `help` (registration-of-introduction); this BI reorders to alphabetical so future typed-tool BIs slot in deterministically. Both `obsidian_exec` and `read_note` receive the SAME `logger` and `queue` instances per FR-016 + FR-017 (Clarifications 2026-05-06 Q1 + Q2). Run `npm run typecheck` and `npm run build` to confirm the wiring typechecks. Run `npx vitest run src/server.test.ts` to confirm the registry-consistency block (which now iterates all three tools) finds the doc-file mapping for `read_note` (the stub at `docs/tools/read_note.md` exists from BI-030, so this passes even before T012's content replacement).

- [ ] T011a [P] [US6] Update [docs/tools/index.md](../../docs/tools/index.md)'s entry for `read_note` per FR-012. The existing index file (created by BI-030) carries a stub placeholder line for `read_note` with the literal `_(documentation pending — owned by a future BI)_` summary (per BI-030 T003). Replace that line with a real one-line summary derived from `READ_NOTE_DESCRIPTION`'s intent: e.g., `- **read_note** — Read a note's raw text from an Obsidian vault by file (wikilink), path, or active focus.` Keep the alphabetical ordering of the bullet list intact. Verifies FR-012 by inspection. The file is Markdown; no source-code header required.

- [ ] T011 [P] [US6] Replace [docs/tools/read_note.md](../../docs/tools/read_note.md) from BI-030 stub to populated body per FR-011 + P5. The new body follows the section ordering pinned in [research.md §P5](./research.md#p5--docstoolsread_notemd-body-structure):
    1. **Overview** — opens with "Read a note's raw text from an Obsidian vault." Names both target modes.
    2. **Input Schema** — fields enumerated by branch:
       - Specific: `target_mode: "specific"` (literal), `vault` (string, min 1, required), exactly one of `file` (wikilink) or `path` (vault-relative).
       - Active: `target_mode: "active"` (literal), no other keys.
       - Cross-link to [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md).
    3. **Output** — `{ content: string }` — UTF-8 raw text, verbatim, no transformation.
    4. **Errors** — table of propagated codes per [data-model.md §6](./data-model.md#6-error-code-roster-zero-new-codes): `VALIDATION_ERROR`, `CLI_NON_ZERO_EXIT`, `CLI_REPORTED_ERROR`, `ERR_NO_ACTIVE_FILE`, `CLI_BINARY_NOT_FOUND`. Cross-link to [errors contract](../../specs/001-add-cli-bridge/contracts/errors.contract.md).
    5. **Examples** — three code blocks: file branch, path branch, active branch.
    6. **References** — bullets with links to the [cli-adapter spec](../../specs/003-cli-adapter/spec.md), [target-mode primitive spec](../../specs/004-target-mode-schema/spec.md), and [help tool spec](../../specs/005-help-tool/spec.md).
  The file MUST NOT carry the `// Original — no upstream.` header (Markdown is exempt per BI-030 FR-019). The file MUST NOT contain the substring `<!-- TODO(BI-003)`. Total Markdown ≈ 120 lines. Verifies FR-011 + Story 6 AC#3 (the `help({ tool_name: "read_note" })` response after this BI returns the populated body).

- [ ] T012 [US6] Author [src/tools/read_note/tool.test.ts](../../src/tools/read_note/tool.test.ts) — 5 test cases per [data-model.md §5 tool tests table](./data-model.md#srctoolsread_notetooltestts-5-cases). The file MUST carry the `// Original — no upstream.` header. Each test:
    1. **Case #1**: `registerReadNoteTool({ logger: stubLogger, queue: createQueue() }).descriptor.name === "read_note"`.
    2. **Case #2** (Story 6 AC#1, BI-030 FR-017 generalized): a recursive walk over `descriptor.inputSchema` visiting `properties` / `oneOf` / `anyOf` / `items` / `additionalProperties` finds zero `description` keys at any depth. Implementation: a small inline helper function `findDescriptionKeys(node)` that returns an array of every `description` key it finds — assert the result has length 0.
    3. **Case #3** (Story 6 AC#2): `descriptor.description` is non-empty, contains `"help"` (case-insensitive — `descriptor.description.toLowerCase().includes("help")`), and contains `"read_note"` (case-sensitive). Optionally a sanity-range length check (between 100 and 500 chars to catch accidental over/under-shooting in a future amendment).
    4. **Case #4** (end-to-end Story 4 through SDK envelope): `await registeredTool.handler({})` (empty input — `target_mode` missing) returns `{ isError: true, content: [{ type: "text", text: <jsonString> }] }` whose `JSON.parse(jsonString)` produces `{ code: "VALIDATION_ERROR", message: <string>, details: { issues: [<array>] } }`; the issues array contains an entry with path including `"target_mode"`.
    5. **Case #5** (FR-011 + FR-013 (e) + P7 + Story 6 AC#3 full content list): doc-content assertions on `docs/tools/read_note.md`. Implementation: resolve the path from `import.meta.url` (NOT `process.cwd()`) — `const here = dirname(fileURLToPath(import.meta.url)); const docPath = resolve(here, "../../../docs/tools/read_note.md"); const body = readFileSync(docPath, "utf8");`. Then assert ALL of:
       - `expect(body).not.toContain("<!-- TODO(BI-003)")` — TODO marker absence (FR-011 last paragraph).
       - `expect(body.length).toBeGreaterThan(500)` — sanity floor against accidental truncation.
       - `expect(body).toContain("Read a note")` — Overview section anchor.
       - `expect(body).toContain('read_note({ target_mode: "specific"')` — at least one specific-mode example.
       - `expect(body).toContain('read_note({ target_mode: "active"')` — active-mode example (Story 6 AC#3 "≥1 example per branch").
       - `expect(body).toContain("file=")` AND `expect(body).toContain("path=")` — both specific-branch locator forms documented (Story 6 AC#3).
       - For each error code in `["VALIDATION_ERROR", "CLI_NON_ZERO_EXIT", "CLI_REPORTED_ERROR", "ERR_NO_ACTIVE_FILE", "CLI_BINARY_NOT_FOUND"]`: `expect(body).toContain(code)` — the full propagated-codes roster (Story 6 AC#3 "the propagated error codes"). Iterate via `forEach` to keep the test compact.
  Run `npx vitest run src/tools/read_note/tool.test.ts` and confirm all 5 cases pass.

**Checkpoint**: User Story 6 complete. The `tools/list` MCP response now includes `read_note` with a stripped `inputSchema` and a verb-led top-level description; `help({ tool_name: "read_note" })` returns the populated doc body; the existing registry-consistency block in `server.test.ts` picks up `read_note` automatically (no edits to that file required); SC-002 + SC-009 verified.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Verify the structural success criteria, confirm coverage didn't regress, run the full quality-gate suite, and prepare the PR.

- [ ] T013 [P] Verify SC-003 (handler has zero direct `child_process.spawn` references) by `grep -E "child_process|spawn" src/tools/read_note/handler.ts` — the only matches MUST be the `SpawnLike` type import (which is fine). If anything else surfaces, the handler is bypassing the adapter — fix before merge.

- [ ] T014 [P] Verify SC-004 (zero hand-written `interface ReadNote…` or `type ReadNote… = { … }` redeclarations of the schema's shape) by `grep -E "^(interface|type) ReadNote" src/tools/read_note/` — only `type ReadNoteInput = TargetMode` (the type-alias re-export per T002) is permitted. `ReadNoteOutput` (a fresh interface for the output shape) is permitted because it does NOT redeclare the input schema's shape — it's a separate type for the handler's return value.

- [ ] T015 [P] Verify SC-005 (zero `.describe()` calls in `src/tools/read_note/schema.ts`) by `grep -F ".describe(" src/tools/read_note/schema.ts` — output MUST be empty.

- [ ] T016 [P] Verify SC-007 (handler ≲50 LOC executable body, ≤ 60 total file lines per the spec's clarification) by `wc -l src/tools/read_note/handler.ts` — output ≤ 60. The 60-line ceiling is the per-spec total-file-LOC bound covering the executable body (≲50) plus the conventional `// Original — no upstream.` header + import block + interface declarations on top. If the handler exceeds, factor out helpers OR re-evaluate whether the design ballooned.

- [ ] T017 [P] Verify SC-010 (obsidian_exec untouched) by `git diff main..HEAD -- src/tools/obsidian_exec/` — output MUST be empty (no changes to obsidian_exec's source or tests). The only acceptable diff in the obsidian_exec area would be a registration-list reorder in `src/server.ts`, which is not under `src/tools/obsidian_exec/`.

- [ ] T018 Run the full quality gate locally: `npm run lint && npm run typecheck && npm run build && npm test`. All four MUST pass. Capture the new statements-coverage number and compare to the T001 baseline — confirm ≥ floor (FR-014 / SC-008) and ideally ~+0.3 pp uptick.

- [ ] T019 Manual verification: start the MCP server, send a `tools/list` request, and inspect the response. `read_note` appears alongside `obsidian_exec` and `help`. Its `description` field contains `"help"` and `"read_note"` (case-insensitive search). Its `inputSchema.properties` (recursively) has zero `description` keys. Send a `tools/call` request with `{ name: "help", arguments: { tool_name: "read_note" } }`; verify the response body is the populated `docs/tools/read_note.md` content (Story 6 AC#3 end-to-end + SC-006 in spec).

- [ ] T020 Update the PR description with the Constitution Compliance checklist per Constitution v1.1.0 §Development Workflow #8 + FR-015. All five principles MUST evaluate as `Y`:
    - [ ] Principle I (Modular Code Organization): `Y` — per-surface module at `src/tools/read_note/` with downward-only imports.
    - [ ] Principle II (Public Surface Test Coverage): `Y` — 22 new co-located test bodies covering happy + failure + boundary paths per FR-013.
    - [ ] Principle III (Boundary Input Validation with Zod): `Y` — `readNoteInputSchema` is the single source of truth (re-export per P1); types via `z.infer`; no `.describe()`; no hand-written interfaces.
    - [ ] Principle IV (Explicit Upstream Error Propagation): `Y` — every failure flows through `asToolError`/`UpstreamError`; zero new error codes (Spec Assumptions).
    - [ ] Principle V (Attribution & Layered Composition): `Y` — every new `.ts` file carries the `// Original — no upstream.` header; Markdown exempt.
  Also note in the PR body: (a) the FR-002 deviation per P1 (re-export instead of literal Pattern (b)) — explain it's a structural-equivalence resolution, not a contract change; (b) the three Clarifications 2026-05-06 anchors (Q1 queue sharing → FR-016, Q2 logger dep → FR-017, Q3 empty-string deferral → updated Edge Case); (c) the SC-008 coverage delta (baseline → final).

---

## Dependencies

**Hard dependencies** (BLOCKING):

- T001 (baseline) → T002–T020 (everything depends on a green baseline).
- T002 (schema.ts complete) → T003, T004, T005, T006, T007, T008, T009, T010, T012 (every other task imports from schema.ts).
- T003 (handler.ts complete) → T006, T007, T008, T009, T010, T012 (every handler test + tool.test.ts case #4 + server.ts wiring).
- T004 (tool.ts complete) → T010, T012 (server wiring + tool tests).
- T010 (server.ts wiring) → T019 (manual verification reads from the running server).
- T011 (docs/tools/read_note.md replacement) → T012 case #5 (doc-content assertions read the populated file).
- T011a (docs/tools/index.md update) is independent of T011 (different file) — both [P] with each other and with T010.

**Phase ordering**:

```
Phase 1 (Setup)
   ↓
Phase 2 (Foundational: T002 → T003 ⇄ T004 — T003 and T004 can run in parallel after T002)
   ↓
Phase 3 (US4 schema tests) ⇄ Phase 4 (US1 handler tests #1, #8) ⇄ Phase 5 (US2 handler test #2) ⇄ Phase 6 (US3 handler tests #3, #6) ⇄ Phase 7 (US5 handler tests #4, #5, #7)
   ↓ (all of Phases 3–7 must complete before Phase 8's T012 case #4 — which exercises the registered handler end-to-end — can pass)
Phase 8 (US6: T010 + T011 ⇄ T012)
   ↓
Phase 9 (Polish: T013–T020)
```

**Cross-story note**: Phases 3–7 all add tests to **the same `handler.test.ts` file** (Phases 4–7) or `schema.test.ts` (Phase 3). They're parallelizable as separate logical work but the file lock makes them sequential at the merge boundary if multiple agents work on them concurrently. For a single implementer, write them in priority order (US4 → US1 → US2 → US3 → US5) and run the full file's test suite at each step.

---

## Parallel execution opportunities

Within Phase 2:
```
T002 (schema.ts) — must finish first.
↓
T003 (handler.ts) ∥ T004 (tool.ts) — both can run in parallel; both depend on T002 only.
```

Within Phase 8:
```
T010 (server.ts wiring) ∥ T011 (docs/tools/read_note.md) ∥ T011a (docs/tools/index.md) — three different files, no shared state, all parallelizable.
↓
T012 (tool.test.ts) — depends on T010 (registered handler must work end-to-end for case #4) AND T011 (case #5 reads the populated file). T011a is independent (no test depends on its content).
```

Within Phase 9:
```
T013 ∥ T014 ∥ T015 ∥ T016 ∥ T017 — all five are pure greps / wc / git diff inspections, no shared state.
↓
T018 (full quality gate) — depends on T013–T017 (verifications first; a failed verification means the gate run is wasted).
↓
T019 (manual server check) — depends on T018 (the build must succeed to start the server).
↓
T020 (PR description) — depends on T018 (coverage numbers) and T019 (manual verification confirmation).
```

---

## Independent test criteria per user story

| Story | How to verify independently | Test command |
|-------|------------------------------|--------------|
| US4 | All 9 schema tests pass; no spawn calls observed | `npx vitest run src/tools/read_note/schema.test.ts` |
| US1 | Handler tests #1 + #8 pass; recorded argv `["read", "vault=…", "file=…"]`; logger captures the three FR-017 events | `npx vitest run src/tools/read_note/handler.test.ts -t "specific\\+file\|empty"` |
| US2 | Handler test #2 passes; recorded argv `["read", "vault=…", "path=…"]`; `locator: "path"` | `npx vitest run src/tools/read_note/handler.test.ts -t "specific\\+path"` |
| US3 | Handler tests #3 + #6 pass; recorded argv `["read"]` (active mode); ERR_NO_ACTIVE_FILE propagates verbatim | `npx vitest run src/tools/read_note/handler.test.ts -t "active"` |
| US5 | Handler tests #4 + #5 + #7 + #9 pass; CLI_NON_ZERO_EXIT + CLI_REPORTED_ERROR + CLI_BINARY_NOT_FOUND all propagate via `UpstreamError`; non-`UpstreamError` exceptions re-throw verbatim WITHOUT `callEndFailure` emission | `npx vitest run src/tools/read_note/handler.test.ts -t "CLI\|re-throw"` |
| US6 | All 5 tool-registration tests pass; the existing registry-consistency block in `server.test.ts` picks up `read_note` automatically | `npx vitest run src/tools/read_note/tool.test.ts && npx vitest run src/server.test.ts` |

---

## Suggested MVP scope

**MVP = User Story 1 (Specific-mode read by `file`)**: Delivers the headline value — an agent can read a note from a known vault by wikilink. Even alone, US1 is a step-change in agent capability over routing every read through `obsidian_exec`. Implementing US1 requires:

- T001 (Setup)
- T002–T004 (Foundational — schema, handler, tool skeletons)
- T005 (US4 schema tests — required because US1's input has to validate; the schema is the bedrock)
- T006 (US1 handler tests + impl wiring)
- T010 (US6 server wiring — the tool must be registered for an MCP client to call it)
- T011 (US6 docs/tools/read_note.md — the help tool's response is part of US6's contract)
- T011a (US6 docs/tools/index.md update — FR-012 listing entry)
- T012 (US6 tool-registration tests — confirms the registration is correct)
- T013–T020 (Polish — quality gates + PR description)

That's 13 tasks. The remaining 8 (US2, US3, US5 — i.e., T007, T008, T009 + the "additional handler tests" they bundle) extend the read_note tool to cover all input branches and all failure surfaces but are not strictly required for the MVP slice. Recommend landing them ALL in one PR (the spec is a coherent BI; splitting US1 from US2/US3/US5 would create two PRs that share the same handler — unnecessary friction). The MVP framing matters mainly for incremental verification while implementing.

---

## Implementation strategy

**Recommended order** (single-implementer):

1. T001 — confirm baseline.
2. T002 — schema (one-liner re-export; minimal cognitive load).
3. T003 ∥ T004 — handler + tool factories in parallel; both are mechanical from the contract.
4. T005 — schema tests; quick win, all should pass against T002 immediately.
5. T006 — first handler test + first integration through the adapter; this is where real bugs surface (argv assembly, log-event payloads, queue.run wrapping).
6. T007, T008, T009 — three more sets of handler tests; each ~10–20 minutes since the handler implementation is already in place from T003 and tests are parameterized. T009 includes the new test #9 (non-`UpstreamError` re-throw, Story 5 AC#4).
7. T010 ∥ T011 ∥ T011a — server wiring + standalone doc replacement + index.md entry update; three independent files, all parallelizable.
8. T012 — five tool-registration tests; each is a small, focused assertion (case #5 now asserts the full Story 6 AC#3 doc-content list).
9. T013–T017 — five inspection tasks; each is a single grep / wc / git diff.
10. T018 — full quality gate; expected to pass.
11. T019 — manual server check; spot-check.
12. T020 — PR description.

**Iteration tip**: when implementing T003 (the handler), keep it under the SC-007 ≲50-LOC executable-body ceiling (≤ 60 total file lines including header + imports) by aggressively delegating to the cli-adapter. The handler should look like: parse-narrowing → derive log fields → callStart → queue.run(invokeCli) → success-or-failure path with log emit → return-or-throw. If it grows past 50 lines of executable body, the most likely culprit is over-complete error handling — let `UpstreamError` flow through naturally; let unclassified throws re-throw without wrapping (and without emitting `callEndFailure` — see T009 test #9 for why that's part of the contract).

**Total task count**: 21 tasks. Per-phase distribution: Setup 1, Foundational 3, US4 1, US1 1, US2 1, US3 1, US5 1, US6 4 (T010, T011, T011a, T012), Polish 8.

**Format validation**: All 21 tasks follow the strict checklist format `- [ ] [TaskID] [P?] [Story?] Description with file path`. Story labels appear on T005–T012 (the per-story phase tasks, including T011a); omitted on T001–T004 (Setup + Foundational) and T013–T020 (Polish). The `[P]` marker appears where parallelism is genuinely possible (T003, T004, T011, T011a, T013–T017) and is absent where shared file state forces sequencing.
