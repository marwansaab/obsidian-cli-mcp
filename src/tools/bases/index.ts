// Original — no upstream.
import { registerTool } from "../_register.js";
import { executeBases, type ExecuteDeps } from "./handler.js";
import { basesInputSchema, basesOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const BASES_TOOL_NAME = "bases";

export const BASES_DESCRIPTION =
  `List every Obsidian Bases (\`.base\`) file in a vault as sorted vault-relative paths. Use it to find a Base; then \`views_base\` lists a Base's view names, \`query_base\` returns a view's rows, and \`create_base\` adds an item note to an existing Base.`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createBasesTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: BASES_TOOL_NAME,
    title: "Bases",
    annotations: READ_ONLY_HINTS,
    description: BASES_DESCRIPTION,
    schema: basesInputSchema,
    outputSchema: basesOutputSchema,
    deps,
    handler: async (input, d) => executeBases(input, d),
  });
}
