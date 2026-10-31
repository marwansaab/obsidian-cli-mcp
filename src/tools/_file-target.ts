// Original — no upstream. Resolves the file a file-path tool will act on, so its file-type check runs on that file however it is addressed (spec 070 FR-009, research D3): `path` as given (no CLI call), `file` through the `obsidian file` TSV resolver, `active` through the focused-file eval. `resolveFileTarget` serves the CLI-pass-through tools (read, rename, move, outline) and also returns the locator they forward (active mode: the resolved `path=` with no `vault=`, so no vault registry is involved) and, in active mode only (narrowed by `vault === undefined`), the focused-file eval's vault root (spec 074: read's exact-content check); `resolveFsTarget` serves the direct-fs tools (append_note, prepend) and also returns the vault root and display name. Composes the shared `_active-file.ts` resolvers; resolution failures surface unchanged.
import {
  resolveActiveFocusedFile,
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

/**
 * `vault` is the `vault=` the tool forwards: the input's vault in specific mode; `undefined` in active
 * mode, so the CLI uses its current vault — the one the vault-less focused-file eval just read (T0 P6,
 * research D3). The vault registry is never consulted, so a reverse-lookup miss cannot turn into a
 * `vault=<absolute path>` the CLI rejects. Active mode instead carries `vaultRoot`, the vault's absolute
 * folder from the focused-file eval's `base` (spec 074); `vault === undefined` narrows to it.
 */
export type FileTarget = {
  /** Vault-relative path of the file the tool will act on. */
  relPath: string;
  /**
   * The locator the tool forwards to its action command: `file=` / `path=` exactly as given in
   * specific mode (the action command resolves a `file` name the way the check did), or the
   * resolved `path=` for active mode, so the CLI acts on the file that was checked even if focus
   * moves to another file in between.
   */
  locator: { file: string } | { path: string };
} & ({ vault: string; vaultRoot?: never } | { vault: undefined; vaultRoot: string });

// Specific mode: `path` as given, or the `file` name resolved through the TSV resolver.
async function specificRelPath(input: FileTargetInput, deps: EvalDeps, toolName: string): Promise<string> {
  return input.path ?? resolveFileByTsv(deps, input.vault!, input.file!, toolName);
}

export async function resolveFileTarget(
  input: FileTargetInput,
  deps: EvalDeps,
  toolName: string,
): Promise<FileTarget> {
  if (input.target_mode === "active") {
    const { vaultRoot, relPath } = await resolveActiveFocusedFile(deps, toolName);
    return { relPath, vault: undefined, locator: { path: relPath }, vaultRoot };
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
  deps: EvalDeps & { vaultRegistry: VaultRegistry },
  toolName: string,
): Promise<ActiveLocatorWithVault> {
  if (input.target_mode === "active") return resolveActiveLocatorWithVault(deps, toolName);
  const vaultRoot = await deps.vaultRegistry.resolveVaultPath(input.vault!);
  const relPath = await specificRelPath(input, deps, toolName);
  return { vaultRoot, relPath, vaultDisplayName: input.vault! };
}
