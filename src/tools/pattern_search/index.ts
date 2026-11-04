// Original — no upstream. pattern_search tool registration via registerTool — ECMAScript-regex search primitive returning a typed { count, matches: [{path, line, offset, match, text}], truncated? } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire. Sixteenth typed-tool wrap.
import { registerTool } from "../_register.js";
import { executePatternSearch, type ExecuteDeps } from "./handler.js";
import { patternSearchInputSchema, patternSearchOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const PATTERN_SEARCH_TOOL_NAME = "pattern_search";

export const PATTERN_SEARCH_DESCRIPTION =
  "Search a vault's Markdown notes for an ECMAScript regular expression, returning each match's path, line, offset and line text. Choose it for a regex; use `context_search` for a literal phrase with its lines, or `search` for only the matching paths, and note `case_sensitive` defaults to true here, false in `context_search`.";

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createPatternSearchTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: PATTERN_SEARCH_TOOL_NAME,
    title: "Pattern Search",
    annotations: READ_ONLY_HINTS,
    description: PATTERN_SEARCH_DESCRIPTION,
    schema: patternSearchInputSchema,
    outputSchema: patternSearchOutputSchema,
    deps,
    handler: async (input, d) => executePatternSearch(input, d),
  });
}
