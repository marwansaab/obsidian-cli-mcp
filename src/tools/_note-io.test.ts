// Original — no upstream. Unit tests for the shared note-write substrate (_note-io.ts, F6 of the
// thermo-nuclear code-quality review): the UUID-uniquified atomic tmp+rename write (raw-error rethrow,
// rename-failure unlink, writeFile-failure no-unlink) and the best-effort metadataCache-invalidation
// eval round-trip (argv shape + silent-on-failure contract).
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { Writable } from "node:stream";

import { describe, expect, test } from "vitest";

import { invalidateMetadataCache, writeAtomic, type AtomicWriteFs } from "./_note-io.js";
import { createLogger } from "../logger.js";
import { createQueue } from "../queue.js";

import type { EvalDeps } from "./_active-file.js";
import type { SpawnLike } from "../cli-adapter/cli-adapter.js";

const sink = new Writable({ write(_chunk, _enc, cb) { cb(); } });

const FIXED_UUID = (): string => "fixed-uuid";

function recordingFs(over: Partial<AtomicWriteFs> = {}): {
  fs: AtomicWriteFs;
  calls: Array<{ op: string; args: string[] }>;
} {
  const calls: Array<{ op: string; args: string[] }> = [];
  const fs: AtomicWriteFs = {
    writeFile: async (p, content) => {
      calls.push({ op: "writeFile", args: [p, content] });
    },
    rename: async (from, to) => {
      calls.push({ op: "rename", args: [from, to] });
    },
    unlink: async (p) => {
      calls.push({ op: "unlink", args: [p] });
    },
    ...over,
  };
  return { fs, calls };
}

describe("writeAtomic", () => {
  test("writes to a UUID-uniquified tmp sibling then renames onto the target", async () => {
    const { fs, calls } = recordingFs();
    await writeAtomic(fs, "/vault/a.md", "hello", FIXED_UUID);
    expect(calls).toEqual([
      { op: "writeFile", args: ["/vault/a.md.fixed-uuid.tmp", "hello"] },
      { op: "rename", args: ["/vault/a.md.fixed-uuid.tmp", "/vault/a.md"] },
    ]);
  });

  test("rethrows the RAW error and unlinks the tmp when rename fails", async () => {
    const renameErr = Object.assign(new Error("EBUSY"), { code: "EBUSY" });
    const unlinked: string[] = [];
    const { fs } = recordingFs({
      rename: async () => {
        throw renameErr;
      },
      unlink: async (p) => {
        unlinked.push(p);
      },
    });
    await expect(writeAtomic(fs, "/vault/a.md", "x", FIXED_UUID)).rejects.toBe(renameErr);
    expect(unlinked).toEqual(["/vault/a.md.fixed-uuid.tmp"]);
  });

  test("swallows an unlink failure during rename-failure cleanup (original error still propagates)", async () => {
    const renameErr = new Error("rename failed");
    const { fs } = recordingFs({
      rename: async () => {
        throw renameErr;
      },
      unlink: async () => {
        throw new Error("unlink also failed");
      },
    });
    await expect(writeAtomic(fs, "/vault/a.md", "x", FIXED_UUID)).rejects.toBe(renameErr);
  });

  test("rethrows the RAW error and does NOT unlink when writeFile fails (no tmp exists yet)", async () => {
    const writeErr = new Error("ENOSPC");
    const unlinked: string[] = [];
    const { fs } = recordingFs({
      writeFile: async () => {
        throw writeErr;
      },
      unlink: async (p) => {
        unlinked.push(p);
      },
    });
    await expect(writeAtomic(fs, "/vault/a.md", "x", FIXED_UUID)).rejects.toBe(writeErr);
    expect(unlinked).toEqual([]);
  });
});

/** A SpawnLike that records the argv it was handed and emits a one-shot stdout/exit lifecycle. */
function recordingSpawn(opts: {
  stdout?: string;
  exitCode?: number;
  onArgv?: (argv: readonly string[]) => void;
}): SpawnLike {
  return (binary, argv) => {
    void binary;
    opts.onArgv?.(argv);
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 7;
    child.kill = () => true;
    setImmediate(() => {
      if (opts.stdout) child.stdout.push(Buffer.from(opts.stdout, "utf8"));
      child.stdout.push(null);
      child.stderr.push(null);
      setImmediate(() => child.emit("exit", opts.exitCode ?? 0, null));
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
}

function evalDeps(spawnFn: SpawnLike): EvalDeps {
  return { logger: createLogger({ stream: sink }), queue: createQueue(), spawnFn };
}

describe("invalidateMetadataCache", () => {
  test("evals computeMetadataAsync against the absolute path and resolves", async () => {
    let argv: readonly string[] | null = null;
    const spawnFn = recordingSpawn({ stdout: "=> undefined", onArgv: (a) => (argv = a) });
    await expect(
      invalidateMetadataCache(evalDeps(spawnFn), "/vault/Notes/a.md"),
    ).resolves.toBeUndefined();
    expect(argv).not.toBeNull();
    const joined = argv!.join(" ");
    expect(joined).toContain("computeMetadataAsync");
    expect(joined).toContain("/vault/Notes/a.md");
  });

  test("swallows an upstream failure (write already landed)", async () => {
    const spawnFn = recordingSpawn({ stdout: "Error: boom\n", exitCode: 1 });
    await expect(
      invalidateMetadataCache(evalDeps(spawnFn), "/vault/a.md"),
    ).resolves.toBeUndefined();
  });
});
