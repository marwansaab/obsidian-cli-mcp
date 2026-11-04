// Original — no upstream. set_property tool registration via registerTool — responseFormat: "json" (default) wraps the { written, path, name } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeWriteProperty, type ExecuteDeps } from "./handler.js";
import { setPropertyInputSchema, writePropertyOutputSchema } from "./schema.js";
import { REPEATABLE_WRITE_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const SET_PROPERTY_TOOL_NAME = "set_property";

export const SET_PROPERTY_DESCRIPTION =
  "Write one frontmatter property on a note, adding it or replacing its value. Choose `set_property` to change one field without rewriting the note: `read_property` reads one value, `find_by_property` finds notes by value and `properties` lists property names.";

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createSetPropertyTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: SET_PROPERTY_TOOL_NAME,
    title: "Set Property",
    annotations: REPEATABLE_WRITE_HINTS,
    description: SET_PROPERTY_DESCRIPTION,
    schema: setPropertyInputSchema,
    outputSchema: writePropertyOutputSchema,
    deps,
    handler: async (input, d) => executeWriteProperty(input, d),
  });
}
