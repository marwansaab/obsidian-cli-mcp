// Original — no upstream. Unit tests for the shared note-write substrate (_note-io.ts, F6 of the
// thermo-nuclear code-quality review): the UUID-uniquified atomic tmp+rename write (raw-error rethrow,
// rename-failure unlink, writeFile-failure no-unlink) and the best-effort metadataCache refresh eval
// round-trip (vault-relative path, vault= argv, logged-on-failure contract — spec 068 A1).
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { Writable } from "node:stream";

import { describe, expect, test } from "vitest";

import { invalidateMetadataCache, writeAtomic, type AtomicWriteFs } from "./_note-io.js";
import { createLogger } from "../logger.js";
import { createQueue } from "../queue.js";

import type { EvalDeps } from "./_active-file.js";
import type { SpawnLike } from "../cli-adapter/cli-adapter.js";

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

function evalDeps(spawnFn: SpawnLike, events: Array<Record<string, unknown>> = []): EvalDeps {
  const stream = new Writable({
    write(chunk, _enc, cb) {
      events.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      cb();
    },
  });
  return { logger: createLogger({ stream }), queue: createQueue(), spawnFn };
}

describe("invalidateMetadataCache", () => {
  test("evals computeFileMetadataAsync on the vault-relative path, with vault= on the argv", async () => {
    let argv: readonly string[] | null = null;
    const events: Array<Record<string, unknown>> = [];
    const spawnFn = recordingSpawn({ stdout: "=> ok\n", onArgv: (a) => (argv = a) });
    await expect(
      invalidateMetadataCache(evalDeps(spawnFn, events), { vault: "TestVault", relPath: "Notes/a.md" }),
    ).resolves.toBeUndefined();
    expect(argv).toContain("vault=TestVault");
    const code = argv!.find((a) => a.startsWith("code="))!;
    expect(code).toContain("computeFileMetadataAsync(f)");
    // Regression guard (068 T010): computeMetadataAsync takes the file's bytes; handing it a TFile
    // wedges the vault's metadata worker until Obsidian reloads.
    expect(code).not.toContain("computeMetadataAsync(");
    expect(code).toContain('getFileByPath("Notes/a.md")');
    expect(events).toEqual([]);
  });

  test("normalises a Windows-style relPath to forward slashes", async () => {
    let argv: readonly string[] | null = null;
    const spawnFn = recordingSpawn({ stdout: "=> ok\n", onArgv: (a) => (argv = a) });
    await invalidateMetadataCache(evalDeps(spawnFn), { vault: "TestVault", relPath: "Notes\\Sub\\a.md" });
    expect(argv!.find((a) => a.startsWith("code="))).toContain('getFileByPath("Notes/Sub/a.md")');
  });

  test("active-mode target (no vault) runs without vault= on the argv", async () => {
    let argv: readonly string[] | null = null;
    const spawnFn = recordingSpawn({ stdout: "=> ok\n", onArgv: (a) => (argv = a) });
    await invalidateMetadataCache(evalDeps(spawnFn), { relPath: "a.md" });
    expect(argv!.some((a) => a.startsWith("vault="))).toBe(false);
  });

  test("a rejecting invokeCli logs metadataRefreshFailed and still resolves (write already landed)", async () => {
    const events: Array<Record<string, unknown>> = [];
    const spawnFn = recordingSpawn({ stdout: "Error: boom\n", exitCode: 1 });
    await expect(
      invalidateMetadataCache(evalDeps(spawnFn, events), { vault: "TestVault", relPath: "Notes\\a.md" }),
    ).resolves.toBeUndefined();
    const failed = events.filter((e) => e.event === "bridge.metadata_refresh_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ vault: "TestVault", relPath: "Notes/a.md" });
    expect(failed[0]!.reason).toEqual(expect.stringContaining("CLI_"));
  });

  test("a note Obsidian cannot find is logged, not silently ignored", async () => {
    const events: Array<Record<string, unknown>> = [];
    const spawnFn = recordingSpawn({ stdout: "=> missing\n" });
    await invalidateMetadataCache(evalDeps(spawnFn, events), { relPath: "a.md" });
    expect(events).toEqual([
      expect.objectContaining({
        event: "bridge.metadata_refresh_failed",
        vault: null,
        relPath: "a.md",
        reason: "note not found in the vault index",
      }),
    ]);
  });
});
