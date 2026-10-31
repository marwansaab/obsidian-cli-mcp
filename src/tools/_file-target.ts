// Original — no upstream. Resolves the file a file-path tool will act on, so its file-type check runs on that file however it is addressed (spec 070 FR-009, research D3): `path` as given (no CLI call), `file` through the `obsidian file` TSV resolver, `active` through the focused-file eval plus the vault display name. `resolveFileTarget` serves the CLI-pass-through tools (read, rename, move, outline) and also returns the locator they forward; `resolveFsTarget` serves the direct-fs tools (append_note, prepend) and also returns the vault root. Composes the shared `_active-file.ts` resolvers; resolution failures surface unchanged.
import {
  resolveActiveLocatorWithVault,
  resolveFileByTsv,
  type ActiveLocatorWithVault,
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

type TargetDeps = EvalDeps & { vaultRegistry: VaultRegistry };

export interface FileTarget {
  /** Vault-relative path of the file the tool will act on. */
  relPath: string;
  /** The `vault=` the tool forwards: the input's vault, or the focused vault's display name in active mode. */
  vault: string;
  /**
   * The locator the tool forwards to its action command: `file=` / `path=` exactly as given in
   * specific mode (the action command resolves a `file` name the way the check did), or the
   * resolved `path=` for active mode, so the CLI acts on the file that was checked even if focus
   * moves in between.
   */
  locator: { file: string } | { path: string };
}

// Specific mode: `path` as given, or the `file` name resolved through the TSV resolver.
async function specificRelPath(input: FileTargetInput, deps: EvalDeps, toolName: string): Promise<string> {
  return input.path ?? resolveFileByTsv(deps, input.vault!, input.file!, toolName);
}

export async function resolveFileTarget(
  input: FileTargetInput,
  deps: TargetDeps,
  toolName: string,
): Promise<FileTarget> {
  if (input.target_mode === "active") {
    const { relPath, vaultDisplayName } = await resolveActiveLocatorWithVault(deps, toolName);
    return { relPath, vault: vaultDisplayName, locator: { path: relPath } };
  }
  const relPath = await specificRelPath(input, deps, toolName);
  return {
    relPath,
    vault: input.vault!,
    locator: input.file !== undefined ? { file: input.file } : { path: relPath },
  };
}

/**
 * The direct-fs tools' locator: the focused file in active mode, or in specific mode the
 * registry's vault root (resolved first, so an unknown vault fails before any CLI call) plus the
 * `path` / resolved `file`.
 */
export async function resolveFsTarget(
  input: FileTargetInput,
  deps: TargetDeps,
  toolName: string,
): Promise<ActiveLocatorWithVault> {
  if (input.target_mode === "active") return resolveActiveLocatorWithVault(deps, toolName);
  const vaultRoot = await deps.vaultRegistry.resolveVaultPath(input.vault!);
  const relPath = await specificRelPath(input, deps, toolName);
  return { vaultRoot, relPath, vaultDisplayName: input.vault! };
}
