// Original — no upstream. help MCP tool registration: returns a RegisteredTool for aggregation in server.ts (FR-007, FR-016, plan-stage P5 + P8).
import { ZodError } from "zod";

import { executeHelp } from "./handler.js";
import { helpInputSchema, helpInputJsonSchema } from "./schema.js";
import { UpstreamError } from "../../errors.js";
import { stripSchemaDescriptions, type JsonSchemaObject } from "../../help/strip-schema.js";
import { asToolError, type RegisteredTool } from "../_shared.js";

export const HELP_TOOL_NAME = "help";

export const HELP_DESCRIPTION =
  'Look up full Markdown documentation for any registered MCP tool. Call help() with no arguments for an index of available docs, or help({ tool_name: "<name>" }) for a specific tool\'s full parameter docs. Self-describing — call help({ tool_name: "help" }).';

export function registerHelpTool(): RegisteredTool {
  return {
    descriptor: {
      name: HELP_TOOL_NAME,
      description: HELP_DESCRIPTION,
      inputSchema: stripSchemaDescriptions(helpInputJsonSchema as JsonSchemaObject) as Record<string, unknown>,
    },
    handler: async (args) => {
      let parsed: ReturnType<typeof helpInputSchema.parse>;
      try {
        parsed = helpInputSchema.parse(args);
      } catch (err: unknown) {
        if (err instanceof ZodError) {
          return asToolError({
            code: "VALIDATION_ERROR",
            message: "help input failed schema validation",
            details: {
              issues: err.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
            },
          });
        }
        throw err;
      }
      try {
        const result = await executeHelp(parsed);
        return result;
      } catch (err: unknown) {
        if (err instanceof UpstreamError) {
          return asToolError({
            code: err.code,
            message: err.message,
            details: err.details as Record<string, unknown>,
          });
        }
        throw err;
      }
    },
  };
}
