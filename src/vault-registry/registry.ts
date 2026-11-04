// Original — no upstream. Lazy vault-name → absolute-path map per ADR-009 / FR-012, built from `obsidian vaults verbose`; retried-on-failure with single-flight probes. 068 R9 (FR-036, FR-037): list() always re-probes and refreshes the cache, and a lookup that misses the cache re-probes once before failing, so a vault added after start-up is usable without a restart. BI-0121: the reverse (path → name) lookup probes on a miss the same way, so a first call that names no vault still resolves its display name.
import { UpstreamError } from "../errors.js";

export interface VaultRegistryDeps {
  /** Bug-safe wrapper that runs `obsidian vaults verbose` and returns its stdout. */
  invokeProbe: () => Promise<string>;
}

/** One row of `obsidian vaults verbose`: an Obsidian display name and its absolute path. */
export interface VaultEntry {
  name: string;
  path: string;
}

/**
 * The listing side of the registry, used only by the `vaults` tool. Kept apart from
 * `VaultRegistry` so the handlers that only resolve names (and their test stubs) are unchanged.
 */
export interface VaultLister {
  /**
   * Every vault Obsidian knows, in CLI order, duplicates kept. Always re-probes (joining a
   * probe already in flight) and refreshes the cache that `resolveVaultPath` reads (068 R9).
   */
  list(): Promise<readonly VaultEntry[]>;
}

export interface VaultRegistry {
  resolveVaultPath(vaultName: string): Promise<string>;
  /**
   * Reverse lookup: given a vault's absolute basePath, return the display name
   * registered for it, or `null` when no entry matches. Added for BI-040's
   * patch_heading active-mode envelope, which receives a basePath from the
   * focused-file eval and needs the matching display name for the response.
   * Like `resolveVaultPath`, a cold cache or a miss probes once before giving
   * up (BI-0121), so the first active-mode call of a process resolves too; a
   * probe failure propagates. Test stubs may answer synchronously.
   * Optional so test stubs that mock VaultRegistry without the reverse lookup
   * do not have to be retrofitted; the shared helper in `_active-file.ts`
   * treats a missing method like a `null` answer.
   */
  resolveVaultDisplayName?: (basePath: string) => string | null | Promise<string | null>;
}

/**
 * The registry `createVaultRegistry` builds, typed as it really is: the reverse lookup is always
 * present and always async. Consumers keep taking the looser `VaultRegistry`, so test stubs may
 * still omit it or answer synchronously.
 */
export interface ObsidianVaultRegistry extends VaultRegistry, VaultLister {
  resolveVaultDisplayName(basePath: string): Promise<string | null>;
}

interface CachedRegistry {
  /** Every parsed row, in CLI order, duplicate display names kept (068 data-model §6). */
  entries: readonly VaultEntry[];
  /** Name → path lookup; a duplicated display name resolves to its last row, as before. */
  byName: ReadonlyMap<string, string>;
  /**
   * Path → name lookup, built from `byName` so a duplicated display name only matches its last
   * row's path; when two names share a path, the first name in `byName` wins.
   */
  byPath: ReadonlyMap<string, string>;
}

const BOM = "﻿";

function parseVaultsVerboseOutput(stdout: string): CachedRegistry {
  const entries: VaultEntry[] = [];
  const body = stdout.startsWith(BOM) ? stdout.slice(1) : stdout;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.length === 0) continue;
    const tabIdx = line.indexOf("\t");
    if (tabIdx < 0) continue;
    const name = line.slice(0, tabIdx);
    const path = line.slice(tabIdx + 1);
    if (name.length === 0 || path.length === 0) continue;
    entries.push({ name, path });
  }
  const byName = new Map(entries.map((e) => [e.name, e.path]));
  const byPath = new Map<string, string>();
  for (const [name, path] of byName) {
    if (!byPath.has(path)) byPath.set(path, name);
  }
  return { entries, byName, byPath };
}

export function createVaultRegistry(deps: VaultRegistryDeps): ObsidianVaultRegistry {
  let cache: CachedRegistry | null = null;
  let inFlightProbe: Promise<CachedRegistry> | null = null;

  async function probe(): Promise<CachedRegistry> {
    if (inFlightProbe !== null) return inFlightProbe;
    inFlightProbe = (async () => {
      try {
        const stdout = await deps.invokeProbe();
        const parsed = parseVaultsVerboseOutput(stdout);
        cache = parsed;
        return parsed;
      } finally {
        inFlightProbe = null;
      }
    })();
    return inFlightProbe;
  }

  return {
    async resolveVaultPath(vaultName: string): Promise<string> {
      const cached = cache?.byName.get(vaultName);
      if (cached !== undefined) return cached;
      // First lookup, or a cache miss: probe once (068 FR-037), then fail if still unknown.
      const known = await probe();
      const path = known.byName.get(vaultName);
      if (path === undefined) {
        throw new UpstreamError({
          code: "VALIDATION_ERROR",
          cause: null,
          details: { requestedVault: vaultName, knownVaults: [...known.byName.keys()] },
          message: `Vault "${vaultName}" is not registered with Obsidian.`,
        });
      }
      return path;
    },
    async list(): Promise<readonly VaultEntry[]> {
      return (await probe()).entries;
    },
    async resolveVaultDisplayName(basePath: string): Promise<string | null> {
      // Cold cache or a miss: probe once (BI-0121, mirroring FR-037 above), then give up.
      return cache?.byPath.get(basePath) ?? (await probe()).byPath.get(basePath) ?? null;
    },
  };
}
