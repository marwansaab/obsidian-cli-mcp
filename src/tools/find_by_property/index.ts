// Original — no upstream. find_by_property tool registration via registerTool — wraps the { count, paths } envelope for the MCP wire.
import { deprecatedNamesNote, withDeprecatedParameters } from "../_deprecated-params.js";
import { registerTool } from "../_register.js";
import { executeFindByProperty, type ExecuteDeps } from "./handler.js";
import { FIND_BY_PROPERTY_RENAMES, findByPropertyInputSchema, findByPropertyOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const FIND_BY_PROPERTY_TOOL_NAME = "find_by_property";

export const FIND_BY_PROPERTY_DESCRIPTION =
  `Find vault notes whose named frontmatter property matches a given value. Returns \`{ count, paths }\` — vault-relative paths of every match. Inverse direction of \`read_property\`: value → file rather than file → value.

Inputs: \`{ vault?, name, value, folder?, array_match?, case_sensitive? }\`.

\`value\` accepts string / number / boolean / null / array<scalar>; type-faithful comparison (number \`7\` is distinct from string \`"7"\`).

\`array_match\` (default \`true\`): contains-semantics on list-valued properties. \`array_match: false\` enables order-sensitive exact-equality (requires array value).

\`case_sensitive\` (default \`true\`).

\`folder\` narrows to a vault-relative subtree.

\`vault\` should be passed explicitly in multi-vault setups to avoid focused-vault basename ambiguity.

${deprecatedNamesNote(FIND_BY_PROPERTY_RENAMES)}`;

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
