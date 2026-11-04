// Original — no upstream. context_search tool registration via registerTool —
// vault-text-search-with-line-context primitive returning
// { count, matches: [{ path, line, text }], truncated? } in one call (eighteenth
// typed-tool wrap). Tool name `context_search` follows ADR-010 strict
// composite-namespace reversal of upstream `obsidian search:context` — parity
// with read_property (property:read) / set_property (property:set).
import { registerTool } from "../_register.js";
import { executeContextSearch, type ExecuteDeps } from "./handler.js";
import { contextSearchInputSchema, contextSearchOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const CONTEXT_SEARCH_TOOL_NAME = "context_search";

export const CONTEXT_SEARCH_DESCRIPTION =
  "Find every line in a vault's Markdown notes that contains a literal phrase, returning each match's path, line number and line text. Choose `context_search` when you need the matching lines themselves; use `search` when only the paths of matching notes are needed, or `pattern_search` to match a regular expression.";

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createContextSearchTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: CONTEXT_SEARCH_TOOL_NAME,
    title: "Context Search",
    annotations: READ_ONLY_HINTS,
    description: CONTEXT_SEARCH_DESCRIPTION,
    schema: contextSearchInputSchema,
    outputSchema: contextSearchOutputSchema,
    deps,
    handler: async (input, d) => executeContextSearch(input, d),
  });
}
