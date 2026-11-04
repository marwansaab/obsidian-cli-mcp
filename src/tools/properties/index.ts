// Original — no upstream. properties tool registration via registerTool — vault-wide structural-discovery primitive returning a typed { count, properties: [{ name, noteCount }] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeProperties, type ExecuteDeps } from "./handler.js";
import { propertiesInputSchema, propertiesOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const PROPERTIES_TOOL_NAME = "properties";

export const PROPERTIES_DESCRIPTION =
  "List every frontmatter property name in a vault with how many notes use each. Choose `properties` to see which property names exist: `read_property` reads one note's value, `set_property` writes one and `find_by_property` finds notes by value.";

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createPropertiesTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: PROPERTIES_TOOL_NAME,
    title: "Properties",
    annotations: READ_ONLY_HINTS,
    description: PROPERTIES_DESCRIPTION,
    schema: propertiesInputSchema,
    outputSchema: propertiesOutputSchema,
    deps,
    handler: async (input, d) => executeProperties(input, d),
  });
}
