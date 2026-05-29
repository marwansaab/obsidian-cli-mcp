// Original — no upstream. MCP Server bootstrap, tool registration via createTool factories, and lifecycle handlers (FR-001, FR-005, FR-017, FR-028, FR-029).
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { invokeCli, killInFlightChildren as defaultKillInFlightChildren } from "./cli-adapter/cli-adapter.js";
import { createLogger, type Logger, type ShutdownReason } from "./logger.js";
import { createQueue, type Queue } from "./queue.js";
import { assertToolDocsExist } from "./tools/_register.js";
import { asToolError, type RegisteredTool } from "./tools/_shared.js";
import { createAppendNoteTool } from "./tools/append_note/index.js";
import { createBacklinksTool } from "./tools/backlinks/index.js";
import { createBasesTool } from "./tools/bases/index.js";
import { createContextSearchTool } from "./tools/context_search/index.js";
import { createCreateBaseTool } from "./tools/create_base/index.js";
import { createDeleteTool } from "./tools/delete/index.js";
import { createFilesTool } from "./tools/files/index.js";
import { createFindAndReplaceTool } from "./tools/find_and_replace/index.js";
import { createFindByPropertyTool } from "./tools/find_by_property/index.js";
import { createHelpTool } from "./tools/help/index.js";
import { createLinksTool } from "./tools/links/index.js";
import { createMoveTool } from "./tools/move/index.js";
import { createObsidianExecTool } from "./tools/obsidian_exec/index.js";
import { createOpenFileTool } from "./tools/open_file/index.js";
import { createOutlineTool } from "./tools/outline/index.js";
import { createPatchBlockTool } from "./tools/patch_block/index.js";
import { createPatchHeadingTool } from "./tools/patch_heading/index.js";
import { createPathsTool } from "./tools/paths/index.js";
import { createPatternSearchTool } from "./tools/pattern_search/index.js";
import { createPrependTool } from "./tools/prepend/index.js";
import { createPropertiesTool } from "./tools/properties/index.js";
import { createQueryBaseTool } from "./tools/query_base/index.js";
import { createReadTool } from "./tools/read/index.js";
import { createReadHeadingTool } from "./tools/read_heading/index.js";
import { createReadPropertyTool } from "./tools/read_property/index.js";
import { createRenameTool } from "./tools/rename/index.js";
import { createSearchTool } from "./tools/search/index.js";
import { createSetPropertyTool } from "./tools/set_property/index.js";
import { createSmartConnectionsQueryTool } from "./tools/smart_connections_query/index.js";
import { createSmartConnectionsSimilarTool } from "./tools/smart_connections_similar/index.js";
import { createTagTool } from "./tools/tag/index.js";
import { createViewsBaseTool } from "./tools/views_base/index.js";
import { createWriteNoteTool } from "./tools/write_note/index.js";
import { createVaultRegistry } from "./vault-registry/registry.js";

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

  const vaultRegistry = createVaultRegistry({
    invokeProbe: async () => {
      const { stdout } = await invokeCli(
        { command: "vaults", parameters: {}, flags: ["verbose"], target_mode: "specific" },
        { logger, queue },
      );
      return stdout;
    },
  });

  const tools: RegisteredTool[] = [
    createAppendNoteTool({ logger, queue, vaultRegistry }),
    createBacklinksTool({ logger, queue }),
    createBasesTool({ logger, queue }),
    createContextSearchTool({ logger, queue }),
    createCreateBaseTool({ logger, queue }),
    createDeleteTool({ logger, queue }),
    createFilesTool({ logger, queue }),
    createFindAndReplaceTool({ logger, queue, vaultRegistry }),
    createFindByPropertyTool({ logger, queue }),
    createHelpTool(),
    createLinksTool({ logger, queue }),
    createMoveTool({ logger, queue }),
    createObsidianExecTool({ logger, queue }),
    createOpenFileTool({ logger, queue, vaultRegistry }),
    createOutlineTool({ logger, queue }),
    createPatchBlockTool({ logger, queue, vaultRegistry }),
    createPatchHeadingTool({ logger, queue, vaultRegistry }),
    createPathsTool({ logger, queue }),
    createPatternSearchTool({ logger, queue }),
    createPrependTool({ logger, queue, vaultRegistry }),
    createPropertiesTool({ logger, queue }),
    createQueryBaseTool({ logger, queue, vaultRegistry }),
    createReadTool({ logger, queue }),
    createReadHeadingTool({ logger, queue }),
    createReadPropertyTool({ logger, queue }),
    createRenameTool({ logger, queue }),
    createSearchTool({ logger, queue }),
    createSetPropertyTool({ logger, queue }),
    createSmartConnectionsQueryTool({ logger, queue }),
    createSmartConnectionsSimilarTool({ logger, queue }),
    createTagTool({ logger, queue }),
    createViewsBaseTool({ logger, queue }),
    createWriteNoteTool({ logger, queue, vaultRegistry }),
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
