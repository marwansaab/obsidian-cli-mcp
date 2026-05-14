// Original — no upstream. smart_connections_query tool registration via registerTool — plugin-backed semantic-query primitive returning a typed { count, matches: [{ path, headingPath, score }] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire. Second member of the eval-driven plugin-backed cohort (after BI-026 smart_connections_similar) and first member of the FILELESS sub-cohort within that cohort (no target_mode discriminator; optional vault?). Tool name follows ADR-013's <plugin_name>_<operation> plugin-namespace convention.
import { registerTool } from "../_register.js";
import { executeSmartConnectionsQuery, type ExecuteDeps } from "./handler.js";
import { smartConnectionsQueryInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const SMART_CONNECTIONS_QUERY_TOOL_NAME = "smart_connections_query";

export const SMART_CONNECTIONS_QUERY_DESCRIPTION =
  "Return the typed list of semantically-nearest block-level matches in a vault for a free-text natural-language query, via the Smart Connections plugin's lookup API (returns { count, matches: [{ path, headingPath, score }] }) — second plugin-backed typed-content primitive; sibling to smart_connections_similar (which answers \"what's near this source note?\"). Required query (string, trimmed, 1..4000 chars). Optional vault (string, min 1 char; routes to focused vault when omitted). Optional integer limit (1..100, default 20) caps the matches list AND the count. Setting total:true populates count and returns matches:[] for a token-economical pre-flight read; the envelope shape is uniform across both modes. Per-match path is the source file's vault-relative path with .md extension (everything before the first # in the plugin's match key); headingPath is an array of heading segments after the first # (empty [] for source-level matches, literal [\"---frontmatter---\"] for frontmatter-block matches with the plugin's sentinel preserved verbatim, multi-segment for nested-heading blocks); score is the raw plugin-returned number with embedding-model-dependent semantics (pass-through; no clamp/normalise/round). Sort order: primary score descending, secondary path byte-ascending, tertiary headingPath.join('#') byte-ascending. Non-finite scores (NaN / Infinity / null / missing) are silently dropped. Requires the Smart Connections plugin (by Brian Petro; minimum probed v4.5.0) to be installed AND its indexing to have completed AND an embed model configured; otherwise surfaces SMART_CONNECTIONS_NOT_INSTALLED / SMART_CONNECTIONS_NOT_READY (with details.reason='api-missing' or 'embed-failed') via CLI_REPORTED_ERROR(stage:'envelope-error'). VAULT_NOT_FOUND carries a details.reason sub-discriminator: \"unknown\" (vault not registered) vs \"not-open\" (registered but not currently open in Obsidian — the CLI transparently opens the vault as a side effect; retry after a brief delay). Error-precedence chain (outer-to-inner, cheapest-first): VAULT_NOT_FOUND(unknown) → VAULT_NOT_FOUND(not-open) → SMART_CONNECTIONS_NOT_INSTALLED → SMART_CONNECTIONS_NOT_READY(api-missing) → SMART_CONNECTIONS_NOT_READY(embed-failed) → success. Call help({ tool_name: \"smart_connections_query\" }) for full parameter docs, the count-only example, the closed-vault retry pattern, the eight documented inherited limitations (embedding-model-dependent score bands; indexing freshness; folder exclusions; plugin-version drift; local-model silent query truncation; embed-call latency cap (10s); stale-index reverse direction; low-information query fallback), and the full five-entry error roster.";

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
