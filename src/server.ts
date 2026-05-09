// Original — no upstream. MCP Server bootstrap, tool registration via createTool factories, and lifecycle handlers (FR-001, FR-005, FR-017, FR-028, FR-029).
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { killInFlightChildren as defaultKillInFlightChildren } from "./cli-adapter/cli-adapter.js";
import { createLogger, type Logger, type ShutdownReason } from "./logger.js";
import { createQueue, type Queue } from "./queue.js";
import { assertToolDocsExist } from "./tools/_register.js";
import { asToolError, type RegisteredTool } from "./tools/_shared.js";
import { createDeleteNoteTool } from "./tools/delete_note/index.js";
import { createFindByPropertyTool } from "./tools/find_by_property/index.js";
import { createHelpTool } from "./tools/help/index.js";
import { createObsidianExecTool } from "./tools/obsidian_exec/index.js";
import { createReadNoteTool } from "./tools/read_note/index.js";
import { createReadPropertyTool } from "./tools/read_property/index.js";
import { createWriteNoteTool } from "./tools/write_note/index.js";

import type { Writable } from "node:stream";

// Read the package version at runtime so the MCP server-info handshake matches
// what npm published. createRequire works under both `dist/server.js` (the
// published shape — `dist/` and `package.json` are siblings under the package
// root) and `src/server.ts` during dev (tsx / vitest — `src/` and
// `package.json` are siblings under the repo root). NodeNext-friendly; no
// resolveJsonModule tsconfig flag required.
const requireFromHere = createRequire(import.meta.url);
const { version: PACKAGE_VERSION } = requireFromHere("../package.json") as { version: string };

export const DEFAULT_DOCS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "docs", "tools");

export interface ShutdownContext {
  loggerStream?: Writable;
  exit?: (code: number) => void;
  registerSignalHandlers?: boolean;
  killInFlightChildren?: () => boolean;
  docsDir?: string;
}

export interface CreatedServer {
  server: Server;
  logger: Logger;
  queue: Queue;
  triggerShutdown: (reason: ShutdownReason) => void;
}

export function createServer(ctx: ShutdownContext = {}): CreatedServer {
  const logger = createLogger({ stream: ctx.loggerStream });
  const queue = createQueue();
  const exit = ctx.exit ?? ((code: number) => process.exit(code));

  const server = new Server(
    {
      name: "obsidian-cli-mcp",
      version: PACKAGE_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const tools: RegisteredTool[] = [
    createDeleteNoteTool({ logger, queue }),
    createFindByPropertyTool({ logger, queue }),
    createHelpTool(),
    createObsidianExecTool({ logger, queue }),
    createReadNoteTool({ logger, queue }),
    createReadPropertyTool({ logger, queue }),
    createWriteNoteTool({ logger, queue }),
  ];

  // Boot-time aggregated doc-file presence check (FR-005 / Q4 — fail-fast on
  // first miss is forbidden; the aggregator collects ALL misses and raises a
  // single error listing every missing file).
  assertToolDocsExist(tools, ctx.docsDir ?? DEFAULT_DOCS_DIR);

  const toolByName = new Map(tools.map((t) => [t.descriptor.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => t.descriptor),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = toolByName.get(req.params.name);
    if (!tool) {
      return asToolError({
        code: "TOOL_NOT_FOUND",
        message: `Unknown tool: ${req.params.name}`,
        details: {
          requestedName: req.params.name,
          knownTools: tools.map((t) => t.descriptor.name),
        },
      });
    }
    return tool.handler(req.params.arguments);
  });

  const killInFlight = ctx.killInFlightChildren ?? defaultKillInFlightChildren;

  let shuttingDown = false;
  function triggerShutdown(reason: ShutdownReason): void {
    if (shuttingDown) return;
    shuttingDown = true;
    const queuedDropped = queue.shutdown();
    const inFlightKilled = killInFlight();
    logger.shutdown({ reason, inFlightKilled, queuedDropped });
    exit(0);
  }

  if (ctx.registerSignalHandlers !== false) {
    process.on("SIGINT", () => triggerShutdown("signal:SIGINT"));
    process.on("SIGTERM", () => triggerShutdown("signal:SIGTERM"));
  }

  return { server, logger, queue, triggerShutdown };
}
