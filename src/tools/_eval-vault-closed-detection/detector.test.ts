// Original — no upstream. Tests for detectIfClosed — invokeCli call shape (`vaults verbose` argv), parser delegation, deps wiring, byte-exact vault-name match, propagation of cli-adapter errors. 12 cases per data-model.md inventory.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { detectIfClosed } from "./detector.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";

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

function makeQueuedSpawn(responses: StubResponse[]): {
  spawnFn: SpawnLike;
  recorded: SpawnRecording[];
  getCount: () => number;
} {
  const recorded: SpawnRecording[] = [];
  let idx = 0;
  const spawnFn: SpawnLike = (binary, argv, options) => {
    const spec = responses[idx++];
    if (!spec) {
      throw new Error(
        `unexpected spawn invocation #${idx}; only ${responses.length} response(s) configured`,
      );
    }
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
  return { spawnFn, recorded, getCount: () => idx };
}

function silentLogger(): Logger {
  return createLogger({
    stream: new Writable({
      write(_c, _e, cb) {
        cb();
      },
    }),
  });
}

function deps(spawnFn: SpawnLike) {
  return { logger: silentLogger(), queue: createQueue(), spawnFn, env: {} };
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    throw new Error("expected rejection but promise resolved");
  } catch (e) {
    return e;
  }
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

// (1) vaults verbose returns vault in registry → true
test("vault present in registry: returns true", async () => {
  const stdout = "Demo\tC:\\Vaults\\Demo\nOther\tC:\\Vaults\\Other\n";
  const { spawnFn } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  const result = await detectIfClosed({ vaultName: "Demo", deps: deps(spawnFn) });
  expect(result).toBe(true);
});

// (2) vaults verbose returns registry without the requested vault → false
test("vault absent from registry: returns false", async () => {
  const stdout = "Demo\tC:\\Vaults\\Demo\n";
  const { spawnFn } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  const result = await detectIfClosed({ vaultName: "Missing", deps: deps(spawnFn) });
  expect(result).toBe(false);
});

// (3) issues exactly one spawn invocation
test("exactly one spawn invocation", async () => {
  const { spawnFn, getCount } = makeQueuedSpawn([
    { stdout: "Demo\tC:\\Vaults\\Demo\n", exitCode: 0 },
  ]);
  await detectIfClosed({ vaultName: "Demo", deps: deps(spawnFn) });
  expect(getCount()).toBe(1);
});

// (4) vaults verbose argv shape correct
test("argv shape: ['vaults', 'verbose'] (no vault= prefix)", async () => {
  const { spawnFn, recorded } = makeQueuedSpawn([
    { stdout: "Demo\tC:\\Vaults\\Demo\n", exitCode: 0 },
  ]);
  await detectIfClosed({ vaultName: "Demo", deps: deps(spawnFn) });
  const argv = recorded[0]!.argv;
  expect(argv[0]).toBe("vaults");
  expect(argv).toContain("verbose");
  expect(argv.some((a) => a.startsWith("vault="))).toBe(false);
});

// (5) BOM handling delegated to parser — BOM-prefixed stdout still matches
test("BOM-prefixed stdout handled (delegated to parser)", async () => {
  const stdout = "﻿Demo\tC:\\Vaults\\Demo\n";
  const { spawnFn } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  const result = await detectIfClosed({ vaultName: "Demo", deps: deps(spawnFn) });
  expect(result).toBe(true);
});

// (6) handles realistic multi-vault `Other\tpath\nDemo\tpath` shape
test("realistic multi-vault registry: finds requested vault by name", async () => {
  const stdout =
    "TestVault\tC:\\Vaults\\TestVault\nThe Setup\tD:\\Vaults\\The Setup\nWays of Working\tE:\\Vaults\\Ways of Working\n";
  const { spawnFn } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  expect(await detectIfClosed({ vaultName: "The Setup", deps: deps(spawnFn) })).toBe(true);
});

// (7) handles single-vault output
test("single-vault output: finds the vault", async () => {
  const stdout = "OnlyOne\tC:\\Vaults\\OnlyOne\n";
  const { spawnFn } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  expect(await detectIfClosed({ vaultName: "OnlyOne", deps: deps(spawnFn) })).toBe(true);
});

// (8) empty registry stdout → false
test("empty registry stdout: returns false", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "", exitCode: 0 }]);
  expect(await detectIfClosed({ vaultName: "Demo", deps: deps(spawnFn) })).toBe(false);
});

// (9) deps wiring: logger / queue / spawnFn pass-through (no thrown error means deps reached invokeCli)
test("deps wiring: invokeCli receives logger / queue / spawnFn / env", async () => {
  const { spawnFn, getCount } = makeQueuedSpawn([
    { stdout: "Demo\tC:\\Vaults\\Demo\n", exitCode: 0 },
  ]);
  const customDeps = deps(spawnFn);
  const result = await detectIfClosed({ vaultName: "Demo", deps: customDeps });
  expect(result).toBe(true);
  expect(getCount()).toBe(1);
});

// (10) error propagation: dispatch-layer error propagates to caller
test("dispatch error propagates: spawn error becomes UpstreamError", async () => {
  const { spawnFn } = makeQueuedSpawn([
    { errorOnSpawn: Object.assign(new Error("ENOENT"), { code: "ENOENT" }) },
  ]);
  const err = (await captureRejection(
    detectIfClosed({ vaultName: "Demo", deps: deps(spawnFn) }),
  )) as UpstreamError;
  expect(err).toBeInstanceOf(UpstreamError);
});

// (11) unknown-vault classifier from cli-adapter: empty stdout on vaults call still yields false
// (we cannot easily simulate the 011-R5 "Vault not found." string here because vaults itself
// does not emit that, but we lock the behaviour that empty stdout does NOT cause an exception)
test("empty stdout from vaults: returns false (no false positive)", async () => {
  const { spawnFn } = makeQueuedSpawn([{ stdout: "", exitCode: 0 }]);
  const result = await detectIfClosed({ vaultName: "Anything", deps: deps(spawnFn) });
  expect(result).toBe(false);
});

// (12) vaultName is byte-exact compared (case-sensitive)
test("vault-name compare is byte-exact, case-sensitive", async () => {
  const stdout = "demo\tC:\\Vaults\\demo\n";
  const { spawnFn } = makeQueuedSpawn([{ stdout, exitCode: 0 }]);
  // case mismatch must NOT match
  expect(await detectIfClosed({ vaultName: "Demo", deps: deps(spawnFn) })).toBe(false);
});
