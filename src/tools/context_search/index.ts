// Original — no upstream. context_search tool registration via registerTool —
// vault-text-search-with-line-context primitive returning
// { count, matches: [{ path, line, text }], truncated? } in one call (eighteenth
// typed-tool wrap). Tool name `context_search` follows ADR-010 strict
// composite-namespace reversal of upstream `obsidian search:context` — parity
// with read_property (property:read) / set_property (property:set).
import { registerTool } from "../_register.js";
import { executeContextSearch, type ExecuteDeps } from "./handler.js";
import { contextSearchInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const CONTEXT_SEARCH_TOOL_NAME = "context_search";

export const CONTEXT_SEARCH_DESCRIPTION =
  `Vault-wide literal substring search returning each match as \`{ path, line, text }\`. Collapses the "find file → read file → locate line" three-call grep pattern into a single MCP call.

Pick \`context_search\` when you need per-match line context. Pick \`search\` when you only need the file paths (smaller payload). Pick \`pattern_search\` for regex queries. Pick \`smart_connections_query\` for semantic similarity (different concept entirely).

Vault-scoped — NO \`target_mode\` discriminator. The optional \`vault\` field routes to a named vault; omitted routes to the focused vault.

Required \`query\` (string, 1..1000 chars, non-empty post-trim; whitespace-only rejected). Internal whitespace preserved verbatim — \`"foo bar"\` matches \`foo bar\` but not \`foobar\` or \`foo  bar\`.

Optional \`folder\` (string): vault-relative folder prefix; leading/trailing "/" stripped; recursive subtree-prefix match (\`folder=Projects\` matches \`Projects/foo.md\` and \`Projects/sub/bar.md\`); case-sensitive segment-boundary equality (\`folder=Projects\` does NOT match \`projects/\`).

Optional \`limit\` (integer 1..10000, default 1000): caps the response \`matches\` array.

Optional \`case_sensitive\` (boolean, default false): when true, exact-case match; otherwise ASCII-fold only — \`É\` does NOT match \`é\`.

Response \`{ count, matches: [{ path, line, text }], truncated? }\`. Sorted by \`path\` asc then \`line\` asc. \`text\` capped at 500 chars + \`…\` ellipsis marker; trailing \`\\r\` stripped for cross-platform CRLF defence. \`truncated: true\` present only when the underlying match-set exceeded the applied cap. Non-\`.md\` paths filtered out.

**Zero-match handling**: WITHOUT \`folder\`, returns \`{ count: 0, matches: [] }\` (never an error). WITH \`folder\`, the wrapper fires a second \`obsidian folder\` probe to distinguish "folder exists with no matches" from "folder missing" — a missing folder surfaces as \`CLI_REPORTED_ERROR\` with \`details.message\` starting \`"Error: Folder ..."\`.

Unknown vault → \`CLI_REPORTED_ERROR\` with \`details.message: "Vault not found."\`. CLI parse failures → \`CLI_REPORTED_ERROR\` with \`details.stage: "json-parse"\` or \`"wire-parse"\`.

Call \`help({ tool_name: "context_search" })\` for worked examples (folder-scoped, capped+truncated, folder-not-found error, mixed CRLF/LF source) and the full failure roster with recovery hints.`;

export type RegisterDeps = ExecuteDeps;

export function createContextSearchTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: CONTEXT_SEARCH_TOOL_NAME,
    description: CONTEXT_SEARCH_DESCRIPTION,
    schema: contextSearchInputSchema,
    deps,
    handler: async (input, d) => executeContextSearch(input, d),
  });
}
