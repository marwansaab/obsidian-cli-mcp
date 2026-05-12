// Original — no upstream. write_property tool registration via registerTool — responseFormat: "json" (default) wraps the { written, path, name } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeWriteProperty, type ExecuteDeps } from "./handler.js";
import { writePropertyInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const WRITE_PROPERTY_TOOL_NAME = "write_property";

export const WRITE_PROPERTY_DESCRIPTION =
  "Write a single named frontmatter property to a vault note. Surgical single-property write — flips one field without the full-file read_note + write_note round-trip. Returns { written: true, path, name }. Specific mode: vault + exactly one of file (wikilink) or path (vault-relative) + name + value + optional type. Active mode: just name + value + optional type (writes the focused note). Value accepts string | number | boolean | string[]; type is one of text / list / number / checkbox / date / datetime (inferred from value's shape when omitted; date / datetime require explicit type). Empty array writes an empty YAML list; cross-type overwrite is supported (the resolved type wins). Call help({ tool_name: \"write_property\" }) for full parameter docs, the type-inference table, and the error-code roster.";

export type RegisterDeps = ExecuteDeps;

export function createWritePropertyTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: WRITE_PROPERTY_TOOL_NAME,
    description: WRITE_PROPERTY_DESCRIPTION,
    schema: writePropertyInputSchema,
    deps,
    handler: async (input, d) => executeWriteProperty(input, d),
  });
}
