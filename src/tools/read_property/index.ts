// Original — no upstream. read_property tool registration via registerTool — responseFormat: "json" wraps the { value, type } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeReadProperty, type ExecuteDeps } from "./handler.js";
import { readPropertyInputSchema, readPropertyOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const READ_PROPERTY_TOOL_NAME = "read_property";

export const READ_PROPERTY_DESCRIPTION =
  "Read one frontmatter property of a note and return its value and type. Choose `read_property` when only that property is needed: `read` returns the whole note, `read_heading` one section, `set_property` writes a property, `find_by_property` finds notes by value and `properties` lists property names.";

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createReadPropertyTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: READ_PROPERTY_TOOL_NAME,
    title: "Read Property",
    annotations: READ_ONLY_HINTS,
    description: READ_PROPERTY_DESCRIPTION,
    schema: readPropertyInputSchema,
    outputSchema: readPropertyOutputSchema,
    deps,
    handler: async (input, d) => executeReadProperty(input, d),
  });
}
