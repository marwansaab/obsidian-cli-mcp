// Original — no upstream. tag tool registration via registerTool — vault-wide tag-index retrieval primitive returning a typed { count, paths } envelope (default mode) or a bare integer (count-only mode); responseFormat: "json" (default) wraps the result for the MCP wire. Fourteenth typed-tool wrap and the project's first tag-index primitive. Tool name `tag` follows ADR-010 single-word-verbatim-from-upstream (matches the upstream `obsidian tag` subcommand, even though the implementation routes through `eval` for case-insensitivity + child-subsumption + JSON output that the native subcommand does not provide).
import { registerTool } from "../_register.js";
import { executeTag, type ExecuteDeps } from "./handler.js";
import { tagInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const TAG_TOOL_NAME = "tag";

export const TAG_DESCRIPTION =
  'Return the vault-relative paths of every Markdown note carrying a given tag (returns { count, paths: string[] } in default mode, or a bare integer in count-only mode) — fourteenth typed-tool wrap and the project\'s first tag-index retrieval primitive. Vault-only surface — NO target_mode discriminator (no specific/active modes). Required tag (string): wrapper trims whitespace, strips a single leading "#", then enforces non-empty / ≤200 chars / no empty hierarchical segments (rejects "/foo", "foo/", "foo//bar"). NO charset regex — Unicode + symbols flow through verbatim (Q2 lock). Hierarchical child-tag subsumption: querying "project" returns notes tagged "project", "project/alpha", "project/alpha/v1" (segment-bounded; "projectile" is NOT a match per the trailing-slash precision rule). Case-insensitive matching: query "ALPHA" matches stored "#alpha" via wrapper-side ASCII lower-fold inside the eval template (Obsidian\'s native `tag` subcommand is case-sensitive — wrapper restores the tag-pane UX expectation). Both body inline tags (#tag) and frontmatter tag arrays (tags: [...]) contribute equally (Q3 defer-to-upstream metadataCache). Optional vault (string, min 1 char; routes to focused vault when omitted); inherited multi-vault basename limitation (open the target vault first in Obsidian). Optional total:true returns the bare integer count without the paths array (token-economical pre-flight); the count is invariant across both modes for the same vault state. Paths sort wrapper-side byte-ascending (Q5 lock; parity with smart_connections_similar / smart_connections_query). Per-note Set de-duplicates same-tag-multiple-occurrences (a body that says #dup #dup contributes once). Zero-match returns { count: 0, paths: [] } in default mode or 0 in count-only mode — NEVER an error. Closed-but-registered vault detected via the shared `_eval-vault-closed-detection` module → CLI_REPORTED_ERROR(details.code:"VAULT_NOT_FOUND", details.reason:"not-open"); unknown vault → CLI_REPORTED_ERROR(details.code:"VAULT_NOT_FOUND") via the cli-adapter\'s 011-R5 inheritance. Call help({ tool_name: "tag" }) for the full parameter docs, eight worked examples, the six documented inherited limitations (basename ambiguity; ASCII-only lower-fold; metadataCache freshness; output cap inherited from cli-adapter; no pagination at v1; Markdown-only tag-cache scope), and the six-entry failure roster.';

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
