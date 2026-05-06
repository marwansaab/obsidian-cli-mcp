// Original — no upstream. obsidian_exec MCP tool registration: returns a RegisteredTool for aggregation in server.ts (plan-stage P8).
import { ZodError } from "zod";

import { executeObsidianExec, type ExecuteDeps } from "./handler.js";
import { obsidianExecSchema, obsidianExecInputJsonSchema } from "./schema.js";
import { UpstreamError } from "../../errors.js";
import { stripSchemaDescriptions, type JsonSchemaObject } from "../../help/strip-schema.js";
import { asToolError, type RegisteredTool } from "../_shared.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export const OBSIDIAN_EXEC_TOOL_NAME = "obsidian_exec";

export const OBSIDIAN_EXEC_DESCRIPTION =
  'Invoke any Obsidian Integrated CLI subcommand. Returns stdout, stderr, exitCode, and the exact argv invoked. Failures (non-zero exit, in-band Error: prefix, missing binary, timeout, output > 10 MiB) surface as structured errors with stable codes. Call help({ tool_name: "obsidian_exec" }) for full parameter docs and the error-code roster.';

export interface RegisterDeps extends Omit<ExecuteDeps, never> {
  logger: Logger;
  queue: Queue;
}

export function registerObsidianExecTool(deps: RegisterDeps): RegisteredTool {
  return {
    descriptor: {
      name: OBSIDIAN_EXEC_TOOL_NAME,
      description: OBSIDIAN_EXEC_DESCRIPTION,
      inputSchema: stripSchemaDescriptions(obsidianExecInputJsonSchema as JsonSchemaObject) as Record<string, unknown>,
    },
    handler: async (args) => {
      let parsed: ReturnType<typeof obsidianExecSchema.parse>;
      try {
        parsed = obsidianExecSchema.parse(args);
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
    },
  };
}
