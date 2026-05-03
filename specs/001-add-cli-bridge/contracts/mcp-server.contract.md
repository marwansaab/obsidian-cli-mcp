# MCP Server Contract

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-03

The bridge is an MCP server with the following published surface. This contract is what an MCP client (Claude Desktop, Claude Cowork, an MCP test client, etc.) sees during the protocol handshake.

## Identity

| Field | Value | Notes |
|-------|-------|-------|
| Server name | `"obsidian-cli-mcp"` | Stable across versions; matches the npm package name |
| Server version | The `version` field from [package.json](../../../package.json) | Read at startup; surfaced via the MCP `initialize` response |
| Protocol version | Whatever the pinned `@modelcontextprotocol/sdk` version negotiates | Determined by the SDK, not by us |

## Capabilities

```jsonc
{
  "tools": {}
}
```

Only `tools` is advertised. The bridge does not expose resources, prompts, sampling, or any other MCP surface in v0.1.

## Transport

- **Transport class**: `StdioServerTransport` from `@modelcontextprotocol/sdk`. Exclusively stdio.
- **Stdout**: owned end-to-end by the SDK transport. The bridge MUST NOT write to stdout from any other code path. Logger writes to stderr only (see [logging.contract.md](./logging.contract.md)).
- **Stdin**: owned by the SDK transport. The bridge MUST NOT read from stdin from any other code path.
- **Stderr**: free for the bridge's structured logger. MCP clients SHOULD treat the bridge's stderr as diagnostic output, not part of the protocol.
- **Lifetime**: bound to the transport. When the transport closes (stdin EOF, client disconnect, transport error) OR the bridge process receives SIGINT/SIGTERM, the bridge runs the cleanup sequence described in [spec.md](../spec.md) FR-028 and exits with code 0.

## Registered tools

### `obsidian_exec`

The single tool registered in v0.1. Full contract: [obsidian_exec.tool.json](./obsidian_exec.tool.json).

When the MCP client calls `tools/list`, the bridge returns exactly one tool:

```jsonc
{
  "tools": [
    {
      "name": "obsidian_exec",
      "description": "<see obsidian_exec.tool.json#description>",
      "inputSchema": <see obsidian_exec.tool.json#inputSchema>
    }
  ]
}
```

When the MCP client calls `tools/call` with `name: "obsidian_exec"` and validated `arguments`, the bridge:

1. Validates `arguments` against the canonical zod schema (single source of truth — same schema produces the published `inputSchema` via `zod-to-json-schema`).
2. On validation failure: returns the SDK's structured-error response carrying the zod field paths.
3. On validation success: enqueues the call onto the FIFO queue.
4. When the call reaches the head of the queue: spawns the `obsidian` child, captures stdout/stderr (capped at 10 MiB each), enforces the timeout, and either returns the `ObsidianExecOutput` (on exit code 0) or throws an `UpstreamError` (per [errors.contract.md](./errors.contract.md)).
5. The MCP SDK serializes a thrown `UpstreamError` via its `CallToolResult` `isError: true` shape with the `code` / `message` / `details` reachable in the response payload.

Calls to any other tool name MUST receive the SDK's standard "tool not found" error.

## Behavioral invariants the client can rely on

1. **At most one CLI child runs at a time** (FR-023). Calls submitted while another is in flight queue and run in arrival order. Each call's `timeoutMs` starts only when its child is spawned.
2. **Stdout is reserved**. The bridge will never emit log noise on stdout. The MCP wire stays clean.
3. **Failures are typed**. Every error path uses one of the four `code` values listed in [errors.contract.md](./errors.contract.md). New codes may be added in future versions; existing codes will not be repurposed or removed within a major version.
4. **Argv is preserved**. Parameter values containing spaces, quotes, semicolons, ampersands, backticks, or dollar signs reach the CLI byte-for-byte (no shell interpolation).
5. **Cleanup on shutdown**. The bridge does not orphan `obsidian` children when shut down via the supported clean paths (transport close, SIGINT, SIGTERM). Hard kills (`taskkill /F`, `kill -9`) bypass cleanup — that's a host-OS limitation.

## Test coverage requirements (Principle II)

- [src/server.test.ts](../../../src/server.test.ts) — assert tool registration (one tool, name `"obsidian_exec"`), capabilities shape (`{ tools: {} }`), transport binding, lifecycle handlers wired (transport close + SIGINT + SIGTERM all reach the same `shutdown` function with the right `reason`).
- [src/tools/obsidian_exec/tool.test.ts](../../../src/tools/obsidian_exec/tool.test.ts) — assert the tool's metadata matches [obsidian_exec.tool.json](./obsidian_exec.tool.json) (name, description, inputSchema produced by `zodToJsonSchema(schema)` is structurally equivalent to the contract document).
