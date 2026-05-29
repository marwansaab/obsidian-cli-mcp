// Original — no upstream.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeViewsBase, type ExecuteDeps } from "./handler.js";
import {
  __resetInFlightRegistryForTests,
  type SpawnLike,
} from "../../cli-adapter/_dispatch.js";
import { UpstreamError } from "../../errors.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";

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

test("not a base file error classification (success-path guard, clean stdout)", async () => {
  // Clean exit-0 stdout WITHOUT an "Error:" prefix: dispatch priority (d)
  // resolves it as success, so invokeCli returns cleanly and the handler's
  // success-path NOT_A_BASE_FILE guard (L66-73) re-classifies. cause is null.
  const deps = makeDeps([{
    stdout: "Active file is not a base file: notes/x.md",
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
    expect(ue.cause).toBeNull();
  }
});

test("not a base file error classification (success-path guard, stderr match)", async () => {
  // Clean exit-0 with the phrase only on stderr: combined stdout\nstderr (L65)
  // still matches NOT_A_BASE_FILE_PATTERN, exercising the stderr half.
  const deps = makeDeps([{
    stdout: "",
    stderr: "active file is not a base file",
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
    expect(ue.cause).toBeNull();
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
