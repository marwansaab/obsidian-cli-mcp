// Original — no upstream. smart_connections_query tool registration via registerTool — plugin-backed semantic-query primitive returning a typed { count, matches: [{ path, headingPath, score }] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire. Second member of the eval-driven plugin-backed cohort (after BI-026 smart_connections_similar) and first member of the FILELESS sub-cohort within that cohort (no target_mode discriminator; optional vault?). Tool name follows ADR-013's <plugin_name>_<operation> plugin-namespace convention.
import { registerTool } from "../_register.js";
import { executeSmartConnectionsQuery, type ExecuteDeps } from "./handler.js";
import { MAX_QUERY_LENGTH, smartConnectionsQueryInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const SMART_CONNECTIONS_QUERY_TOOL_NAME = "smart_connections_query";

export const SMART_CONNECTIONS_QUERY_DESCRIPTION =
  `Semantic search: return the block-level vault matches nearest to a free-text natural-language query via the Smart Connections plugin's lookup API. Returns \`{ count, matches: [{ path, headingPath, score }] }\`.

Use this when the agent has a QUESTION and needs notes related to it. Use \`smart_connections_similar\` when the agent has a SOURCE NOTE and needs notes related to it. Use \`search\` / \`context_search\` for literal-string content search.

Required \`query\` (string, trimmed, 1..${MAX_QUERY_LENGTH} chars — over-cap rejected fast with VALIDATION_ERROR). The cap is bounded by an upstream Obsidian CLI defect that hangs the host process around 4 KB of base64-encoded eval payload on Windows; queries above ~2000 chars trigger \`CLI_TIMEOUT\` at 10 s and a 30–60 s recovery window during which subsequent calls timeout. For longer text, summarise client-side before querying.

Optional \`vault\` (string, min 1 char; routes to the focused vault when omitted). Optional integer \`limit\` (1..100, default 20) caps the matches list AND the count. Setting \`total: true\` returns just the count with \`matches: []\` for a token-economical pre-flight read.

Per-match fields: \`path\` is the source file's vault-relative path with \`.md\` extension. \`headingPath\` is an array of heading segments — empty \`[]\` for source-level matches, literal \`["---frontmatter---"]\` for frontmatter-block matches (plugin sentinel preserved verbatim), multi-segment for nested-heading blocks. \`score\` is the raw plugin-returned number — embedding-model-dependent semantics, pass-through (no clamp / normalise / round); non-finite scores (NaN / Infinity / null / missing) are silently dropped. Sort: primary score descending, secondary path byte-ascending, tertiary headingPath.join('#') byte-ascending.

Runtime dependency: the Smart Connections plugin (by Brian Petro; ≥ v4.5.0) must be installed in the target vault AND have completed initial indexing AND have an embed model configured. Missing / not-ready states surface as typed CLI_REPORTED_ERROR codes (\`SMART_CONNECTIONS_NOT_INSTALLED\` or \`SMART_CONNECTIONS_NOT_READY\` with \`details.reason: "api-missing"\` or \`"embed-failed"\`).

Closed-but-registered vaults: when \`vault\` is in \`obsidian vaults\` but not currently open, the CLI transparently begins opening it as a side effect — error returned with \`details.code: VAULT_NOT_FOUND\`, \`details.reason: "not-open"\`. Retry after a brief delay.

Error-precedence (outer to inner): VAULT_NOT_FOUND(unknown) → VAULT_NOT_FOUND(not-open) → SMART_CONNECTIONS_NOT_INSTALLED → SMART_CONNECTIONS_NOT_READY(api-missing) → SMART_CONNECTIONS_NOT_READY(embed-failed) → success.

Call \`help({ tool_name: "smart_connections_query" })\` for worked examples, full error roster with recovery hints, and inherited-limitation details (indexing freshness, folder exclusions, local-model silent truncation, score-band caveats).`;

export type RegisterDeps = ExecuteDeps;

export function createSmartConnectionsQueryTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: SMART_CONNECTIONS_QUERY_TOOL_NAME,
    description: SMART_CONNECTIONS_QUERY_DESCRIPTION,
    schema: smartConnectionsQueryInputSchema,
    deps,
    handler: async (input, d) => executeSmartConnectionsQuery(input, d),
  });
}
