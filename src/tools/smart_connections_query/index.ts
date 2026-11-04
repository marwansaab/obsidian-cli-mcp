// Original — no upstream. smart_connections_query tool registration via registerTool — plugin-backed semantic-query primitive returning a typed { count, matches: [{ path, headingPath, score }] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire. Second member of the eval-driven plugin-backed cohort (after BI-026 smart_connections_similar) and first member of the FILELESS sub-cohort within that cohort (no target_mode discriminator; optional vault?). Tool name follows ADR-013's <plugin_name>_<operation> plugin-namespace convention. The spec 085 leading-slice guarantee is stated on the help page (spec 092 keeps the description short).
import { registerTool } from "../_register.js";
import { executeSmartConnectionsQuery, type ExecuteDeps } from "./handler.js";
import { smartConnectionsQueryInputSchema, smartConnectionsQueryOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const SMART_CONNECTIONS_QUERY_TOOL_NAME = "smart_connections_query";

export const SMART_CONNECTIONS_QUERY_DESCRIPTION =
  `Semantic search: return the vault blocks nearest in meaning to a free-text question, ranked by the Smart Connections plugin. Choose it when you start from a question; choose \`smart_connections_similar\` when you start from a note and want notes like it.`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createSmartConnectionsQueryTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: SMART_CONNECTIONS_QUERY_TOOL_NAME,
    title: "Smart Connections Query",
    annotations: READ_ONLY_HINTS,
    description: SMART_CONNECTIONS_QUERY_DESCRIPTION,
    schema: smartConnectionsQueryInputSchema,
    outputSchema: smartConnectionsQueryOutputSchema,
    deps,
    handler: async (input, d) => executeSmartConnectionsQuery(input, d),
  });
}
