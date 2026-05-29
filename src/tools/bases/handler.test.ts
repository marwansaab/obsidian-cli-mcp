// Original — no upstream.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeBases, type ExecuteDeps } from "./handler.js";
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
  recorded: Array<{ binary: string; argv: string[] }>;
} {
  const recorded: Array<{ binary: string; argv: string[] }> = [];
  let idx = 0;
  const spawnFn: SpawnLike = (binary, argv, _options: SpawnOptions) => {
    const spec = responses[idx++]!;
    recorded.push({ binary, argv: [...argv] });
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
  return { spawnFn, recorded };
}

function makeDeps(responses: StubResponse[]): {
  deps: ExecuteDeps;
  recorded: Array<{ binary: string; argv: string[] }>;
} {
  const { spawnFn, recorded } = makeSpawn(responses);
  return {
    deps: {
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn,
    },
    recorded,
  };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

test("happy: multi-base sorted output", async () => {
  const stdout = "Vault Health Check.base\n000-Meta/Bases/Type ID Index.base\n220-Planning/Backlog (Base).base\n";
  const { deps } = makeDeps([{ stdout }]);

  const result = await executeBases({}, deps);

  expect(result.bases).toEqual([
    "000-Meta/Bases/Type ID Index.base",
    "220-Planning/Backlog (Base).base",
    "Vault Health Check.base",
  ]);
  expect(result.count).toBe(3);
});

test("happy: empty vault returns count=0", async () => {
  const { deps } = makeDeps([{ stdout: "" }]);

  const result = await executeBases({}, deps);

  expect(result.bases).toEqual([]);
  expect(result.count).toBe(0);
});

test("happy: deterministic sort order", async () => {
  const stdout = "c.base\na.base\nb.base\n";
  const { deps } = makeDeps([{ stdout }]);

  const result = await executeBases({}, deps);

  expect(result.bases).toEqual(["a.base", "b.base", "c.base"]);
});

test("vault parameter accepted but silently ignored (R-001)", async () => {
  const stdout = "test.base\n";
  const { deps, recorded } = makeDeps([{ stdout }]);

  const result = await executeBases({ vault: "MyVault" }, deps);

  expect(result.bases).toEqual(["test.base"]);
  expect(result.count).toBe(1);
  expect(recorded.length).toBe(1);
});

test("upstream CLI failure surfaces as UpstreamError", async () => {
  const { deps } = makeDeps([{ stdout: "", exitCode: 1, stderr: "Error: something failed" }]);

  await expect(executeBases({}, deps)).rejects.toThrow(UpstreamError);
});
