// Original — no upstream. tag tool registration via registerTool — vault-wide tag-index retrieval primitive returning a typed { count, paths } envelope (default mode) or a bare integer (count-only mode); responseFormat: "json" (default) wraps the result for the MCP wire. Fourteenth typed-tool wrap and the project's first tag-index primitive. Tool name `tag` follows ADR-010 single-word-verbatim-from-upstream (matches the upstream `obsidian tag` subcommand, even though the implementation routes through `eval` for case-insensitivity + child-subsumption + JSON output that the native subcommand does not provide).
import { registerTool } from "../_register.js";
import { executeTag, type ExecuteDeps } from "./handler.js";
import { tagInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const TAG_TOOL_NAME = "tag";

export const TAG_DESCRIPTION =
  `Find every Markdown note in a vault carrying a given tag. Returns \`{ count, paths: string[] }\` (default mode) or a bare integer (count-only mode).

Pick \`tag\` for tag-index lookups. Pick \`find_by_property\` for frontmatter property value lookups. Pick \`search\` / \`context_search\` for content-text matching.

Vault-only — NO \`target_mode\` discriminator.

Required \`tag\` (string): wrapper trims whitespace, strips a single leading \`#\`, then enforces non-empty / ≤200 chars / no empty hierarchical segments (rejects \`"/foo"\`, \`"foo/"\`, \`"foo//bar"\`). Unicode and symbols flow through verbatim — no charset regex.

**Hierarchical child-tag subsumption**: querying \`"project"\` returns notes tagged \`"project"\`, \`"project/alpha"\`, \`"project/alpha/v1"\` (segment-bounded; \`"projectile"\` is NOT a match).

**Case-insensitive matching** via ASCII lower-fold — query \`"ALPHA"\` matches stored \`#alpha\`. (Note: Obsidian's native \`tag\` subcommand is case-sensitive — the wrapper restores the tag-pane UX expectation.)

Both body inline tags (\`#tag\`) and frontmatter tag arrays (\`tags: [...]\`) contribute equally. Per-note de-duplication — a body that says \`#dup #dup\` contributes once.

Optional \`vault\` (string): routes to a named vault even when it is open but unfocused (B1 falsified — BI-0134 / ADR-031); omitted routes to the focused vault. Residual limit: genuine same-display-name collision (focus does not fix it — give colliding vaults distinct display names).

Optional \`total: true\` returns the bare integer count (token-economical pre-flight); the count is invariant across both modes for the same vault state.

Paths sort byte-ascending. Zero-match returns \`{ count: 0, paths: [] }\` (or \`0\` in count-only mode) — NEVER an error.

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\`; \`CLI_REPORTED_ERROR\` (\`VAULT_NOT_FOUND\` with sub-reasons \`unknown\` / \`not-open\`); \`CLI_TIMEOUT\`; \`CLI_OUTPUT_TOO_LARGE\`; \`CLI_BINARY_NOT_FOUND\`. Call \`help({ tool_name: "tag" })\` for worked examples, the inherited-limitation details (ASCII-only fold; metadataCache freshness; no pagination), and the full failure roster.`;

export type RegisterDeps = ExecuteDeps;

export function createTagTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: TAG_TOOL_NAME,
    description: TAG_DESCRIPTION,
    schema: tagInputSchema,
    deps,
    handler: async (input, d) => executeTag(input, d),
  });
}
