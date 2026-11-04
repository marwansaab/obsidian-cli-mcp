// Original — no upstream. outline tool registration via registerTool — structural-discovery primitive returning a typed { count, headings: [...] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeOutline, OUTLINE_SUPPORTED, type ExecuteDeps } from "./handler.js";
import { outlineInputSchema, outlineOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const OUTLINE_TOOL_NAME = "outline";

export const OUTLINE_DESCRIPTION =
  "List every heading in a note, in source order, with its level, text and line number. Use `outline` for a note's headings; use `links` for the links it makes, and `backlinks` for the notes that link to it. " +
  describeSupport(OUTLINE_SUPPORTED);

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createOutlineTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: OUTLINE_TOOL_NAME,
    title: "Outline",
    annotations: READ_ONLY_HINTS,
    description: OUTLINE_DESCRIPTION,
    schema: outlineInputSchema,
    outputSchema: outlineOutputSchema,
    deps,
    handler: async (input, d) => executeOutline(input, d),
  });
}
