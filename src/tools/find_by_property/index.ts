// Original — no upstream. find_by_property tool registration via registerTool — wraps the { count, paths } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeFindByProperty, type ExecuteDeps } from "./handler.js";
import { findByPropertyInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const FIND_BY_PROPERTY_TOOL_NAME = "find_by_property";

export const FIND_BY_PROPERTY_DESCRIPTION =
  'Find vault notes whose named frontmatter property matches a given value. Returns { count, paths } — vault-relative paths of every match. Inverse direction of read_property: value → file rather than file → value. Replaces the agent\'s "guess the path from convention" sequence with a single typed call. Inputs: { vault?, property, value, folder?, arrayMatch?, caseSensitive? }. Value accepts string / number / boolean / null / array<scalar>; type-faithful comparison (number 7 distinct from string "7"). Default arrayMatch:true gives contains-semantics on list-valued properties; arrayMatch:false enables order-sensitive exact-equality (requires array value). Default caseSensitive:true; folder narrows to a vault-relative subtree. Multi-vault setups should pass vault explicitly to avoid focused-vault default ambiguity. Call help({ tool_name: "find_by_property" }) for full parameter docs and the error-code roster.';

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
