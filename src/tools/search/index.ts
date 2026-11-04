// Original — no upstream. search tool registration via registerTool — vault-text-search
// primitive returning either { count, paths, truncated? } (default mode) or
// { count, matches: [{ path, line, text }], truncated? } (line mode);
// responseFormat: "json" (default) wraps the result for the MCP wire. Seventeenth
// typed-tool wrap and the project's first vault-text-search primitive. Tool name
// `search` follows ADR-010 single-word-verbatim-from-upstream (matches the upstream
// `obsidian search` subcommand; line mode internally routes to `obsidian search:context`
// via the BI-019 multi-subcommand-routing precedent — single MCP tool, two upstream
// subcommands).
import { registerTool } from "../_register.js";
import { executeSearch, type ExecuteDeps } from "./handler.js";
import { searchInputSchema, searchOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const SEARCH_TOOL_NAME = "search";

export const SEARCH_DESCRIPTION =
  "Find the Markdown notes in a vault whose text or file name contains a literal phrase, and return their paths. Choose `search` when you only need which notes match; use `context_search` to get each matching line with its line number, or `pattern_search` to match a regular expression.";

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createSearchTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: SEARCH_TOOL_NAME,
    title: "Search",
    annotations: READ_ONLY_HINTS,
    description: SEARCH_DESCRIPTION,
    schema: searchInputSchema,
    outputSchema: searchOutputSchema,
    deps,
    handler: async (input, d) => executeSearch(input, d),
  });
}
