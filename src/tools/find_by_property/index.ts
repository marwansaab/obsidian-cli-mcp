// Original — no upstream. find_by_property tool registration via registerTool — wraps the { count, paths } envelope for the MCP wire.
import { withDeprecatedParameters } from "../_deprecated-params.js";
import { registerTool } from "../_register.js";
import { executeFindByProperty, type ExecuteDeps } from "./handler.js";
import { findByPropertyInputSchema, findByPropertyOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const FIND_BY_PROPERTY_TOOL_NAME = "find_by_property";

export const FIND_BY_PROPERTY_DESCRIPTION =
  "Find the notes whose frontmatter property matches a given value and return their paths. Choose `find_by_property` to go from a value to notes: `read_property` reads one note's value, `set_property` writes one, `properties` lists property names and `tag` finds notes by tag.";

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createFindByPropertyTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: FIND_BY_PROPERTY_TOOL_NAME,
    title: "Find By Property",
    annotations: READ_ONLY_HINTS,
    description: FIND_BY_PROPERTY_DESCRIPTION,
    schema: findByPropertyInputSchema,
    outputSchema: findByPropertyOutputSchema,
    deps,
    handler: async (input, d) => withDeprecatedParameters(await executeFindByProperty(input, d), input.deprecated_parameters),
  });
}
