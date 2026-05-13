// Original — no upstream. properties tool registration via registerTool — vault-wide structural-discovery primitive returning a typed { count, properties: [{ name, noteCount }] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeProperties, type ExecuteDeps } from "./handler.js";
import { propertiesInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const PROPERTIES_TOOL_NAME = "properties";

export const PROPERTIES_DESCRIPTION =
  "List every distinct frontmatter property name in a vault with the per-property note count (returns { count, properties: [{ name, noteCount }] }) — vault-wide structural-discovery primitive that replaces \"obsidian_exec plus full-vault grep plus client-side dedup\" at one to two orders of magnitude less token cost. Vault-only surface — NO target_mode discriminator (no specific/active modes). Optional vault parameter; when omitted the focused vault is used. Setting total:true populates count and returns properties:[] for a token-economical pre-flight read; the envelope shape is uniform across both modes and the outer count value matches across both modes for the same vault state. Names sort case-insensitive-primary with byte-order tiebreak — case-distinct duplicates (`Tags` next to `tags`) appear adjacent for drift-detection workflows. The upstream `type` metadata is dropped per FR-004 (future BI may expose it). MULTI-VAULT INHERITED LIMITATION: the vault parameter is silently honoured-as-noop by the upstream CLI — multi-vault users open the target vault before invoking. Empty vaults return { count: 0, properties: [] } in both modes. Call help({ tool_name: \"properties\" }) for full parameter docs, the count-only mode example, the multi-vault inherited limitation, the sort-order note, the type-metadata-out-of-scope note, and the error-code roster.";

export type RegisterDeps = ExecuteDeps;

export function createPropertiesTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: PROPERTIES_TOOL_NAME,
    description: PROPERTIES_DESCRIPTION,
    schema: propertiesInputSchema,
    deps,
    handler: async (input, d) => executeProperties(input, d),
  });
}
