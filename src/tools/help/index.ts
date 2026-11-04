// Original — no upstream. help tool registration via registerTool — responseFormat: "raw" because the handler returns a pre-built ToolCallResult.
import { registerTool } from "../_register.js";
import { executeHelp } from "./handler.js";
import { helpInputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type RegisteredTool } from "../_shared.js";

export const HELP_TOOL_NAME = "help";

export const HELP_DESCRIPTION =
  'Return any registered tool\'s full contract (inputs, output, errors and examples) as Markdown when given its name in tool_name, or the index of every tool when called with no arguments. Self-describing: { tool_name: "help" } documents this tool.';

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
