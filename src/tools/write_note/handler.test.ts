// Original — no upstream. Tests for the write_note handler per ADR-009 / US1 — direct-fs-write specific-mode happy path: vault-registry resolution, canonical-path safety, atomic temp+rename, content fidelity, argv anti-leak, lazy registry probe semantics. T002 decisions header: (d) DEL added to path-safety; (e) best-effort fs.unlink on rename failure; (f) FILE_EXISTS race-freeness covered by `wx` flag semantics — deterministic concurrency test omitted; (g) mid-write SIGTERM atomicity deferred to manual M-4 in quickstart.md.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { executeWriteNote, type ExecuteFs } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";
import { createVaultRegistry, type VaultRegistry } from "../../vault-registry/registry.js";

const VAULT_ROOT = "C:\\TestVault";
const FOO_ROOT = "C:\\Foo";
const BAR_ROOT = "C:\\Bar";

interface StubResponse {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  errorOnSpawn?: unknown;
}

interface SpawnRecording {
  binary: string;
  argv: string[];
  options: SpawnOptions;
}

function makeQueuedSpawn(
  responses: StubResponse[],
): { spawnFn: SpawnLike; recorded: SpawnRecording[] } {
  const recorded: SpawnRecording[] = [];
  let idx = 0;
  const spawnFn: SpawnLike = (binary, argv, options) => {
    const spec = responses[idx++];
    if (!spec) {
      throw new Error(
        `unexpected spawn invocation #${idx}; only ${responses.length} response(s) configured`,
      );
    }
    if (spec.errorOnSpawn) throw spec.errorOnSpawn;
    recorded.push({ binary, argv: [...argv], options });
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 4242;
    child.kill = (signal?: NodeJS.Signals) => {
      setImmediate(() => child.emit("exit", null, signal ?? "SIGTERM"));
      return true;
    };
    setImmediate(() => {
      if (spec.stdout) child.stdout.push(Buffer.from(spec.stdout, "utf8"));
      child.stdout.push(null);
      if (spec.stderr) child.stderr.push(Buffer.from(spec.stderr, "utf8"));
      child.stderr.push(null);
      setImmediate(() => {
        const closeCode = "exitCode" in spec ? (spec.exitCode ?? null) : 0;
        const closeSignal = "signal" in spec ? (spec.signal ?? null) : null;
        child.emit("exit", closeCode, closeSignal);
      });
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
  return { spawnFn, recorded };
}

function silentLogger(): Logger {
  return createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });
}

function fakeFs(over: Partial<ExecuteFs> = {}): ExecuteFs & { writes: Array<[string, string]>; renames: Array<[string, string]>; mkdirs: string[]; unlinks: string[] } {
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
    mkdir: vi.fn(async (p: string) => {
      mkdirs.push(p);
    }),
    writeFile: vi.fn(async (p: string, c: string) => {
      writes.push([p, c]);
    }),
    rename: vi.fn(async (from: string, to: string) => {
      renames.push([from, to]);
    }),
    realpath: vi.fn(async (p: string) => {
      // default: vault root identity; non-existent files throw ENOENT
      if (p === VAULT_ROOT || p === FOO_ROOT || p === BAR_ROOT) return p;
      // parent dirs are presumed-existing for mkdir target check; throw for the
      // pre-write existence probe on the absPath itself
      throw enoent();
    }),
    unlink: vi.fn(async (p: string) => {
      unlinks.push(p);
    }),
  };
  const merged: ExecuteFs = { ...base, ...over };
  return Object.assign(merged, { writes, renames, mkdirs, unlinks });
}

function fakeRegistry(map: Record<string, string>): VaultRegistry {
  return {
    resolveVaultPath: vi.fn(async (name: string) => {
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
    }),
  };
}

function deps(opts: {
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

const EVAL_OK: StubResponse = { stdout: "=> undefined\n", exitCode: 0 };

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// (#1) Specific mode happy path: fresh file written, returns { created: true, path }
test("specific happy path (fresh file, overwrite=true) → { created: true, path }", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/note.md",
      content: "hello",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(result).toEqual({ created: true, path: "Sandbox/note.md" });
  expect(fs.writes.length).toBe(1);
  expect(fs.renames.length).toBe(1);
  // tmp path was renamed to absPath
  const [, finalPath] = fs.renames[0]!;
  expect(finalPath.endsWith("Sandbox\\note.md") || finalPath.endsWith("Sandbox/note.md")).toBe(true);
});

// (#2) Specific mode overwrite=true happy path: existing file replaced, returns { created: false }
test("specific overwrite=true on existing file → { created: false, path }", async () => {
  // realpath returns absPath itself (file exists)
  const fs = fakeFs({
    realpath: vi.fn(async (p: string) => {
      if (p === VAULT_ROOT) return VAULT_ROOT;
      return p; // any other path: exists
    }),
  });
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/exists.md",
      content: "replaced",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(result.created).toBe(false);
  expect(result.path).toBe("Sandbox/exists.md");
});

// (#5) Auto-mkdir of nested parent dirs on fresh path
test("auto-mkdir nested parents (Daily/2026/05/note.md)", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Daily/2026/05/note.md",
      content: "x",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(fs.mkdirs.length).toBe(1);
  // mkdir target is the parent of the absPath
  const mkdirArg = fs.mkdirs[0]!;
  expect(
    mkdirArg.endsWith("Daily\\2026\\05") || mkdirArg.endsWith("Daily/2026/05"),
  ).toBe(true);
});

// (#6) vault=Foo when focused vault is Bar → write lands at Foo's absolute path (resolves R11)
test("vault=Foo resolves to Foo's absolute path (multi-vault routing fixed; R11)", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "Foo",
      path: "n.md",
      content: "x",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ Foo: FOO_ROOT, Bar: BAR_ROOT }), fs }),
  );
  expect(result.path).toBe("n.md");
  // The rename's destination must be under FOO_ROOT, never BAR_ROOT
  const [, finalPath] = fs.renames[0]!;
  expect(finalPath.startsWith(FOO_ROOT)).toBe(true);
  expect(finalPath.startsWith(BAR_ROOT)).toBe(false);
});

// (#7) vault=Unknown → VALIDATION_ERROR (vault not in registry)
test("vault=Unknown propagates VALIDATION_ERROR from registry", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([]);
  const err = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "DoesNotExist",
      path: "n.md",
      content: "x",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  ).catch((e) => e);
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("VALIDATION_ERROR");
});

// (#9) Atomic write: tmp file orphaned cleanly when rename fails (best-effort unlink per T002 (e))
test("rename failure → tmp file unlinked best-effort, FS_WRITE_FAILED raised", async () => {
  const renameError = Object.assign(new Error("EPERM"), { code: "EPERM", syscall: "rename" });
  const fs = fakeFs({
    rename: vi.fn(async () => {
      throw renameError;
    }),
  });
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const err = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/n.md",
      content: "x",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  ).catch((e) => e);
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
  expect(fs.unlinks.length).toBe(1);
});

// (#10) Atomic write: temp file uniqueness via UUID (concurrent writes don't collide on tmp)
test("tmp file path includes a UUID — two writes pick distinct tmp names", async () => {
  const tmpPaths: string[] = [];
  const fs = fakeFs({
    writeFile: vi.fn(async (p: string) => {
      tmpPaths.push(p);
    }),
  });
  const { spawnFn } = makeQueuedSpawn([EVAL_OK, EVAL_OK]);
  const reg = fakeRegistry({ TestVault: VAULT_ROOT });
  await executeWriteNote(
    { target_mode: "specific", vault: "TestVault", path: "n.md", content: "a", overwrite: true },
    deps({ spawnFn, vaultRegistry: reg, fs }),
  );
  await executeWriteNote(
    { target_mode: "specific", vault: "TestVault", path: "n.md", content: "b", overwrite: true },
    deps({ spawnFn, vaultRegistry: reg, fs }),
  );
  expect(tmpPaths.length).toBe(2);
  expect(tmpPaths[0]).not.toBe(tmpPaths[1]);
  // both have ".tmp" suffix
  expect(tmpPaths[0]!.endsWith(".tmp")).toBe(true);
  expect(tmpPaths[1]!.endsWith(".tmp")).toBe(true);
});

// (#11) metadataCache invalidation eval succeeds; response is success
test("metadataCache invalidation eval succeeds → response is success", async () => {
  const fs = fakeFs();
  const { spawnFn, recorded } = makeQueuedSpawn([EVAL_OK]);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/n.md",
      content: "x",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(result).toMatchObject({ created: true, path: "Sandbox/n.md" });
  expect(recorded.length).toBe(1); // one invalidate eval
  // argv contains the eval command + a code= parameter
  const argv = recorded[0]!.argv;
  expect(argv).toContain("eval");
  expect(argv.some((a) => a.startsWith("code="))).toBe(true);
});

// (#12) metadataCache invalidation eval fails → response is STILL success (best-effort per FR-011)
test("metadataCache invalidation eval failure → response is still success (best-effort silent per FR-011)", async () => {
  const fs = fakeFs();
  // eval responds with non-zero exit / Error: prefix → invokeCli will throw; handler catches silently
  const { spawnFn } = makeQueuedSpawn([
    { stdout: "Error: cache invalidation failed\n", exitCode: 1 },
  ]);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/n.md",
      content: "x",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(result).toEqual({ created: true, path: "Sandbox/n.md" });
});

// (#21) Content with double quotes survives byte-for-byte
test("content with double quotes preserved byte-for-byte in fs.writeFile call", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const content = 'Body with "quotes" and \\backslashes\\.';
  await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      content,
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(fs.writes[0]![1]).toBe(content);
});

// (#22) Content with `,]"Calls.md",]` (BI-038 trigger fragment) survives byte-for-byte
test("BI-038 trigger fragment preserved byte-for-byte", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const content = `before ,]"Calls.md",] after`;
  await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      content,
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(fs.writes[0]![1]).toBe(content);
});

// (#23) Content with mixed CRLF/LF line endings preserved
test("CRLF/LF mixed line endings preserved", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const content = "line-lf\nline-crlf\r\nlast\n";
  await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      content,
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(fs.writes[0]![1]).toBe(content);
});

// (#24) Content with multi-byte UTF-8 + emoji preserved
test("multi-byte UTF-8 + emoji preserved", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const content = "Привет 你好 مرحبا 📝🚀✅";
  await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      content,
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(fs.writes[0]![1]).toBe(content);
});

// (#25) Spawn-arg-length: NO spawn argv element contains content
test("no spawn argv element carries the user content (FR-005, SC-007)", async () => {
  const fs = fakeFs();
  const { spawnFn, recorded } = makeQueuedSpawn([EVAL_OK]);
  const sentinel = "SENTINEL_CONTENT_THAT_MUST_NOT_LEAK_TO_ARGV_" + "x".repeat(10_000);
  await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      content: sentinel,
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  for (const rec of recorded) {
    for (const arg of rec.argv) {
      expect(arg.includes(sentinel)).toBe(false);
    }
  }
});

// (#26) Spawn-arg-length: every emitted spawn argv element ≤ 250 bytes
test("every spawn argv element ≤ 250 bytes (SC-007)", async () => {
  const fs = fakeFs();
  const { spawnFn, recorded } = makeQueuedSpawn([EVAL_OK]);
  const big = "x".repeat(100_000);
  await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/big.md",
      content: big,
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  for (const rec of recorded) {
    for (const arg of rec.argv) {
      expect(arg.length).toBeLessThanOrEqual(250);
    }
  }
});

// (#27) 100KB content sanity
test("100KB content writes without error (large-content sanity)", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const big = "x".repeat(100 * 1024);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/big.md",
      content: big,
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(result.created).toBe(true);
  expect(fs.writes[0]![1].length).toBe(100 * 1024);
});

// (#28) First write triggers vault-registry probe; second write hits cache (no second probe)
test("vault-registry probe-on-first + cache-hit-on-second (FR-012, R2)", async () => {
  const probe = vi.fn().mockResolvedValue(`TestVault\t${VAULT_ROOT}\n`);
  const reg = createVaultRegistry({ invokeProbe: probe });
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK, EVAL_OK]);
  await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "n1.md",
      content: "a",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: reg, fs }),
  );
  await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "n2.md",
      content: "b",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: reg, fs }),
  );
  expect(probe).toHaveBeenCalledTimes(1);
});

// (#29) Probe failure on first write → handler retries probe on second write (FR-012 retry)
test("probe failure on first write → handler retries probe on second write", async () => {
  const probeError = new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: {},
    message: "Obsidian not running",
  });
  const probe = vi
    .fn()
    .mockRejectedValueOnce(probeError)
    .mockResolvedValueOnce(`TestVault\t${VAULT_ROOT}\n`);
  const reg = createVaultRegistry({ invokeProbe: probe });
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  // first write: probe fails → propagated
  const err = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      content: "x",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: reg, fs }),
  ).catch((e) => e);
  expect(err).toBe(probeError);
  // second write: probe retries and succeeds
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      content: "x",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: reg, fs }),
  );
  expect(result.created).toBe(true);
  expect(probe).toHaveBeenCalledTimes(2);
});

// (#30) Output envelope shape EXACTLY { created, path }
test("output envelope has exactly two keys: created + path", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      content: "x",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(Object.keys(result).sort()).toEqual(["created", "path"]);
});
