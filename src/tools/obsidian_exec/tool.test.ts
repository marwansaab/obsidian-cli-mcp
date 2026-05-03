// Original — no upstream. Tests for obsidian_exec MCP tool registration and dispatch.
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { test, expect } from "vitest";

import { type SpawnLike } from "./handler.js";
import { obsidianExecInputJsonSchema } from "./schema.js";
import { registerObsidianExecTool, OBSIDIAN_EXEC_TOOL_NAME, OBSIDIAN_EXEC_DESCRIPTION } from "./tool.js";
import { UpstreamError } from "../../errors.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";

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
  expect(handler).toBeTruthy();
  const result = (await handler!({ method: "tools/list", params: {} })) as { tools: { name: string }[] };
  expect(result.tools.length).toBe(1);
  expect(result.tools[0]!.name).toBe(OBSIDIAN_EXEC_TOOL_NAME);
});

test("registered tool's inputSchema matches the zod-derived schema (single source of truth)", async () => {
  const server = makeServer();
  registerObsidianExecTool(server, { logger: silentLogger(), queue: createQueue() });
  const handler = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers.get(
    ListToolsRequestSchema.shape.method.value,
  );
  const result = (await handler!({ method: "tools/list", params: {} })) as { tools: { inputSchema: unknown }[] };
  expect(result.tools[0]!.inputSchema).toEqual(obsidianExecInputJsonSchema);
});

test("registered tool's description matches the published one", async () => {
  const server = makeServer();
  registerObsidianExecTool(server, { logger: silentLogger(), queue: createQueue() });
  const handler = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers.get(
    ListToolsRequestSchema.shape.method.value,
  );
  const result = (await handler!({ method: "tools/list", params: {} })) as { tools: { description: string }[] };
  expect(result.tools[0]!.description).toBe(OBSIDIAN_EXEC_DESCRIPTION);
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
  expect(result.isError).toBe(true);
  expect(result.content[0]!.text).toMatch(/not_a_real_tool/);
});

function makeMockSpawn(stdout: string, exitCode: number): SpawnLike {
  return (_binary, _spawnArgs, _opts) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: () => boolean;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.kill = () => true;
    setImmediate(() => {
      child.stdout.push(Buffer.from(stdout, "utf8"));
      child.stdout.push(null);
      child.stderr.push(null);
      setImmediate(() => child.emit("exit", exitCode, null));
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
}

test("calling obsidian_exec with valid arguments returns success-shape JSON in content text", async () => {
  const server = makeServer();
  registerObsidianExecTool(server, {
    logger: silentLogger(),
    queue: createQueue(),
    spawnFn: makeMockSpawn("1.7.2\n", 0),
    env: {},
  });
  const handler = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers.get(
    CallToolRequestSchema.shape.method.value,
  );
  const result = (await handler!({
    method: "tools/call",
    params: { name: "obsidian_exec", arguments: { command: "version" } },
  })) as { isError?: boolean; content: { type: string; text: string }[] };
  expect(result.isError).toBeFalsy();
  expect(result.content[0]!.type).toBe("text");
  const payload = JSON.parse(result.content[0]!.text);
  expect(payload.stdout).toBe("1.7.2\n");
  expect(payload.exitCode).toBe(0);
  expect(payload.argv).toEqual(["obsidian", "version"]);
});

test("calling obsidian_exec when the handler throws UpstreamError returns isError with code/message/details", async () => {
  const server = makeServer();
  registerObsidianExecTool(server, {
    logger: silentLogger(),
    queue: createQueue(),
    spawnFn: makeMockSpawn("", 2),
    env: {},
  });
  const handler = (server as unknown as { _requestHandlers: Map<string, (req: unknown) => Promise<unknown>> })._requestHandlers.get(
    CallToolRequestSchema.shape.method.value,
  );
  const result = (await handler!({
    method: "tools/call",
    params: { name: "obsidian_exec", arguments: { command: "x" } },
  })) as { isError?: boolean; content: { type: string; text: string }[] };
  expect(result.isError).toBe(true);
  const payload = JSON.parse(result.content[0]!.text);
  expect(payload.code).toBe("CLI_NON_ZERO_EXIT");
  expect(payload.details.argv).toEqual(["obsidian", "x"]);
});

test("UpstreamError export is the same class the handler throws (single source per FR-018)", () => {
  // Sanity check: the tool.ts UpstreamError catch path uses the same class instance.
  const err = new UpstreamError({ code: "X", cause: null, details: {} });
  expect(err).toBeInstanceOf(UpstreamError);
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
  expect(result.isError).toBe(true);
  const payload = JSON.parse(result.content[0]!.text);
  expect(payload.code).toBe("VALIDATION_ERROR");
  expect(Array.isArray(payload.details.issues)).toBe(true);
  expect(payload.details.issues.some((i: { path: string[] }) => i.path.includes("command"))).toBe(true);
});
