// Original — no upstream. Tests for the read_property tool registration — descriptor shape, stripped schema, help mention + output-shape disclosure, docs presence + content completeness.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createReadPropertyTool, READ_PROPERTY_DESCRIPTION, READ_PROPERTY_TOOL_NAME } from "./index.js";
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

function walkSchema(node: unknown, fn: (n: Record<string, unknown>) => void): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkSchema(item, fn);
    return;
  }
  fn(node as Record<string, unknown>);
  for (const value of Object.values(node as Record<string, unknown>)) walkSchema(value, fn);
}

describe("createReadPropertyTool — descriptor", () => {
  // (a) Story 5 — descriptor name
  it("publishes name = 'read_property' (Story 5)", () => {
    const tool = createReadPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(READ_PROPERTY_TOOL_NAME);
    expect(tool.descriptor.name).toBe("read_property");
    expect(tool.descriptor.description).toBe(READ_PROPERTY_DESCRIPTION);
  });

  // (b) Story 5 — emitted post-010 inputSchema invariants
  it("emits a flat post-010 inputSchema with all 5 properties, additionalProperties:false, required includes target_mode AND name, no description keys", () => {
    const tool = createReadPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.oneOf).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["file", "name", "path", "target_mode", "vault"]);
    const required = schema.required as string[];
    expect(required).toEqual(expect.arrayContaining(["target_mode", "name"]));
    let descriptionKeysFound = 0;
    walkSchema(schema, (n) => {
      if (Object.prototype.hasOwnProperty.call(n, "description")) descriptionKeysFound += 1;
    });
    expect(descriptionKeysFound).toBe(0);
  });

  // (c) Story 5 — descriptor description references help, the tool name, and output shape
  it("description references help(), the tool name 'read_property', and surfaces the {value, type} output shape", () => {
    const tool = createReadPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const desc = tool.descriptor.description;
    const lower = desc.toLowerCase();
    expect(lower).toContain("help");
    expect(lower).toContain("read_property");
    expect(desc).toMatch(/value.*type|type.*value/i);
    expect(desc.length).toBeGreaterThan(0);
  });
});

describe("createReadPropertyTool — handler integration via registerTool", () => {
  // (d) F10 — VALIDATION_ERROR envelope + spawn-spy gate (FR-016)
  it("missing required vault+locator+name surfaces as VALIDATION_ERROR isError envelope; spawn never called (F10 / FR-016)", async () => {
    let spawnCalled = false;
    const spawnSpy: SpawnLike = () => {
      spawnCalled = true;
      throw new Error("spawnFn called on validation failure — FR-016 violation");
    };
    const tool = createReadPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: spawnSpy });
    const result = (await tool.handler({ target_mode: "specific" })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.message).toContain("read_property");
    expect(spawnCalled).toBe(false);
  });
});

describe("docs/tools/read_property.md exists and is non-stub (FR-022)", () => {
  // (e) Story 5 / FR-022 docs presence + content completeness
  it("docs file resolves via import.meta.url, has no TODO marker, contains all 5 error codes + ≥4 example sections + active-mode multi-vault note", () => {
    const docsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/read_property.md");
    expect(existsSync(docsPath)).toBe(true);
    const body = readFileSync(docsPath, "utf8");
    expect(body).not.toContain("<!-- TODO");
    for (const code of [
      "VALIDATION_ERROR",
      "CLI_BINARY_NOT_FOUND",
      "CLI_NON_ZERO_EXIT",
      "CLI_REPORTED_ERROR",
      "ERR_NO_ACTIVE_FILE",
    ]) {
      expect(body).toContain(code);
    }
    const exampleHeadings = (body.match(/### Example/g) ?? []).length;
    expect(exampleHeadings).toBeGreaterThanOrEqual(4);
    expect(body).toMatch(/multi-?vault|multiple vaults|default vault/i);
  });
});
