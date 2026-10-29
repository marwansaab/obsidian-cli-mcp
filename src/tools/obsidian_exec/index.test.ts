// Original — no upstream. Co-located tests for the obsidian_exec tool's registered surface — descriptor + handler exercised via registerTool.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createObsidianExecTool, OBSIDIAN_EXEC_DESCRIPTION, OBSIDIAN_EXEC_TOOL_NAME } from "./index.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";


function makeStubSpawn(opts: { stdout?: string; stderr?: string; exitCode?: number; errorOnSpawn?: NodeJS.ErrnoException } = {}): SpawnLike {
  return (binary, _argv, _options: SpawnOptions) => {
    if (opts.errorOnSpawn) throw opts.errorOnSpawn;
    void binary;
    const child = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: (signal?: NodeJS.Signals) => boolean;
      pid?: number;
    };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.pid = 7;
    child.kill = () => true;
    setImmediate(() => {
      if (opts.stdout) child.stdout.push(Buffer.from(opts.stdout, "utf8"));
      child.stdout.push(null);
      if (opts.stderr) child.stderr.push(Buffer.from(opts.stderr, "utf8"));
      child.stderr.push(null);
      setImmediate(() => child.emit("exit", opts.exitCode ?? 0, null));
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createObsidianExecTool — descriptor", () => {
  it("publishes the documented name + description verbatim", () => {
    const tool = createObsidianExecTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(OBSIDIAN_EXEC_TOOL_NAME);
    expect(tool.descriptor.description).toBe(OBSIDIAN_EXEC_DESCRIPTION);
  });

  it("publishes inputSchema with type === 'object' (FR-002)", () => {
    const tool = createObsidianExecTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect((tool.descriptor.inputSchema as Record<string, unknown>).type).toBe("object");
  });
});

describe("createObsidianExecTool — handler integration via registerTool", () => {
  it("happy path wraps executeObsidianExec output in JSON-stringified content (responseFormat: 'json')", async () => {
    const tool = createObsidianExecTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn({ stdout: "1.7.2\n", exitCode: 0 }),
      env: {},
    });
    const result = (await tool.handler({ command: "version" })) as { content: { type: string; text: string }[] };
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.stdout).toBe("1.7.2\n");
    expect(parsed.exitCode).toBe(0);
    expect(parsed.argv).toEqual(["obsidian", "version"]);
  });

  it("VALIDATION_ERROR for invalid input (empty command)", async () => {
    const tool = createObsidianExecTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const result = (await tool.handler({ command: "" })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.message).toContain("obsidian_exec");
  });

  it("CLI_NON_ZERO_EXIT surfaces through the structured-error envelope", async () => {
    const tool = createObsidianExecTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn({ stderr: "boom", exitCode: 2 }),
      env: {},
    });
    const result = (await tool.handler({ command: "x" })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("CLI_NON_ZERO_EXIT");
    expect(payload.details.exitCode).toBe(2);
  });
});

describe("createObsidianExecTool — allowEval deps reach the handler (068 T023/T024)", () => {
  function countingSpawn(): { spawnFn: SpawnLike; calls: () => number } {
    let n = 0;
    const inner = makeStubSpawn({ stdout: "2\n", exitCode: 0 });
    return {
      spawnFn: (binary, argv, options) => {
        n += 1;
        return inner(binary, argv, options);
      },
      calls: () => n,
    };
  }

  it("default deps: a blocked command returns the COMMAND_BLOCKED envelope (errors contract) and never spawns", async () => {
    const { spawnFn, calls } = countingSpawn();
    const tool = createObsidianExecTool({ logger: silentLogger(), queue: createQueue(), spawnFn, env: {} });
    const result = (await tool.handler({ command: "eval", parameters: { code: "1+1" } })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
      structuredContent?: unknown;
    };
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.structuredContent).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      code: "VALIDATION_ERROR",
      message:
        "obsidian_exec: command `eval` is blocked by default because it can run arbitrary code or drive developer tooling. The vault owner can allow it by setting OBSIDIAN_MCP_ALLOW_EVAL=1.",
      details: { code: "COMMAND_BLOCKED", command: "eval" },
    });
    expect(calls()).toBe(0);
  });

  it("allowEval: true in the registration deps spawns the command", async () => {
    const { spawnFn, calls } = countingSpawn();
    const tool = createObsidianExecTool({ logger: silentLogger(), queue: createQueue(), spawnFn, env: {}, allowEval: true });
    const result = (await tool.handler({ command: "eval", parameters: { code: "1+1" } })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text).stdout).toBe("2\n");
    expect(calls()).toBe(1);
  });
});
