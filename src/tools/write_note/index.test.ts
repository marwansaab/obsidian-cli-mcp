// Original — no upstream. Tests for the write_note tool registration — descriptor shape, stripped schema, help mention, docs presence.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";

import { createWriteNoteTool, WRITE_NOTE_DESCRIPTION, WRITE_NOTE_TOOL_NAME } from "./index.js";

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

describe("createWriteNoteTool — descriptor", () => {
  // (a) Story 8 AC#1 base — descriptor name
  it("publishes name = 'write_note' and description verbatim (Story 8 AC#1)", () => {
    const tool = createWriteNoteTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(WRITE_NOTE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("write_note");
    expect(tool.descriptor.description).toBe(WRITE_NOTE_DESCRIPTION);
  });

  // (b) Story 8 AC#1 + AC#2 — emitted inputSchema shape
  it("emits a flat post-010 inputSchema with all 8 properties, additionalProperties:false, no description keys (Story 8 AC#2)", () => {
    const tool = createWriteNoteTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.oneOf).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual([
      "content",
      "file",
      "open",
      "overwrite",
      "path",
      "target_mode",
      "template",
      "vault",
    ]);
    expect(schema.required).toEqual(expect.arrayContaining(["target_mode", "content"]));
    let descriptionKeysFound = 0;
    walkSchema(schema, (n) => {
      if (Object.prototype.hasOwnProperty.call(n, "description")) descriptionKeysFound += 1;
    });
    expect(descriptionKeysFound).toBe(0);
  });

  // (c) Story 8 AC#3 — description mentions help and write_note
  it("description references help() and the tool name 'write_note' (Story 8 AC#3, FR-012)", () => {
    const tool = createWriteNoteTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const desc = tool.descriptor.description.toLowerCase();
    expect(desc).toContain("help");
    expect(desc).toContain("write_note");
    expect(tool.descriptor.description.length).toBeGreaterThan(0);
  });
});

describe("createWriteNoteTool — handler integration via registerTool", () => {
  // (d) End-to-end VALIDATION_ERROR propagation
  it("missing required content surfaces as VALIDATION_ERROR isError envelope (registerTool ZodError wrap)", async () => {
    const tool = createWriteNoteTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const result = (await tool.handler({ target_mode: "specific" })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.message).toContain("write_note");
  });
});

describe("docs/tools/write_note.md exists and is non-stub (FR-014, FR-016 case e)", () => {
  // (e) Story 8 AC#4 / FR-014 / FR-016 case (e) — docs file presence + content
  it("docs file resolves via import.meta.url, has no TODO marker, and contains all 5 error codes + 4 example shapes", () => {
    const docsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/write_note.md");
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
    expect(body).toMatch(/target_mode[\s\S]*?specific[\s\S]*?path/);
    expect(body).toMatch(/target_mode[\s\S]*?specific[\s\S]*?file/);
    expect(body).toMatch(/target_mode[\s\S]*?specific[\s\S]*?overwrite/);
    expect(body).toMatch(/target_mode[\s\S]*?active/);
  });
});
