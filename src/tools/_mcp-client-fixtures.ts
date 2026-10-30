// Original — no upstream. Shared in-process MCP client fixture (068 PR-3 review): connects a v2 Client (2025 era) to an McpServer over a linked in-memory transport pair. Vitest-free so the FR-018 fingerprint helper can use it as well as the tests.
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import type { McpServer } from "@modelcontextprotocol/server";

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
