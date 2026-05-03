// Original — no upstream. Tests for obsidian_exec MCP tool registration and dispatch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";
import { registerObsidianExecTool, OBSIDIAN_EXEC_TOOL_NAME, OBSIDIAN_EXEC_DESCRIPTION } from "./tool.js";
import { obsidianExecInputJsonSchema } from "./schema.js";

function makeServer(): Server {
  return new Server({ name: "test", version: "0.0.0" }, { capabilities: { tools: {} } });
}

function silentLogger() {
  const stream = new Writable({ write(_c, _e, cb) { cb(); } });
  return createLogger({ stream });
}

test("registerObsidianExecTool publishes name 'obsidian_exec' via tools/list", async () => {
  const server = makeServer();
  registerObsidianExecTool(server, { logger: silentLogger(), queue: createQueue() });
  const handler = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers.get(
    ListToolsRequestSchema.shape.method.value,
  );
  assert.ok(handler);
  const result = (await handler({ method: "tools/list", params: {} })) as { tools: { name: string }[] };
  assert.equal(result.tools.length, 1);
  assert.equal(result.tools[0]!.name, OBSIDIAN_EXEC_TOOL_NAME);
});

test("registered tool's inputSchema matches the zod-derived schema (single source of truth)", async () => {
  const server = makeServer();
  registerObsidianExecTool(server, { logger: silentLogger(), queue: createQueue() });
  const handler = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers.get(
    ListToolsRequestSchema.shape.method.value,
  );
  const result = (await handler!({ method: "tools/list", params: {} })) as { tools: { inputSchema: unknown }[] };
  assert.deepEqual(result.tools[0]!.inputSchema, obsidianExecInputJsonSchema);
});

test("registered tool's description matches the published one", async () => {
  const server = makeServer();
  registerObsidianExecTool(server, { logger: silentLogger(), queue: createQueue() });
  const handler = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers.get(
    ListToolsRequestSchema.shape.method.value,
  );
  const result = (await handler!({ method: "tools/list", params: {} })) as { tools: { description: string }[] };
  assert.equal(result.tools[0]!.description, OBSIDIAN_EXEC_DESCRIPTION);
});

test("calling unknown tool returns isError with a descriptive message", async () => {
  const server = makeServer();
  registerObsidianExecTool(server, { logger: silentLogger(), queue: createQueue() });
  const handler = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers.get(
    CallToolRequestSchema.shape.method.value,
  );
  const result = (await handler!({
    method: "tools/call",
    params: { name: "not_a_real_tool", arguments: {} },
  })) as { isError?: boolean; content: { type: string; text: string }[] };
  assert.equal(result.isError, true);
  assert.match(result.content[0]!.text, /not_a_real_tool/);
});

test("calling obsidian_exec with invalid arguments returns isError with zod field paths (FR-009)", async () => {
  const server = makeServer();
  registerObsidianExecTool(server, { logger: silentLogger(), queue: createQueue() });
  const handler = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers.get(
    CallToolRequestSchema.shape.method.value,
  );
  const result = (await handler!({
    method: "tools/call",
    params: { name: "obsidian_exec", arguments: { command: "" } },
  })) as { isError?: boolean; content: { type: string; text: string }[] };
  assert.equal(result.isError, true);
  const payload = JSON.parse(result.content[0]!.text);
  assert.equal(payload.code, "VALIDATION_ERROR");
  assert.ok(Array.isArray(payload.details.issues));
  assert.ok(payload.details.issues.some((i: { path: string[] }) => i.path.includes("command")));
});
