// Original — no upstream. Tests for the read_note handler — schema-typed input → invokeCli (BI-028) → text envelope; FR-017 log events.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import { test, expect, vi } from "vitest";

import { executeReadNote } from "./handler.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";

import type { SpawnLike } from "../../cli-adapter/cli-adapter.js";
import type { Logger } from "../../logger.js";

interface StubChildSpec {
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
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.kill = () => true;
    setImmediate(() => {
      if (spec.stdout) child.stdout.push(Buffer.from(spec.stdout, "utf8"));
      child.stdout.push(null);
      if (spec.stderr) child.stderr.push(Buffer.from(spec.stderr, "utf8"));
      child.stderr.push(null);
      setImmediate(() => {
        const closeCode = "exitCode" in spec ? (spec.exitCode ?? null) : 0;
        const closeSignal = "signal" in spec ? (spec.signal ?? null) : null;
        child.emit("close", closeCode, closeSignal);
      });
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
  return { spawnFn, recorded };
}

type StubLogger = Logger & {
  callStart: ReturnType<typeof vi.fn>;
  callEndSuccess: ReturnType<typeof vi.fn>;
  callEndFailure: ReturnType<typeof vi.fn>;
  shutdown: ReturnType<typeof vi.fn>;
};

function makeStubLogger(): StubLogger {
  return {
    callStart: vi.fn(),
    callEndSuccess: vi.fn(),
    callEndFailure: vi.fn(),
    shutdown: vi.fn(),
  } as unknown as StubLogger;
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    return e;
  }
}

// --- US1: specific + file (happy + boundary) ---

test("US1 specific+file invokes adapter with argv [read, vault=, file=] and returns content (Story 1 AC#1)", async () => {
  const stdoutText = "# Recipe\n\nIngredients...\n";
  const { spawnFn, recorded } = makeStubSpawn({ stdout: stdoutText, exitCode: 0 });
  const logger = makeStubLogger();
  const queue = createQueue();
  const result = await executeReadNote(
    { target_mode: "specific", vault: "MyVault", file: "Recipe" },
    { logger, queue, spawnFn, env: {} },
  );
  expect(result).toEqual({ content: stdoutText });
  expect(recorded).toHaveLength(1);
  expect(recorded[0]!.binary).toBe("obsidian");
  expect(recorded[0]!.argv).toEqual(["read", "vault=MyVault", "file=Recipe"]);
  expect(logger.callStart).toHaveBeenCalledTimes(1);
  expect(logger.callStart.mock.calls[0]![0]).toMatchObject({
    command: "read",
    vault: "MyVault",
    locator: "file",
  });
  expect(logger.callEndSuccess).toHaveBeenCalledTimes(1);
  expect(logger.callEndSuccess.mock.calls[0]![0]).toMatchObject({
    stdoutBytes: Buffer.byteLength(stdoutText, "utf8"),
  });
  expect(logger.callEndFailure).not.toHaveBeenCalled();
});

test("US1 boundary empty stdout returns { content: '' } with stdoutBytes 0 (Story 1 AC#2)", async () => {
  const { spawnFn } = makeStubSpawn({ stdout: "", exitCode: 0 });
  const logger = makeStubLogger();
  const queue = createQueue();
  const result = await executeReadNote(
    { target_mode: "specific", vault: "MyVault", file: "Empty" },
    { logger, queue, spawnFn, env: {} },
  );
  expect(result).toEqual({ content: "" });
  expect(logger.callEndSuccess).toHaveBeenCalledTimes(1);
  expect(logger.callEndSuccess.mock.calls[0]![0]).toMatchObject({ stdoutBytes: 0 });
});

// --- US2: specific + path (happy) ---

test("US2 specific+path invokes adapter with argv [read, vault=, path=] and returns content (Story 2 AC#1)", async () => {
  const stdoutText = "<template body>";
  const { spawnFn, recorded } = makeStubSpawn({ stdout: stdoutText, exitCode: 0 });
  const logger = makeStubLogger();
  const queue = createQueue();
  const result = await executeReadNote(
    { target_mode: "specific", vault: "MyVault", path: "Templates/Recipe.md" },
    { logger, queue, spawnFn, env: {} },
  );
  expect(result).toEqual({ content: stdoutText });
  expect(recorded[0]!.argv).toEqual(["read", "vault=MyVault", "path=Templates/Recipe.md"]);
  expect(logger.callStart.mock.calls[0]![0]).toMatchObject({ locator: "path" });
});

// --- US3: active mode (happy + ERR_NO_ACTIVE_FILE) ---

test("US3 active invokes adapter with bare argv [read] and returns content (Story 3 AC#1)", async () => {
  const stdoutText = "<active body>";
  const { spawnFn, recorded } = makeStubSpawn({ stdout: stdoutText, exitCode: 0 });
  const logger = makeStubLogger();
  const queue = createQueue();
  const result = await executeReadNote(
    { target_mode: "active" },
    { logger, queue, spawnFn, env: {} },
  );
  expect(result).toEqual({ content: stdoutText });
  expect(recorded[0]!.argv).toEqual(["read"]);
  expect(logger.callStart.mock.calls[0]![0]).toMatchObject({ vault: null, locator: "active" });
});

test("US3 active propagates ERR_NO_ACTIVE_FILE from the adapter (Story 3 AC#3)", async () => {
  const { spawnFn } = makeStubSpawn({ stdout: "Error: no active file\n", exitCode: 0 });
  const logger = makeStubLogger();
  const queue = createQueue();
  const err = (await captureRejection(
    executeReadNote({ target_mode: "active" }, { logger, queue, spawnFn, env: {} }),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
  expect(err.details.message).toContain("no active file");
  expect(logger.callEndFailure).toHaveBeenCalledTimes(1);
  expect(logger.callEndFailure.mock.calls[0]![0]).toMatchObject({ errorCode: "ERR_NO_ACTIVE_FILE" });
});

// --- US5: CLI failure surfaces (CLI_NON_ZERO_EXIT, CLI_REPORTED_ERROR, CLI_BINARY_NOT_FOUND, re-throw) ---

test("US5 propagates CLI_NON_ZERO_EXIT (Story 5 AC#1)", async () => {
  const { spawnFn } = makeStubSpawn({ stderr: "file not found", exitCode: 1 });
  const logger = makeStubLogger();
  const queue = createQueue();
  const err = (await captureRejection(
    executeReadNote(
      { target_mode: "specific", vault: "MyVault", file: "Missing" },
      { logger, queue, spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_NON_ZERO_EXIT");
  expect(err.details.exitCode).toBe(1);
  expect(logger.callEndFailure.mock.calls[0]![0]).toMatchObject({ errorCode: "CLI_NON_ZERO_EXIT" });
});

test("US5 propagates CLI_REPORTED_ERROR for in-band Error: prefix (Story 5 AC#2)", async () => {
  const { spawnFn } = makeStubSpawn({ stdout: "Error: File not found\n", exitCode: 0 });
  const logger = makeStubLogger();
  const queue = createQueue();
  const err = (await captureRejection(
    executeReadNote(
      { target_mode: "specific", vault: "MyVault", file: "Missing" },
      { logger, queue, spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_REPORTED_ERROR");
  expect(err.details.message).toBe("Error: File not found");
  expect(logger.callEndFailure.mock.calls[0]![0]).toMatchObject({ errorCode: "CLI_REPORTED_ERROR" });
});

test("US5 propagates CLI_BINARY_NOT_FOUND when spawn raises ENOENT (Story 5 AC#3)", async () => {
  const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const { spawnFn } = makeStubSpawn({ errorOnSpawn: enoent });
  const logger = makeStubLogger();
  const queue = createQueue();
  const err = (await captureRejection(
    executeReadNote(
      { target_mode: "specific", vault: "MyVault", file: "Recipe" },
      { logger, queue, spawnFn, env: {} },
    ),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
  expect(err.code).toBe("CLI_BINARY_NOT_FOUND");
  expect(err.details.binaryAttempted).toBeDefined();
  expect(logger.callEndFailure.mock.calls[0]![0]).toMatchObject({ errorCode: "CLI_BINARY_NOT_FOUND" });
});

test("US5 re-throws non-UpstreamError verbatim WITHOUT emitting callEndFailure (Story 5 AC#4)", async () => {
  const synthetic = new Error("synthetic non-UpstreamError");
  const { spawnFn } = makeStubSpawn({ errorOnSpawn: synthetic });
  const logger = makeStubLogger();
  const queue = createQueue();
  const rejection = await captureRejection(
    executeReadNote(
      { target_mode: "specific", vault: "MyVault", file: "Recipe" },
      { logger, queue, spawnFn, env: {} },
    ),
  );
  expect(rejection).toBe(synthetic);
  expect(rejection).not.toBeInstanceOf(UpstreamError);
  expect(logger.callEndFailure).not.toHaveBeenCalled();
  expect(logger.callEndSuccess).not.toHaveBeenCalled();
});
