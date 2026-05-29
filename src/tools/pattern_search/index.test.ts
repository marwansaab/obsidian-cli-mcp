// Original — no upstream. pattern_search registration tests.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PATTERN_SEARCH_DESCRIPTION,
  PATTERN_SEARCH_TOOL_NAME,
  createPatternSearchTool,
} from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createPatternSearchTool — descriptor", () => {
  // (1) factory returns RegisteredTool with name + non-empty description
  it("publishes name = 'pattern_search' with a non-empty description", () => {
    const tool = createPatternSearchTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(PATTERN_SEARCH_TOOL_NAME);
    expect(tool.descriptor.name).toBe("pattern_search");
    expect(tool.descriptor.description).toBe(PATTERN_SEARCH_DESCRIPTION);
    expect(tool.descriptor.description.length).toBeGreaterThan(0);
  });

  // (2) inputSchema round-trips with additionalProperties:false and the right property set
  it("emits inputSchema with additionalProperties:false and the expected property set", () => {
    const tool = createPatternSearchTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual([
      "case_sensitive",
      "folder",
      "limit",
      "pattern",
      "vault",
    ]);
    expect(schema.required).toEqual(["pattern"]);
  });

  // (3) description length > 300 (worked-example + dialect + default-flip-note budget)
  it("description length > 300 chars (budget for dialect + default-flip + cross-pointer + worked examples)", () => {
    const tool = createPatternSearchTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.description.length).toBeGreaterThan(300);
  });

  // (4) deps wired through to handler — smoke test against a stubbed CLI returning a happy envelope
  it("deps wired through: handler receives stubbed CLI envelope and produces typed response", async () => {
    const envelope = JSON.stringify({ ok: true, count: 0, matches: [] });
    const tool = createPatternSearchTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn({ stdout: `=> ${envelope}\n` }),
    });
    const result = await tool.handler({ pattern: "x", vault: "Demo" });
    expect(result).not.toHaveProperty("isError");
    if ("isError" in result) throw new Error("unexpected error envelope");
    const body = JSON.parse(result.content[0]!.text) as { count: number; matches: unknown[] };
    expect(body).toEqual({ count: 0, matches: [] });
  });

  // (5) description contains cross-pointer to context_search (sibling BI-035)
  it("description contains cross-pointer to sibling 'context_search'", () => {
    const tool = createPatternSearchTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.description).toContain("context_search");
  });

  // (6) description contains explicit case-sensitivity default-flip note
  it("description explicitly notes case-sensitivity default (callout phrases 'case' + 'default')", () => {
    const tool = createPatternSearchTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const desc = tool.descriptor.description.toLowerCase();
    expect(desc).toContain("case_sensitive");
    expect(desc).toContain("default");
  });
});
