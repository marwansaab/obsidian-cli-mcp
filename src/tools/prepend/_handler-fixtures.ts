// Original — no upstream. Shared prepend handler-test fixtures (BI-058 F-E):
// the per-tool fakeFs / fakeRegistry / deps builders + canned spawn responses,
// extracted so prepend's handler tests can split across handler.test.ts (BI-045
// US1–US4) and handler.bi047.test.ts (the byte-delta-guard cohort) with each file
// under 1000 lines, without duplicating the preamble. Vitest-free by design —
// plain async stubs, not vi.fn (no test asserts on these mocks; fs.statCalls is
// tracked manually) — so the build keeps it a harmless dist orphan.
import { resolve } from "node:path";

import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { type ExecuteFs } from "./handler.js";

import type { SpawnLike } from "../../cli-adapter/_dispatch.js";
import type { Logger } from "../../logger.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";
import type { StubResponse } from "../_handler-test-fixtures.js";

export const VAULT_ROOT = resolve("/test-vault");

export interface FakeFsHandle extends ExecuteFs {
  statCalls: string[];
}

export function fakeFs(opts: { sizes?: number[]; over?: Partial<ExecuteFs> } = {}): FakeFsHandle {
  const statCalls: string[] = [];
  const sizes = opts.sizes ?? [0, 0];
  let statIdx = 0;
  const base: ExecuteFs = {
    realpath: async (p: string) => {
      if (p === VAULT_ROOT) return VAULT_ROOT;
      const e = new Error("ENOENT") as NodeJS.ErrnoException;
      e.code = "ENOENT";
      throw e;
    },
    stat: async (p: string) => {
      statCalls.push(p);
      const size = sizes[statIdx] ?? sizes[sizes.length - 1] ?? 0;
      statIdx += 1;
      return { size };
    },
  };
  const merged: ExecuteFs = { ...base, ...opts.over };
  return Object.assign(merged, { statCalls });
}

export function fakeRegistry(map: Record<string, string>): VaultRegistry {
  return {
    resolveVaultPath: async (name: string) => {
      const path = map[name];
      if (path === undefined) {
        throw new UpstreamError({
          code: "VALIDATION_ERROR",
          cause: null,
          details: { requestedVault: name, knownVaults: Object.keys(map) },
          message: `Vault "${name}" is not registered.`,
        });
      }
      return path;
    },
    resolveVaultDisplayName: (basePath: string) => {
      for (const [name, path] of Object.entries(map)) {
        if (path === basePath) return name;
      }
      return null;
    },
  };
}

export function deps(opts: {
  spawnFn: SpawnLike;
  vaultRegistry: VaultRegistry;
  fs?: ExecuteFs;
  logger?: Logger;
}) {
  return {
    logger: opts.logger ?? silentLogger(),
    queue: createQueue(),
    vaultRegistry: opts.vaultRegistry,
    spawnFn: opts.spawnFn,
    env: {},
    fs: opts.fs,
  };
}

export const PREPEND_OK: StubResponse = { stdout: "", exitCode: 0 };
export const FILE_TSV_OK = (relPath: string): StubResponse => ({
  stdout: `path\t${relPath}\n`,
  exitCode: 0,
});
