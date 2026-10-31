// Original — no upstream. Shared patch_block handler-test fixtures (spec 075 review): the
// fakeFs / fakeRegistry / deps builders + the canned eval response, extracted so the handler
// tests split across handler.test.ts (BI-043 US1–US3) and handler.bytes-written.test.ts (the
// spec 075 size change) without duplicating the preamble. Vitest-free by design — plain async
// stubs, not vi.fn (no test asserts on these mocks; reads/writes/renames/unlinks are tracked in
// arrays).
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
  reads: string[];
  writes: Array<[string, string]>;
  renames: Array<[string, string]>;
  unlinks: string[];
}

export function fakeFs(
  canned: { content?: string } = {},
  over: Partial<ExecuteFs> = {},
): FakeFsHandle {
  const reads: string[] = [];
  const writes: Array<[string, string]> = [];
  const renames: Array<[string, string]> = [];
  const unlinks: string[] = [];
  const enoent = (): NodeJS.ErrnoException => {
    const e = new Error("ENOENT") as NodeJS.ErrnoException;
    e.code = "ENOENT";
    return e;
  };
  const base: ExecuteFs = {
    readFile: async (p: string) => {
      reads.push(p);
      return canned.content ?? "fallback ^foo\n";
    },
    writeFile: async (p: string, c: string) => {
      writes.push([p, c]);
    },
    rename: async (from: string, to: string) => {
      renames.push([from, to]);
    },
    realpath: async (p: string) => {
      if (p === VAULT_ROOT) return VAULT_ROOT;
      throw enoent();
    },
    unlink: async (p: string) => {
      unlinks.push(p);
    },
  };
  const merged: ExecuteFs = { ...base, ...over };
  return Object.assign(merged, { reads, writes, renames, unlinks });
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

export const EVAL_OK: StubResponse = { stdout: "=> undefined\n", exitCode: 0 };
