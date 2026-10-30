#!/usr/bin/env node
// Original — no upstream. Entrypoint: builds the composition root once, serves both MCP eras over stdio with serveStdio (068 R10, ADR-039), idles on the event loop.
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createServer } from "./server.js";

function main(): void {
  const app = createServer();
  // serveStdio may call the factory more than once (an era-discovery probe, then the pinned
  // instance); every instance shares the one queue and registry built above.
  serveStdio(() => app.buildMcpServer());
  // Shut down on stdin EOF explicitly: dropping queued work and killing in-flight children
  // is the project's own shutdown path, not the transport's.
  process.stdin.once("end", () => app.shutdown("transport_closed"));
  process.stdin.once("close", () => app.shutdown("transport_closed"));
}

try {
  main();
} catch (err: unknown) {
  process.stderr.write(JSON.stringify({ event: "bridge.fatal", ts: new Date().toISOString(), error: String(err) }) + "\n");
  process.exit(1);
}
