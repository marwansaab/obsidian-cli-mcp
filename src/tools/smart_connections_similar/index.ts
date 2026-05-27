// Original — no upstream. smart_connections_similar tool registration via registerTool — plugin-backed semantic-similarity primitive returning a typed { count, matches: [{ path, headingPath, score }] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeSmartConnectionsSimilar, type ExecuteDeps } from "./handler.js";
import { smartConnectionsSimilarInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const SMART_CONNECTIONS_SIMILAR_TOOL_NAME = "smart_connections_similar";

export const SMART_CONNECTIONS_SIMILAR_DESCRIPTION =
  `Return semantically-similar block-level matches for a single source note via the Smart Connections plugin's similarity API. Returns { count, matches: [{ path, headingPath, score }] }.

Targeting: target_mode discriminator. Specific mode: target_mode + vault + exactly one of file/path. Active mode: target_mode only (operates on the focused note in the focused vault).

Caps: optional integer limit (1..100, default 20) caps the matches list AND the count. Setting total:true populates count and returns matches:[] for a token-economical pre-flight read; the envelope shape is uniform across both modes.

Per-match shape: path is the source file's vault-relative path with .md extension (everything before the first # in the plugin's match key); headingPath is an array of heading segments after the first # (empty [] for source-level matches, literal [\"---frontmatter---\"] for frontmatter-block matches with the plugin's sentinel preserved verbatim, multi-segment for nested-heading blocks); score is the raw plugin-returned number with embedding-model-dependent semantics (pass-through; no clamp/normalise/round).

Sort order: primary score descending, secondary path byte-ascending, tertiary headingPath.join('#') byte-ascending. Non-finite scores (NaN / Infinity / null / missing) are silently dropped; source-path-keyed self-exclusion removes the source note AND any block inside the source from the result list.

Plugin dependency: requires the Smart Connections plugin (by Brian Petro; minimum probed v4.5.0) to be installed AND its indexing to have completed in the target vault; otherwise surfaces SMART_CONNECTIONS_NOT_INSTALLED / SMART_CONNECTIONS_NOT_READY / SOURCE_NOT_INDEXED via CLI_REPORTED_ERROR(stage:'envelope-error').

Vault states: VAULT_NOT_FOUND carries a details.reason sub-discriminator — "unknown" (vault not registered) vs "not-open" (registered but not currently open in Obsidian — the CLI transparently opens the vault as a side effect; retry after a brief delay). In practice closing a vault unloads the Integrated CLI plugin too, so the "not-open" path may surface as CLI_REPORTED_ERROR with stderr Error: Command 'eval' not found.; treat both as "vault unavailable, retry after Obsidian opens it".

Error-precedence chain (outer-to-inner, cheapest-first): VAULT_NOT_FOUND(unknown) → VAULT_NOT_FOUND(not-open) → SMART_CONNECTIONS_NOT_INSTALLED → NO_ACTIVE_FILE / FILE_NOT_FOUND → NOT_MARKDOWN → SMART_CONNECTIONS_NOT_READY → SOURCE_NOT_INDEXED → success.

Call help({ tool_name: "smart_connections_similar" }) for full parameter docs, the count-only example, the closed-vault retry pattern, the documented inherited limitations (embedding-model-dependent score bands; indexing freshness; folder exclusions; plugin-version drift; multi-vault basename ambiguity), and the full error roster.`;

export type RegisterDeps = ExecuteDeps;

export function createSmartConnectionsSimilarTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: SMART_CONNECTIONS_SIMILAR_TOOL_NAME,
    description: SMART_CONNECTIONS_SIMILAR_DESCRIPTION,
    schema: smartConnectionsSimilarInputSchema,
    deps,
    handler: async (input, d) => executeSmartConnectionsSimilar(input, d),
  });
}
