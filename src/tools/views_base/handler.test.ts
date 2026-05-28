// Original — no upstream.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeViewsBase, type ExecuteDeps } from "./handler.js";
import {
  __resetInFlightRegistryForTests,
  type SpawnLike,
} from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createLogger, type Logger } from "../../logger.js";
import { createQueue } from "../../queue.js";

interface StubResponse {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
}

function makeSpawn(responses: StubResponse[]): {
  spawnFn: SpawnLike;
} {
  let idx = 0;
  const spawnFn: SpawnLike = (_binary, _argv, _options: SpawnOptions) => {
    const spec = responses[idx++]!;
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 7777;
    child.kill = () => true;
    setImmediate(() => {
      if (spec.stdout) child.stdout.push(Buffer.from(spec.stdout, "utf8"));
      child.stdout.push(null);
      if (spec.stderr) child.stderr.push(Buffer.from(spec.stderr, "utf8"));
      child.stderr.push(null);
      setImmediate(() => {
        child.emit("exit", spec.exitCode ?? 0, spec.signal ?? null);
      });
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
  return { spawnFn };
}

function silentLogger(): Logger {
  return createLogger({
    stream: new Writable({ write(_c, _e, cb) { cb(); } }),
  });
}

function makeDeps(responses: StubResponse[]): ExecuteDeps {
  const { spawnFn } = makeSpawn(responses);
  return {
    logger: silentLogger(),
    queue: createQueue(),
    spawnFn,
  };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

test("happy: multi-view output", async () => {
  const stdout = "All\nActive\nCompleted\n";
  const deps = makeDeps([{ stdout }]);

  const result = await executeViewsBase({}, deps);

  expect(result.views).toEqual(["All", "Active", "Completed"]);
  expect(result.count).toBe(3);
});

test("happy: zero views returns count=0", async () => {
  const deps = makeDeps([{ stdout: "" }]);

  const result = await executeViewsBase({}, deps);

  expect(result.views).toEqual([]);
  expect(result.count).toBe(0);
});

test("not a base file error classification (dispatch-layer catch)", async () => {
  const deps = makeDeps([{
    stdout: "Error: Active file is not a base file: some/path.md",
    exitCode: 0,
  }]);

  try {
    await executeViewsBase({}, deps);
    throw new Error("expected rejection");
  } catch (err) {
    expect(err).toBeInstanceOf(UpstreamError);
    const ue = err as UpstreamError;
    expect(ue.code).toBe("CLI_REPORTED_ERROR");
    expect(ue.details.code).toBe("BASE_NOT_FOUND");
  }
});

test("upstream CLI failure surfaces as UpstreamError", async () => {
  const deps = makeDeps([{ stdout: "", exitCode: 1, stderr: "Error: something failed" }]);

  await expect(executeViewsBase({}, deps)).rejects.toThrow(UpstreamError);
});

test("vault parameter accepted but silently ignored (R-003)", async () => {
  const stdout = "All\n";
  const deps = makeDeps([{ stdout }]);

  const result = await executeViewsBase({ vault: "MyVault" }, deps);

  expect(result.views).toEqual(["All"]);
  expect(result.count).toBe(1);
});
