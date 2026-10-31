// Original — no upstream. Tests for the find_by_property tool registration — descriptor shape, output-shape disclosure, docs presence + content completeness, drift-detector parameterised lock.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createFindByPropertyTool,
  FIND_BY_PROPERTY_DESCRIPTION,
  FIND_BY_PROPERTY_TOOL_NAME,
} from "./index.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createFindByPropertyTool — descriptor", () => {
  // (a) Story 7 — descriptor name
  it("publishes name = 'find_by_property'", () => {
    const tool = createFindByPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(FIND_BY_PROPERTY_TOOL_NAME);
    expect(tool.descriptor.name).toBe("find_by_property");
    expect(tool.descriptor.description).toBe(FIND_BY_PROPERTY_DESCRIPTION);
  });

  // (c) Story 7 — descriptor description surfaces the output shape
  it("description surfaces the {count, paths} output shape", () => {
    const tool = createFindByPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const desc = tool.descriptor.description;
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

// Exercises the index.ts handler closure `async (input, d) => executeFindByProperty(input, d)`.
// Case (d) above stops at _register's validation gate before the closure runs; this case
// passes a schema-valid payload so the closure executes through to a success envelope.
describe("createFindByPropertyTool — handler closure executes on VALID input", () => {
  it("tool.handler(valid input) drives the closure → executeFindByProperty → { count, paths } envelope", async () => {
    const tool = createFindByPropertyTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn({ stdout: '=> {"count":1,"paths":["x.md"]}\n', exitCode: 0 }),
    });
    const result = (await tool.handler({
      vault: "Demo",
      name: "id",
      value: "BI-030",
    })) as { isError?: boolean; content: { type: string; text: string }[] };
    expect(result.isError).toBeUndefined();
    expect(Array.isArray(result.content)).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload).toEqual({ count: 1, paths: ["x.md"] });
  });
});

describe("createFindByPropertyTool — deprecated names (spec 073)", () => {
  type Result = { isError?: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown> };
  const stub = () => makeStubSpawn({ stdout: '=> {"count":1,"paths":["x.md"]}\n', exitCode: 0 });

  it("O1: a new-name call carries no deprecated_parameters", async () => {
    const tool = createFindByPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: stub() });
    const result = (await tool.handler({ vault: "Demo", name: "id", value: "BI-030", array_match: true, case_sensitive: true })) as Result;
    expect(result.structuredContent).toEqual({ count: 1, paths: ["x.md"] });
  });

  it("O2: an old-name call gets today's result plus the notice, identical in text and structuredContent", async () => {
    const tool = createFindByPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: stub() });
    const result = (await tool.handler({ vault: "Demo", property: "id", value: "BI-030", arrayMatch: true, caseSensitive: true })) as Result;
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      count: 1,
      paths: ["x.md"],
      deprecated_parameters: [
        { parameter: "property", replacement: "name" },
        { parameter: "arrayMatch", replacement: "array_match" },
        { parameter: "caseSensitive", replacement: "case_sensitive" },
      ],
    });
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
  });

  it("O4: old + new → VALIDATION_ERROR, nothing spawned", async () => {
    let spawned = false;
    const spawnSpy: SpawnLike = () => {
      spawned = true;
      throw new Error("spawn on a rejected call");
    };
    const tool = createFindByPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: spawnSpy });
    const result = (await tool.handler({ name: "id", property: "id", value: "x" })) as Result;
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.details.issues).toEqual([
      expect.objectContaining({ path: ["property"], message: "`property` is deprecated and replaced by `name`; supply only `name`" }),
    ]);
    expect(spawned).toBe(false);
  });

  it("description uses the new names, drops the property: NOTE and lists the deprecated ones", () => {
    expect(FIND_BY_PROPERTY_DESCRIPTION).toContain("Inputs: `{ vault?, name, value, folder?, array_match?, case_sensitive? }`.");
    expect(FIND_BY_PROPERTY_DESCRIPTION).not.toContain("NOTE — the property-name parameter");
    expect(FIND_BY_PROPERTY_DESCRIPTION).toContain(
      "Deprecated names (accepted until the next major release; a call that uses one gets `deprecated_parameters` in its result): `property` → `name`, `arrayMatch` → `array_match`, `caseSensitive` → `case_sensitive`.",
    );
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
