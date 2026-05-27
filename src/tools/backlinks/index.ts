// Original — no upstream. backlinks tool registration via registerTool — link-graph primitive returning a typed { count, backlinks: [{ source, count? }], truncated? } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeBacklinks, type ExecuteDeps } from "./handler.js";
import { backlinksInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const BACKLINKS_TOOL_NAME = "backlinks";

export const BACKLINKS_DESCRIPTION =
  `Return the flat ordered list of every source note that references a target Markdown note as a typed envelope \`{ count, backlinks: [{ source, count? }], truncated? }\`. Replaces "vault-wide body-text search for the target's name" at one to two orders of magnitude less token cost.

Inverse of \`links\` (which returns outgoing references from a single note); together the two surfaces give complete 1-hop link-graph reads.

Targeting: \`target_mode: "specific"\` + \`vault\` + EXACTLY ONE of \`file\` (wikilink) or \`path\` (vault-relative). Or \`target_mode: "active"\` for the currently-focused note.

Options:
- \`with_counts: true\` — decorates each per-source entry with an integer \`count\` aggregating all references from that source.
- \`total: true\` — count-only mode (\`backlinks: []\`). BYPASSES the implicit 1000-source cap and reports the full pre-cap count. Use for hub notes referenced by thousands of sources where only the headline number matters.
- \`limit\` (integer 1..10000) — overrides the implicit 1000-source cap on \`backlinks.length\` (entry-list modes only).

When the underlying source set exceeds the applied cap (in entry-list modes), the response includes \`truncated: true\` and carries the FIRST cap-many entries (sorted by source path UTF-16 ascending).

Source corpus is restricted to \`.md\` files only — \`.canvas\` / \`.base\` / plugin-config / attachment sources are excluded even if Obsidian's metadata cache lists them. Self-references ARE included (matching Obsidian's Backlinks pane). Aliased wikilinks attribute to the resolved target, not the alias text. Frontmatter-declared references contribute uniformly with body references. Code-block-only references are excluded (Obsidian's link parser does not extract them).

Cross-folder reach: when the target's basename is unique vault-wide, bare-basename wikilinks (\`[[<basename>]]\`) from any folder resolve to the target. When two notes share a case-folded basename, Obsidian's resolver picks one canonical destination and the other receives zero bare-basename backlinks — use folder-prefixed wikilinks to disambiguate.

Non-Markdown target locators (\`.canvas\`, \`.pdf\`, attachments) surface as \`CLI_REPORTED_ERROR\` with \`details.code: "NOT_MARKDOWN"\`. Unknown vault display names surface as \`CLI_REPORTED_ERROR\` with \`details.message: "Vault not found."\` (no silent routing to focused vault).

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\`, \`CLI_REPORTED_ERROR\` (with sub-discriminators \`VAULT_NOT_FOUND\` / \`FILE_NOT_FOUND\` / \`NOT_MARKDOWN\`), \`ERR_NO_ACTIVE_FILE\`, \`CLI_NON_ZERO_EXIT\`, \`CLI_BINARY_NOT_FOUND\`. Call \`help({ tool_name: "backlinks" })\` for worked examples (with_counts / total / capped / truncated), the self-reference + frontmatter-inclusion semantics, and the full error roster with recovery hints.`;

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
