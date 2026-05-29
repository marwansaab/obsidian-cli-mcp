// Original — no upstream. Tests for the context_search tool registration —
// descriptor name + description, stripped JSON Schema (ADR-005), help-facility
// doc presence + content completeness (>=4 worked examples + error roster), and
// the FR-018 baseline drift-detector lock (rolled forward by `npm run baseline:write`).
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createContextSearchTool,
  CONTEXT_SEARCH_DESCRIPTION,
  CONTEXT_SEARCH_TOOL_NAME,
} from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";

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

describe("createContextSearchTool — descriptor (I1 smoke)", () => {
  it("publishes name = 'context_search'", () => {
    const tool = createContextSearchTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(CONTEXT_SEARCH_TOOL_NAME);
    expect(tool.descriptor.name).toBe("context_search");
  });

  it("description is non-empty and contains the help-tool pointer", () => {
    const tool = createContextSearchTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.description).toBe(CONTEXT_SEARCH_DESCRIPTION);
    expect(CONTEXT_SEARCH_DESCRIPTION.length).toBeGreaterThan(0);
    expect(CONTEXT_SEARCH_DESCRIPTION).toContain('help({ tool_name: "context_search" })');
  });

  it("emits inputSchema with descriptions stripped at every nested depth", () => {
    const tool = createContextSearchTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(
      ["case_sensitive", "folder", "limit", "query", "vault"],
    );
    let descriptionKeysFound = 0;
    walkSchema(schema, (n) => {
      if (Object.prototype.hasOwnProperty.call(n, "description")) descriptionKeysFound += 1;
    });
    expect(descriptionKeysFound).toBe(0);
  });

  it("inputSchema declares 'query' required", () => {
    const tool = createContextSearchTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(Array.isArray(schema.required)).toBe(true);
    expect((schema.required as string[])).toContain("query");
  });
});

describe("docs/tools/context_search.md exists and is non-stub", () => {
  it("docs file resolves, mentions inherited error codes, >=4 example sections, has a Worked example heading and an Error roster", () => {
    const docsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/context_search.md");
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

describe("FR-018 baseline contains context_search entry (post-baseline roll-forward)", () => {
  it("baseline JSON includes a tools[] entry with name === 'context_search'", () => {
    const baselinePath = resolve(dirname(fileURLToPath(import.meta.url)), "../_register-baseline.json");
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      tools: Array<{ name: string; descriptionFingerprint: string; schemaFingerprint: string }>;
    };
    const entry = baseline.tools.find((t) => t.name === "context_search");
    expect(entry, "baseline must include a `context_search` entry — run `npm run baseline:write`").toBeDefined();
    expect(entry!.descriptionFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(entry!.schemaFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
