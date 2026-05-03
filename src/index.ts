#!/usr/bin/env node
// Original — no upstream. Entrypoint: constructs the MCP server, connects the stdio transport, idles on the event loop.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const { server, triggerShutdown } = createServer();
  const transport = new StdioServerTransport();
  transport.onclose = () => triggerShutdown("transport_closed");
  // The SDK's StdioServerTransport does not auto-detect stdin EOF — wire it explicitly.
  process.stdin.once("end", () => triggerShutdown("transport_closed"));
  process.stdin.once("close", () => triggerShutdown("transport_closed"));
  await server.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(JSON.stringify({ event: "bridge.fatal", ts: new Date().toISOString(), error: String(err) }) + "\n");
  process.exit(1);
});
