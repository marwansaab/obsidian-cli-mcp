// Original — no upstream. Resolves the file a CLI-pass-through tool (read, rename, move, outline) will act on, so its file-type check runs on that file however it is addressed (spec 070 FR-009, research D3): `path` as given (no CLI call), `file` through the `obsidian file` TSV resolver, `active` through the focused-file eval plus the vault display name the tool forwards in specific mode. Composes the shared `_active-file.ts` resolvers; resolution failures surface unchanged.
import {
  resolveActiveFocusedFile,
  resolveFileByTsv,
  resolveVaultDisplayName,
  type EvalDeps,
} from "./_active-file.js";

import type { VaultRegistry } from "../vault-registry/registry.js";

/** The target-mode locator fields every file-path tool's input carries. */
export interface FileTargetInput {
  target_mode: "specific" | "active";
  vault?: string;
  file?: string;
  path?: string;
}

export interface FileTarget {
  /** Vault-relative path of the file the tool will act on. */
  relPath: string;
  /** Active mode only: the focused vault's display name, for the specific-mode `vault=` the tool forwards. */
  activeVault?: string;
}

export async function resolveFileTarget(
  input: FileTargetInput,
  deps: EvalDeps & { vaultRegistry: VaultRegistry },
  toolName: string,
): Promise<FileTarget> {
  if (input.target_mode === "active") {
    const { vaultRoot, relPath } = await resolveActiveFocusedFile(deps, toolName);
    return { relPath, activeVault: resolveVaultDisplayName(deps.vaultRegistry, vaultRoot) };
  }
  if (input.path !== undefined) return { relPath: input.path };
  return { relPath: await resolveFileByTsv(deps, input.vault!, input.file!, toolName) };
}

/**
 * The locator the tool forwards to its action command: `file=` / `path=` exactly as given in
 * specific mode (the action command resolves a `file` name the way the check did), or the
 * resolved `path=` in the focused vault for active mode, so the CLI acts on the file that was
 * checked even if focus moves in between.
 */
export function forwardedLocator(
  input: FileTargetInput,
  target: FileTarget,
): { vault: string; parameters: Record<string, string> } {
  if (input.target_mode === "active") {
    return { vault: target.activeVault!, parameters: { path: target.relPath } };
  }
  return {
    vault: input.vault!,
    parameters: input.file !== undefined ? { file: input.file } : { path: input.path! },
  };
}
