// Original — no upstream. In-process protocol tests for both MCP eras.
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ProtocolError, type Client } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { buildInstructions } from "./instructions/instructions.js";
import { connectInMemoryClient, connectModernClient, quietServer, textOf } from "./tools/_mcp-client-fixtures.js";
import { registerTool } from "./tools/_register.js";
import { READ_ONLY_HINTS } from "./tools/_shared.js";

import type { CreatedServer } from "./server.js";

const { version: PACKAGE_VERSION } = createRequire(import.meta.url)("../package.json") as { version: string };

/** 2025 era: the default (legacy-negotiating) client over a linked in-memory transport pair. */
function connectLegacy(app: CreatedServer): Promise<Client> {
  return connectInMemoryClient(app.buildMcpServer(), "protocol-test-2025");
}

/** 2026 era: the same factory behind createMcpHandler, reached through a fetch-backed HTTP client transport. */
function connectModern(app: CreatedServer): Promise<Client> {
  return connectModernClient(app, "protocol-test-2026");
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

  it("listTools returns all 35 tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBe(35);
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

describe("MCP protocol — server instructions (068 FR-025, T055)", () => {
  it("both eras receive byte-identical instructions, built from the registered tools", async () => {
    const app = quietServer();
    const legacy = await connectLegacy(app);
    const modern = await connectModern(app);
    try {
      const fromLegacy = legacy.getInstructions();
      const fromModern = modern.getInstructions();
      expect(fromLegacy).toBeDefined();
      expect(fromModern).toBe(fromLegacy);
      const { tools } = await legacy.listTools();
      expect(fromLegacy).toBe(buildInstructions(tools.map((t) => t.name)));
      expect(fromLegacy!.length).toBeLessThan(2000);
      // The `vaults` rule appears now that the tool is registered (068 PR 5, T065).
      expect(fromLegacy).toContain("`vaults` lists the vault names to use.");
    } finally {
      await legacy.close();
      await modern.close();
    }
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

describe.each([
  { era: "2025", connect: (server: McpServer) => connectInMemoryClient(server, "progress-test-2025") },
  { era: "2026", connect: (server: McpServer) => connectModernClient({ buildMcpServer: () => server }, "progress-test-2026") },
])("MCP protocol — progress notifications, $era era (068 FR-054, T088)", ({ connect }) => {
  // A tool that reports two steps through its call deps; the reporter exists only when the
  // request carried a progress token.
  function progressServer(): McpServer {
    const server = new McpServer({ name: "progress-test", version: "0.0.0" }, { capabilities: { tools: { listChanged: false } } });
    registerTool({
      name: "stepper",
      title: "Stepper",
      description: "Reports two progress steps.",
      annotations: READ_ONLY_HINTS,
      schema: z.strictObject({}),
      deps: {},
      handler: async (_input, deps) => {
        deps.reportProgress?.(1, 2, "first");
        deps.reportProgress?.(2, 2, "second");
        return { reported: deps.reportProgress !== undefined };
      },
    }).register(server);
    return server;
  }

  it("a call with a progress token receives each step carrying that token", async () => {
    const client = await connect(progressServer());
    try {
      const seen: Array<{ progress: number; total?: number; message?: string }> = [];
      const result = await client.callTool({ name: "stepper", arguments: {} }, { onprogress: (p) => seen.push(p) });
      expect(JSON.parse(textOf(result))).toEqual({ reported: true });
      expect(seen).toEqual([
        { progress: 1, total: 2, message: "first" },
        { progress: 2, total: 2, message: "second" },
      ]);
    } finally {
      await client.close();
    }
  });

  it("a call without a progress token receives none and gets no reporter", async () => {
    const client = await connect(progressServer());
    try {
      const result = await client.callTool({ name: "stepper", arguments: {} });
      expect(JSON.parse(textOf(result))).toEqual({ reported: false });
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
    const app = quietServer();
    const runSpy = vi.spyOn(app.queue, "run");

    const first = await connectLegacy(app);
    const second = await connectLegacy(app);
    try {
      const args = { target_mode: "specific", vault: "Demo", path: "Note.md" };
      const r1 = await first.callTool({ name: "read", arguments: args });
      const r2 = await second.callTool({ name: "read", arguments: args });
      expect(JSON.parse(textOf(r1)).code).toBe("CLI_BINARY_NOT_FOUND");
      expect(JSON.parse(textOf(r2)).code).toBe("CLI_BINARY_NOT_FOUND");
      // Both servers' calls went through the one queue createServer returned.
      expect(runSpy).toHaveBeenCalledTimes(2);
    } finally {
      await first.close();
      await second.close();
    }
  });
});
