// Original — no upstream. smart_connections_similar tool registration via registerTool — plugin-backed semantic-similarity primitive returning a typed { count, matches: [{ path, headingPath, score }] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire. The spec 085 leading-slice guarantee is stated on the help page (spec 092 keeps the description short).
import { registerTool } from "../_register.js";
import { type ExecuteDeps, executeSmartConnectionsSimilar, SMART_CONNECTIONS_SIMILAR_SUPPORTED } from "./handler.js";
import { smartConnectionsSimilarInputSchema, smartConnectionsSimilarOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const SMART_CONNECTIONS_SIMILAR_TOOL_NAME = "smart_connections_similar";

export const SMART_CONNECTIONS_SIMILAR_DESCRIPTION =
  `Return the vault blocks nearest in meaning to one source note, ranked by the Smart Connections plugin. Choose it when you start from a note and want notes like it; choose \`smart_connections_query\` when you start from a free-text question. ${describeSupport(SMART_CONNECTIONS_SIMILAR_SUPPORTED)}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createSmartConnectionsSimilarTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: SMART_CONNECTIONS_SIMILAR_TOOL_NAME,
    title: "Smart Connections Similar",
    annotations: READ_ONLY_HINTS,
    description: SMART_CONNECTIONS_SIMILAR_DESCRIPTION,
    schema: smartConnectionsSimilarInputSchema,
    outputSchema: smartConnectionsSimilarOutputSchema,
    deps,
    handler: async (input, d) => executeSmartConnectionsSimilar(input, d),
  });
}
