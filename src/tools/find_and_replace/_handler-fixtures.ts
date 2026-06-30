// Original — no upstream. Shared find_and_replace handler-test fixtures (BI-066):
// the captureLogger / fakeRegistry / inMemoryFs / baseDeps builders + canned spawn
// responses, extracted so the handler tests split across handler.test.ts (core
// US1–US4) and scope.test.ts (066 single-note scope) with each file under 1000
// lines, without duplicating the preamble. Vitest-free by design — plain async
// stubs, not vi.fn (the fs call-sites a test asserts on are tracked manually via
// FakeFsState.reads / .writes / .renames) — so the build keeps it a harmless dist
// orphan and coverage excludes it (`_*fixtures.ts`).
import { resolve, sep } from "node:path";
import { Writable } from "node:stream";

import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { type ExecuteDeps, type ExecuteFs } from "./handler.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";
import type { Dirent } from "node:fs";

export const VAULT_ROOT = resolve("/find-replace-vault");

export function captureLogger(events: Array<Record<string, unknown>>): Logger {
  return createLogger({
    stream: new Writable({
      write(chunk, _enc, cb) {
        try {
          events.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
        } catch {
          /* ignore */
        }
        cb();
      },
    }),
  });
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

export interface MemFile {
  abs: string;
  content: string;
}

function makeDirent(name: string, parentPath: string, isFileVal: boolean): Dirent {
  const d = {
    name,
    parentPath,
    path: parentPath,
    isFile: () => isFileVal,
    isDirectory: () => !isFileVal,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  };
  return d as unknown as Dirent;
}

export interface FakeFsState {
  files: Map<string, string>;
  /** Every path passed to readFile, in call order (incl. calls that then threw). */
  reads: string[];
  writes: Array<{ path: string; content: string }>;
  renames: Array<{ from: string; to: string }>;
  unlinks: string[];
  realpathOverride?: (p: string) => Promise<string>;
}

export function inMemoryFs(
  files: MemFile[],
  vaultRoot: string,
  options: {
    readErrorByRel?: Record<string, NodeJS.ErrnoException>;
    writeErrorByRel?: Record<string, NodeJS.ErrnoException>;
    renameErrorByRel?: Record<string, NodeJS.ErrnoException>;
    realpathOverride?: (p: string) => Promise<string>;
    readdirError?: NodeJS.ErrnoException;
    missingSubfolders?: Set<string>;
  } = {},
): { fs: ExecuteFs; state: FakeFsState } {
  const state: FakeFsState = {
    files: new Map(files.map((f) => [f.abs, f.content])),
    reads: [],
    writes: [],
    renames: [],
    unlinks: [],
  };
  const fs: ExecuteFs = {
    readdir: async (root: string, _opts) => {
      if (options.readdirError) throw options.readdirError;
      const entries: Dirent[] = [];
      // Emit a Dirent for every file whose absolute path lives under `root`.
      // (Recursive walk semantics — Node returns all descendants flattened.)
      for (const abs of state.files.keys()) {
        if (!abs.startsWith(root)) continue;
        const tail = abs.slice(root.length);
        if (!tail.startsWith(sep) && tail.length > 0) continue;
        // Compute parent dir and file name.
        const parentPath = abs.slice(0, abs.length - (abs.split(sep).pop()?.length ?? 0));
        const name = abs.split(sep).pop()!;
        const parentTrim = parentPath.endsWith(sep)
          ? parentPath.slice(0, -1)
          : parentPath;
        entries.push(makeDirent(name, parentTrim, true));
      }
      return entries;
    },
    readFile: async (p: string, _enc: "utf8") => {
      state.reads.push(p);
      const rel = p.replace(vaultRoot + sep, "").split(sep).join("/");
      if (options.readErrorByRel?.[rel]) throw options.readErrorByRel[rel];
      const content = state.files.get(p);
      if (content === undefined) {
        const e = new Error("ENOENT") as NodeJS.ErrnoException;
        e.code = "ENOENT";
        throw e;
      }
      return content;
    },
    writeFile: async (p: string, content: string) => {
      // The tmp path is `${abs}.${uuid}.tmp` — match the target by stripping the suffix.
      const targetMatch = p.match(/^(.+)\.[0-9a-f-]+\.tmp$/i);
      const target = targetMatch?.[1] ?? p;
      const rel = target.replace(vaultRoot + sep, "").split(sep).join("/");
      if (options.writeErrorByRel?.[rel]) throw options.writeErrorByRel[rel];
      state.writes.push({ path: p, content });
    },
    rename: async (from: string, to: string) => {
      const rel = to.replace(vaultRoot + sep, "").split(sep).join("/");
      if (options.renameErrorByRel?.[rel]) throw options.renameErrorByRel[rel];
      state.renames.push({ from, to });
      const writeEntry = state.writes.find((w) => w.path === from);
      if (writeEntry) state.files.set(to, writeEntry.content);
    },
    unlink: async (p: string) => {
      state.unlinks.push(p);
    },
    realpath: async (p: string) => {
      if (options.realpathOverride) return options.realpathOverride(p);
      if (p === vaultRoot) return vaultRoot;
      // Treat subfolder paths under vaultRoot as existing only if they don't
      // appear in missingSubfolders.
      const rel = p.replace(vaultRoot + sep, "").split(sep).join("/");
      if (options.missingSubfolders?.has(rel)) {
        const e = new Error("ENOENT") as NodeJS.ErrnoException;
        e.code = "ENOENT";
        throw e;
      }
      if (p.startsWith(vaultRoot)) return p;
      const e = new Error("ENOENT") as NodeJS.ErrnoException;
      e.code = "ENOENT";
      throw e;
    },
  };
  return { fs, state };
}

export function relToAbs(rel: string): string {
  return resolve(VAULT_ROOT, rel.split("/").join(sep));
}

export function baseDeps(over: Partial<ExecuteDeps> = {}): ExecuteDeps {
  return {
    logger: over.logger ?? silentLogger(),
    queue: over.queue ?? createQueue(),
    vaultRegistry: over.vaultRegistry ?? fakeRegistry({ V: VAULT_ROOT }),
    fs: over.fs,
    randomUUID: over.randomUUID ?? (() => "00000000-0000-0000-0000-000000000000"),
    invokeEval: over.invokeEval,
    env: over.env ?? {},
    spawnFn: over.spawnFn,
    warn: over.warn,
  };
}

export const FILE_TSV_OK = (relPath: string): { stdout: string; exitCode: number } => ({
  stdout: `path\t${relPath}\nname\t${relPath.split("/").pop()}\nextension\tmd\n`,
  exitCode: 0,
});

export const ACTIVE_EVAL = (relPath: string | null): { stdout: string; exitCode: number } => ({
  stdout: "=> " + JSON.stringify({ path: relPath, base: VAULT_ROOT }),
  exitCode: 0,
});
