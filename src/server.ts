// Original — no upstream. MCP Server bootstrap, tool registration, and lifecycle handlers (FR-001, FR-028, FR-029, plan-stage P8 aggregator).
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { createLogger, type Logger, type ShutdownReason } from "./logger.js";
import { createQueue, type Queue } from "./queue.js";
import { asToolError, type RegisteredTool } from "./tools/_shared.js";
import { registerHelpTool } from "./tools/help/tool.js";
import { killActiveChild as defaultKillActiveChild } from "./tools/obsidian_exec/handler.js";
import { registerObsidianExecTool } from "./tools/obsidian_exec/tool.js";
import { registerReadNoteTool } from "./tools/read_note/tool.js";

import type { Writable } from "node:stream";

export interface ShutdownContext {
  loggerStream?: Writable;
  exit?: (code: number) => void;
  registerSignalHandlers?: boolean;
  killActiveChild?: () => boolean;
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
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Aggregate every registered tool into a single dispatch surface (P8). The MCP
  // SDK's setRequestHandler allows exactly one handler per request type, so each
  // per-tool register*Tool factory returns a RegisteredTool (descriptor + handler)
  // and this function aggregates them into the single ListTools / CallTool routes.
  const tools: RegisteredTool[] = [
    registerHelpTool(),
    registerObsidianExecTool({ logger, queue }),
    registerReadNoteTool({ logger, queue }),
  ];
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

  const killActiveChild = ctx.killActiveChild ?? defaultKillActiveChild;

  let shuttingDown = false;
  function triggerShutdown(reason: ShutdownReason): void {
    if (shuttingDown) return;
    shuttingDown = true;
    const queuedDropped = queue.shutdown();
    const inFlightKilled = killActiveChild();
    logger.shutdown({ reason, inFlightKilled, queuedDropped });
    exit(0);
  }

  if (ctx.registerSignalHandlers !== false) {
    process.on("SIGINT", () => triggerShutdown("signal:SIGINT"));
    process.on("SIGTERM", () => triggerShutdown("signal:SIGTERM"));
  }

  return { server, logger, queue, triggerShutdown };
}
