// Original — no upstream. obsidian_exec MCP tool registration: ListTools + CallTool dispatch with structured error mapping.
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z, ZodError } from "zod";
import { UpstreamError } from "../../errors.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import { obsidianExecSchema, obsidianExecInputJsonSchema } from "./schema.js";
import { executeObsidianExec, type ExecuteDeps } from "./handler.js";

export const OBSIDIAN_EXEC_TOOL_NAME = "obsidian_exec";

export const OBSIDIAN_EXEC_DESCRIPTION =
  "Invoke any Obsidian Integrated CLI subcommand on the host where the bridge is running. Bridges MCP clients (including sandboxed ones that cannot exec the obsidian binary directly) to the running Obsidian desktop instance. The 'command' field names the CLI subcommand; 'parameters' becomes 'key=value' argv tokens; 'flags' are appended as bare-word tokens; 'vault' (if set) scopes the invocation to a named vault by prepending 'vault=<value>' as the first positional; 'copy' appends '--copy' to copy stdout to the OS clipboard. Returns stdout, stderr, exitCode, and the exact argv invoked. Failures (non-zero exit, missing binary, timeout, captured-output exceeds 10 MiB) surface as structured errors with stable code identifiers — see contracts/errors.contract.md.";

export interface RegisterDeps extends Omit<ExecuteDeps, never> {
  logger: Logger;
  queue: Queue;
}

interface ToolErrorPayload {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

function asToolError(payload: ToolErrorPayload) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

export function registerObsidianExecTool(server: Server, deps: RegisterDeps): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: OBSIDIAN_EXEC_TOOL_NAME,
        description: OBSIDIAN_EXEC_DESCRIPTION,
        inputSchema: obsidianExecInputJsonSchema as z.ZodType extends z.ZodType ? Record<string, unknown> : never,
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== OBSIDIAN_EXEC_TOOL_NAME) {
      return asToolError({
        code: "TOOL_NOT_FOUND",
        message: `Unknown tool: ${req.params.name}`,
        details: { requestedName: req.params.name, knownTools: [OBSIDIAN_EXEC_TOOL_NAME] },
      });
    }
    let parsed: ReturnType<typeof obsidianExecSchema.parse>;
    try {
      parsed = obsidianExecSchema.parse(req.params.arguments);
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        return asToolError({
          code: "VALIDATION_ERROR",
          message: "obsidian_exec input failed schema validation",
          details: {
            issues: err.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
          },
        });
      }
      throw err;
    }
    try {
      const result = await executeObsidianExec(parsed, deps);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    } catch (err: unknown) {
      if (err instanceof UpstreamError) {
        return asToolError({
          code: err.code,
          message: err.message,
          details: err.details,
        });
      }
      throw err;
    }
  });
}
