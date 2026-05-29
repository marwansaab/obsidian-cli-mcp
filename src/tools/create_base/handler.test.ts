// Original — no upstream.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import { afterEach, beforeEach, expect, test } from "vitest";

import { executeCreateBase, type ExecuteDeps } from "./handler.js";
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

test("happy: parsed filename + constructed path", async () => {
  const { deps } = makeDeps([{ stdout: "Created: New item.md\n" }]);

  const result = await executeCreateBase(
    { path: "220-Planning/Backlog (Base).base", name: "New item" },
    deps,
  );

  expect(result.name).toBe("New item.md");
  expect(result.path).toBe("220-Planning/Backlog (Base)/New item.md");
});

test("happy: root-level base file path construction", async () => {
  const { deps } = makeDeps([{ stdout: "Created: Test.md\n" }]);

  const result = await executeCreateBase(
    { path: "Tasks.base", name: "Test" },
    deps,
  );

  expect(result.name).toBe("Test.md");
  expect(result.path).toBe("Tasks/Test.md");
});

test("name collision auto-increment (R-005)", async () => {
  const { deps } = makeDeps([{ stdout: "Created: New item 1.md\n" }]);

  const result = await executeCreateBase(
    { path: "220-Planning/Backlog (Base).base", name: "New item" },
    deps,
  );

  expect(result.name).toBe("New item 1.md");
  expect(result.path).toBe("220-Planning/Backlog (Base)/New item 1.md");
});

test("content parameter passthrough", async () => {
  const { deps, recorded } = makeDeps([{ stdout: "Created: Test.md\n" }]);

  await executeCreateBase(
    { path: "Tasks.base", name: "Test", content: "Body text" },
    deps,
  );

  const argv = recorded[0]!.argv;
  expect(argv.some((a) => a.includes("content="))).toBe(true);
});

test("view parameter passthrough", async () => {
  const { deps, recorded } = makeDeps([{ stdout: "Created: Test.md\n" }]);

  await executeCreateBase(
    { path: "Tasks.base", name: "Test", view: "All" },
    deps,
  );

  const argv = recorded[0]!.argv;
  expect(argv.some((a) => a.includes("view="))).toBe(true);
});

test("BASE_NOT_FOUND error classification (dispatch-layer catch)", async () => {
  const { deps } = makeDeps([{
    stdout: "Error: Base file not found: nonexistent.base",
    exitCode: 0,
  }]);

  try {
    await executeCreateBase(
      { path: "nonexistent.base", name: "x" },
      deps,
    );
    throw new Error("expected rejection");
  } catch (err) {
    expect(err).toBeInstanceOf(UpstreamError);
    const ue = err as UpstreamError;
    expect(ue.code).toBe("CLI_REPORTED_ERROR");
    expect(ue.details.code).toBe("BASE_NOT_FOUND");
  }
});

test("BASE_NOT_FOUND on success envelope (post-success path, cause null)", async () => {
  const { deps } = makeDeps([{
    stdout: "Base file not found: x.base\n",
    exitCode: 0,
  }]);

  try {
    await executeCreateBase(
      { path: "x.base", name: "x" },
      deps,
    );
    throw new Error("expected rejection");
  } catch (err) {
    expect(err).toBeInstanceOf(UpstreamError);
    const ue = err as UpstreamError;
    expect(ue.code).toBe("CLI_REPORTED_ERROR");
    expect(ue.details.code).toBe("BASE_NOT_FOUND");
    expect(ue.details.path).toBe("x.base");
    expect(ue.cause).toBeNull();
  }
});

test("upstream CLI failure surfaces as UpstreamError", async () => {
  const { deps } = makeDeps([{ stdout: "", exitCode: 1, stderr: "Error: something failed" }]);

  await expect(
    executeCreateBase({ path: "Tasks.base", name: "x" }, deps),
  ).rejects.toThrow(UpstreamError);
});

test("vault parameter accepted but silently ignored (R-004)", async () => {
  const { deps } = makeDeps([{ stdout: "Created: Test.md\n" }]);

  const result = await executeCreateBase(
    { path: "Tasks.base", name: "Test", vault: "MyVault" },
    deps,
  );

  expect(result.name).toBe("Test.md");
});

test("unparseable response throws UpstreamError", async () => {
  const { deps } = makeDeps([{ stdout: "Unexpected output\n" }]);

  try {
    await executeCreateBase({ path: "Tasks.base", name: "x" }, deps);
    throw new Error("expected rejection");
  } catch (err) {
    expect(err).toBeInstanceOf(UpstreamError);
    const ue = err as UpstreamError;
    expect(ue.code).toBe("CLI_REPORTED_ERROR");
    expect(ue.details.stage).toBe("response-parse");
  }
});
