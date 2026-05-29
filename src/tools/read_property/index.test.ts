// Original — no upstream. Tests for the read_property tool registration — descriptor shape, stripped schema, help mention + output-shape disclosure, docs presence + content completeness.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createReadPropertyTool, READ_PROPERTY_DESCRIPTION, READ_PROPERTY_TOOL_NAME } from "./index.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
import { countDescriptionKeys } from "../_schema-test-utils.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createReadPropertyTool — descriptor", () => {
  // (a) Story 5 — descriptor name
  it("publishes name = 'read_property' (Story 5)", () => {
    const tool = createReadPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(READ_PROPERTY_TOOL_NAME);
    expect(tool.descriptor.name).toBe("read_property");
    expect(tool.descriptor.description).toBe(READ_PROPERTY_DESCRIPTION);
  });

  // (b) Story 5 — strips descriptions at every nested depth (BI-041: root description preserved per FR-003)
  it("strips descriptions at every nested depth, preserving the root description (FR-003)", () => {
    const tool = createReadPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.oneOf).toBeUndefined();
    // Count children only — root description is preserved by stripSchemaDescriptions
    // per FR-003 (BI-041 introduces a root-level description carrying the
    // malformed-frontmatter contract per FR-010).
    const props = schema.properties as Record<string, unknown>;
    let nestedDescriptionKeysFound = 0;
    for (const child of Object.values(props)) nestedDescriptionKeysFound += countDescriptionKeys(child);
    expect(nestedDescriptionKeysFound).toBe(0);
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
