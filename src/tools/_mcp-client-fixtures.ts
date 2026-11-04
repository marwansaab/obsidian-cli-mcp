// Original — no upstream. Shared in-process MCP client fixtures (068 PR-3 review, PR-5 review): connect a v2 Client to an McpServer in either era — 2025 over a linked in-memory transport pair, 2026 through createMcpHandler and a fetch-backed transport — plus a quiet composition root, a single-tool server and the published-surface lister shared by the FR-018 fingerprint helper and the description audit. Vitest-free so the FR-018 fingerprint helper can use it as well as the tests.
import { Writable } from "node:stream";

import { Client, InMemoryTransport, StreamableHTTPClientTransport, type Tool } from "@modelcontextprotocol/client";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

import { createServer, type CreatedServer } from "../server.js";

import type { RegisteredTool } from "./_shared.js";

/** Connect a fresh 2025-era `Client` named `clientName` to `server`; the caller closes it. */
export async function connectInMemoryClient(
  server: McpServer,
  clientName: string,
): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: clientName, version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

/**
 * The tools and instructions `server` publishes, as a fresh 2025-era `Client` named `clientName` lists
 * them (cache bypassed). The client is closed before this returns.
 */
export async function listPublished(
  server: McpServer,
  clientName: string,
): Promise<{ tools: Tool[]; instructions: string | undefined }> {
  const client = await connectInMemoryClient(server, clientName);
  try {
    const { tools } = await client.listTools(undefined, { cacheMode: "bypass" });
    return { tools, instructions: client.getInstructions() };
  } finally {
    await client.close();
  }
}

/** Connect a 2026-era `Client` named `clientName` to `app`'s factory behind `createMcpHandler`; the caller closes it. */
export async function connectModernClient(app: Pick<CreatedServer, "buildMcpServer">, clientName: string): Promise<Client> {
  const handler = createMcpHandler(() => app.buildMcpServer());
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client({ name: clientName, version: "0.0.0" }, { versionNegotiation: { mode: "auto" } });
  await client.connect(transport);
  return client;
}

/**
 * The real composition root with its logger silenced and no signal handlers or exit. `env` is the
 * access-flag environment (`createServer`'s `ctx.env`); omitted, the flags are read from `process.env`.
 */
export function quietServer(env?: NodeJS.ProcessEnv): CreatedServer {
  const sink = new Writable({ write: (_chunk, _enc, cb) => cb() });
  return createServer({ loggerStream: sink, registerSignalHandlers: false, exit: () => undefined, env });
}

/** Serve `tool` alone on a fresh McpServer and connect a 2025-era client named `clientName` to it. */
export function serveOne(tool: RegisteredTool, clientName: string): Promise<Client> {
  const server = new McpServer({ name: "single-tool", version: "0.0.0" }, { capabilities: { tools: { listChanged: false } } });
  tool.register(server);
  return connectInMemoryClient(server, clientName);
}

/** The text of a tool result's first content block. */
export function textOf(result: unknown): string {
  return (result as { content: Array<{ type: string; text: string }> }).content[0]!.text;
}
