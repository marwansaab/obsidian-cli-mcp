# Contract: Protocol serving (both eras)

**Serves**: FR-014–FR-018, FR-025, FR-051–FR-055 · **PRs**: 3 (serving), 4 (instructions), 6 (cancel/progress)
**Research**: R1, R2, R10, R11

## Handshakes served over stdio

| Era | Opening message | Server answers | Tool list via |
|---|---|---|---|
| 2025-11-25 (legacy) | `initialize` | `InitializeResult`: `serverInfo {name: "obsidian-cli-mcp", version}`, `capabilities {tools: {listChanged: false}}`, `instructions` | `tools/list` |
| 2026-07-28 (modern) | `server/discover` (or any request whose `_meta` claims `2026-07-28`) | discover result with the same `serverInfo`, `capabilities`, `instructions` | `tools/list` |

- One OS process serves one stdio connection. Both eras share one logger, one
  single-flight queue and one vault registry (the composition root runs once per process).
- Capabilities declared: `tools` only. Never `logging`, and never Roots or Sampling (FR-017).
- stdout carries MCP messages only. Every diagnostic is a JSON line on stderr.

## `tools/call`

| Situation | Response |
|---|---|
| known tool, valid input, success | `CallToolResult`, see the [tool-surface contract](tool-surface.contract.md) §Results |
| known tool, invalid input | `isError: true`, text = `{code: "VALIDATION_ERROR", message, details}`, the same per-tool mapping as today (R2) |
| known tool, upstream failure | `isError: true`, text = `{code, message, details}` as today |
| unknown tool name | JSON-RPC error `-32602` (SDK default; FR-016 allowance) |
| tool hidden by configuration | JSON-RPC error `-32602`; the tool is not registered |
| irreversible action, client can elicit | `input_required` round (modern) or `elicitation/create` (legacy shim), then proceed or `CONFIRMATION_DECLINED` |
| irreversible action, client cannot elicit | `isError: true`, `VALIDATION_ERROR / CONFIRMATION_UNAVAILABLE`; nothing spawned or written |

## Cancellation (`notifications/cancelled`)

| Call state | Effect | Response |
|---|---|---|
| queued | removed from the queue; never spawns | none (SDK sends no response to a cancelled request) |
| running CLI child | SIGTERM, then SIGKILL after 2,000 ms; the queue advances once the task settles | none |
| running `find_and_replace` commit | stops between notes; the in-flight write completes; `commitCancelled` logged | none |
| already finished | ignored | the earlier response stands |

Transport close (stdin EOF) aborts every in-flight request the same way. The existing
shutdown path (`queue.shutdown()`, `killInFlight()`, `bridge.shutdown` log) still runs.

## Progress (`notifications/progress`)

Sent only if the request's `_meta.progressToken` is present. The token is echoed
unchanged.

| Operation | `progress` / `total` | `message` |
|---|---|---|
| auto-launch readiness wait | poll index / 40 | `"waiting for Obsidian to start"` |
| `find_and_replace` commit | notes written / notes to write | vault-relative path of the note just written |

## Shutdown

stdin `end`/`close`, transport close, SIGINT and SIGTERM all reach the one
`shutdown()`, which drops queued work, kills in-flight children, logs `bridge.shutdown`
and exits 0. This is the same behaviour as today.

## Tests

- In-process 2025 era: `Client` + `InMemoryTransport.createLinkedPair()`: initialize
  result fields, `listTools` count, one `callTool` success, one validation failure
  envelope, an unknown tool → `-32602`.
- In-process 2026 era: `createMcpHandler(factory)` + fetch-backed
  `StreamableHTTPClientTransport` + auto version negotiation, with the same assertions.
- Both eras receive byte-identical `instructions`.
- Factory called twice (discover probe + legacy fallback) → one queue (assert by identity).
- Real stdio, both handshakes: `scripts/probe-stdio.ts` against `dist/` (quickstart §3).
