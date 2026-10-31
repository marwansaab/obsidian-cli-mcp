// Original — no upstream. Shared prepend handler-test fixtures (BI-058 F-E):
// the per-tool fakeFs / fakeRegistry / deps builders + canned spawn responses,
// extracted so prepend's handler tests can split across handler.test.ts (BI-045
// US1–US4) and handler.bi047.test.ts (the byte-delta-guard cohort) with each file
// under 1000 lines, without duplicating the preamble. Vitest-free by design —
// plain async stubs, not vi.fn (fs.statCalls / readCalls / writes / renames /
// unlinks are tracked manually) — so the build keeps it a harmless dist orphan.
// Spec 076: fakeFs replays a `contents` sequence through readFile and records the
// corrective atomic write (writeFile + rename) of the empty-note fix.
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
  readCalls: string[];
  writes: Array<{ path: string; content: string }>;
  renames: Array<{ from: string; to: string }>;
  unlinks: string[];
}

/**
 * `sizes` and `contents` replay in call order, the last value repeating. A `contents` entry
 * that is an Error is thrown by that `readFile` call instead of returned.
 */
export function fakeFs(
  opts: { sizes?: number[]; contents?: Array<string | Error>; over?: Partial<ExecuteFs> } = {},
): FakeFsHandle {
  const statCalls: string[] = [];
  const readCalls: string[] = [];
  const writes: Array<{ path: string; content: string }> = [];
  const renames: Array<{ from: string; to: string }> = [];
  const unlinks: string[] = [];
  const sizes = opts.sizes ?? [0, 0];
  const contents = opts.contents ?? [""];
  let statIdx = 0;
  let readIdx = 0;
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
    readFile: async (p: string) => {
      readCalls.push(p);
      const entry = contents[readIdx] ?? contents[contents.length - 1] ?? "";
      readIdx += 1;
      if (entry instanceof Error) throw entry;
      return entry;
    },
    writeFile: async (p: string, content: string) => {
      writes.push({ path: p, content });
    },
    rename: async (from: string, to: string) => {
      renames.push({ from, to });
    },
    unlink: async (p: string) => {
      unlinks.push(p);
    },
  };
  const merged: ExecuteFs = { ...base, ...opts.over };
  return Object.assign(merged, { statCalls, readCalls, writes, renames, unlinks });
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
