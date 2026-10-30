// Original — no upstream. vaults tool registration: wraps `obsidian vaults verbose` 1:1 (ADR-010 rule 1), read-only (068 FR-024, FR-036).
import { registerTool } from "../_register.js";
import { executeVaults, type ExecuteDeps } from "./handler.js";
import { vaultsInputSchema, vaultsOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const VAULTS_TOOL_NAME = "vaults";

export const VAULTS_DESCRIPTION =
  `List every vault Obsidian knows, with the name to pass as \`vault\` to other tools and the vault's folder. Takes no input.

Response: \`{ count: number, vaults: [{ name: string, path: string, open: boolean | null }] }\`. Vaults appear in the order the Obsidian CLI lists them; two vaults that share a name are both listed. \`open\` is null because the CLI does not report which vaults are open.

Every call reads Obsidian's current vault list, so a vault added after the server started is listed, and other tools can then target it by name without a restart.

Read-only: the tool never changes a vault.

Typed errors via \`UpstreamError.code\`: \`CLI_BINARY_NOT_FOUND\` (Obsidian CLI not installed); \`CLI_REPORTED_ERROR\` or \`CLI_TIMEOUT\` (Obsidian could not be reached, even after the usual auto-launch; an error is returned rather than an empty list); \`VALIDATION_ERROR\` (any input key given).`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createVaultsTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: VAULTS_TOOL_NAME,
    title: "Vaults",
    annotations: READ_ONLY_HINTS,
    description: VAULTS_DESCRIPTION,
    schema: vaultsInputSchema,
    outputSchema: vaultsOutputSchema,
    deps,
    handler: async (input, d) => executeVaults(input, d),
  });
}
