// Original — no upstream. outline tool registration via registerTool — structural-discovery primitive returning a typed { count, headings: [...] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeOutline, OUTLINE_SUPPORTED, type ExecuteDeps } from "./handler.js";
import { outlineInputSchema, outlineOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const OUTLINE_TOOL_NAME = "outline";

export const OUTLINE_DESCRIPTION =
  "Return the flat ordered list of every heading in a Markdown note (returns { count, headings: [{ level, text, line }] }) — structural-discovery primitive that replaces \"full read plus client-side parse\" for the outline case at one to two orders of magnitude less token cost. Discriminated by target_mode; in active mode it operates on the focused note in the focused vault. Setting total:true populates count and returns headings:[] for a token-economical pre-flight read; the envelope shape is uniform across both modes. Zero-heading files return { count: 0, headings: [] } in both modes. Setext underline-style headings AND ATX headings both appear in the output (defers to upstream). " +
  describeSupport(OUTLINE_SUPPORTED) +
  " Canvases, bases, attachments and other files are rejected before the call with UNSUPPORTED_FILE_TYPE.";

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
