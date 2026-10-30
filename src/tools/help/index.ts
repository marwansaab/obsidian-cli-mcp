// Original — no upstream. help tool registration via registerTool — responseFormat: "raw" because the handler returns a pre-built ToolCallResult.
import { registerTool } from "../_register.js";
import { executeHelp } from "./handler.js";
import { helpInputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type RegisteredTool } from "../_shared.js";

export const HELP_TOOL_NAME = "help";

export const HELP_DESCRIPTION =
  'Look up full Markdown documentation for any registered MCP tool. With no arguments it returns an index of available docs; with { tool_name: "<name>" } it returns that tool\'s full reference. Self-describing: { tool_name: "help" } documents this tool.';

export function createHelpTool(): RegisteredTool {
  return registerTool({
    name: HELP_TOOL_NAME,
    title: "Help",
    annotations: READ_ONLY_HINTS,
    description: HELP_DESCRIPTION,
    schema: helpInputSchema,
    handler: async (input) => executeHelp(input),
    responseFormat: "raw",
  });
}
