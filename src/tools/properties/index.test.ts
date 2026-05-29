// Original — no upstream. Tests for the properties tool registration — descriptor name + description, stripped JSON Schema (ADR-005), help-facility doc presence + content completeness (≥4 worked examples + error roster), and the FR-018 baseline drift-detector lock (rolled forward by `npm run baseline:write` post-T009).
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPropertiesTool, PROPERTIES_DESCRIPTION, PROPERTIES_TOOL_NAME } from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
import { countDescriptionKeys } from "../_schema-test-utils.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createPropertiesTool — handler closure execution", () => {
  // Exercises the `handler: async (input, d) => executeProperties(input, d)` closure in
  // index.ts: the descriptor tests only call tool.handler with INVALID input, which
  // short-circuits to VALIDATION_ERROR inside registerTool before the closure runs.
  // A VALID input ({} — vault-only, no discriminator) drives the closure →
  // executeProperties → invokeCli (success spawn) and returns a JSON success envelope.
  // Reuses handler.test.ts's empty-array success stdout.
  it("VALID input drives the handler closure to a success envelope", async () => {
    const { spawnFn } = makeQueuedSpawn([{ stdout: "[]\n", exitCode: 0 }]);
    const tool = createPropertiesTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn,
    });
    const result = (await tool.handler({})) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBeUndefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(JSON.parse(result.content[0]!.text)).toEqual({ count: 0, properties: [] });
  });
});

describe("createPropertiesTool — descriptor", () => {
  // (a) descriptor.name === "properties"
  it("publishes name = 'properties'", () => {
    const tool = createPropertiesTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(PROPERTIES_TOOL_NAME);
    expect(tool.descriptor.name).toBe("properties");
  });

  // (b) inputSchema has nested descriptions stripped (ADR-005); BI-041 introduces
  //     a root-level description carrying the case-insensitive collapse contract,
  //     preserved by stripSchemaDescriptions per FR-003.
  it("strips descriptions at every nested depth (root description allowed per FR-003)", () => {
    const tool = createPropertiesTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown>;
    // Walk children only — root description is preserved by stripSchemaDescriptions
    // per FR-003 (BI-041 introduces a root-level description carrying the collapse contract).
    let nestedDescriptionKeysFound = 0;
    for (const child of Object.values(props)) {
      nestedDescriptionKeysFound += countDescriptionKeys(child);
    }
    expect(nestedDescriptionKeysFound).toBe(0);
  });

  // (c) PROPERTIES_DESCRIPTION mentions help({ tool_name: "properties" })
  it("PROPERTIES_DESCRIPTION mentions help({ tool_name: \"properties\" })", () => {
    const tool = createPropertiesTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.description).toBe(PROPERTIES_DESCRIPTION);
    expect(PROPERTIES_DESCRIPTION).toContain('help({ tool_name: "properties" })');
  });
});

// (d) docs/tools/properties.md exists with non-stub content (≥4 worked examples + error roster)
describe("docs/tools/properties.md exists and is non-stub", () => {
  it("docs file resolves, mentions inherited error codes, ≥4 example sections, has a Worked example heading and an Error roster", () => {
    const docsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/properties.md");
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

// (e) FR-018 baseline drift-detector lock — the rolled-forward baseline at
// src/tools/_register-baseline.json contains a `properties` entry.
describe("FR-018 baseline contains properties entry (post-T009 baseline roll-forward)", () => {
  it("baseline JSON includes a tools[] entry with name === 'properties'", () => {
    const baselinePath = resolve(dirname(fileURLToPath(import.meta.url)), "../_register-baseline.json");
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      tools: Array<{ name: string; descriptionFingerprint: string; schemaFingerprint: string }>;
    };
    const entry = baseline.tools.find((t) => t.name === "properties");
    expect(entry, "baseline must include a `properties` entry — run `npm run baseline:write`").toBeDefined();
    expect(entry!.descriptionFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(entry!.schemaFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
