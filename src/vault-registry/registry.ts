// Original — no upstream. Lazy vault-name → absolute-path map per ADR-009 / FR-012; cached for the MCP-server-process lifetime once the first probe succeeds, retried-on-failure with concurrent-first-call deduplication.
import { UpstreamError } from "../errors.js";

export interface VaultRegistryDeps {
  /** Bug-safe wrapper that runs `obsidian vaults verbose` and returns its stdout. */
  invokeProbe: () => Promise<string>;
}

export interface VaultRegistry {
  resolveVaultPath(vaultName: string): Promise<string>;
}

type CachedRegistry = ReadonlyMap<string, string>;

const BOM = "﻿";

function parseVaultsVerboseOutput(stdout: string): CachedRegistry {
  const map = new Map<string, string>();
  const body = stdout.startsWith(BOM) ? stdout.slice(1) : stdout;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.length === 0) continue;
    const tabIdx = line.indexOf("\t");
    if (tabIdx < 0) continue;
    const name = line.slice(0, tabIdx);
    const path = line.slice(tabIdx + 1);
    if (name.length === 0 || path.length === 0) continue;
    map.set(name, path);
  }
  return map;
}

export function createVaultRegistry(deps: VaultRegistryDeps): VaultRegistry {
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
      const known = cache ?? (await probe());
      const path = known.get(vaultName);
      if (path === undefined) {
        throw new UpstreamError({
          code: "VALIDATION_ERROR",
          cause: null,
          details: { requestedVault: vaultName, knownVaults: [...known.keys()] },
          message: `Vault "${vaultName}" is not registered with Obsidian. If it was added after the bridge started, restart the MCP server.`,
        });
      }
      return path;
    },
  };
}
