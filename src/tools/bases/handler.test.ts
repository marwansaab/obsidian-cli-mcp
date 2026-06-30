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
  // Real empty-vault emission: the native `bases` subcommand exits 0 and prints
  // an informational line on stdout (research D6 / T0 P1). The stale fixture used
  // `stdout: ""`, which never reproduced the defect. With the genuine emission the
  // positive `.base` filter must drop the message and yield an honest empty result.
  const { deps } = makeDeps([{ stdout: "No base files found in vault\n" }]);

  const result = await executeBases({}, deps);

  expect(result.bases).toEqual([]);
  expect(result.count).toBe(0);
});

test("happy: deterministic sort order", async () => {
  const stdout = "c.base\na.base\nb.base\n";
  const { deps } = makeDeps([{ stdout }]);

  const result = await executeBases({}, deps);

  expect(result.bases).toEqual(["a.base", "b.base", "c.base"]);
  expect(result.count).toBe(3);
});

test("vault parameter accepted but silently ignored (R-001)", async () => {
  const stdout = "test.base\n";
  const { deps, recorded } = makeDeps([{ stdout }]);

  const result = await executeBases({ vault: "MyVault" }, deps);

  expect(result.bases).toEqual(["test.base"]);
  expect(result.count).toBe(1);
  expect(recorded.length).toBe(1);
});

test("regression: populated listing is byte-identical to pre-fix (FR-004 / SC-003)", async () => {
  // Fixed multi-base fixture matching the live T0 P2 shape (one lowercase `.base`
  // path per line, names with spaces/punctuation emitted verbatim). The positive
  // `.base` filter must keep every line — zero membership or ordering difference
  // versus the pre-fix filter(non-empty).
  const stdout =
    "Vault Health Check.base\n000-Meta/Bases/Type ID Index.base\n220-Planning/Backlog (Base).base\n";
  const { deps } = makeDeps([{ stdout }]);

  const result = await executeBases({}, deps);

  expect(result.bases).toEqual([
    "000-Meta/Bases/Type ID Index.base",
    "220-Planning/Backlog (Base).base",
    "Vault Health Check.base",
  ]);
  expect(result.count).toBe(3);
});

test("boundary: whitespace-only / blank stdout returns empty (FR-002)", async () => {
  const { deps } = makeDeps([{ stdout: "   \n\n" }]);

  const result = await executeBases({}, deps);

  expect(result.bases).toEqual([]);
  expect(result.count).toBe(0);
});

test("boundary: a single real Base still counts 1 (FR-005)", async () => {
  const { deps } = makeDeps([{ stdout: "Only One.base\n" }]);

  const result = await executeBases({}, deps);

  expect(result.bases).toEqual(["Only One.base"]);
  expect(result.count).toBe(1);
});

test("defensive: informational message mixed with a real path keeps only the path (FR-002)", async () => {
  const { deps } = makeDeps([{ stdout: "No base files found in vault\nReal One.base\n" }]);

  const result = await executeBases({}, deps);

  expect(result.bases).toEqual(["Real One.base"]);
  expect(result.count).toBe(1);
});

test("case-insensitive: a `.Base` extension line is kept (FR-002 / research D5)", async () => {
  const { deps } = makeDeps([{ stdout: "Mixed.Base\n" }]);

  const result = await executeBases({}, deps);

  expect(result.bases).toEqual(["Mixed.Base"]);
  expect(result.count).toBe(1);
});

// Story 3 (US3): a genuine upstream failure must stay observably distinct from the
// empty-vault success — a thrown typed error vs the clean { bases: [], count: 0 }
// envelope. The error path is owned by `invokeCli`/`dispatchCli` (raised before the
// filter runs), so the positive-`.base` filter never converts a failure into empty.
test("upstream CLI failure surfaces as UpstreamError (FR-006 / SC-004)", async () => {
  const { deps } = makeDeps([{ stdout: "", exitCode: 1, stderr: "Error: something failed" }]);

  await expect(executeBases({}, deps)).rejects.toThrow(UpstreamError);
});
