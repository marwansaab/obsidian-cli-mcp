// Original — no upstream. In-process protocol tests for both MCP eras.
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import { Client, InMemoryTransport, ProtocolError, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createQueue, type Queue } from "./queue.js";
import { createServer, type CreatedServer } from "./server.js";

const { version: PACKAGE_VERSION } = createRequire(import.meta.url)("../package.json") as { version: string };

function quietServer(extra: { createQueue?: () => Queue } = {}): CreatedServer {
  const sink = new Writable({ write: (_chunk, _enc, cb) => cb() });
  return createServer({ loggerStream: sink, registerSignalHandlers: false, exit: () => undefined, ...extra });
}

/** 2025 era: the default (legacy-negotiating) client over a linked in-memory transport pair. */
async function connectLegacy(app: CreatedServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await app.buildMcpServer().connect(serverTransport);
  const client = new Client({ name: "protocol-test-2025", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

/** 2026 era: the same factory behind createMcpHandler, reached through a fetch-backed HTTP client transport. */
async function connectModern(app: CreatedServer): Promise<Client> {
  const handler = createMcpHandler(() => app.buildMcpServer());
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client(
    { name: "protocol-test-2026", version: "0.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(transport);
  return client;
}

function textOf(result: unknown): string {
  return (result as { content: Array<{ type: string; text: string }> }).content[0]!.text;
}

describe.each([
  { era: "2025 (initialize, in-memory)", connect: connectLegacy },
  { era: "2026 (server/discover, createMcpHandler)", connect: connectModern },
])("MCP protocol — $era", ({ connect }) => {
  let client: Client;

  beforeEach(async () => {
    client = await connect(quietServer());
  });

  afterEach(async () => {
    await client.close();
  });

  it("serverInfo is obsidian-cli-mcp at the package version; capabilities declare tools.listChanged false and no logging", () => {
    expect(client.getServerVersion()).toMatchObject({ name: "obsidian-cli-mcp", version: PACKAGE_VERSION });
    const caps = client.getServerCapabilities();
    expect(caps?.tools?.listChanged).toBe(false);
    expect(caps?.logging).toBeUndefined();
  });

  it("listTools returns all 34 tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBe(34);
  });

  it("callTool('help') succeeds", async () => {
    const result = await client.callTool({ name: "help", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(textOf(result).length).toBeGreaterThan(0);
  });

  it("an invalid input returns the project VALIDATION_ERROR envelope", async () => {
    const result = await client.callTool({ name: "read", arguments: { target_mode: "nonsense" } });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(textOf(result)) as { code: string; message: string; details: unknown };
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(typeof payload.message).toBe("string");
    expect(payload.details).toBeDefined();
  });

  it("an unknown tool is a JSON-RPC -32602 error (no TOOL_NOT_FOUND result)", async () => {
    const call = client.callTool({ name: "not_a_real_tool", arguments: {} });
    await expect(call).rejects.toBeInstanceOf(ProtocolError);
    await expect(call).rejects.toMatchObject({ code: -32602 });
  });
});

describe("MCP protocol — negotiated versions", () => {
  it("the 2026-era client negotiates 2026-07-28", async () => {
    const client = await connectModern(quietServer());
    try {
      expect(client.getNegotiatedProtocolVersion()).toBe("2026-07-28");
    } finally {
      await client.close();
    }
  });

  it("the 2025-era client negotiates a 2025 revision", async () => {
    const client = await connectLegacy(quietServer());
    try {
      expect(client.getNegotiatedProtocolVersion()).toMatch(/^2025-/);
    } finally {
      await client.close();
    }
  });
});

describe("composition root — one queue across buildMcpServer calls (FR-053, 068 R10)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("two McpServer instances built from one createServer share the single queue it built", async () => {
    // An unresolvable OBSIDIAN_BIN fails binary resolution inside the queued task, so the
    // calls go through the queue without starting a real process.
    vi.stubEnv("OBSIDIAN_BIN", join(tmpdir(), "no-such-obsidian-068-t036"));
    const realQueue = createQueue();
    const runSpy = vi.spyOn(realQueue, "run");
    const createQueueSpy = vi.fn(() => realQueue);
    const app = quietServer({ createQueue: createQueueSpy });

    const first = await connectLegacy(app);
    const second = await connectLegacy(app);
    try {
      const args = { target_mode: "specific", vault: "Demo", path: "Note.md" };
      const r1 = await first.callTool({ name: "read", arguments: args });
      const r2 = await second.callTool({ name: "read", arguments: args });
      expect(JSON.parse(textOf(r1)).code).toBe("CLI_BINARY_NOT_FOUND");
      expect(JSON.parse(textOf(r2)).code).toBe("CLI_BINARY_NOT_FOUND");
      expect(createQueueSpy).toHaveBeenCalledTimes(1);
      expect(runSpy).toHaveBeenCalledTimes(2);
    } finally {
      await first.close();
      await second.close();
    }
  });
});
