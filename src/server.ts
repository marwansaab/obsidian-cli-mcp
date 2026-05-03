// Original — no upstream. MCP Server bootstrap, tool registration, and lifecycle handlers (FR-001, FR-028, FR-029).
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

import { createLogger, type Logger, type ShutdownReason } from "./logger.js";
import { createQueue, type Queue } from "./queue.js";
import { killActiveChild as defaultKillActiveChild } from "./tools/obsidian_exec/handler.js";
import { registerObsidianExecTool } from "./tools/obsidian_exec/tool.js";

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

  registerObsidianExecTool(server, { logger, queue });

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
