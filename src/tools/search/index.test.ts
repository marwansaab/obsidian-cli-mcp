// Original — no upstream. Tests for the search tool registration — descriptor name +
// description, stripped JSON Schema (ADR-005), help-facility doc presence + content
// completeness (>=4 worked examples + error roster), and the FR-018 baseline
// drift-detector lock (rolled forward by `npm run baseline:write`).
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSearchTool, SEARCH_DESCRIPTION, SEARCH_TOOL_NAME } from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
import { countDescriptionKeys } from "../_schema-test-utils.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createSearchTool — descriptor", () => {
  it("publishes name = 'search'", () => {
    const tool = createSearchTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(SEARCH_TOOL_NAME);
    expect(tool.descriptor.name).toBe("search");
  });

  it("emits inputSchema with descriptions stripped at every nested depth (root description allowed per FR-003)", () => {
    const tool = createSearchTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown>;
    // Count children only — root description is preserved by stripSchemaDescriptions
    // per FR-003 (BI-041 introduces a root-level description carrying the error roster).
    const nestedDescriptionKeysFound = Object.values(props).reduce<number>(
      (sum, child) => sum + countDescriptionKeys(child),
      0,
    );
    expect(nestedDescriptionKeysFound).toBe(0);
  });

  it("SEARCH_DESCRIPTION mentions help({ tool_name: \"search\" })", () => {
    const tool = createSearchTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.description).toBe(SEARCH_DESCRIPTION);
    expect(SEARCH_DESCRIPTION).toContain('help({ tool_name: "search" })');
  });
});

describe("docs/tools/search.md exists and is non-stub", () => {
  it("docs file resolves, mentions inherited error codes, >=4 example sections, has a Worked example heading and an Error roster", () => {
    const docsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/search.md");
    expect(existsSync(docsPath)).toBe(true);
    const body = readFileSync(docsPath, "utf8");
    expect(body.length).toBeGreaterThan(1024);
    expect(body).toContain("Worked example");
    expect(body).toContain("Error roster");
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
  });
});

describe("FR-018 baseline contains search entry (post-baseline roll-forward)", () => {
  it("baseline JSON includes a tools[] entry with name === 'search'", () => {
    const baselinePath = resolve(dirname(fileURLToPath(import.meta.url)), "../_register-baseline.json");
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      tools: Array<{ name: string; descriptionFingerprint: string; schemaFingerprint: string }>;
    };
    const entry = baseline.tools.find((t) => t.name === "search");
    expect(entry, "baseline must include a `search` entry — run `npm run baseline:write`").toBeDefined();
    expect(entry!.descriptionFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(entry!.schemaFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
