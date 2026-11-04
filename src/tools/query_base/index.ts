// Original — no upstream. query_base tool registration via registerTool — wraps the upstream `obsidian base:query` subcommand to return matched rows from a named view inside an Obsidian Bases (.base) file as a structured `{ columns, rows, truncated, total_rows? }` envelope. Sixteenth typed-tool wrap; ADR-010 mechanical name from `base:query`. BI-0174: a mapValidationError hook (shared liftSubCodedIssue) lifts INVALID_BASE_PATH / INVALID_VIEW_NAME's ADR-015 params into details.
import { registerTool } from "../_register.js";
import { liftSubCodedIssue } from "../_validation-details.js";
import { type ExecuteDeps, executeQueryBase, QUERY_BASE_SUPPORTED } from "./handler.js";
import { queryBaseInputSchema, queryBaseOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const QUERY_BASE_TOOL_NAME = "query_base";

export const QUERY_BASE_DESCRIPTION =
  `Run a named view of an Obsidian Bases (\`.base\`) file and return its matched rows as structured JSON. Use it to read a Base's rows; \`bases\` lists the vault's \`.base\` files, \`views_base\` lists a Base's exact view names, and \`create_base\` adds an item note to an existing Base. ${describeSupport(QUERY_BASE_SUPPORTED)}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createQueryBaseTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: QUERY_BASE_TOOL_NAME,
    title: "Query Base",
    annotations: READ_ONLY_HINTS,
    description: QUERY_BASE_DESCRIPTION,
    schema: queryBaseInputSchema,
    outputSchema: queryBaseOutputSchema,
    deps,
    handler: executeQueryBase,
    mapValidationError: liftSubCodedIssue,
  });
}
