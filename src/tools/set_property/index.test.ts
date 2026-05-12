// Original — no upstream. Tests for the set_property tool registration — descriptor name + description, stripped JSON Schema, help mention, docs file presence + content completeness.
import { type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSetPropertyTool, SET_PROPERTY_DESCRIPTION, SET_PROPERTY_TOOL_NAME } from "./index.js";
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

describe("createSetPropertyTool — descriptor", () => {
  // (1) descriptor name = "set_property"
  it("publishes name = 'set_property'", () => {
    const tool = createSetPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(SET_PROPERTY_TOOL_NAME);
    expect(tool.descriptor.name).toBe("set_property");
  });

  // (2) description includes typed-write summary token + tool name + help mention
  it("description references help(), 'set_property', and the typed-write summary", () => {
    const tool = createSetPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.description).toBe(SET_PROPERTY_DESCRIPTION);
    const lower = SET_PROPERTY_DESCRIPTION.toLowerCase();
    expect(lower).toContain("help");
    expect(lower).toContain("set_property");
    expect(lower).toContain("write");
    expect(lower).toContain("property");
  });

  // (3) emitted inputSchema is stripped of description keys (ADR-005)
  it("emits flat inputSchema with all 7 properties, required ⊇ {target_mode, name, value}, additionalProperties:false, no description keys", () => {
    const tool = createSetPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["file", "name", "path", "target_mode", "type", "value", "vault"]);
    const required = schema.required as string[];
    expect(required).toEqual(expect.arrayContaining(["target_mode", "name", "value"]));
    let descriptionKeysFound = 0;
    walkSchema(schema, (n) => {
      if (Object.prototype.hasOwnProperty.call(n, "description")) descriptionKeysFound += 1;
    });
    expect(descriptionKeysFound).toBe(0);
  });
});

// (4) help facility references set_property — the help tool reads from the docs index
describe("help facility references set_property (registry-consistency)", () => {
  it("docs/tools/index.md mentions set_property", () => {
    const indexPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/index.md");
    expect(existsSync(indexPath)).toBe(true);
    const body = readFileSync(indexPath, "utf8");
    expect(body).toContain("set_property");
  });
});

// (5) docs/tools/set_property.md exists and is non-stub
describe("docs/tools/set_property.md exists and is non-stub", () => {
  it("docs file resolves, has no TODO marker, contains all 5 inherited error codes, ≥4 example sections, and a known-limitations note", () => {
    const docsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/set_property.md");
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
    expect(body).toMatch(/known limitation|limitations/i);
  });
});
