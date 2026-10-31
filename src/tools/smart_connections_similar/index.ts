// Original — no upstream. smart_connections_similar tool registration via registerTool — plugin-backed semantic-similarity primitive returning a typed { count, matches: [{ path, headingPath, score }] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { type ExecuteDeps, executeSmartConnectionsSimilar, SMART_CONNECTIONS_SIMILAR_SUPPORTED } from "./handler.js";
import { smartConnectionsSimilarInputSchema, smartConnectionsSimilarOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const SMART_CONNECTIONS_SIMILAR_TOOL_NAME = "smart_connections_similar";

export const SMART_CONNECTIONS_SIMILAR_DESCRIPTION =
  `Return semantically-similar block-level matches for a single source note via the Smart Connections plugin's similarity API. Returns { count, matches: [{ path, headingPath, score }] }. ${describeSupport(SMART_CONNECTIONS_SIMILAR_SUPPORTED)}

Caps: optional integer limit (1..100, default 20) caps the matches list AND the count. Setting total:true populates count and returns matches:[] for a token-economical pre-flight read; the envelope shape is uniform across both modes.

Per-match shape: path is the source file's vault-relative path with .md extension (everything before the first # in the plugin's match key); headingPath is an array of heading segments after the first # (empty [] for source-level matches, literal [\"---frontmatter---\"] for frontmatter-block matches with the plugin's sentinel preserved verbatim, multi-segment for nested-heading blocks); score is the raw plugin-returned number with embedding-model-dependent semantics (pass-through; no clamp/normalise/round).

Sort order: primary score descending, secondary path byte-ascending, tertiary headingPath.join('#') byte-ascending. Non-finite scores (NaN / Infinity / null / missing) are silently dropped; source-path-keyed self-exclusion removes the source note AND any block inside the source from the result list.

Plugin dependency: requires the Smart Connections plugin (by Brian Petro; minimum probed v4.5.0) to be installed AND its indexing to have completed in the target vault; otherwise surfaces SMART_CONNECTIONS_NOT_INSTALLED / SMART_CONNECTIONS_NOT_READY / SOURCE_NOT_INDEXED via CLI_REPORTED_ERROR(stage:'envelope-error').

Vault states: VAULT_NOT_FOUND carries a details.reason sub-discriminator — "unknown" (vault not registered).

Closed vault: a registered vault that is not open is opened automatically and the call returns its normal result (the first call takes longer). If it cannot be brought up — for example, its command-line integration is disabled — the call fails with CLI_REPORTED_ERROR whose details.stdout starts Error: Command "eval" not found. (vault unavailable): open the vault in Obsidian, then call again. This is a failure, never an empty result.

Error-precedence chain (outer-to-inner, cheapest-first): VAULT_NOT_FOUND(unknown) → SMART_CONNECTIONS_NOT_INSTALLED → NO_ACTIVE_FILE / FILE_NOT_FOUND → NOT_MARKDOWN → SMART_CONNECTIONS_NOT_READY → SOURCE_NOT_INDEXED → success.`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createSmartConnectionsSimilarTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: SMART_CONNECTIONS_SIMILAR_TOOL_NAME,
    title: "Smart Connections Similar",
    annotations: READ_ONLY_HINTS,
    description: SMART_CONNECTIONS_SIMILAR_DESCRIPTION,
    schema: smartConnectionsSimilarInputSchema,
    outputSchema: smartConnectionsSimilarOutputSchema,
    deps,
    handler: async (input, d) => executeSmartConnectionsSimilar(input, d),
  });
}
