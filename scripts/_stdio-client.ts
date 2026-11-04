// Original — no upstream. Builds an MCP client and a stdio transport for the built server (`node dist/index.js`, server stderr inherited); shared by probe-stdio.ts and check-non-ascii.ts. The caller connects and closes.

import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

export interface BuiltServerClientOptions {
  /** The clientInfo name the server sees. */
  clientName: string;
  /** "legacy" is the 2025-era `initialize` handshake; "modern" negotiates the 2026-era one. */
  era: "legacy" | "modern";
  /** Whether the client declares the elicitation capability. */
  elicitation: boolean;
}

/** A client and a transport that spawns the built server with this process's environment. */
export function builtServerClient(opts: BuiltServerClientOptions): {
  client: Client;
  transport: StdioClientTransport;
} {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(import.meta.dirname, "..", "dist", "index.js")],
    env,
    stderr: "inherit",
  });
  const client = new Client(
    { name: opts.clientName, version: "0.0.0" },
    {
      versionNegotiation: { mode: opts.era === "modern" ? "auto" : "legacy" },
      capabilities: opts.elicitation ? { elicitation: {} } : {},
    },
  );
  return { client, transport };
}
