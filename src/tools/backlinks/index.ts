// Original — no upstream. backlinks tool registration via registerTool — link-graph primitive returning a typed { count, backlinks: [{ source, count? }], truncated? } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeBacklinks, type ExecuteDeps } from "./handler.js";
import { backlinksInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const BACKLINKS_TOOL_NAME = "backlinks";

export const BACKLINKS_DESCRIPTION =
  "Return the flat ordered list of every source note that references a target Markdown note (returns { count, backlinks: [{ source, count? }], truncated? }) — link-graph primitive that replaces \"vault-wide body-text search\" for the inbound-reference case at one to two orders of magnitude less token cost. Inverse of the outgoing-links sibling `links`; together the two surfaces give complete 1-hop link-graph reads from any note. Discriminated by target_mode. Specific mode: target_mode + vault + exactly one of file/path. Active mode: target_mode only (operates on the focused note in the focused vault). Setting with_counts:true decorates each per-source entry with an integer count aggregating all references from that source. Setting total:true populates count and returns backlinks:[] for a token-economical pre-flight read; per the 2026-05-17 clarification, total:true BYPASSES the implicit 1000-source cap and reports the full pre-cap source-note count. The optional limit field (range 1..10000) overrides the implicit cap; when the underlying source set exceeds the applied cap (in entry-list modes only), the response includes truncated:true. Source corpus is restricted to .md files only (per the 2026-05-17 clarification); .canvas/.base/plugin-config/attachment sources are excluded even if upstream classifies them as link-carrying. Self-references are INCLUDED in the listing (matching Obsidian's Backlinks pane semantic). Aliased wikilinks are attributed to the resolved target, not the alias text. Frontmatter-declared references contribute uniformly with body references. Code-block-only references are excluded (defers to the host's link parser). Non-Markdown TARGET locators (.canvas, .pdf, attachments) are rejected as CLI_REPORTED_ERROR. Unknown vault display names emit a structured CLI_REPORTED_ERROR via the inherited cli-adapter classifier (multi-vault callers must supply a registered name; no silent routing to focused vault). Call help({ tool_name: \"backlinks\" }) for full parameter docs, the with_counts / total / capped / truncated examples, the self-reference note, the frontmatter-inclusion note, the multi-vault structured-error note, the cross-pointer to the outgoing-links sibling (links), and the error-code roster.";

export type RegisterDeps = ExecuteDeps;

export function createBacklinksTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: BACKLINKS_TOOL_NAME,
    description: BACKLINKS_DESCRIPTION,
    schema: backlinksInputSchema,
    deps,
    handler: async (input, d) => executeBacklinks(input, d),
  });
}
