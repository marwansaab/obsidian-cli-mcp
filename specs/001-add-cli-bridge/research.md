# Phase 0 Research: Add CLI Bridge

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-03

The spec was fully clarified across two `/speckit-clarify` sessions before this command ran. There are no `NEEDS CLARIFICATION` items in the Technical Context to dispatch research agents against. The decisions below are pre-emptive resolutions of the small set of *implementation-pattern* questions every implementer of this feature would otherwise have to re-derive — pinned now so Phase 2 task generation has a single answer to point at.

---

## R1. `child_process.spawn` invocation pattern on Windows

**Decision**: Use `spawn(binary, argv, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })`, where `binary = process.env.OBSIDIAN_BIN ?? "obsidian"` and `argv` is the array assembled per FR-010 (no `binary` in the array — `spawn` handles that).

**Rationale**:
- `shell: false` is non-negotiable. With `shell: true`, every parameter value would be re-interpreted by `cmd.exe`, defeating FR-011 (byte-for-byte argv pass-through) and reintroducing shell-injection risk.
- `stdio: ['ignore', 'pipe', 'pipe']` discards child stdin (the bridge has nothing to write to it), captures stdout and stderr explicitly. Gives us control over byte counting per FR-027.
- `windowsHide: true` suppresses the brief console-window flash some Windows binaries cause when launched from a non-console parent. Cosmetic but important for an unattended bridge.
- `OBSIDIAN_BIN` env override is read once per call (cheap; allows the operator to change it without restarting the bridge for development).

**Alternatives considered**:
- `execFile(binary, argv, callback)`: collects stdout/stderr in full before calling back, but loses partial buffers if we kill the child mid-stream — incompatible with the `partialStdout` / `partialStderr` fields required in `UpstreamError.details` for `CLI_TIMEOUT` and `CLI_OUTPUT_TOO_LARGE`. Rejected.
- `cross-spawn` / `execa` / `nano-spawn`: third-party wrappers around `spawn`. None solve a problem we have here, and the constitution's Dependencies rule biases hard against new runtime deps unless they replace ~150+ LOC. Rejected.

---

## R2. MCP SDK `Server` API + `StdioServerTransport` wiring

**Decision**: Construct one `Server` with the SDK's `Server` class. Register the tool via `server.setRequestHandler(ListToolsRequestSchema, ...)` to advertise `obsidian_exec` and `server.setRequestHandler(CallToolRequestSchema, ...)` to dispatch into our handler. Connect via `new StdioServerTransport()` then `await server.connect(transport)`. Server identity: `name: "obsidian-cli-mcp"`, `version` read from `package.json`. Capabilities: `{ tools: {} }`.

**Rationale**:
- The constitution's Technical Standards section explicitly forbids ad-hoc JSON-RPC handling and mandates the `Server` API. The two `setRequestHandler` calls are the SDK's documented convention for tool servers.
- `StdioServerTransport` is the published transport class for stdio MCP servers; it owns the framing and protocol — we never write to stdout directly.
- Server identity is exposed via the MCP `initialize` response automatically by the SDK.

**Alternatives considered**:
- Building a custom JSON-RPC dispatcher: forbidden by the constitution. Rejected.
- Using one of the SDK's higher-level "server with auto-registered tools" helpers (if available in the SDK version we pin): considered, but the explicit `setRequestHandler` calls make the request shapes visible in the source — important for `tool.test.ts` and for future readers maintaining the bridge. Will pin a specific SDK version in `package.json` and use whichever public API that version exposes; if a higher-level helper is the dominant idiom in the pinned version, switch to it during implementation (no contract change either way).

---

## R3. `zod` → MCP `inputSchema` interop

**Decision**: Define the canonical schema in [src/tools/obsidian_exec/schema.ts](../../src/tools/obsidian_exec/schema.ts) as a `z.object({ ... })`. Export both `obsidianExecSchema` (the zod object) and `obsidianExecInputJsonSchema = zodToJsonSchema(obsidianExecSchema, { name: "ObsidianExecInput" }).definitions.ObsidianExecInput` (or whatever shape the version of `zod-to-json-schema` we pin produces — adjusted to match). The MCP tool registration in [src/tools/obsidian_exec/tool.ts](../../src/tools/obsidian_exec/tool.ts) sets `inputSchema: obsidianExecInputJsonSchema`. The handler receives the **already-parsed** `z.infer<typeof obsidianExecSchema>` value (the SDK does not parse the input against `inputSchema`, so we run `obsidianExecSchema.parse(args)` once at the top of the handler dispatch).

**Rationale**:
- Single source of truth (Principle III): the same schema produces the published JSON Schema and the runtime parser. Drift impossible.
- `zod-to-json-schema` is the smallest-surface adapter for this conversion. Hand-rolling a JSON Schema for the half-dozen fields here would not be hard — but every future tool added under `src/tools/` would need the same hand-rolling, and the conversion logic for `z.record(...).optional()` and `z.number().int().max(...)` is exactly the kind of boundary that benefits from a tested third-party converter.

**Alternatives considered**:
- Hand-write the JSON Schema and add a `// keep in sync with schema.ts` comment: violates Principle III's "single source of truth" requirement. Rejected.
- `@anatine/zod-openapi` or other converters: larger surface, scoped to OpenAPI. Rejected.

---

## R4. Output buffering with the 10 MiB cap

**Decision**: Accumulate stdout/stderr as `Buffer[]` arrays, tracking `bytesSeenStdout` and `bytesSeenStderr` counters. On every `data` event, push the chunk and increment the counter. If either counter exceeds `10 * 1024 * 1024 = 10485760`, immediately call the kill sequence (SIGTERM, then SIGKILL after 2-second grace), then `Buffer.concat(chunks).toString('utf8').slice(0, 10485760)` for the `partial` field, and throw `UpstreamError` with `code: "CLI_OUTPUT_TOO_LARGE"`. Successful completion calls `Buffer.concat(stdoutChunks).toString('utf8')` once at the end.

**Rationale**:
- Pushing to an array and concatenating once at the end is O(n) total. Repeatedly growing a single Buffer with `Buffer.concat([acc, chunk])` is O(n²). Important when we're capturing up to 10 MiB.
- Counting bytes (not characters) is the right unit because the cap is a memory bound, not a content bound. A multi-byte UTF-8 character won't cause us to slightly under- or over-shoot.
- The 2-second grace window matches the kill machinery used for `CLI_TIMEOUT` (FR-016) and the lifecycle cleanup (FR-028). One kill helper handles all three call sites.

**Alternatives considered**:
- Stream output through a `Writable` that errors when capped: more elegant, but the SDK's tool-result shape requires us to return the captured prefix in `details.partial`, so we need the bytes in memory anyway. Rejected.
- Truncate silently and return `exitCode: 0`: explicitly rejected during clarification (the user picked B over D). Out.

---

## R5. SIGINT / SIGTERM handler registration

**Decision**: In [src/server.ts](../../src/server.ts), after `server.connect(transport)` resolves, call `process.on('SIGINT', () => shutdown('signal:SIGINT'))` and `process.on('SIGTERM', () => shutdown('signal:SIGTERM'))`. The transport's `onclose` callback calls `shutdown('transport_closed')`. `shutdown(reason)` is idempotent (guarded by a `shuttingDown` flag): it kills any in-flight child via the queue's exposed kill hook, drops the queue, emits the `bridge.shutdown` log line via `logger.shutdown(reason, { inFlightKilled, queuedDropped })`, and calls `process.exit(0)`.

**Rationale**:
- Idempotency matters: if the operator hits Ctrl+C twice, or if the transport closes a moment before SIGINT lands (or vice versa), the cleanup must run exactly once. The `shuttingDown` flag is a one-line guard.
- All three triggers feed the same `shutdown(reason)` function, which differs only in the `reason` field of the log line. Reuse over branching.
- Windows reality (per the spec's edge case): `taskkill /F` and `kill -9` bypass these handlers entirely. Documented as an OS limitation, not a code path we need to handle.

**Alternatives considered**:
- Wiring two separate cleanup paths (one for transport, one for signals) with subtly different behavior: violates DRY and the spec's "MUST run identical cleanup" requirement (FR-028). Rejected.
- Using `process.on('exit', ...)` for cleanup: the `exit` event is too late — the event loop has already stopped, async kill operations cannot complete. Rejected.

---

## R6. UTF-8 decoding strategy

**Decision**: Decode at the end of collection with `Buffer.concat(chunks).toString('utf8')`. Node's default UTF-8 decoder substitutes U+FFFD (replacement character) for invalid byte sequences without throwing.

**Rationale**:
- Matches FR-012's "string, UTF-8" output contract.
- Failing on invalid UTF-8 would be a hostile contract for a tool whose output is "whatever the CLI emitted" — the bridge isn't supposed to interpret content, just convey it.
- The replacement character is the standard signal for "encoding issue here"; downstream agents can detect it if they care.

**Alternatives considered**:
- Decode chunk-by-chunk with a `TextDecoder` in streaming mode: handles boundary-spanning multi-byte sequences correctly. Equivalent to the bulk-decode result for valid UTF-8 input; for invalid input both produce U+FFFD. Bulk-decode is simpler. Rejected the streaming approach as unjustified complexity.
- Throw on invalid UTF-8: hostile to legitimate use cases (e.g., a file with mixed encodings being read through `obsidian_exec({ command: "read", ... })`). Rejected.

---

## R7. FIFO queue implementation

**Decision**: A single in-memory module ([src/queue.ts](../../src/queue.ts)) maintains a `currentRunPromise: Promise<unknown> | null` reference. `queue.run(task: () => Promise<T>): Promise<T>` chains: `const next = (currentRunPromise ?? Promise.resolve()).then(task); currentRunPromise = next.catch(() => undefined); return next`. Queue depth is `pendingTaskCount` (incremented on entry, decremented on settle). The module also exports `queue.depth()`, `queue.shutdown()` (for cleanup signaling), and a way for the handler to register the in-flight child so the shutdown hook can kill it.

**Rationale**:
- A single promise chain achieves FIFO serialization with no third-party dependency. Six lines of code.
- Tracking the in-flight child outside the queue (a simple `let activeChild: ChildProcess | null` in the handler module, exposed via a kill hook the queue's shutdown calls) keeps responsibilities clean: the queue knows about *order*; the handler knows about *processes*.
- Queue depth is needed for the `call.start` log line (FR-024).

**Alternatives considered**:
- `p-queue`, `async-mutex`, `fastq`: all third-party. Each replaces ~10 LOC. Constitution biases hard against. Rejected.
- A `for await (const task of channel)` worker loop using async iteration: more elegant for unbounded streaming workloads, but overkill for a one-process FIFO with simple await semantics. Rejected.

---

## R8. `callId` generation for log correlation

**Decision**: Use `crypto.randomUUID()` for each call's `callId`. UUIDs are 36 characters of stable opaque text — easy to grep across log lines, no collision risk in a process's lifetime, no monotonic-counter sharing concerns.

**Rationale**:
- `crypto.randomUUID()` is built into Node 22.11+ — no dependency.
- Collision-free across processes (relevant if logs from multiple bridge instances ever get aggregated).
- Greppable by humans and structured by tools.

**Alternatives considered**:
- Monotonic counter (`callCounter++`): smaller string, but harder to disambiguate across bridge restarts in aggregated logs. Marginal win on string size, marginal loss on traceability. Rejected.
- Timestamp-based ID: collision-prone under burst. Rejected.

---

## R9. Test infrastructure for the spawn path

**Decision**: Tests that exercise real `spawn` against the `obsidian` binary are gated behind an integration-test flag (e.g., `process.env.RUN_OBSIDIAN_INTEGRATION === "1"`). The default `npm run test` runs unit tests with `spawn` calls mocked via a small in-tree fake child-process factory exported from a test helper. CI / local-dev integration runs are explicit opt-in.

**Rationale**:
- Co-located unit tests need to run without an Obsidian instance available (e.g., on a developer's laptop without Obsidian installed, or in CI). The mock lets us assert argv assembly, kill-on-timeout, kill-on-cap, and error mapping without a real binary.
- The three FR-020-mandated tests (happy-path `version`, failure-path `nonexistent_command_xyz`, vault-omitted boundary) are written so they can run against either the mock OR a real Obsidian instance via the same test code, gated by the env flag. The ones that actually need a running Obsidian (the `version` happy-path verification of "the running Obsidian version" string) skip when the flag is unset.
- Constitution Principle II requires happy + failure-or-boundary coverage on every public surface; the mock satisfies this requirement against `spawn`'s behavior, the integration mode satisfies it against the real binary's behavior. Both layers exist.

**Alternatives considered**:
- Always run integration tests against a real Obsidian: blocks development on dev machines without Obsidian and requires a running instance in CI (flaky, expensive). Rejected.
- Skip the integration mode entirely: leaves the spec's acceptance criteria unverifiable in any automated way. Rejected.
