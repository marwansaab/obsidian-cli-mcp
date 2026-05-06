// Original — no upstream. help tool registration via registerTool — responseFormat: "raw" because the handler returns a pre-built ToolCallResult.
import { registerTool } from "../_register.js";
import { executeHelp } from "./handler.js";
import { helpInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const HELP_TOOL_NAME = "help";

export const HELP_DESCRIPTION =
  'Look up full Markdown documentation for any registered MCP tool. Call help() with no arguments for an index of available docs, or help({ tool_name: "<name>" }) for a specific tool\'s full parameter docs. Self-describing — call help({ tool_name: "help" }).';

export function createHelpTool(): RegisteredTool {
  return registerTool({
    name: HELP_TOOL_NAME,
    description: HELP_DESCRIPTION,
    schema: helpInputSchema,
    handler: async (input) => executeHelp(input),
    responseFormat: "raw",
  });
}
