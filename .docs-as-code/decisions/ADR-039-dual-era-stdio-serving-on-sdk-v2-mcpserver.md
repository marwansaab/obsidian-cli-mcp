# ADR-039 — Dual-era stdio serving on MCP SDK v2 `McpServer`

- **Status:** Accepted
- **Date:** decided 2026-10-28 by the owner; implemented 2026-10-30
- **Source:** PR #89 (BI-0165 A2 + C3; `specs/068-modernise-mcp-surface/`,
  US4, US5, US9, research R1, R2, R3, R10), with the PR #89 review rulings
  in commits `0b5018c` and `76ceeb7`
- **Supersedes:** ADR-036 (Modern-Only Protocol Era For Obsidian CLI MCP),
  and the BI-067 decision (PR #78) to keep the SDK's low-level `Server`,
  which until now was recorded only as a comment in `src/server.ts`
- **Related:** ADR-005 (Token-Optimized Tool Definitions via Progressive
  Disclosure), still in force for description stripping; ADR-006
  (Centralized Tool Registration), whose `registerTool` stays the only path
  from a zod schema to a published tool

The maintainer's working-notes copy of this record lives outside the
repository under the same number. This page records the decision as PR #89
shipped it after review.

## Context

Until PR #89 the server ran on `@modelcontextprotocol/sdk` 1.x, used the
deprecated low-level `Server` with hand-written `tools/list` and `tools/call`
handlers, and served only 2025-era clients (`initialize`). ADR-036 had chosen
a modern-only future (protocol `2026-07-28` only). On 2026-10-28 the owner
reversed that: the package is public on npm, and a modern-only release would
break every consumer still on a 2025-era client. Constitution v1.6.0
(*Technical Standards → MCP*) now fixes the stack: SDK v2
`@modelcontextprotocol/server`, `McpServer.registerTool`, dual-era `serveStdio`.

Three SDK v2 behaviours shaped the design (068 research R2, R10):

1. `McpServer` validates tool input against `inputSchema` before calling the
   handler, and turns a failure into free-text `isError` with no hook. The
   project's `{code, message, details}` envelope, `VALIDATION_ERROR` and each
   tool's `mapValidationError` would be lost (FR-016).
2. `serveStdio(factory)` calls the factory more than once per connection:
   once for a `server/discover` probe and once for the instance it pins.
3. An unknown tool name is a JSON-RPC `-32602`, raised before project code
   runs.

## Decision

1. **Packages.** `@modelcontextprotocol/sdk ^1.29` is replaced by
   `@modelcontextprotocol/server ^2.4` at runtime;
   `@modelcontextprotocol/client ^2.4` is a devDependency for tests, the
   fingerprint gate and the stdio probe only.
2. **Registration through a pass-through adapter.** Every tool is registered
   with `McpServer.registerTool` through the project's `registerTool`. The SDK
   is given `toSdkInputSchema`, a Standard Schema whose JSON Schema is the zod
   schema's own emission at the SDK's target (draft-2020-12) and whose
   `validate` accepts every value. The registered callback runs the zod parse
   and returns `asToolError` results; it never throws a classified error.
3. **Composition root split.** `createServer` runs once per process, stays the
   only constructor of `createLogger()` and `createQueue()`, and returns
   `{ buildMcpServer, shutdown, logger, queue }`. `buildMcpServer()` is a cheap
   per-connection builder that every `serveStdio` call shares.
4. **Serving.** `src/index.ts` calls `serveStdio(() => app.buildMcpServer())`.
5. **Unknown tool.** The SDK's `-32602` is accepted; `TOOL_NOT_FOUND` is no
   longer raised.
6. **Fingerprint gate.** The baseline is read through a v2 client over an
   in-memory transport (`schemaVersion: 2`), and the draft-07 parity
   normaliser is deleted (068 C3). The baseline was regenerated on purpose.

How each piece is built is in [architecture.md](../architecture.md#boot-spine)
and [tech-stack.md](../tech-stack.md#mcp-transport).

## Alternatives rejected

- **Hand the zod schema to `registerTool` directly.** No adapter, but the
  SDK's free-text validation errors replace the project envelope, which breaks
  FR-016 and every `VALIDATION_ERROR` contract in `docs/tools/`.
- **`fromJsonSchema(z.toJSONSchema(schema))`.** Uses an SDK helper, but its
  Ajv validator runs first, with the same envelope loss.
- **Keep the low-level `Server` on v2.** The smallest change, but the
  constitution's MCP standard forbids hand-written `tools/list`/`tools/call`,
  and it keeps the deprecated API.
- **Modern-only (ADR-036).** One era to test, but it breaks every 2025-era
  client of a public package. Reversed by the owner.
- **Build logger, queue and registry inside the `serveStdio` factory.** The
  simplest wiring, but the discovery probe would build a second single-flight
  queue (FR-053).
- **A test-only `createQueue` seam on `createServer`'s context** to prove the
  queue is shared. PR #89 first shipped it, as the plan asked. Review
  (finding F2) argued it out: the queue is already on `createServer`'s return
  value, and every queued call goes through `deps.queue.run`, so a spy on
  `app.queue.run` proves FR-053 without widening a kernel node's context
  (constitution Principle I). The owner chose that (commit `76ceeb7`).

## Consequences

- One process serves both eras. On 2026-10-30 real stdio negotiated
  `2025-11-25` for the 2025-era handshake and `2026-07-28` for the 2026-era
  one (`npm run probe:stdio`, research R10 T0).
- The `-32602` path, era negotiation and capability advertising are the
  SDK's code, not the project's. `tools.listChanged: false` is now declared,
  and true.
- The adapter is project code that must track the SDK's Standard Schema
  contract. The spike tests in `src/tools/_register.test.ts` are the tripwire
  if a later SDK minor calls the converter differently, or changes its target.
- Every published `schemaFingerprint` changed once (draft-07 →
  draft-2020-12). Clients that cached schemas see a new dialect; no
  description and no tool name moved.
- A handler error that is neither `UpstreamError` nor `ZodError` now reaches
  the client as the SDK's `isError` text instead of a JSON-RPC internal error.
- A call with no `arguments` reaches the tool as `{}`, so tools whose fields
  are all optional succeed instead of failing validation.
- Description stripping is still in place, re-hosted inside the adapter.
  Spec 068 plans to remove it in a later PR, with its own ADR superseding
  ADR-005.
- T042 asked for Claude Code itself to connect to the built server. The
  unattended run could not attach a Claude Code session, so a v2 client over
  the same real stdio stood in for it; the PR body leaves that check to the
  owner before merge.
