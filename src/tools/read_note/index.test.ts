// Original — no upstream. Co-located tests for the read_note tool's registered surface — descriptor + handler exercised via registerTool.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createReadNoteTool, READ_NOTE_DESCRIPTION, READ_NOTE_TOOL_NAME } from "./index.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";


function makeStubSpawn(opts: { stdout?: string; exitCode?: number } = {}): SpawnLike {
  return (binary, _argv, _options: SpawnOptions) => {
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
      child.stderr.push(null);
      setImmediate(() => child.emit("exit", opts.exitCode ?? 0, null));
    });
    return child as unknown as ReturnType<SpawnLike>;
  };
}

const silentLogger = () => createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createReadNoteTool — descriptor", () => {
  it("publishes the documented name + description verbatim", () => {
    const tool = createReadNoteTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(READ_NOTE_TOOL_NAME);
    expect(tool.descriptor.description).toBe(READ_NOTE_DESCRIPTION);
  });

  it("publishes inputSchema as a post-010 flat object with target_mode/vault/file/path properties and additionalProperties: false", () => {
    const tool = createReadNoteTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.oneOf).toBeUndefined();
    expect(schema.allOf).toBeUndefined();
    expect(schema.anyOf).toBeUndefined();
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["file", "path", "target_mode", "vault"]);
    expect(schema.required).toEqual(["target_mode"]);
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("createReadNoteTool — handler integration via registerTool", () => {
  it("specific+file happy path wraps content in JSON-stringified envelope", async () => {
    const tool = createReadNoteTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn({ stdout: "# Note body\n", exitCode: 0 }),
      env: {},
    });
    const result = (await tool.handler({ target_mode: "specific", vault: "MyVault", file: "Note" })) as {
      content: { type: string; text: string }[];
    };
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.content).toBe("# Note body\n");
  });

  it("active happy path wraps stdout content (FR-021 reach: no locator)", async () => {
    const tool = createReadNoteTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn({ stdout: "<active body>", exitCode: 0 }),
      env: {},
    });
    const result = (await tool.handler({ target_mode: "active" })) as {
      content: { type: string; text: string }[];
    };
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.content).toBe("<active body>");
  });

  it("VALIDATION_ERROR for invalid input (specific without locator)", async () => {
    const tool = createReadNoteTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const result = (await tool.handler({ target_mode: "specific", vault: "MyVault" })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.message).toContain("read_note");
  });
});
