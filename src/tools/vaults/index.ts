// Original — no upstream. vaults tool registration: wraps `obsidian vaults verbose` 1:1 (ADR-010 rule 1), read-only (068 FR-024, FR-036).
import { registerTool } from "../_register.js";
import { executeVaults, type ExecuteDeps } from "./handler.js";
import { vaultsInputSchema, vaultsOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const VAULTS_TOOL_NAME = "vaults";

export const VAULTS_DESCRIPTION =
  "List every vault Obsidian knows, with the name other tools take as `vault` and the vault's folder. Use it to find the exact vault name to pass to another tool, including a vault added after the server started.";

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
