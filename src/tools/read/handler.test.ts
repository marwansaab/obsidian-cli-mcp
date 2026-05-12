// Original — no upstream. Tests for the read handler — schema-typed input → invokeCli → text envelope; bounds-via-dispatchCli failures surface verbatim.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { executeReadNote } from "./handler.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";


interface StubChildSpec {
  stdout?: string;
  stderr?: string;
  chunkedStdout?: Buffer[];
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  errorOnSpawn?: unknown;
  hold?: boolean;
}

interface SpawnRecording {
  binary: string;
  argv: string[];
  options: SpawnOptions;
}

function makeStubSpawn(spec: StubChildSpec): { spawnFn: SpawnLike; recorded: SpawnRecording[] } {
  const recorded: SpawnRecording[] = [];
  const spawnFn: SpawnLike = (binary, argv, options) => {
    if (spec.errorOnSpawn) {
      throw spec.errorOnSpawn;
    }
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
      if (spec.chunkedStdout) {
        for (const c of spec.chunkedStdout) child.stdout.push(c);
      } else if (spec.stdout) {
        child.stdout.push(Buffer.from(spec.stdout, "utf8"));
      }
      child.stdout.push(null);
      if (spec.stderr) child.stderr.push(Buffer.from(spec.stderr, "utf8"));
      child.stderr.push(null);
      if (spec.hold) return;
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

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    return e;
  }
}

function pendingRejection<T>(p: Promise<T>): Promise<UpstreamError> {
  return p.then(
    () => { throw new Error("expected rejection but promise resolved"); },
    (e: unknown) => {
      if (!(e instanceof UpstreamError)) throw new Error(`expected UpstreamError, got ${String(e)}`);
      return e;
    },
  );
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// --- US1: specific + file (happy + boundary) ---

test("US1 specific+file invokes adapter and returns content (Story 1 AC#1)", async () => {
  const stdoutText = "# Recipe\n\nIngredients...\n";
  const { spawnFn, recorded } = makeStubSpawn({ stdout: stdoutText, exitCode: 0 });
  const result = await executeReadNote(
    { target_mode: "specific", vault: "MyVault", file: "Recipe" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({ content: stdoutText });
  expect(recorded).toHaveLength(1);
  expect(recorded[0]!.binary).toBe("obsidian");
  // FR-012 documented argv order: [vault=..., command, kvs..., flags..., --copy].
  expect(recorded[0]!.argv).toEqual(["vault=MyVault", "read", "file=Recipe"]);
});

test("US1 boundary empty stdout returns { content: '' } (Story 1 AC#2)", async () => {
  const { spawnFn } = makeStubSpawn({ stdout: "", exitCode: 0 });
  const result = await executeReadNote(
    { target_mode: "specific", vault: "MyVault", file: "Empty" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({ content: "" });
});

// --- US2: specific + path ---

test("US2 specific+path invokes adapter and returns content (Story 2 AC#1)", async () => {
  const stdoutText = "<template body>";
  const { spawnFn, recorded } = makeStubSpawn({ stdout: stdoutText, exitCode: 0 });
  const result = await executeReadNote(
    { target_mode: "specific", vault: "MyVault", path: "Templates/Recipe.md" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({ content: stdoutText });
  expect(recorded[0]!.argv).toEqual(["vault=MyVault", "read", "path=Templates/Recipe.md"]);
});

// --- US3: active mode (happy + ERR_NO_ACTIVE_FILE) ---

test("US3 active invokes adapter with bare argv [read] and returns content (Story 3 AC#1)", async () => {
  const stdoutText = "<active body>";
  const { spawnFn, recorded } = makeStubSpawn({ stdout: stdoutText, exitCode: 0 });
  const result = await executeReadNote(
    { target_mode: "active" },
    { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
  );
  expect(result).toEqual({ content: stdoutText });
  expect(recorded[0]!.argv).toEqual(["read"]);
});

test("US3 active propagates ERR_NO_ACTIVE_FILE from the adapter (Story 3 AC#3)", async () => {
  const { spawnFn } = makeStubSpawn({ stdout: "Error: no active file\n", exitCode: 0 });
  const err = (await captureRejection(
    executeReadNote(
      { target_mode: "active" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(err.details.message).toContain("no active file");
});

// --- US5: classification surfaces ---

test("US5 propagates CLI_NON_ZERO_EXIT (Story 5 AC#1)", async () => {
  const { spawnFn } = makeStubSpawn({ stderr: "file not found", exitCode: 1 });
  const err = (await captureRejection(
    executeReadNote(
      { target_mode: "specific", vault: "MyVault", file: "Missing" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.details.exitCode).toBe(1);
});

test("US5 propagates CLI_REPORTED_ERROR for in-band Error: prefix (Story 5 AC#2)", async () => {
  const { spawnFn } = makeStubSpawn({ stdout: "Error: File not found\n", exitCode: 0 });
  const err = (await captureRejection(
    executeReadNote(
      { target_mode: "specific", vault: "MyVault", file: "Missing" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe("Error: File not found");
});

test("US5 propagates CLI_BINARY_NOT_FOUND when spawn raises ENOENT (Story 5 AC#3)", async () => {
  const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const { spawnFn } = makeStubSpawn({ errorOnSpawn: enoent });
  const err = (await captureRejection(
    executeReadNote(
      { target_mode: "specific", vault: "MyVault", file: "Recipe" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
});

test("US5 re-throws non-UpstreamError verbatim (Story 5 AC#4)", async () => {
  const synthetic = new Error("synthetic non-UpstreamError");
  const { spawnFn } = makeStubSpawn({ errorOnSpawn: synthetic });
  const rejection = await captureRejection(
    executeReadNote(
      { target_mode: "specific", vault: "MyVault", file: "Recipe" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} },
    ),
  );
  expect(rejection).toBe(synthetic);
  expect(rejection).not.toBeInstanceOf(UpstreamError);
});

// --- New under 008-refactor: typed-tool bounds reachable through invokeCli (FR-009 / FR-010 / SC-003 / SC-004) ---

// Synchronously-resolving resolver stub — bypasses real fs.access I/O so timing-
// sensitive tests (fake timers, microtask kills) don't race with the production
// resolver's libuv access call.
const stubResolveBinary = async () => ({
  path: "obsidian",
  attempts: [{ source: "PATH" as const, path: "obsidian", outcome: "pending" as const }],
});

test("typed-tool TIMEOUT: synthetic 11 s hang → CLI_TIMEOUT within ~10.5 s (SC-003)", async () => {
  vi.useFakeTimers();
  try {
    const { spawnFn } = makeStubSpawn({ hold: true });
    const rejected = pendingRejection(
      executeReadNote(
        { target_mode: "active" },
        { logger: silentLogger(), queue: createQueue(), spawnFn, env: {}, resolveBinary: stubResolveBinary },
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_001);
    const err = await rejected;
    expect(err.code).toBe("CLI_TIMEOUT");
    expect(err.details).toMatchObject({ timeoutMs: 10_000 });
  } finally {
    vi.useRealTimers();
  }
});

test("typed-tool CAP: synthetic > 10 MiB → CLI_OUTPUT_TOO_LARGE with partial ≤ 10 MiB (SC-004)", async () => {
  const oneMiB = Buffer.alloc(1024 * 1024, 0x41);
  const elevenMiBChunks = Array.from({ length: 11 }, () => oneMiB);
  const { spawnFn } = makeStubSpawn({ chunkedStdout: elevenMiBChunks, hold: true });
  const err = (await captureRejection(
    executeReadNote(
      { target_mode: "active" },
      { logger: silentLogger(), queue: createQueue(), spawnFn, env: {}, resolveBinary: stubResolveBinary },
    ),
  )) as UpstreamError;
  expect(err.code).toBe("CLI_OUTPUT_TOO_LARGE");
  expect(err.details.stream).toBe("stdout");
  expect((err.details.partial as string).length).toBe(10 * 1024 * 1024);
});
