// Original — no upstream. read_property tool registration via registerTool — responseFormat: "json" wraps the { value, type } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeReadProperty, type ExecuteDeps } from "./handler.js";
import { readPropertyInputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type RegisteredTool } from "../_shared.js";

export const READ_PROPERTY_TOOL_NAME = "read_property";

export const READ_PROPERTY_DESCRIPTION =
  'Read a single named frontmatter property from a vault note. Returns { value, type } with the property\'s native YAML type preserved (text / list / number / checkbox / date / datetime / unknown). In active mode it reads the focused note. Absent properties and frontmatter-less files return { value: null, type: "unknown" } without error.';

export type RegisterDeps = ExecuteDeps;

export function createReadPropertyTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: READ_PROPERTY_TOOL_NAME,
    title: "Read Property",
    annotations: READ_ONLY_HINTS,
    description: READ_PROPERTY_DESCRIPTION,
    schema: readPropertyInputSchema,
    deps,
    handler: async (input, d) => executeReadProperty(input, d),
  });
}
