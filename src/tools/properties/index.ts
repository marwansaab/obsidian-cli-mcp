// Original — no upstream. properties tool registration via registerTool — vault-wide structural-discovery primitive returning a typed { count, properties: [{ name, noteCount }] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeProperties, type ExecuteDeps } from "./handler.js";
import { propertiesInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const PROPERTIES_TOOL_NAME = "properties";

export const PROPERTIES_DESCRIPTION =
  "List every distinct frontmatter property name in a vault with the per-property note count (returns { count, properties: [{ name, noteCount }] }) — vault-wide structural-discovery primitive that replaces \"obsidian_exec plus full-vault grep plus client-side dedup\" at one to two orders of magnitude less token cost. Vault-only surface — NO target_mode discriminator (no specific/active modes). Optional vault parameter; when omitted the focused vault is used. Setting total:true populates count and returns properties:[] for a token-economical pre-flight read; the envelope shape is uniform across both modes and the outer count value matches across both modes for the same vault state. Names sort case-insensitive-primary; the byte-order tiebreak originally documented in FR-013 is structurally unobservable post-BI-041 (upstream's case-insensitive collapse erases the inputs the tiebreak was designed to disambiguate). The upstream `type` metadata is dropped per FR-004 (future BI may expose it). MULTI-VAULT NOTE: the vault parameter is honoured by upstream — unregistered vault names surface as CLI_REPORTED_ERROR with details.message: \"Vault not found.\" (BI-042 reconciliation, empirical anchor 2026-05-21, obsidian-cli 1.12.7). Multi-vault users targeting a known vault pass it explicitly; agents preferring focused-vault default may omit the parameter. Empty vaults return { count: 0, properties: [] } in both modes. Call help({ tool_name: \"properties\" }) for full parameter docs, the count-only mode example, the multi-vault note, the sort-order note, the type-metadata-out-of-scope note, and the error-code roster.";

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
