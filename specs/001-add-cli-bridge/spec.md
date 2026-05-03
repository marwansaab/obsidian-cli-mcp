# Feature Specification: Add CLI Bridge

**Feature Branch**: `001-add-cli-bridge`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "Add CLI Bridge — A minimal MCP server that bridges any MCP client (running anywhere — local or sandboxed) to the Obsidian Integrated CLI binary running on the Windows host. The server is a Node.js process on Windows; it speaks MCP over stdio and exec's the `obsidian` binary via `child_process.spawn`. It registers ONE tool, `obsidian_exec`, that lets the caller invoke any obsidian CLI subcommand by name, with structured parameters, bare-word flags, and optional vault scoping. This is the v0.1 foundation — the typed Track-A wrappers (read, search, tasks, properties, etc.) are deferred to follow-up specs that compose on top of this primitive."

## Clarifications

### Session 2026-05-03

- Q: How should the bridge handle overlapping `obsidian_exec` calls (multiple in-flight invocations from one or more MCP clients)? → A: Serialize via an in-process FIFO queue — one CLI child process runs at a time; pending calls wait for the in-flight call to complete. Rationale: the Obsidian-renderer-backed CLI is not assumed to be reentrancy-safe (concurrent `eval` calls can race on `app.vault` state), and serializing keeps the contract predictable without adding tunable knobs in v0.1.
- Q: What is the bridge's logging policy for v0.1? → A: Structured JSON lines to stderr, one line per lifecycle event for every call. Stdout is reserved exclusively for MCP protocol traffic. No verbosity knob in v0.1 (the call-start + call-end pair is always emitted).
- Q: How should the bridge bound stdout/stderr collection to protect against runaway output? → A: Hard cap of 10 MiB per stream (stdout and stderr counted independently). On overflow, the bridge kills the child and raises `UpstreamError` with `code: "CLI_OUTPUT_TOO_LARGE"` carrying the captured prefix. No tunable knob in v0.1.
- Q: What should the bridge do when the MCP transport closes (stdin EOF / client disconnect)? → A: Kill the in-flight child (SIGTERM, then SIGKILL after the same 2-second grace period as the timeout path), drop all queued calls without spawning them, then exit the bridge process cleanly. Reason: when the listener is gone, work has no consumer; orphaning the `obsidian` process risks vault corruption and resource leaks.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Invoke Obsidian CLI subcommands from a remote MCP client (Priority: P1)

An LLM agent running inside a sandboxed environment (e.g., Claude Cowork's Linux container) needs to read, query, or evaluate things inside an Obsidian vault that lives on the operator's Windows desktop. The agent connects to the bridge MCP server over stdio and calls `obsidian_exec` with a subcommand name (such as `version`, `help`, or `eval`) and gets back the CLI's stdout, stderr, exit code, and the exact argv that was invoked.

**Why this priority**: This is the entire reason the bridge exists. Until the agent can issue *any* CLI call and observe its full output, no follow-up Track-A wrapper (search, read, tasks, properties) can be built on top. Without P1, the project has zero value. With P1 alone, every Obsidian CLI capability becomes reachable from a remote agent — even before typed wrappers ship.

**Independent Test**: With Obsidian 1.12+ running on the Windows host and the bridge launched as an MCP stdio server, an MCP test client invoking `obsidian_exec({ command: "version" })` returns `{ stdout: "<obsidian version string>", stderr: "", exitCode: 0, argv: ["obsidian", "version"] }`. No other story needs to exist for this to be demonstrably useful.

**Acceptance Scenarios**:

1. **Given** the bridge is running and Obsidian 1.12+ is open on the host, **When** an MCP client calls `obsidian_exec({ command: "version" })`, **Then** the response contains the running Obsidian version in `stdout`, an empty `stderr`, `exitCode: 0`, and `argv: ["obsidian", "version"]`.
2. **Given** the bridge is running, **When** an MCP client calls `obsidian_exec({ command: "help" })`, **Then** the top-level CLI help text appears in `stdout` with `exitCode: 0`.
3. **Given** the bridge is running, **When** an MCP client calls `obsidian_exec({ command: "eval", parameters: { code: "app.vault.getFiles().length" } })`, **Then** the response `stdout` contains the file count as a stringified number with `exitCode: 0`.
4. **Given** the bridge is running, **When** an MCP client calls `obsidian_exec({ command: "search", parameters: { query: "meeting", limit: 10 } })`, **Then** the spawned argv is `["obsidian", "search", "query=meeting", "limit=10"]` and the response surfaces the CLI's stdout/stderr/exitCode unchanged.

---

### User Story 2 - Scope an invocation to a named vault (Priority: P2)

When the operator has more than one vault open in Obsidian, the agent needs to be explicit about which vault a command targets. The agent passes a `vault` field; the bridge prepends it as the first positional token after the binary so the CLI applies its documented vault-scoping convention.

**Why this priority**: P2, not P1, because the CLI's own "currently focused vault" default is sufficient for single-vault setups (the most common starting case). Multi-vault scoping is essential the moment the agent operates against more than one vault, but it can be layered on after the bridge demonstrably works against the focused vault.

**Independent Test**: With at least one named vault registered in Obsidian, calling `obsidian_exec({ vault: "test-vault", command: "search", parameters: { query: "fixture" } })` returns a response whose `argv` begins `["obsidian", "vault=test-vault", "search", "query=fixture", ...]` — confirming the `vault=` token is the first post-binary positional, before the command name.

**Acceptance Scenarios**:

1. **Given** the bridge is running and a vault named `test-vault` exists, **When** the client calls `obsidian_exec({ vault: "test-vault", command: "search", parameters: { query: "fixture" } })`, **Then** the response `argv` is `["obsidian", "vault=test-vault", "search", "query=fixture"]` and the search runs against `test-vault`.
2. **Given** the bridge is running, **When** the client omits `vault`, **Then** the spawned argv contains no `vault=` token and the command targets Obsidian's currently focused vault.
3. **Given** the client supplies `copy: true` together with `vault` and `flags`, **When** the call is made, **Then** the argv ordering is `[binary, vault=..., command, ...parameters, ...flags, --copy]` — `vault=` first, `--copy` last.

---

### User Story 3 - Surface upstream failures as structured, debuggable errors (Priority: P3)

When the underlying CLI call fails — non-zero exit, binary missing from PATH, or the call hangs past the timeout — the bridge does not pretend success. It throws a structured `UpstreamError` carrying a stable `code`, the original `cause` where available, and a `details` payload that preserves enough context (the exact argv, captured stdout/stderr, exit code, signal, timeout) for the caller to diagnose the failure.

**Why this priority**: P3 because the happy path delivers value first, but error transparency is what makes the bridge trustworthy for an autonomous agent. Without it, a silent empty stdout is indistinguishable from a real-but-empty result, and the agent will confidently act on a false negative. Required for production use; not required to demonstrate the bridge works at all.

**Independent Test**: An MCP test client invoking `obsidian_exec({ command: "nonexistent_command_xyz" })` and asserting that the error response carries `code: "CLI_NON_ZERO_EXIT"` plus `details.argv`, `details.stdout`, `details.stderr`, `details.exitCode`, `details.signal`. A separate test setting `timeoutMs: 1` against `command: "version"` asserts `code: "CLI_TIMEOUT"`.

**Acceptance Scenarios**:

1. **Given** the bridge is running, **When** the client calls `obsidian_exec({ command: "nonexistent_command_xyz" })` and the CLI exits non-zero, **Then** the bridge raises `UpstreamError` with `code: "CLI_NON_ZERO_EXIT"`, `cause: { exitCode, signal }`, and `details: { argv, stdout, stderr }`.
2. **Given** the obsidian binary is not resolvable on PATH and `OBSIDIAN_BIN` is unset (or points nowhere), **When** the client calls any `obsidian_exec(...)`, **Then** the bridge raises `UpstreamError` with `code: "CLI_BINARY_NOT_FOUND"`, `cause` set to the spawn error, and `details: { binaryAttempted, PATH }`.
3. **Given** the bridge is running, **When** the client calls `obsidian_exec({ command: "version", timeoutMs: 1 })` and the call exceeds the timeout, **Then** the bridge sends SIGTERM, waits a 2-second grace period, sends SIGKILL if still alive, and raises `UpstreamError` with `code: "CLI_TIMEOUT"` and `details: { argv, timeoutMs, partialStdout, partialStderr }`.

---

### Edge Cases

- **Empty `command`**: rejected at the boundary — the schema requires a non-empty string, so the bridge never attempts to spawn.
- **Parameter values containing shell metacharacters** (spaces, quotes, `$`, `;`, `&`, backticks): passed through unchanged because argv is an array — no shell interpolation runs. The CLI sees the raw value verbatim.
- **Very large stdout/stderr**: collected fully into memory up to a hard cap of 10 MiB per stream (stdout and stderr counted independently). When either stream crosses the cap, the bridge kills the child (SIGTERM, then SIGKILL after a 2-second grace period) and raises `UpstreamError` with `code: "CLI_OUTPUT_TOO_LARGE"`. v0.1 makes no streaming guarantees and exposes no tunable knob for the cap.
- **Boolean and numeric parameter values**: stringified before assembly into the `key=value` argv form (`{ limit: 10 }` becomes `"limit=10"`, `{ silent: true }` becomes `"silent=true"`).
- **Both `parameters` and `flags` empty**: produces an argv of just `[binary, (vault=...,)? command, (--copy)?]` — valid, no padding.
- **`timeoutMs` above the cap (120000)**: rejected at the boundary by the schema; the bridge never attempts the call.
- **Caller passes a `command` that maps to a CLI subcommand which itself takes a long time**: the default 30-second timeout applies unless `timeoutMs` is set; on expiry, the timeout error path runs.
- **The CLI exits zero but writes to stderr** (warnings): treated as success — `stderr` is returned alongside `stdout` and `exitCode: 0` for the caller to interpret.
- **Overlapping calls** (a second `obsidian_exec` arrives while another is already running): the second call waits in a FIFO queue and starts only after the in-flight call completes. Calls are processed in arrival order; queue depth is unbounded in v0.1.
- **MCP client disconnects mid-call** (stdin EOF on the bridge's MCP transport): the bridge sends SIGTERM to the in-flight `obsidian` child, sends SIGKILL after a 2-second grace period if the child is still alive, drops every queued call without spawning, and exits its own process cleanly. The dropped queued calls do not need to surface an `UpstreamError` to the caller — the transport is gone, there is nobody to receive it.

## Requirements *(mandatory)*

### Functional Requirements

**Surface registration**

- **FR-001**: The system MUST expose a Model Context Protocol server that speaks over stdio and registers exactly one tool named `obsidian_exec` for v0.1.
- **FR-002**: The MCP `inputSchema` published by `obsidian_exec` MUST be derived from a single zod schema that is also the runtime validator for incoming arguments — there is one source of truth per the project's boundary-validation principle.

**Tool input contract**

- **FR-003**: `obsidian_exec` MUST accept a required `command` field (non-empty string) naming the CLI subcommand to invoke as the first positional after the binary.
- **FR-004**: `obsidian_exec` MUST accept an optional `parameters` field (record of string → string | number | boolean) and assemble each entry into the spawned argv as `key=value`, with numbers and booleans stringified.
- **FR-005**: `obsidian_exec` MUST accept an optional `flags` field (array of bare-word strings, no `--` prefix) and append each entry to the spawned argv verbatim.
- **FR-006**: `obsidian_exec` MUST accept an optional `vault` field (string); when set, the bridge MUST prepend a `vault=<value>` token as the first positional argument after the binary, before the command name.
- **FR-007**: `obsidian_exec` MUST accept an optional `copy` field (boolean); when true, the bridge MUST append `--copy` to the spawned argv as the final token. This is the only `--`-prefixed flag the bridge produces.
- **FR-008**: `obsidian_exec` MUST accept an optional `timeoutMs` field (positive integer, maximum 120000) overriding the default 30-second exec timeout.
- **FR-009**: When inputs fail schema validation, the bridge MUST refuse to spawn and return a validation error reporting the offending field paths.

**Argv assembly**

- **FR-010**: The argv passed to the spawned process MUST follow this exact order: `[binary, (vault=<v>)?, command, ...parameters_in_declaration_order, ...flags_in_declaration_order, (--copy)?]`.
- **FR-011**: Parameter values MUST be passed via array argv (no shell interpolation), so values containing spaces, quotes, semicolons, ampersands, backticks, dollar signs, or other shell metacharacters reach the CLI unchanged.

**Tool output contract (success)**

- **FR-012**: On exit code 0, `obsidian_exec` MUST return an object containing `stdout` (string, UTF-8), `stderr` (string, UTF-8), `exitCode` (literal `0`), and `argv` (the exact string array passed to the spawned process).

**Binary resolution**

- **FR-013**: The bridge MUST resolve the obsidian binary by name from the host's PATH by default and MUST allow override via the `OBSIDIAN_BIN` environment variable for development against non-PATH installs.

**Error handling (per project Principle IV)**

- **FR-014**: When the CLI exits non-zero, the bridge MUST raise an `UpstreamError` instance with `code: "CLI_NON_ZERO_EXIT"`, `cause: { exitCode, signal }`, and `details: { argv, stdout, stderr }`. The bridge MUST NOT swallow the error or substitute an empty result.
- **FR-015**: When spawn fails because the binary cannot be found, the bridge MUST raise an `UpstreamError` with `code: "CLI_BINARY_NOT_FOUND"`, `cause` set to the underlying spawn error, and `details: { binaryAttempted, PATH }`.
- **FR-016**: When the call exceeds its timeout, the bridge MUST send SIGTERM to the child, wait a 2-second grace period, send SIGKILL if the child is still alive, and raise an `UpstreamError` with `code: "CLI_TIMEOUT"` and `details: { argv, timeoutMs, partialStdout, partialStderr }`.
- **FR-017**: Plain `throw new Error("…")` at the bridge boundary is forbidden; every failure path MUST surface as `UpstreamError` so the MCP SDK serializes it via the SDK's structured error-response shape and downstream code can grep for the type.
- **FR-018**: The `UpstreamError` class MUST be defined once in this feature (`src/errors.ts`) carrying `code`, `cause`, and `details` fields, and MUST be the shared error type reused across the project for all subsequent boundary surfaces.
- **FR-027**: The bridge MUST enforce a hard cap of **10 MiB (10 × 1024 × 1024 bytes)** on each captured stream (stdout and stderr counted independently). When either stream's captured byte count crosses the cap, the bridge MUST kill the child (SIGTERM, then SIGKILL after a 2-second grace period) and raise `UpstreamError` with `code: "CLI_OUTPUT_TOO_LARGE"` and `details: { argv, stream: "stdout"|"stderr", limitBytes: 10485760, capturedBytes: <integer>, partial: <captured prefix string> }`. The cap MUST NOT be overridable by tool input or environment variable in v0.1.

**Module layout & tests (per project Principles I & II)**

- **FR-019**: The `obsidian_exec` surface MUST be organized as a `{schema, tool, handler}.ts` triplet under `src/tools/obsidian_exec/`, with tests co-located in the same directory using the `*.test.ts` naming convention.
- **FR-020**: The feature MUST ship with at least three co-located tests using the built-in `node:test` runner: a happy-path test for `version`, a failure-path test for `nonexistent_command_xyz`, and a boundary-path test for the vault-omitted default-focused-vault behaviour.

**Attribution (per project Principle V)**

- **FR-021**: Every new module under `src/` introduced by this feature MUST carry an attribution header. `obsidian_exec` modules and `errors.ts` MUST carry an `Original — no upstream.` header with a one-line description, since no code is lifted for v0.1.

**Concurrency**

- **FR-023**: The bridge MUST serialize concurrent `obsidian_exec` calls through an in-process FIFO queue: at most one `obsidian` child process runs at any time; additional calls wait in arrival order and start only after the in-flight call completes (success or `UpstreamError`). Each call's `timeoutMs` MUST start counting only when its child is actually spawned, not while it is queued.

**Observability**

- **FR-024**: The bridge MUST emit structured JSON-lines (one JSON object per line, terminated with `\n`) to **stderr** for every `obsidian_exec` lifecycle event. At minimum:
  - **Call start**: `{ "event": "call.start", "ts": <ISO-8601>, "callId": <string>, "command": <string>, "vault": <string|null>, "argv": <string[]>, "queueDepth": <integer> }` emitted at the moment the child is spawned (after queue wait, before child output).
  - **Call end (success)**: `{ "event": "call.end", "ts": <ISO-8601>, "callId": <string>, "exitCode": 0, "durationMs": <integer>, "stdoutBytes": <integer>, "stderrBytes": <integer> }`.
  - **Call end (failure)**: `{ "event": "call.end", "ts": <ISO-8601>, "callId": <string>, "errorCode": <"CLI_NON_ZERO_EXIT"|"CLI_BINARY_NOT_FOUND"|"CLI_TIMEOUT"|"CLI_OUTPUT_TOO_LARGE">, "durationMs": <integer> }` plus `exitCode`/`signal` when known.
  Each `callId` MUST correlate the matching `call.start` and `call.end` lines.
- **FR-025**: The bridge MUST treat **stdout** as exclusively reserved for MCP protocol traffic. No log lines, no diagnostic prints, no `console.log` to stdout — only the MCP SDK's transport may write there. Violations corrupt the wire.
- **FR-026**: Logging MUST NOT be conditional on a verbosity knob in v0.1; the call-start/call-end pair is always emitted. (Future verbosity controls are deferred to a follow-up spec and out of scope here.)

**Lifecycle**

- **FR-028**: When the MCP transport closes (stdin EOF, client disconnect, or transport error), the bridge MUST: (a) send SIGTERM to the in-flight `obsidian` child if one is running, (b) send SIGKILL after a 2-second grace period if the child has not exited, (c) discard every queued call without spawning it, and (d) exit the bridge process cleanly with exit code 0. Dropped queued calls do NOT need to surface an `UpstreamError` (the receiver is gone). Orphan child processes are a defect.
- **FR-029**: The bridge MUST also emit a final shutdown log line to stderr — `{ "event": "bridge.shutdown", "ts": <ISO-8601>, "reason": "transport_closed", "inFlightKilled": <boolean>, "queuedDropped": <integer> }` — before exiting, so the operator can audit shutdown causes from the log stream.

**Documentation**

- **FR-022**: The project README MUST include an Installation section that makes clear the bridge installs on the Windows host (not inside a sandboxed Linux container) and an MCP-client configuration example showing how to register the bridge in Claude Desktop and in Claude Cowork's MCP configuration.

### Key Entities

- **`obsidian_exec` invocation**: a single CLI call brokered through the bridge. Carries a command name, optional parameters, optional flags, optional vault scope, optional clipboard-copy flag, and an optional per-call timeout. Yields either a success record (stdout, stderr, exitCode 0, argv) or an `UpstreamError` instance.
- **`UpstreamError`**: a project-wide structured error class introduced by this feature. Carries `code` (a stable string identifier such as `CLI_NON_ZERO_EXIT`, `CLI_BINARY_NOT_FOUND`, `CLI_TIMEOUT`, or `CLI_OUTPUT_TOO_LARGE`), `cause` (the original thrown value where available), and `details` (a structured record preserving the upstream context — argv, exit code, signal, captured streams, timeout, attempted binary, PATH, output limit/captured-byte counts).
- **Bridge process**: the long-lived Node.js process running on the Windows host that hosts the MCP server, owns the stdio transport, maintains a FIFO queue of pending invocations, and spawns one short-lived `obsidian` child per invocation. Lifetime is bound to the MCP transport — when stdin closes, the bridge kills the in-flight child, drops the queue, and exits.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time operator can install the bridge on a Windows host and complete the first successful `obsidian_exec({ command: "version" })` call from an MCP test client in under 10 minutes following only the README.
- **SC-002**: 100% of CLI subcommands accepted by Obsidian Integrated CLI are reachable through `obsidian_exec` without bridge changes — the bridge never needs to be modified to expose a new subcommand because it is a generic primitive.
- **SC-003**: 100% of upstream failure modes (non-zero exit, missing binary, timeout, output-too-large) surface to the caller as a structured `UpstreamError` carrying enough detail (argv, exit code/signal, captured streams, timeout, captured-byte counts) to diagnose the failure without reproducing it. Zero failure modes return an empty success record or a plain `Error`.
- **SC-004**: Argv values reach the CLI byte-for-byte identical to what the caller supplied, even when those values contain shell metacharacters. Verified by a test that round-trips a payload containing spaces, quotes, `$`, `;`, `&`, and backticks through `eval` and asserts the CLI received them unchanged.
- **SC-005**: The bridge boots on Node.js 22.11+ on the Windows host via `npx obsidian-cli-mcp` (post-install) or `node dist/index.js`, registers `obsidian_exec`, and stays alive on stdio waiting for MCP requests with no exits or warnings on a clean startup.
- **SC-006**: An autonomous agent running in Claude Cowork's Linux container can discover the bridge, invoke `obsidian_exec`, and receive a result on the first attempt without operator intervention beyond the one-time MCP-client configuration shown in the README.

## Assumptions

- **Host platform**: v0.1 targets Windows only. macOS and Linux paths for binary resolution are tracked as a possible-future-improvement and out of scope for this spec.
- **Obsidian version**: a running Obsidian 1.12+ desktop instance is required for the CLI to respond. Verifying that Obsidian is running is the operator's responsibility; the bridge surfaces whatever the CLI returns.
- **Single CLI invocation per tool call**: each `obsidian_exec` call spawns exactly one `obsidian` child process. Pipelines, command chaining, and shell features are not supported.
- **Full-buffer output**: stdout and stderr are collected to completion before the response returns. No streaming or chunked output in v0.1.
- **Default timeout**: 30 seconds per call when `timeoutMs` is unset. Hard maximum: 120000 ms (2 minutes).
- **Eval safety**: when callers use `command: "eval"`, the JavaScript runs unsandboxed in Obsidian's renderer with full vault access. `UpstreamError` catches thrown values, but the bridge does not constrain what eval payloads can do at runtime. Sandboxing is explicitly a separate spec.
- **Stderr disclosure in errors**: stdout and stderr captured from the CLI are passed through to the caller verbatim — both in successful responses and inside `UpstreamError.details`. The MCP client / agent is treated as a fully-trusted reader of vault contents (it can already call `read`), so no redaction or content filtering is performed. Tightening this is left to a future spec if a less-trusted-caller deployment ever appears.
- **Inherited child environment and cwd**: the spawned `obsidian` process inherits the bridge's environment variables and current working directory unless future specs say otherwise. v0.1 does not expose either as a tool input.
- **Constitution**: Principles I (modular layout), II (co-located public-surface tests), III (zod boundary validation), IV (structured upstream errors), and V (attribution headers) all apply to this feature and bind the implementation.
- **No CLI surface**: the project's eventual citty-based CLI is out of scope here. v0.1 ships only the MCP server.
- **No typed Track-A wrappers**: typed convenience tools (`obsidian_read`, `obsidian_search`, `obsidian_tasks`, `obsidian_properties`, etc.) and a typed `obsidian_eval` are deferred. Each becomes its own follow-up `/speckit-specify` composing on top of `obsidian_exec`.
- **Architecture rationale**: the Windows-host placement of the bridge will be captured in ADR-002 (separate document); this spec assumes that placement and does not re-litigate it.
