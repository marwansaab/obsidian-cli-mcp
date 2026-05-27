// Original — no upstream. properties tool registration via registerTool — vault-wide structural-discovery primitive returning a typed { count, properties: [{ name, noteCount }] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeProperties, type ExecuteDeps } from "./handler.js";
import { propertiesInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const PROPERTIES_TOOL_NAME = "properties";

export const PROPERTIES_DESCRIPTION =
  `Vault-wide catalogue of frontmatter property names with per-property note counts. Returns \`{ count, properties: [{ name, noteCount }] }\`. Replaces "obsidian_exec plus full-vault grep plus client-side dedup" at one to two orders of magnitude less token cost.

Pick \`properties\` for the property-name catalogue. Pick \`read_property\` to read one value in one note. Pick \`find_by_property\` to find notes by a property value. Pick \`set_property\` to write one. Pick \`obsidian_exec\` for frequency-ordered (\`sort=count\`) or other native upstream output.

Vault-only — NO \`target_mode\` discriminator.

Optional \`vault\` (string): routes to a named vault; omitted routes to the focused vault. Honoured by upstream — unregistered names surface as \`CLI_REPORTED_ERROR\` with \`details.message: "Vault not found."\`.

Optional \`total: true\`: returns \`{ count, properties: [] }\` for a token-economical pre-flight read; \`count\` is invariant across both modes for the same vault state.

Names sort alphabetically ascending, case-insensitive. Upstream applies case-insensitive collapse — two notes carrying \`AaTest\` and \`aatest\` produce one merged entry with \`noteCount\` summing both contributors (reported casing is upstream's choice, typically first-encountered). Empty vaults return \`{ count: 0, properties: [] }\` in both modes.

Upstream's per-entry \`type\` field (\`aliases\`, \`text\`, \`date\`, \`multitext\`, \`number\`, \`tags\`, \`checkbox\`, etc.) is dropped — type-aware enumeration is out of scope; route through \`obsidian_exec\` if you need it.

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` (unknown top-level key, empty \`vault\`, non-boolean \`total\`); \`CLI_REPORTED_ERROR\` (\`Vault not found.\`); \`CLI_NON_ZERO_EXIT\` / \`CLI_OUTPUT_TOO_LARGE\` (pathologically large inventories — use \`total: true\` to bypass); \`CLI_BINARY_NOT_FOUND\`. No \`ERR_NO_ACTIVE_FILE\` — this tool has no active mode.

Call \`help({ tool_name: "properties" })\` for worked examples, the case-variant collapse semantics, and recovery hints.`;

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
