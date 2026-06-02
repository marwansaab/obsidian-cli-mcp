// Original — no upstream. outline tool registration via registerTool — structural-discovery primitive returning a typed { count, headings: [...] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeOutline, type ExecuteDeps } from "./handler.js";
import { outlineInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const OUTLINE_TOOL_NAME = "outline";

export const OUTLINE_DESCRIPTION =
  "Return the flat ordered list of every heading in a Markdown note (returns { count, headings: [{ level, text, line }] }) — structural-discovery primitive that replaces \"full read plus client-side parse\" for the outline case at one to two orders of magnitude less token cost. Discriminated by target_mode. Specific mode: target_mode + vault + exactly one of file/path. Active mode: target_mode only (operates on the focused note in the focused vault). Setting total:true populates count and returns headings:[] for a token-economical pre-flight read; the envelope shape is uniform across both modes. Zero-heading files return { count: 0, headings: [] } in both modes. Setext underline-style headings AND ATX headings both appear in the output (defers to upstream). Non-Markdown filetypes (.canvas, .pdf, attachments) are rejected at the upstream CLI as CLI_REPORTED_ERROR. Call help({ tool_name: \"outline\" }) for full parameter docs, the count-only mode example, the multi-vault default-ambiguity note, the Setext-included note, and the error-code roster.";

export type RegisterDeps = ExecuteDeps;

export function createOutlineTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: OUTLINE_TOOL_NAME,
    description: OUTLINE_DESCRIPTION,
    schema: outlineInputSchema,
    deps,
    handler: async (input, d) => executeOutline(input, d),
  });
}
