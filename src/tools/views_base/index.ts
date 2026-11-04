// Original — no upstream.
import { registerTool } from "../_register.js";
import { type ExecuteDeps, executeViewsBase, VIEWS_BASE_SUPPORTED } from "./handler.js";
import { viewsBaseInputSchema, viewsBaseOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const VIEWS_BASE_TOOL_NAME = "views_base";

export const VIEWS_BASE_DESCRIPTION =
  `List the views defined in an Obsidian Bases (\`.base\`) file, either the one named by \`base_path\` or the Base focused in Obsidian. Use it to get exact view names for \`query_base\`, which returns a view's rows; \`bases\` lists the vault's \`.base\` files, and \`create_base\` adds an item note to an existing Base. ${describeSupport(VIEWS_BASE_SUPPORTED)}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createViewsBaseTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: VIEWS_BASE_TOOL_NAME,
    title: "Views Base",
    annotations: READ_ONLY_HINTS,
    description: VIEWS_BASE_DESCRIPTION,
    schema: viewsBaseInputSchema,
    outputSchema: viewsBaseOutputSchema,
    deps,
    handler: async (input, d) => executeViewsBase(input, d),
  });
}
