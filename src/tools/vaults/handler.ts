// Original — no upstream. vaults handler: a fresh `obsidian vaults verbose` listing through the vault registry, which also refreshes the registry's name cache (068 R9, FR-036).
import { vaultsOutputSchema, type VaultsInput, type VaultsOutput } from "./schema.js";

import type { VaultLister } from "../../vault-registry/registry.js";

export interface ExecuteDeps {
  vaultRegistry: VaultLister;
}

export async function executeVaults(_input: VaultsInput, deps: ExecuteDeps): Promise<VaultsOutput> {
  const entries = await deps.vaultRegistry.list();
  // `open` is always null: the CLI reports no per-vault open marker (evidence-b4.md, R9).
  const vaults = entries.map(({ name, path }) => ({ name, path, open: null }));
  return vaultsOutputSchema.parse({ count: vaults.length, vaults });
}
