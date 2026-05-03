# Tasks: Add CLI Bridge

**Input**: Design documents from [specs/001-add-cli-bridge/](./)
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md), [.specify/memory/constitution.md](../../.specify/memory/constitution.md)

**Tests**: REQUIRED for this feature. FR-019 mandates the `{schema, tool, handler}.ts` triplet with co-located tests; FR-020 mandates a minimum of three named tests for `obsidian_exec`; constitution Principle II makes co-located public-surface test coverage NON-NEGOTIABLE. Test files use the built-in `node:test` runner with `*.test.ts` naming, co-located next to the source they exercise.

**Organization**: Tasks are grouped by user story. Phase 2 (Foundational) builds the cross-cutting machinery (errors, logger, queue, server bootstrap, lifecycle handlers) that **every** user story depends on; this is heavier than a typical feature's foundational layer because the bridge's error-handling, logging, and signal-cleanup contracts are constitution-pinned and apply from the first call onward.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: Maps task to a spec.md user story (US1 / US2 / US3). Setup, Foundational, and Polish phases carry no story label.
- Every task description names the exact file path(s) it touches and cites the spec FR / contract document / research decision it implements.

## Path Conventions

Single-project layout per [plan.md → Project Structure](./plan.md#project-structure). All source under [src/](../../src/), no `tests/` directory (tests co-locate as `*.test.ts` per Principle II). Documentation under `specs/001-add-cli-bridge/`. Build output to `dist/` (gitignored).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project bootstrap — package metadata, TypeScript config, lint/format tooling, dependency install.

- [X] T001 [P] Create [package.json](../../package.json): `name: "obsidian-cli-mcp"`, `version: "0.1.0"`, `type: "module"`, `engines.node: ">=22.11"`, `bin.obsidian-cli-mcp: "./dist/index.js"`. Scripts: `build` (`tsc`), `typecheck` (`tsc --noEmit`), `test` (`node --test --enable-source-maps "src/**/*.test.ts"` via `--import` of a TS loader, or `tsx --test`), `lint` (`eslint .`), `format:check` (`prettier --check .`), `format:write` (`prettier --write .`). Runtime deps: `@modelcontextprotocol/sdk`, `zod`, `zod-to-json-schema`. Dev deps: `typescript`, `@types/node`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `prettier`, plus a TS test loader (`tsx` or `ts-node` with NodeNext-compatible config). Cite plan.md → Technical Context for the dep list rationale.
- [X] T002 [P] Create [tsconfig.json](../../tsconfig.json): `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `target: "ES2024"`, `strict: true`, `outDir: "dist"`, `rootDir: "src"`, `declaration: true`, `sourceMap: true`, `noEmitOnError: true`, `forceConsistentCasingInFileNames: true`, `skipLibCheck: true`. `include: ["src/**/*.ts"]`. `exclude: ["dist", "node_modules"]`. Cite constitution Technical Standards.
- [X] T003 [P] Create [eslint.config.js](../../eslint.config.js) (flat config): TypeScript parser, `@typescript-eslint` recommended-strict ruleset, zero-warning policy on merge. Cite constitution Technical Standards.
- [X] T004 [P] Create [.prettierrc.json](../../.prettierrc.json) with project formatting conventions (default Prettier settings are acceptable; explicit file pins the convention).
- [X] T005 [P] Create [.gitignore](../../.gitignore) covering `node_modules/`, `dist/`, `*.log`, `.env`, `.DS_Store`.
- [X] T006 Run `npm install` and verify the dependency tree resolves without warnings or peer-dep errors. Pin transitive lockfile by committing `package-lock.json`. (Sequential — depends on T001.)

**Checkpoint**: Project bootstraps. `npm run lint`, `npm run typecheck`, `npm run build` all run cleanly against the empty `src/` tree (no errors because there's nothing to check yet).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core process-level infrastructure — the error class, logger, FIFO queue, and server bootstrap with full lifecycle handling. **Required by every user story** because (a) Principle IV mandates `UpstreamError` from the first call, (b) Principle II mandates logging on every public-surface call, (c) FR-023 mandates serialization from the first concurrent invocation, and (d) FR-028/FR-029 mandate orphan-free shutdown from the moment the bridge starts accepting traffic.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T007 [P] Create [src/errors.test.ts](../../src/errors.test.ts) using `node:test`. Assert: `UpstreamError` is exported, extends `Error`, `instanceof UpstreamError` works after construction, the constructor preserves `code` / `cause` / `details` verbatim, the optional `message` argument is preserved when given and synthesized (e.g. includes `code`) when omitted, JSON serialization of `details` is sane. Reference [contracts/errors.contract.md](./contracts/errors.contract.md) for the class shape.
- [X] T008 [P] Create [src/errors.ts](../../src/errors.ts) implementing `class UpstreamError extends Error` with `readonly code: string`, `readonly cause: unknown`, `readonly details: Record<string, unknown>`, and the documented constructor. Add the attribution header `// Original — no upstream. Project-wide structured boundary error class (FR-018, Principle IV foundation).` Make T007's tests pass. Cite [contracts/errors.contract.md](./contracts/errors.contract.md).
- [X] T009 [P] Create [src/logger.test.ts](../../src/logger.test.ts). Assert each event shape (`call.start`, `call.end` success, `call.end` failure, `bridge.shutdown`) per [contracts/logging.contract.md](./contracts/logging.contract.md). Assert the **stderr-only invariant**: the logger MUST NOT write to `process.stdout` under any code path (use a fake stream injected through the logger's constructor and assert it's never `process.stdout`). Assert ISO-8601 UTC timestamp format. Assert `callId` correlation via the `callStart`/`callEnd` helper pair.
- [X] T010 [P] Create [src/logger.ts](../../src/logger.ts). Export a `Logger` factory (or singleton) accepting an optional output stream (defaults to `process.stderr`). Expose helpers: `callStart({ callId, command, vault, argv, queueDepth })`, `callEndSuccess({ callId, durationMs, stdoutBytes, stderrBytes })`, `callEndFailure({ callId, errorCode, durationMs, exitCode?, signal? })`, `shutdown({ reason, inFlightKilled, queuedDropped })`. Each writes one line of `JSON.stringify(event) + "\n"` to the configured stream. Generate `callId` via `crypto.randomUUID()` per research.md R8. Add attribution header. Make T009's tests pass.
- [X] T011 [P] Create [src/queue.test.ts](../../src/queue.test.ts). Assert: `queue.run(task)` returns a promise that resolves/rejects to the task's outcome, two tasks enqueued together complete in arrival order (assert via timestamps), `queue.depth()` reports the number of pending (not-yet-spawned) items, `queue.shutdown()` drops queued items without running them and resolves their promises with a sentinel rejection (or no-op — the spec says dropped queued calls don't need to surface an error). Reference [data-model.md → QueueItem](./data-model.md#queueitem-internal) and research.md R7.
- [X] T012 [P] Create [src/queue.ts](../../src/queue.ts). Implement the FIFO single-flight queue per research.md R7: a chained-promise tail, a pending-count, an exposed `depth()`, and a `shutdown()` hook that drops not-yet-started tasks. Add attribution header. Make T011's tests pass.
- [X] T013 [P] Create [src/server.test.ts](../../src/server.test.ts). Assert: server boots (constructs the MCP `Server`, advertises `capabilities: { tools: {} }`, identity `name: "obsidian-cli-mcp"` with `version` from package.json). Assert lifecycle: a fake transport's `onclose` triggers `shutdown('transport_closed')`; emitting `process.emit('SIGINT')` triggers `shutdown('signal:SIGINT')`; emitting `process.emit('SIGTERM')` triggers `shutdown('signal:SIGTERM')`. Assert `shutdown()` is idempotent (calling twice runs cleanup once, emits exactly one `bridge.shutdown` log line). Assert `bridge.shutdown` log includes the right `reason` discriminator and `inFlightKilled: false` / `queuedDropped: 0` when there's nothing in flight or queued. Assert `process.exit(0)` is called (use a stub that records the exit code without actually exiting the test runner). Reference [contracts/mcp-server.contract.md](./contracts/mcp-server.contract.md) and [contracts/logging.contract.md](./contracts/logging.contract.md).
- [X] T014 Create [src/server.ts](../../src/server.ts). Construct the MCP `Server` with identity + capabilities per T013. Implement `shutdown(reason: "transport_closed" | "signal:SIGINT" | "signal:SIGTERM")`: idempotent (guarded by a `shuttingDown` flag), kills any active child by calling a hook (initially a no-op stub — wired by T031 in Phase 5), calls `queue.shutdown()`, emits `logger.shutdown({ reason, inFlightKilled, queuedDropped })`, then `process.exit(0)`. Wire `transport.onclose = () => shutdown('transport_closed')`, `process.on('SIGINT', () => shutdown('signal:SIGINT'))`, `process.on('SIGTERM', () => shutdown('signal:SIGTERM'))`. **No tools are registered yet**. Add attribution header. Depends on T008, T010, T012. Make T013's tests pass.
- [X] T015 Create [src/index.ts](../../src/index.ts). Module-top side-effect entry: `const server = createServer(); const transport = new StdioServerTransport(); await server.connect(transport);` then idle (the transport keeps the event loop alive). Add the `#!/usr/bin/env node` shebang on the FIRST line so the `bin` entry from package.json works post-install. Add attribution header. Depends on T014.

**Checkpoint**: The bridge boots, advertises an empty tool list, and shuts down cleanly on transport-close, SIGINT, and SIGTERM. Logger emits the right lifecycle events. The error class and queue are ready to be used by user story phases.

---

## Phase 3: User Story 1 - Invoke Obsidian CLI subcommands from a remote MCP client (Priority: P1) 🎯 MVP

**Goal**: Register the `obsidian_exec` MCP tool in its minimum-viable form: accept `command` + `parameters`, assemble argv, spawn the `obsidian` binary, return `{stdout, stderr, exitCode: 0, argv}` on success, and surface non-zero exits and missing-binary failures as `UpstreamError`. After this phase, every Obsidian CLI subcommand reachable via positional `command [param=value...]` is callable from a remote MCP client. (`vault`, `flags`, `copy`, `timeoutMs` arrive in US2/US3.)

**Independent Test**: With Obsidian 1.12+ running on the host, an MCP test client invoking `obsidian_exec({ command: "version" })` returns `{ stdout: "<version string>", stderr: "", exitCode: 0, argv: ["obsidian", "version"] }` (binary INCLUDED as argv[0]). Spec acceptance scenario US1#1.

**Tests for User Story 1** (REQUIRED — see header note)

- [X] T016 [P] [US1] Create [src/tools/obsidian_exec/schema.test.ts](../../src/tools/obsidian_exec/schema.test.ts) covering the US1-scoped fields (`command`, `parameters` only — `vault`/`flags`/`copy`/`timeoutMs` arrive in later phases). Cases: (a) parse `{ command: "version" }` succeeds, (b) parse `{ command: "search", parameters: { query: "foo", limit: 10, silent: true } }` succeeds with the right value types, (c) reject empty `command` (`.min(1)` enforcement, FR-003), (d) reject extra unknown fields (`additionalProperties: false`), (e) reject `parameters` values that are arrays/objects (only string/number/boolean primitives allowed, FR-004), (f) accept missing `parameters`. Reference [contracts/obsidian_exec.tool.json](./contracts/obsidian_exec.tool.json) and [data-model.md → ObsidianExecInput](./data-model.md#obsidianexecinput).
- [X] T017 [P] [US1] Create [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) using a mock spawn factory (in-tree fake child-process module exporting a controllable EventEmitter that mimics `ChildProcess`). **Terminology**: per research.md R1, the handler computes `spawnArgs` (passed to Node's `spawn(binary, spawnArgs, opts)`) and the **published `argv`** field returned to callers is `[binary, ...spawnArgs]` (binary INCLUDED as argv[0]). All assertions below use the published-argv form. FR-020-mandated tests scoped to US1: (a) **happy path**: `command: "version"` with the mock emitting `"1.7.2\n"` to stdout and exit 0 returns `{ stdout: "1.7.2\n", stderr: "", exitCode: 0, argv: ["obsidian", "version"] }`; the mock's recorded `(binary, spawnArgs)` are `("obsidian", ["version"])`; (b) **failure path**: `command: "nonexistent_command_xyz"` with mock exit code 2 raises `UpstreamError` with `code: "CLI_NON_ZERO_EXIT"`, `cause: { exitCode: 2, signal: null }`, and `details: { argv: ["obsidian", "nonexistent_command_xyz"], stdout, stderr }`; (c) **boundary path** (vault-omitted default-focused-vault): `command: "search", parameters: { query: "fixture" }` produces published `argv: ["obsidian", "search", "query=fixture"]` and recorded `spawnArgs: ["search", "query=fixture"]` (no `vault=` token); (d) spawn-error ENOENT raises `UpstreamError` with `code: "CLI_BINARY_NOT_FOUND"` carrying the `binaryAttempted` and `PATH` fields per [contracts/errors.contract.md](./contracts/errors.contract.md); (e) integer/boolean values in `parameters` stringify into `key=value` argv tokens; (f) handler emits matching `call.start` / `call.end` log lines via the injected logger; the `call.start` line's `argv` is the published-argv form `["obsidian", ...]`; (g) **OBSIDIAN_BIN override (FR-013)**: with `deps.env: { OBSIDIAN_BIN: "C:\\custom\\obsidian.exe", PATH: "..." }`, calling with `command: "version"` causes the mock spawn factory to receive `binary === "C:\\custom\\obsidian.exe"` and the published `argv` to be `["C:\\custom\\obsidian.exe", "version"]`. **Integration mode**: gate any test that hits a real `obsidian` binary behind `process.env.RUN_OBSIDIAN_INTEGRATION === "1"` so the default `npm test` works on dev machines without Obsidian installed. Reference research.md R9 for the gating pattern.
- [X] T018 [P] [US1] Create [src/tools/obsidian_exec/tool.test.ts](../../src/tools/obsidian_exec/tool.test.ts). Cases: (a) the tool's published `name` is `"obsidian_exec"` (matches [contracts/mcp-server.contract.md](./contracts/mcp-server.contract.md)), (b) the published `description` matches [contracts/obsidian_exec.tool.json](./contracts/obsidian_exec.tool.json) `#description`, (c) the published `inputSchema` (produced at runtime by `zodToJsonSchema(schema)`) is structurally equivalent to the `inputSchema` in the contract document for the US1-scoped fields (a deep-equal comparison after dropping order-insensitive keys), (d) calling the tool with valid arguments dispatches into the handler, (e) calling the tool with invalid arguments returns the SDK's structured error response carrying the zod field paths.

**Implementation for User Story 1**

- [X] T019 [US1] Create [src/tools/obsidian_exec/schema.ts](../../src/tools/obsidian_exec/schema.ts). Export `obsidianExecSchema = z.object({ command: z.string().min(1), parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional() }).strict()`. Export `obsidianExecInputJsonSchema = zodToJsonSchema(obsidianExecSchema, { name: "ObsidianExecInput", $refStrategy: "none" })`. Export `type ObsidianExecInput = z.infer<typeof obsidianExecSchema>`. Add attribution header. Make T016's tests pass. Reference research.md R3 and FR-002 / FR-003 / FR-004 / FR-009.
- [X] T020 [US1] Create [src/tools/obsidian_exec/handler.ts](../../src/tools/obsidian_exec/handler.ts). Export `executeObsidianExec(input: ObsidianExecInput, deps: { logger, queue, spawnFn?, env? }): Promise<ObsidianExecOutput>`. Inside: wrap the work in `queue.run(async () => { ... })`. **Two-name argv convention** (per research.md R1): `spawnArgs` is what gets passed to Node's `spawn(binary, spawnArgs, opts)` (does NOT include argv[0]); `argv` is the published field returned to callers and surfaced in errors/logs and is `[binary, ...spawnArgs]` (binary INCLUDED). The wrapped task: (a) generate `callId` via `crypto.randomUUID()`, (b) compute `binary = (deps.env ?? process.env).OBSIDIAN_BIN ?? "obsidian"`, (c) assemble `spawnArgs` per FR-010 for US1 fields only: `spawnArgs = [input.command, ...Object.entries(input.parameters ?? {}).map(([k, v]) => "${k}=${v}")]`, (d) derive `const argv = [binary, ...spawnArgs]` for the published payloads, (e) emit `logger.callStart({ callId, command: input.command, vault: null, argv, queueDepth: queue.depth() })` and capture the start timestamp, (f) call `(deps.spawnFn ?? spawn)(binary, spawnArgs, { shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })`, (g) collect stdout/stderr as `Buffer[]` arrays per research.md R4, (h) on `error` event with `code === "ENOENT"`: emit `logger.callEndFailure({ callId, errorCode: "CLI_BINARY_NOT_FOUND", durationMs })` then throw `new UpstreamError({ code: "CLI_BINARY_NOT_FOUND", cause: errorEvent, details: { binaryAttempted: binary, PATH: (deps.env ?? process.env).PATH } })`, (i) on child `exit` with code 0: emit `logger.callEndSuccess(...)` then return `{ stdout: Buffer.concat(stdoutChunks).toString("utf8"), stderr: ..., exitCode: 0, argv }`, (j) on child `exit` with non-zero code: emit `logger.callEndFailure({ callId, errorCode: "CLI_NON_ZERO_EXIT", durationMs, exitCode, signal })` then throw `new UpstreamError({ code: "CLI_NON_ZERO_EXIT", cause: { exitCode, signal }, details: { argv, stdout, stderr } })`. **No timeout machinery and no output-cap machinery in this task** — the timer/cap impl lands in T031 (T030 just adds the `timeoutMs` schema field). Add attribution header. Depends on T008 (errors), T010 (logger), T012 (queue), T019 (schema). Make T017's tests pass. Reference [contracts/errors.contract.md](./contracts/errors.contract.md) for the two error shapes, [contracts/logging.contract.md](./contracts/logging.contract.md) for the log-event payloads.
- [X] T021 [US1] Create [src/tools/obsidian_exec/tool.ts](../../src/tools/obsidian_exec/tool.ts). Export `registerObsidianExecTool(server, deps)`: calls `server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: "obsidian_exec", description: <from contracts/obsidian_exec.tool.json>, inputSchema: obsidianExecInputJsonSchema }] }))` and `server.setRequestHandler(CallToolRequestSchema, async (req) => { if (req.params.name !== "obsidian_exec") throw <SDK ToolNotFound>; const parsed = obsidianExecSchema.parse(req.params.arguments); const result = await executeObsidianExec(parsed, deps); return { content: [{ type: "text", text: JSON.stringify(result) }] }; })`. The handler dispatch catches `ZodError` and translates to the SDK's structured error response (per FR-009); other thrown values (notably `UpstreamError`) propagate so the SDK serializes via its `isError: true` path per [contracts/errors.contract.md](./contracts/errors.contract.md) → "Serialization to MCP". Add attribution header. Depends on T019, T020. Make T018's tests pass.
- [X] T022 [US1] Wire `registerObsidianExecTool(server, { logger, queue })` into [src/server.ts](../../src/server.ts) inside `createServer()` after `Server` construction and before returning. Update [src/server.test.ts](../../src/server.test.ts): add a case asserting `tools/list` returns exactly one tool with `name: "obsidian_exec"`. Depends on T014, T021.

**Checkpoint US1**: A real MCP client can connect to the bridge and call `obsidian_exec({ command: "version" })` and other parameter-bearing subcommands. Non-zero exits and missing-binary failures surface as structured `UpstreamError`. The bridge is **deployable as an MVP** at this point — every other story in this feature adds capability rather than fixing a defect.

---

## Phase 4: User Story 2 - Scope an invocation to a named vault (Priority: P2)

**Goal**: Add the `vault`, `flags`, and `copy` input fields. The handler prepends `vault=<value>` as the first positional after the binary, appends bare-word flags in declaration order, and appends `--copy` as the final token when requested. Argv ordering follows FR-010 exactly.

**Independent Test**: `obsidian_exec({ vault: "test-vault", command: "search", parameters: { query: "fixture" } })` returns a response whose published `argv` is `["obsidian", "vault=test-vault", "search", "query=fixture"]` (binary INCLUDED) and the search runs against `test-vault`. Spec acceptance scenario US2#1.

**Tests for User Story 2** (REQUIRED)

- [X] T023 [US2] Extend [src/tools/obsidian_exec/schema.test.ts](../../src/tools/obsidian_exec/schema.test.ts) with US2-field cases: (a) parse `{ command: "search", vault: "v" }` succeeds, (b) reject `vault: ""` (`.min(1)` enforcement, FR-006), (c) parse `flags: ["silent", "overwrite"]` succeeds, (d) **reject `flags: ["--silent"]`** — bare-word constraint (FR-005), assert the zod error path includes `flags` and the offending index, (e) reject `flags: [""]`, (f) accept `copy: true` and `copy: false`, (g) parse the all-fields-together example from [contracts/obsidian_exec.tool.json](./contracts/obsidian_exec.tool.json) succeeds.

**Implementation for User Story 2**

- [X] T024 [US2] Extend [src/tools/obsidian_exec/schema.ts](../../src/tools/obsidian_exec/schema.ts): add `vault: z.string().min(1).optional()`, `flags: z.array(z.string().min(1).regex(/^(?!--).*/)).optional()`, `copy: z.boolean().optional()` to the `obsidianExecSchema` object. Re-export the regenerated `obsidianExecInputJsonSchema`. Make T023's tests pass. The `z.infer` type updates automatically — no parallel TS interface to keep in sync (Principle III). Reference FR-005, FR-006, FR-007.
- [X] T025 [US2] Extend [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts) (using the two-name argv convention from T020 — `spawnArgs` is the array passed to spawn, `argv` is the published `[binary, ...spawnArgs]`): (a) `vault: "test-vault"` produces published `argv: ["obsidian", "vault=test-vault", "search", "query=fixture"]` (the `vault=` token is the FIRST POST-BINARY positional, before the command); the recorded `spawnArgs` is `["vault=test-vault", "search", "query=fixture"]`; (b) `flags: ["silent", "overwrite"]` appends both verbatim after parameters in declaration order — published `argv` ends `..., "silent", "overwrite"`; (c) `copy: true` appends `--copy` as the FINAL argv element — published `argv` ends `..., "--copy"`; (d) the all-fields-together call (`vault` + `command` + `parameters` + `flags` + `copy`) produces published `argv` in the exact FR-010 order: `[binary, vault=v, command, ...params, ...flags, --copy]`; (e) `call.start` log line's `vault` field is `"test-vault"` when present and `null` when omitted (per [contracts/logging.contract.md](./contracts/logging.contract.md)) and the log line's `argv` matches the published-argv form.
- [X] T026 [US2] Extend [src/tools/obsidian_exec/handler.ts](../../src/tools/obsidian_exec/handler.ts) `spawnArgs` assembly to follow FR-010 exactly (still using the two-name convention from T020 — derive `argv = [binary, ...spawnArgs]` once for published payloads): `spawnArgs = [...(input.vault ? [\`vault=${input.vault}\`] : []), input.command, ...kvParams, ...(input.flags ?? []), ...(input.copy ? ["--copy"] : [])]`. The published `argv` is therefore `[binary, vault=<v>?, command, ...params, ...flags, --copy?]` — exactly the FR-010 ordering with binary at argv[0]. Update the `logger.callStart({ ..., vault: input.vault ?? null, argv, ... })` payload (no change to the argv-derivation site since T020 already does it once). Make T025's new cases pass.

**Checkpoint US2**: Multi-vault setups work. The full positional-and-flag contract is wired. Only error-path machinery (timeout, output cap) remains for v0.1.

---

## Phase 5: User Story 3 - Surface upstream failures as structured, debuggable errors (Priority: P3)

**Goal**: Add the `timeoutMs` input field, the per-call timeout machinery (kill on expiry), the 10 MiB per-stream output cap (kill on overflow), and the `CLI_TIMEOUT` and `CLI_OUTPUT_TOO_LARGE` error codes. `CLI_NON_ZERO_EXIT` and `CLI_BINARY_NOT_FOUND` already shipped in US1 (Principle IV requires them from day one). After this phase, every failure mode named in the spec surfaces as a structured `UpstreamError` with full diagnostic detail.

**Independent Test**: `obsidian_exec({ command: "version", timeoutMs: 1 })` raises `UpstreamError` with `code: "CLI_TIMEOUT"` and `details: { argv, timeoutMs: 1, partialStdout: "", partialStderr: "" }`. Spec acceptance scenario US3#3. A separate test that mocks a child emitting > 10 MiB of stdout raises `UpstreamError` with `code: "CLI_OUTPUT_TOO_LARGE"` and `details.stream: "stdout"`, `details.limitBytes: 10485760`, `details.capturedBytes > 10485760`.

**Tests for User Story 3** (REQUIRED)

- [X] T027 [US3] Extend [src/tools/obsidian_exec/schema.test.ts](../../src/tools/obsidian_exec/schema.test.ts) with `timeoutMs` cases: accept `1`, `30000`, `120000`; reject `0`, `-1`, `120001`, `1.5`, `"30000"`. Cite FR-008.
- [X] T028 [US3] Extend [src/tools/obsidian_exec/handler.test.ts](../../src/tools/obsidian_exec/handler.test.ts): (a) **CLI_TIMEOUT**: with a mock spawn that never exits, calling with `timeoutMs: 1` raises `UpstreamError` with `code: "CLI_TIMEOUT"` and `details: { argv: ["obsidian", "version"], timeoutMs: 1, partialStdout, partialStderr }` (note: `argv` includes the binary per the two-name convention); assert SIGTERM is sent first and SIGKILL follows after the 2-second grace if the child still hasn't exited (use a fake-timer / a kill-tracking mock to verify both signals); (b) **CLI_OUTPUT_TOO_LARGE on stdout**: mock spawn emits **11 MiB of ASCII filler** (e.g., `Buffer.alloc(1024 * 1024, 0x41)` repeated 11 times — guaranteed single-byte UTF-8 so `byteLength === string.length` for the assertion below) to stdout in chunks, handler raises `UpstreamError` with `code: "CLI_OUTPUT_TOO_LARGE"`, `details.stream: "stdout"`, `details.limitBytes: 10485760`, `details.capturedBytes > 10485760`, `details.partial.length === 10485760` AND `Buffer.byteLength(details.partial, "utf8") === 10485760` (both hold because the fixture is ASCII; the byteLength check guards against future non-ASCII fixtures silently passing a character-count assertion); assert the kill sequence ran; (c) **CLI_OUTPUT_TOO_LARGE on stderr**: same as (b) but with the data going to stderr; (d) **default timeout**: omitting `timeoutMs` uses 30000 ms (assert by mocking timers and checking the `setTimeout` argument); (e) **timeout starts at spawn, not at enqueue (FR-023)**: enqueue two calls; the second's `timeoutMs` clock should not start until its child is spawned (after the first completes); (f) **SC-004 round-trip**: with the happy-path mock, call with `parameters: { code: "with spaces, quotes \"x\", $vars, ;& backticks \`y\`" }` and assert the mock's recorded `spawnArgs` contains the value byte-for-byte (no shell interpolation occurred). Reference [contracts/errors.contract.md](./contracts/errors.contract.md) and research.md R4.
- [X] T029 [US3] Extend [src/server.test.ts](../../src/server.test.ts): (a) trigger transport-close while a long-running call is in flight; assert the in-flight child receives SIGTERM, the `bridge.shutdown` log line has `inFlightKilled: true`, and the queued task count drops cleanly; (b) trigger SIGINT during an in-flight call; same assertions with `reason: "signal:SIGINT"`; (c) trigger SIGTERM during an in-flight call with two queued tasks; assert `queuedDropped: 2` and the queued tasks' promises do not resolve to a success result. Reference FR-028, FR-029.

**Implementation for User Story 3**

- [X] T030 [US3] Extend [src/tools/obsidian_exec/schema.ts](../../src/tools/obsidian_exec/schema.ts) with `timeoutMs: z.number().int().positive().max(120000).optional()`. Re-export the regenerated `obsidianExecInputJsonSchema`. Make T027's cases pass. Cite FR-008.
- [X] T031 [US3] Extend [src/tools/obsidian_exec/handler.ts](../../src/tools/obsidian_exec/handler.ts):
  - **Timeout**: After spawn, `const timer = setTimeout(() => killAndReject(<reason: "timeout">), input.timeoutMs ?? 30000)`. On natural exit, `clearTimeout(timer)`. The `killAndReject(reason)` helper sends SIGTERM, schedules a 2-second `setTimeout(() => child.kill("SIGKILL"))`, then once `exit` fires resolves the per-call promise with the appropriate `UpstreamError`. For `reason === "timeout"`: throw `new UpstreamError({ code: "CLI_TIMEOUT", cause: null, details: { argv, timeoutMs: input.timeoutMs ?? 30000, partialStdout: ..., partialStderr: ... } })`.
  - **Output cap**: Track `stdoutBytes` and `stderrBytes` counters incremented on every `data` event. When either crosses `10 * 1024 * 1024`, call `killAndReject({ kind: "cap", stream: "stdout"|"stderr", capturedBytes })`. For the cap reason: throw `new UpstreamError({ code: "CLI_OUTPUT_TOO_LARGE", cause: null, details: { argv, stream, limitBytes: 10485760, capturedBytes, partial: <captured prefix decoded as utf8, sliced to limitBytes if needed> } })`.
  - **Active child handle**: maintain a module-scoped `let activeChild: ChildProcess | null = null` (set on spawn, cleared on exit). Export a `killActiveChild(): boolean` function that returns `true` if it killed something, `false` if no active child. This is the hook server.ts's `shutdown(reason)` calls during cleanup (per FR-028).
  - Make T028's cases pass. Reference research.md R4 (output buffering), R5 (kill machinery shared across timeout / cap / shutdown).
- [X] T032 [US3] Wire the kill hook from T031 into [src/server.ts](../../src/server.ts)'s `shutdown(reason)` function. Replace the no-op stub installed in T014 with a call to `killActiveChild()`; capture its return value as `inFlightKilled` and pass it to `logger.shutdown({ reason, inFlightKilled, queuedDropped })`. Capture `queuedDropped = queue.depth()` BEFORE calling `queue.shutdown()`. Make T029's cases pass. Depends on T031.

**Checkpoint US3**: All four error codes thrown, all three shutdown-cleanup signal paths verified, output cap protects the bridge from runaway payloads, default and per-call timeouts kill stuck children. The bridge meets every functional requirement in spec.md.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: README content (FR-022), constitution-gated quality checks, and final attribution sweep.

- [X] T033 [P] Write [README.md](../../README.md). Sections: a one-paragraph project summary, **Installation** (Windows-host install via `npm install -g obsidian-cli-mcp` or `npx` — explicitly state the bridge **MUST** install on the Windows host and **NOT** inside a sandboxed Linux container like Claude Cowork's, per FR-022 and the architectural rationale ADR-002 will capture; prerequisites: Node >= 22.11, Obsidian 1.12+, `obsidian` on PATH or `OBSIDIAN_BIN` set), **MCP-client configuration** (Claude Desktop config snippet, Claude Cowork host-tunneling note explaining why the bridge can't run inside the container, both per [quickstart.md](./quickstart.md)), **Tool reference** (single-tool summary pointing at [contracts/obsidian_exec.tool.json](./contracts/obsidian_exec.tool.json)), **Troubleshooting** (the table from quickstart.md), **Attributions** ("v0.1: no upstream lifts. All code under `src/` is original; future composed code will be enumerated here per constitution Principle V."), **License** (MIT or whatever the project picks). Cite FR-022.
- [X] T034 [P] Verify [CLAUDE.md](../../CLAUDE.md)'s SPECKIT block is current (already updated by `/speckit-plan`; this task confirms no drift after merge). Visual diff against [specs/001-add-cli-bridge/plan.md](./plan.md)'s referenced paths.
- [X] T035 [P] Sweep every file under [src/](../../src/) and verify each carries the attribution header per FR-021. Pattern: `// Original — no upstream. <one-line description>.` on the first line of every `.ts` source file (not test files — though tests are also encouraged to carry headers). If any file is missing the header, add it. Cite Principle V.
- [X] T036 Run `npm run lint` from the repo root. Expect zero warnings (constitution Development Workflow & Quality Gates rule 1). Fix any warnings before proceeding.
- [X] T037 Run `npm run typecheck` (`tsc --noEmit`). Expect clean output (gate rule 2). Fix any type errors before proceeding.
- [X] T038 Run `npm test` from the repo root. Expect every co-located `*.test.ts` to pass under `node:test`. With `RUN_OBSIDIAN_INTEGRATION` unset, integration-gated tests skip; with `RUN_OBSIDIAN_INTEGRATION=1` and a running Obsidian instance, the gated tests run and pass against the real binary. Gate rule 4.
- [X] T039 Run `npm run build`. Expect `dist/` produced with `index.js`, `index.d.ts`, source maps, and the rest of the compiled tree. Verify `dist/index.js` is executable (the `#!/usr/bin/env node` shebang from T015 survives compilation). Gate rule 3.
- [ ] T040 Manual quickstart validation per [quickstart.md](./quickstart.md): install the bridge from a built tarball into a clean MCP client config, point Claude Desktop at it, ask the agent to invoke `obsidian_exec({ command: "version" })`, confirm the response carries the running Obsidian version AND the published `argv` is `["obsidian", "version"]` (binary INCLUDED — verifies F1's resolution end-to-end). Confirm Ctrl+C in the bridge's foreground shell emits a `bridge.shutdown` log line with `reason: "signal:SIGINT"` and exits with code 0. SC-001, SC-005, SC-006.

- [X] T041 Run prohibition checks (FR-017, FR-025): from the repo root, `Grep` (or equivalent) for `throw new Error` inside [src/server.ts](../../src/server.ts) and [src/tools/](../../src/tools/) — expected: zero matches (FR-017 forbids plain throws at boundary surfaces; every failure path uses `UpstreamError`). Then `Grep` for `console.log`, `console.error`, `console.warn`, `process.stdout.write` across all of [src/](../../src/) — expected: zero matches outside the MCP SDK transport (FR-025: stdout is reserved for MCP protocol traffic; logger writes only to stderr). Any match is a regression — fix before merge. This is the automated counterpart to the code-review-only enforcement noted in tasks.md "Notes" section.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion (specifically T006, the `npm install`). **BLOCKS all user stories.**
- **User Stories (Phase 3+)**: All depend on Foundational (Phase 2) being complete.
  - US1 is the MVP. Required before US2/US3 add value.
  - US2 and US3 each EXTEND files that US1 created (`schema.ts`, `handler.ts`). They cannot be done in parallel by separate developers without a merge conflict in those two files. Sequential: US1 → US2 → US3.
  - US3 also touches [src/server.ts](../../src/server.ts) (T032 wires the kill hook), so it has a hard dependency on US1's T022 (which wired the tool registration). The kill-hook wiring picks up where T014's no-op stub left off.
- **Polish (Phase 6)**: Depends on all desired user stories being complete. T036–T039 are constitution-mandated gates (lint, typecheck, test, build) that should be re-run after every user story to catch regressions early. T041 is an additional automated prohibition check (FR-017 no-plain-throw, FR-025 stdout-reserved). The formal "feature ready" gate is at the end of Phase 6 (T040 manual quickstart validation).

### User Story Dependencies (within this feature)

- **US1 (P1)**: Depends only on Foundational. **MVP-deployable on its own.**
- **US2 (P2)**: Depends on US1 (extends `schema.ts` and `handler.ts` with vault/flags/copy logic). Cannot be tested without US1's schema and handler scaffolding in place.
- **US3 (P3)**: Depends on US1 (extends the same files with timeout + cap; wires the kill-active hook into the server's shutdown path that US1's T022 left wired but inert).

### Within Each User Story

- **TDD ordering** (per template guidance "Write these tests FIRST, ensure they FAIL"): test files come before implementation tasks within each story. T016/T017/T018 (US1 tests) precede T019/T020/T021 (US1 impl).
- **Schema before handler**: `schema.ts` exports the input type the handler imports; touch in that order.
- **Handler before tool**: `tool.ts` imports `executeObsidianExec` from `handler.ts` and `obsidianExecSchema` from `schema.ts`.
- **Tool before server wiring**: `server.ts`'s `registerObsidianExecTool` import target must exist before T022 can wire it.

### Parallel Opportunities

- **All Phase 1 tasks marked [P]** (T001–T005) can run in parallel. T006 (`npm install`) sequences after T001.
- **All Phase 2 test-task pairs marked [P]** (T007/T008, T009/T010, T011/T012, T013/T014) can run in parallel across pairs — but within each pair, the implementation task (T008, T010, T012, T014) sequences after its test task. T014 also depends on T008 and T010 (it imports from them). T015 sequences after T014.
- **US1 test tasks T016/T017/T018 are [P]** (different files, no inter-deps). Implementation T019/T020/T021 each sequence after their respective test task; T020 also depends on T019, T021 also depends on T019 + T020. T022 sequences after T021.
- **US2 and US3 cannot meaningfully parallelize** — they extend the same two files (`schema.ts`, `handler.ts`). Sequential.
- **Polish tasks T033/T034/T035 are [P]** (different files / read-only checks). T036–T039 are sequential constitution gate runs. T041 (prohibition grep) is read-only and can run in parallel with T040 (manual validation).

---

## Parallel Example: Phase 2 Foundational

```text
# All four foundational test files can be drafted in parallel:
Task: "Create src/errors.test.ts" (T007)
Task: "Create src/logger.test.ts" (T009)
Task: "Create src/queue.test.ts"  (T011)
Task: "Create src/server.test.ts" (T013)

# Once each test exists, its implementation can start in parallel with the others' implementations:
Task: "Create src/errors.ts to make T007 pass" (T008)
Task: "Create src/logger.ts to make T009 pass" (T010)
Task: "Create src/queue.ts to make T011 pass"  (T012)

# T014 (server.ts) depends on T008 and T010 — must follow them.
# T015 (index.ts) depends on T014 — must follow it.
```

## Parallel Example: User Story 1

```text
# All three US1 test files can be drafted in parallel:
Task: "Create src/tools/obsidian_exec/schema.test.ts"  (T016)
Task: "Create src/tools/obsidian_exec/handler.test.ts" (T017)
Task: "Create src/tools/obsidian_exec/tool.test.ts"    (T018)

# Implementation must respect the import order schema → handler → tool:
Task: "Create src/tools/obsidian_exec/schema.ts to make T016 pass"  (T019)
Task: "Create src/tools/obsidian_exec/handler.ts to make T017 pass" (T020)  # after T019
Task: "Create src/tools/obsidian_exec/tool.ts to make T018 pass"    (T021)  # after T019, T020
Task: "Wire the tool into src/server.ts"                            (T022)  # after T021
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T006).
2. Complete Phase 2: Foundational (T007–T015) — **do not skip; the constitution mandates the error class, logger, queue, and lifecycle handlers from the first call onward**.
3. Complete Phase 3: User Story 1 (T016–T022).
4. **STOP and VALIDATE**: Run lint, typecheck, test gates. Manually invoke `obsidian_exec({ command: "version" })` against a real Obsidian instance via an MCP test client. Verify the success response shape and the `CLI_NON_ZERO_EXIT` path against `command: "nonexistent"`.
5. **Deploy/demo if ready**: the bridge is a viable MVP at this point.

### Incremental Delivery

After MVP:

1. **US2** (T023–T026): adds vault scoping + flags + copy. Re-run lint/typecheck/test. Manual validation: `obsidian_exec({ vault: "<your-vault>", command: "search", parameters: { query: "foo" } })`.
2. **US3** (T027–T032): adds timeout + output cap + the remaining two error codes + signal-cleanup wiring. Re-run gates. Manual validation: `obsidian_exec({ command: "version", timeoutMs: 1 })` returns `CLI_TIMEOUT`; pressing Ctrl+C during a long call kills it cleanly.
3. **Polish** (T033–T041): README, attribution sweep, four constitution gate runs (lint/typecheck/test/build), end-to-end manual quickstart validation, and the FR-017/FR-025 prohibition grep.

### Parallel Team Strategy

Single developer expected for v0.1. If two developers were available:

- After Phase 2 completes, one developer starts US1 (T016–T022). The other can begin drafting US2 tests (T023) speculatively, but cannot run them until US1 lands the schema/handler scaffolding.
- US2 and US3 cannot be developed in parallel by separate developers without a merge conflict in `schema.ts` and `handler.ts`. Sequential.

---

## Notes

- **Test framework**: `node:test` (built-in), per constitution Technical Standards. No `vitest`, `jest`, or `mocha`.
- **Tests are co-located** (`*.test.ts` next to source), per Principle II. There is no `tests/` directory in this project.
- **Every src/ module needs an attribution header** per FR-021 / Principle V. Even modules without explicit "create attribution header" line items below MUST carry one — the implementer adds it as part of the module-creation task.
- **Plain `throw new Error(...)` is forbidden** at boundary surfaces (the MCP tool handler and the lifecycle handlers in server.ts). Every failure path uses `UpstreamError`. Reviewers should grep for stray plain-throws during code review. (T041 automates this; review remains a defense-in-depth.)
- **Stdout is sacred** — the logger writes to stderr only (FR-025). Reviewers should grep for `console.log` and `process.stdout.write` and reject any that aren't from the MCP SDK transport. (T041 automates this; review remains a defense-in-depth.)
- **Commit cadence**: per the project's existing pattern, commit after each completed task or logical group. The auto-commit hook is currently disabled by default; if you want commits to be automatic, flip `auto_commit.default: true` in [.specify/extensions/git/git-config.yml](../../.specify/extensions/git/git-config.yml).
- **Avoid**: vague tasks, same-file conflicts across [P]-marked tasks, cross-story dependencies that break independence (US2 and US3 explicitly depend on US1 — that's fine; what's not fine is US3 depending on US2 since they SHOULD be independently testable atop US1).
