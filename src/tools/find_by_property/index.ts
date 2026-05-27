// Original — no upstream. find_by_property tool registration via registerTool — wraps the { count, paths } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeFindByProperty, type ExecuteDeps } from "./handler.js";
import { findByPropertyInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const FIND_BY_PROPERTY_TOOL_NAME = "find_by_property";

export const FIND_BY_PROPERTY_DESCRIPTION =
  `Find vault notes whose named frontmatter property matches a given value. Returns \`{ count, paths }\` — vault-relative paths of every match. Inverse direction of \`read_property\`: value → file rather than file → value.

**NOTE — the property-name parameter is \`property:\`, not \`name:\`** (diverges from sibling \`read_property\` / \`set_property\` which use \`name:\`). A call with \`name:\` instead of \`property:\` fails with VALIDATION_ERROR.

Inputs: \`{ vault?, property, value, folder?, arrayMatch?, caseSensitive? }\`.

\`value\` accepts string / number / boolean / null / array<scalar>; type-faithful comparison (number \`7\` is distinct from string \`"7"\`).

\`arrayMatch\` (default \`true\`): contains-semantics on list-valued properties. \`arrayMatch: false\` enables order-sensitive exact-equality (requires array value).

\`caseSensitive\` (default \`true\`).

\`folder\` narrows to a vault-relative subtree.

\`vault\` should be passed explicitly in multi-vault setups to avoid focused-vault basename ambiguity.

Call \`help({ tool_name: "find_by_property" })\` for worked examples, full parameter docs, and the error roster with recovery hints.`;

export type RegisterDeps = ExecuteDeps;

export function createFindByPropertyTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: FIND_BY_PROPERTY_TOOL_NAME,
    description: FIND_BY_PROPERTY_DESCRIPTION,
    schema: findByPropertyInputSchema,
    deps,
    handler: async (input, d) => executeFindByProperty(input, d),
  });
}
