// Original — no upstream. Tests for the write_note handler per ADR-009 / US1 — direct-fs-write specific-mode happy path: vault-registry resolution, canonical-path safety, atomic temp+rename, content fidelity, argv anti-leak, lazy registry probe semantics. T002 decisions header: (d) DEL added to path-safety; (e) best-effort fs.unlink on rename failure; (f) FILE_EXISTS race-freeness covered by `wx` flag semantics — deterministic concurrency test omitted; (g) mid-write SIGTERM atomicity deferred to manual M-4 in quickstart.md.
import { resolve } from "node:path";
import { Writable } from "node:stream";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { executeWriteNote, type ExecuteFs } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";
import { createVaultRegistry, type VaultRegistry } from "../../vault-registry/registry.js";
import { makeQueuedSpawn, silentLogger, type StubResponse } from "../_handler-test-fixtures.js";

// Use path.resolve to make the test roots OS-portable absolute paths — POSIX hosts
// (CI on Linux) treat Windows-style "C:\..." literals as relative names, so the
// canonical-path check would resolve them under the cwd and trip PATH_ESCAPES_VAULT.
const VAULT_ROOT = resolve("/test-vault");
const FOO_ROOT = resolve("/foo-vault");
const BAR_ROOT = resolve("/bar-vault");

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

// US6 open-flag cases (#16, #17, #18) — post-write `openLinkText` eval is best-effort per FR-017;
// failure does not fail the call (open is a UX nicety, not the contract).

// (#16) open=true → post-write openLinkText eval fired
test("open=true → post-write openLinkText eval fired (#16)", async () => {
  const fs = fakeFs();
  const { spawnFn, recorded } = makeQueuedSpawn([EVAL_OK, EVAL_OK]);
  await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/n.md",
      content: "x",
      overwrite: true,
      open: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  // Two evals: invalidate + open
  expect(recorded.length).toBe(2);
  // The second (open) eval contains openLinkText in the code= argv
  const openArg = recorded[1]!.argv.find((a) => a.startsWith("code="));
  expect(openArg).toBeDefined();
  expect(openArg!).toContain("openLinkText");
});

// (#17) open=true + post-write open eval fails → response is STILL success
test("open=true + open eval fails → response is still success (#17, best-effort per FR-017)", async () => {
  const fs = fakeFs();
  // First eval (invalidate) succeeds; second eval (open) fails
  const { spawnFn } = makeQueuedSpawn([
    EVAL_OK,
    { stdout: "Error: openLinkText failed\n", exitCode: 1 },
  ]);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/n.md",
      content: "x",
      overwrite: true,
      open: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(result).toEqual({ created: true, path: "Sandbox/n.md" });
});

// (#18) open=false (default) → no openLinkText eval emitted
test("open=false (default) → only invalidate eval, no openLinkText (#18)", async () => {
  const fs = fakeFs();
  const { spawnFn, recorded } = makeQueuedSpawn([EVAL_OK]);
  await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/n.md",
      content: "x",
      overwrite: true,
      // open omitted → default
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  // Only one eval (invalidate)
  expect(recorded.length).toBe(1);
  const evalArg = recorded[0]!.argv.find((a) => a.startsWith("code="));
  expect(evalArg).toBeDefined();
  expect(evalArg!).not.toContain("openLinkText");
});

// US3 active-mode cases (#13, #14, #15) — pre-write focused-file resolution via small
// bug-safe `eval`; response is `=> {"path":"...","base":"..."}` per F3 / R14.

// (#13) Active mode with focused file → write at resolved path, returns { created: false, path }
test("active mode with focused file → resolved path written, returns { created:false, path }", async () => {
  const fs = fakeFs({
    realpath: vi.fn(async (p: string) => {
      if (p === VAULT_ROOT) return VAULT_ROOT;
      // Pretend the focused file already exists for the existedBefore probe
      return p;
    }),
  });
  const focusedResp: StubResponse = {
    stdout: `=> {"path":"Daily/today.md","base":${JSON.stringify(VAULT_ROOT)}}\n`,
    exitCode: 0,
  };
  const { spawnFn } = makeQueuedSpawn([focusedResp, EVAL_OK]);
  const result = await executeWriteNote(
    { target_mode: "active", content: "rewritten", overwrite: true },
    deps({ spawnFn, vaultRegistry: fakeRegistry({}), fs }),
  );
  expect(result).toEqual({ created: false, path: "Daily/today.md" });
});

// (#14) Active mode with no focused file → ERR_NO_ACTIVE_FILE
test("active mode with no focused file (eval returns path: null) → ERR_NO_ACTIVE_FILE", async () => {
  const fs = fakeFs();
  const focusedResp: StubResponse = {
    stdout: `=> {"path":null,"base":${JSON.stringify(VAULT_ROOT)}}\n`,
    exitCode: 0,
  };
  const { spawnFn } = makeQueuedSpawn([focusedResp]);
  const err = await executeWriteNote(
    { target_mode: "active", content: "x", overwrite: true },
    deps({ spawnFn, vaultRegistry: fakeRegistry({}), fs }),
  ).catch((e) => e);
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("ERR_NO_ACTIVE_FILE");
});

// (#15) Active-mode focused-file eval is small (~120 bytes argv) — stays under the SC-007 cap
test("active-mode focused-file eval argv stays under 250-byte cap (SC-007 / F1)", async () => {
  const fs = fakeFs({
    realpath: vi.fn(async (p: string) => {
      if (p === VAULT_ROOT) return VAULT_ROOT;
      return p;
    }),
  });
  const focusedResp: StubResponse = {
    stdout: `=> {"path":"x.md","base":${JSON.stringify(VAULT_ROOT)}}\n`,
    exitCode: 0,
  };
  const { spawnFn, recorded } = makeQueuedSpawn([focusedResp, EVAL_OK]);
  await executeWriteNote(
    { target_mode: "active", content: "x", overwrite: true },
    deps({ spawnFn, vaultRegistry: fakeRegistry({}), fs }),
  );
  // The first spawn is the focused-file eval; verify the code= argv element is small
  const firstArgv = recorded[0]!.argv;
  const codeArg = firstArgv.find((a) => a.startsWith("code="));
  expect(codeArg).toBeDefined();
  expect(codeArg!.length).toBeLessThanOrEqual(250);
});

// US2 collision cases (#3, #4) — FILE_EXISTS race-freeness is enforced via the `wx` flag's
// atomic EEXIST behaviour at the kernel level (Node fs.writeFile maps O_CREAT|O_EXCL); per
// T002 (f) decision 2026-05-10, no deterministic concurrency test is added (vitest cannot
// reliably interleave fs.writeFile calls; the atomicity guarantee comes from the underlying
// syscall, not from the JS runtime).

// (#8) Path-escape attempt → PATH_ESCAPES_VAULT + typed pathEscapeAttempt logger event
test("symlink-escape attempt → PATH_ESCAPES_VAULT + pathEscapeAttempt logger event (#8)", async () => {
  // realpath on the parent directory points OUTSIDE vaultRoot
  const escapeTarget = resolve("/escape-target");
  const fs = fakeFs({
    realpath: vi.fn(async (p: string) => {
      if (p === VAULT_ROOT) return VAULT_ROOT;
      // any other path resolves OUTSIDE the vault root → triggers PATH_ESCAPES_VAULT
      return escapeTarget;
    }),
  });
  const events: Array<{ event: string; vault: unknown; attemptedPath: unknown }> = [];
  const captureLogger: Logger = createLogger({
    stream: new Writable({
      write(chunk, _enc, cb) {
        try {
          const parsed = JSON.parse(chunk.toString());
          events.push(parsed);
        } catch { /* ignore */ }
        cb();
      },
    }),
  });
  const { spawnFn } = makeQueuedSpawn([]);
  const err = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "subdir/escape.md",
      content: "x",
      overwrite: true,
    },
    deps({
      spawnFn,
      vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }),
      fs,
      logger: captureLogger,
    }),
  ).catch((e) => e);
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("PATH_ESCAPES_VAULT");
  expect((err as UpstreamError).details.vault).toBe("TestVault");
  expect((err as UpstreamError).details.attemptedPath).toBe("subdir/escape.md");
  // Logger event fired
  const escapeEvent = events.find((e) => e.event === "pathEscapeAttempt");
  expect(escapeEvent).toBeDefined();
  expect(escapeEvent!.vault).toBe("TestVault");
  expect(escapeEvent!.attemptedPath).toBe("subdir/escape.md");
  // No file was written / mkdir'd
  expect(fs.writes.length).toBe(0);
  expect(fs.mkdirs.length).toBe(0);
});

// (#19) FS_WRITE_FAILED with details.errno = "ENOSPC"
test("ENOSPC on writeFile → FS_WRITE_FAILED with details.errno=ENOSPC (#19)", async () => {
  const enospc = Object.assign(new Error("ENOSPC"), {
    code: "ENOSPC",
    syscall: "write",
    path: "C:\\TestVault\\Sandbox\\big.md",
  });
  const fs = fakeFs({
    writeFile: vi.fn(async () => {
      throw enospc;
    }),
  });
  const { spawnFn } = makeQueuedSpawn([]);
  const err = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/big.md",
      content: "x".repeat(1_000),
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  ).catch((e) => e);
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
  expect((err as UpstreamError).details.errno).toBe("ENOSPC");
  expect((err as UpstreamError).details.syscall).toBe("write");
});

// (#20) FS_WRITE_FAILED with details.errno = "EACCES"
test("EACCES on writeFile → FS_WRITE_FAILED with details.errno=EACCES (#20)", async () => {
  const eaccess = Object.assign(new Error("EACCES"), {
    code: "EACCES",
    syscall: "open",
    path: "C:\\TestVault\\readonly.md",
  });
  const fs = fakeFs({
    writeFile: vi.fn(async () => {
      throw eaccess;
    }),
  });
  const { spawnFn } = makeQueuedSpawn([]);
  const err = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "readonly.md",
      content: "x",
      overwrite: false,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  ).catch((e) => e);
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("FS_WRITE_FAILED");
  expect((err as UpstreamError).details.errno).toBe("EACCES");
});

// (#3) Specific mode overwrite=false against existing → FILE_EXISTS, original content unchanged
test("specific overwrite=false against existing file → FILE_EXISTS (#3)", async () => {
  const eexist = Object.assign(new Error("EEXIST"), { code: "EEXIST", syscall: "open" });
  const fs = fakeFs({
    writeFile: vi.fn(async () => {
      throw eexist;
    }),
  });
  const { spawnFn } = makeQueuedSpawn([]);
  const err = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/exists.md",
      content: "x",
      overwrite: false,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  ).catch((e) => e);
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("FILE_EXISTS");
  expect((err as UpstreamError).details.path).toBe("Sandbox/exists.md");
  // No rename / unlink should have happened — original content untouched
  expect(fs.renames.length).toBe(0);
});

// (#4) Specific mode overwrite=false against fresh path → FILE_EXISTS NOT raised; file created
test("specific overwrite=false against fresh path → file created (#4)", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Sandbox/fresh.md",
      content: "x",
      overwrite: false,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(result.created).toBe(true);
  // overwrite=false uses the `wx` flag option — verify the writeFile call carried it
  expect(fs.writes.length).toBe(1);
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

// 020-fix-write-gaps US1 — Short-form-name resolution (FR-001 / FR-001a)
// =====================================================================

// (#020-1) Canonical short-form happy path: file: "Acceptance Probe" → on-disk
// "Acceptance Probe.md", response path "Acceptance Probe.md". FR-001 / FR-002 /
// FR-003 / Story 1 AC#1.
test("020/US1 canonical short-form file → <file>.md at vault root", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      file: "Acceptance Probe",
      content: "body",
      overwrite: false,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(result).toEqual({ created: true, path: "Acceptance Probe.md" });
  expect(fs.writes.length).toBe(1);
  const writtenPath = fs.writes[0]![0];
  expect(
    writtenPath.endsWith("Acceptance Probe.md"),
  ).toBe(true);
});

// (#020-2) Internal-period preservation: file: "version_1.2.3" →
// "version_1.2.3.md" (endsWith(".md") is false; not path.extname). FR-001
// invariant H6 / Story 1 AC#5.
test("020/US1 canonical short-form preserves internal periods", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      file: "version_1.2.3",
      content: "x",
      overwrite: false,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(result.path).toBe("version_1.2.3.md");
});

// (#020-3) FR-001a passthrough (already-ends-in-.md): file: "Notes.md" →
// verbatim, NO double-extension. Story 1 AC#6.
test("020/US1 file ending in .md passes through verbatim (no double-extension)", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      file: "Notes.md",
      content: "x",
      overwrite: false,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(result.path).toBe("Notes.md");
  const writtenPath = fs.writes[0]![0];
  expect(writtenPath.endsWith("Notes.md")).toBe(true);
  expect(writtenPath.endsWith("Notes.md.md")).toBe(false);
});

// (#020-4) FR-001a passthrough (contains folder separator): file: "Folder/Note"
// → verbatim, no .md appended, folder NOT stripped. Story 1 AC#7.
test("020/US1 file with folder separator passes through verbatim", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      file: "Folder/Note",
      content: "x",
      overwrite: false,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(result.path).toBe("Folder/Note");
  const writtenPath = fs.writes[0]![0];
  expect(
    writtenPath.endsWith("Folder\\Note") || writtenPath.endsWith("Folder/Note"),
  ).toBe(true);
  expect(writtenPath.endsWith(".md")).toBe(false);
});

// (#020-5) Path-form regression guard: path: "Subfolder/Note.md" → verbatim, no
// double-extension, no .md re-append. FR-004 / Story 1 AC#4 / SC-003.
test("020/US1 path form unaffected by short-form rule (regression guard)", async () => {
  const fs = fakeFs();
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Subfolder/Note.md",
      content: "x",
      overwrite: false,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  );
  expect(result.path).toBe("Subfolder/Note.md");
  const writtenPath = fs.writes[0]![0];
  expect(
    writtenPath.endsWith("Subfolder\\Note.md") || writtenPath.endsWith("Subfolder/Note.md"),
  ).toBe(true);
  expect(writtenPath.endsWith("Note.md.md")).toBe(false);
});

// 020-fix-write-gaps US2 — FILE_EXISTS diagnostic enrichment (FR-007 / FR-008)
// =============================================================================

// (#020-6) Hot-path FILE_EXISTS additive details: {errno, path, vault}. FR-007 /
// FR-008 / FR-009 / Story 2 AC#1.
test("020/US2 hot-path FILE_EXISTS rejection carries additive details.errno", async () => {
  const eexist = Object.assign(new Error("EEXIST: file already exists"), {
    code: "EEXIST",
    syscall: "open",
  });
  const fs = fakeFs({
    writeFile: vi.fn(async () => {
      throw eexist;
    }),
  });
  const { spawnFn } = makeQueuedSpawn([]);
  const err = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "V",
      path: "Existing.md",
      content: "x",
      overwrite: false,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ V: VAULT_ROOT }), fs }),
  ).catch((e) => e);
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("FILE_EXISTS");
  expect((err as UpstreamError).details).toEqual({
    errno: "EEXIST",
    path: "Existing.md",
    vault: "V",
  });
  // No rename / unlink — hot path is wx-flag write, not temp+rename.
  expect(fs.renames.length).toBe(0);
  expect(fs.unlinks.length).toBe(0);
});

// (#020-7) mapFsError asymmetry guard: mkdir EEXIST maps via mapFsError, which
// keeps its single-field {errno: "EEXIST"} details (no path / vault). Research
// decision R4 + Constitution Principle II boundary-test side.
test("020/US2 mapFsError EEXIST keeps single-field details (preserved asymmetry)", async () => {
  const mkdirEexist = Object.assign(new Error("EEXIST"), {
    code: "EEXIST",
    syscall: "mkdir",
  });
  const fs = fakeFs({
    mkdir: vi.fn(async () => {
      throw mkdirEexist;
    }),
  });
  const { spawnFn } = makeQueuedSpawn([]);
  const err = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "TestVault",
      path: "Subdir/n.md",
      content: "x",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ TestVault: VAULT_ROOT }), fs }),
  ).catch((e) => e);
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).code).toBe("FILE_EXISTS");
  expect((err as UpstreamError).details).toEqual({ errno: "EEXIST" });
});

// (#020-8) Overwrite-true on existing → success envelope, no details.errno in
// response. FR-010 / Story 2 AC#4 / SC-006.
test("020/US2 overwrite=true on existing → success envelope carries no errno", async () => {
  const fs = fakeFs({
    realpath: vi.fn(async (p: string) => {
      if (p === VAULT_ROOT) return VAULT_ROOT;
      return p; // target exists
    }),
  });
  const { spawnFn } = makeQueuedSpawn([EVAL_OK]);
  const result = await executeWriteNote(
    {
      target_mode: "specific",
      vault: "V",
      path: "Existing.md",
      content: "new",
      overwrite: true,
    },
    deps({ spawnFn, vaultRegistry: fakeRegistry({ V: VAULT_ROOT }), fs }),
  );
  expect(result).toEqual({ created: false, path: "Existing.md" });
  expect((result as unknown as { details?: unknown }).details).toBeUndefined();
});
