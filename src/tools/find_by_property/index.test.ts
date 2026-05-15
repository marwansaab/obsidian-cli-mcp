// Original — no upstream. Tests for the find_by_property tool registration — descriptor shape, stripped schema, help mention, docs presence + content completeness, drift-detector parameterised lock.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createFindByPropertyTool,
  FIND_BY_PROPERTY_DESCRIPTION,
  FIND_BY_PROPERTY_TOOL_NAME,
} from "./index.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";

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

describe("createFindByPropertyTool — descriptor", () => {
  // (a) Story 7 — descriptor name
  it("publishes name = 'find_by_property'", () => {
    const tool = createFindByPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(FIND_BY_PROPERTY_TOOL_NAME);
    expect(tool.descriptor.name).toBe("find_by_property");
    expect(tool.descriptor.description).toBe(FIND_BY_PROPERTY_DESCRIPTION);
  });

  // (b) Story 7 — emitted post-010 inputSchema invariants
  it("emits a flat inputSchema with all 6 properties, additionalProperties:false, required={property,value}, no description keys", () => {
    const tool = createFindByPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual([
      "arrayMatch",
      "caseSensitive",
      "folder",
      "property",
      "value",
      "vault",
    ]);
    const required = schema.required as string[];
    expect(required.sort()).toEqual(["property", "value"]);
    let descriptionKeysFound = 0;
    walkSchema(schema, (n) => {
      if (Object.prototype.hasOwnProperty.call(n, "description")) descriptionKeysFound += 1;
    });
    expect(descriptionKeysFound).toBe(0);
  });

  // (c) Story 7 — descriptor description references help, the tool name, and output shape
  it("description references help(), the tool name 'find_by_property', and surfaces the {count, paths} output shape", () => {
    const tool = createFindByPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const desc = tool.descriptor.description;
    const lower = desc.toLowerCase();
    expect(lower).toContain("help");
    expect(lower).toContain("find_by_property");
    expect(desc).toMatch(/count.*paths|paths.*count/i);
    expect(desc.length).toBeGreaterThan(0);
  });
});

describe("createFindByPropertyTool — handler integration via registerTool", () => {
  // (d) FR-018 — VALIDATION_ERROR envelope + spawn-spy gate
  it("missing required property+value surfaces as VALIDATION_ERROR isError envelope; spawn never called (FR-018)", async () => {
    let spawnCalled = false;
    const spawnSpy: SpawnLike = () => {
      spawnCalled = true;
      throw new Error("spawnFn called on validation failure — FR-018 violation");
    };
    const tool = createFindByPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: spawnSpy });
    const result = (await tool.handler({})) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.message).toContain("find_by_property");
    expect(spawnCalled).toBe(false);
  });
});

describe("docs/tools/find_by_property.md exists and is non-stub (FR-025)", () => {
  // (e) Story 7 / FR-025 docs presence + content completeness
  it("docs file resolves via import.meta.url, has no TODO marker, contains all 4 error codes + ≥4 example sections + multi-vault note", () => {
    const docsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/find_by_property.md");
    expect(existsSync(docsPath)).toBe(true);
    const body = readFileSync(docsPath, "utf8");
    expect(body).not.toContain("<!-- TODO");
    for (const code of [
      "VALIDATION_ERROR",
      "CLI_BINARY_NOT_FOUND",
      "CLI_NON_ZERO_EXIT",
      "CLI_REPORTED_ERROR",
    ]) {
      expect(body).toContain(code);
    }
    const exampleHeadings = (body.match(/### Example/g) ?? []).length;
    expect(exampleHeadings).toBeGreaterThanOrEqual(4);
    expect(body).toMatch(/multi-?vault|multiple vaults|focused vault/i);
  });
});
