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
import { searchInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const SEARCH_TOOL_NAME = "search";

export const SEARCH_DESCRIPTION =
  `Vault-wide literal substring search. Returns just the file paths that contain the query (default mode: \`{ count, paths }\`). Lightest payload of the search tools.

Pick \`search\` when you only need to know WHICH files contain the phrase. Pick \`context_search\` when you need per-match line context. Pick \`pattern_search\` for regex queries. Pick \`smart_connections_query\` for semantic similarity.

**DEPRECATION**: \`context_lines: true\` mode is retained for backward compatibility but is **deprecated** — call \`context_search\` instead for per-line-context queries. The dedicated tool ships CRLF normalisation, structured folder-not-found errors, and a cleaner shape.

Vault-scoped — NO \`target_mode\` discriminator. The optional \`vault\` field routes to a named vault; omitted routes to the focused vault.

Required \`query\` (string, 1..1000 chars, non-empty post-trim; whitespace-only rejected).

Optional \`folder\` (string): vault-relative folder prefix; leading/trailing \`/\` stripped; case-sensitive segment-boundary match enforced by upstream.

Optional \`limit\` (integer 1..10000, default 1000): caps the response array.

Optional \`case_sensitive\` (boolean, default false): ASCII fold only when false — \`É\` does NOT match \`é\`.

Optional \`context_lines\` (boolean, default false, **DEPRECATED — prefer \`context_search\`**): when true, returns line-level matches as \`{ count, matches: [{ path, line, text }], truncated? }\` instead of paths.

Optional \`vault\` (string): routes to a named vault; omitted routes to the focused vault.

Response carries \`count\` plus the array (\`paths\` or \`matches\`) plus optional \`truncated: true\` (present only when truncation fired). Sort: UTF-16 ascending. Non-\`.md\` paths filtered out. Files matched only by filename/metadata (not body text) do NOT appear in line mode — \`context_search\`'s count can be less than \`search\`'s default-mode count for the same query.

Zero-match returns the empty envelope (never an error). Unknown vault → \`CLI_REPORTED_ERROR\` with \`details.code: "VAULT_NOT_FOUND"\`. CLI parse failures → \`CLI_REPORTED_ERROR\` with \`details.stage: "json-parse"\` or \`"wire-parse"\`.

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\`, \`CLI_REPORTED_ERROR\`, \`CLI_NON_ZERO_EXIT\`, \`CLI_TIMEOUT\`, \`CLI_OUTPUT_TOO_LARGE\`, \`CLI_BINARY_NOT_FOUND\`. Call \`help({ tool_name: "search" })\` for worked examples and the full failure roster with recovery hints.`;

export type RegisterDeps = ExecuteDeps;

export function createSearchTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: SEARCH_TOOL_NAME,
    description: SEARCH_DESCRIPTION,
    schema: searchInputSchema,
    deps,
    handler: async (input, d) => executeSearch(input, d),
  });
}
