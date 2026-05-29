// Original — no upstream. Shared write_note handler-test fixtures (BI-058 F-E):
// fakeFs / fakeRegistry / deps + the OS-portable vault roots + EVAL_OK, extracted
// so handler.test.ts stays under 1000 lines. Vitest-free (plain async stubs — no
// test asserts on these mocks; writes/renames/mkdirs/unlinks are tracked via arrays,
// and the lazy-registry-probe tests build their own vi.fn spawn probe locally).
import { resolve } from "node:path";

import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { type ExecuteFs } from "./handler.js";

import type { SpawnLike } from "../../cli-adapter/_dispatch.js";
import type { Logger } from "../../logger.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";
import type { StubResponse } from "../_handler-test-fixtures.js";

// path.resolve makes these OS-portable absolute paths — POSIX hosts (CI on Linux)
// treat Windows-style "C:\..." literals as relative names, so the canonical-path
// check would resolve them under the cwd and trip PATH_ESCAPES_VAULT.
export const VAULT_ROOT = resolve("/test-vault");
export const FOO_ROOT = resolve("/foo-vault");
export const BAR_ROOT = resolve("/bar-vault");

export interface FakeWriteFs extends ExecuteFs {
  writes: Array<[string, string]>;
  renames: Array<[string, string]>;
  mkdirs: string[];
  unlinks: string[];
}

export function fakeFs(over: Partial<ExecuteFs> = {}): FakeWriteFs {
  const writes: Array<[string, string]> = [];
  const renames: Array<[string, string]> = [];
  const mkdirs: string[] = [];
  const unlinks: string[] = [];
  const enoent = (): NodeJS.ErrnoException => {
    const e = new Error("ENOENT") as NodeJS.ErrnoException;
    e.code = "ENOENT";
    return e;
  };
  const base: ExecuteFs = {
    mkdir: async (p: string) => {
      mkdirs.push(p);
    },
    writeFile: async (p: string, c: string) => {
      writes.push([p, c]);
    },
    rename: async (from: string, to: string) => {
      renames.push([from, to]);
    },
    realpath: async (p: string) => {
      // default: vault root identity; non-existent files throw ENOENT
      if (p === VAULT_ROOT || p === FOO_ROOT || p === BAR_ROOT) return p;
      // parent dirs are presumed-existing for the mkdir target check; throw for the
      // pre-write existence probe on the absPath itself
      throw enoent();
    },
    unlink: async (p: string) => {
      unlinks.push(p);
    },
  };
  const merged: ExecuteFs = { ...base, ...over };
  return Object.assign(merged, { writes, renames, mkdirs, unlinks });
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
