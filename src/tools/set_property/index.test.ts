// Original — no upstream. Tests for the set_property tool registration — descriptor name + description, stripped JSON Schema, help mention, docs file presence + content completeness.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSetPropertyTool, SET_PROPERTY_DESCRIPTION, SET_PROPERTY_TOOL_NAME } from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
import { countDescriptionKeys } from "../_schema-test-utils.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

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
  it("strips descriptions at every nested depth", () => {
    const tool = createSetPropertyTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(countDescriptionKeys(schema)).toBe(0);
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
