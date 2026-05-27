// Original — no upstream. set_property tool registration via registerTool — responseFormat: "json" (default) wraps the { written, path, name } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeWriteProperty, type ExecuteDeps } from "./handler.js";
import { setPropertyInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const SET_PROPERTY_TOOL_NAME = "set_property";

export const SET_PROPERTY_DESCRIPTION =
  `Write a single named frontmatter property to a vault note. Surgical single-property write — flips one field without the full-file read + write_note round-trip. Returns \`{ written: true, path, name }\`.

Pick \`set_property\` to write one frontmatter value. Pick \`read_property\` to read one. Pick \`properties\` for the vault-wide property catalogue. Pick \`find_by_property\` to find notes by a property value.

Targeting: \`target_mode: "specific"\` + \`vault\` + EXACTLY ONE of \`file\` (wikilink) or \`path\` (vault-relative) + \`name\` + \`value\` + optional \`type\`. Or \`target_mode: "active"\` + \`name\` + \`value\` + optional \`type\` (writes the focused note).

\`value\` accepts \`string | number | boolean | string[]\`. \`type\` is one of \`text\` / \`list\` / \`number\` / \`checkbox\` / \`date\` / \`datetime\` — inferred from value's shape when omitted. \`date\` / \`datetime\` REQUIRE explicit \`type\` (the inferrer can't distinguish them from a plain string). Empty array writes an empty YAML list. Cross-type overwrite is supported (the resolved type wins).

**Cowork-pathway caveat**: on the Cowork MCP client, non-string \`value\` payloads (numbers, booleans, arrays) may be coerced to strings client-side before reaching the wrapper. To force the wrapper to write the intended YAML type, **pass an explicit \`type\`** for list / number / checkbox writes. Without it, the wrapper sees a string and may write the wrong YAML shape.

Call \`help({ tool_name: "set_property" })\` for the type-inference table, worked examples, and the error roster with recovery hints.`;

export type RegisterDeps = ExecuteDeps;

export function createSetPropertyTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: SET_PROPERTY_TOOL_NAME,
    description: SET_PROPERTY_DESCRIPTION,
    schema: setPropertyInputSchema,
    deps,
    handler: async (input, d) => executeWriteProperty(input, d),
  });
}
