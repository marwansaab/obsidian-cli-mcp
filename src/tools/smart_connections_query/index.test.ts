// Original — no upstream. Tests for the smart_connections_query tool registration — descriptor shape, stripped schema (ADR-005), help mention + plugin-namespace name + plugin-lifecycle codes + sub-discriminator reasons in description, docs presence + content completeness, FR-018 baseline drift detector entry. 5 cases per data-model.md inventory.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createSmartConnectionsQueryTool,
  SMART_CONNECTIONS_QUERY_DESCRIPTION,
  SMART_CONNECTIONS_QUERY_TOOL_NAME,
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

describe("createSmartConnectionsQueryTool — descriptor", () => {
  // (1) Descriptor name follows ADR-013 plugin-namespace convention
  it("publishes name = 'smart_connections_query' (ADR-013 plugin-namespace)", () => {
    const tool = createSmartConnectionsQueryTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(SMART_CONNECTIONS_QUERY_TOOL_NAME);
    expect(tool.descriptor.name).toBe("smart_connections_query");
    expect(tool.descriptor.description).toBe(SMART_CONNECTIONS_QUERY_DESCRIPTION);
  });

  // (2) Stripped emitted schema — ADR-005
  it("emits inputSchema with query/vault/limit/total properties, additionalProperties:false, required={query}, no description keys", () => {
    const tool = createSmartConnectionsQueryTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["limit", "query", "total", "vault"]);
    const required = schema.required as string[];
    expect([...required].sort()).toEqual(["query"]);
    let descriptionKeysFound = 0;
    walkSchema(schema, (n) => {
      if (Object.prototype.hasOwnProperty.call(n, "description")) descriptionKeysFound += 1;
    });
    expect(descriptionKeysFound).toBe(0);
  });

  // (3) Description references help(), tool name, plugin-lifecycle codes incl. sub-reasons, headingPath
  it("description references help(), 'smart_connections_query', plugin-lifecycle codes incl. api-missing/embed-failed, headingPath, limit/total", () => {
    const tool = createSmartConnectionsQueryTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const desc = tool.descriptor.description;
    expect(desc).toContain("help");
    expect(desc).toContain("smart_connections_query");
    expect(desc).toContain("headingPath");
    expect(desc).toContain("limit");
    expect(desc).toContain("total");
    expect(desc).toContain("SMART_CONNECTIONS_NOT_INSTALLED");
    expect(desc).toContain("SMART_CONNECTIONS_NOT_READY");
    expect(desc).toContain("api-missing");
    expect(desc).toContain("embed-failed");
    expect(desc).toContain("not-open");
    expect(desc.length).toBeGreaterThan(0);
  });
});

// (4) Docs presence + content completeness
describe("docs/tools/smart_connections_query.md exists and is non-stub (FR-022)", () => {
  it("docs file exists, has no TODO marker, lists every error code + ≥4 worked examples + plugin-lifecycle text", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/smart_connections_query.md",
    );
    expect(existsSync(docsPath)).toBe(true);
    const body = readFileSync(docsPath, "utf8");
    expect(body.length).toBeGreaterThan(1024);
    expect(body).not.toContain("<!-- TODO");
    for (const code of [
      "VALIDATION_ERROR",
      "CLI_BINARY_NOT_FOUND",
      "CLI_NON_ZERO_EXIT",
      "CLI_REPORTED_ERROR",
      "VAULT_NOT_FOUND",
      "SMART_CONNECTIONS_NOT_INSTALLED",
      "SMART_CONNECTIONS_NOT_READY",
      "api-missing",
      "embed-failed",
      "not-open",
    ]) {
      expect(body).toContain(code);
    }
    const exampleHeadings = (body.match(/### Example/g) ?? []).length;
    expect(exampleHeadings).toBeGreaterThanOrEqual(4);
    expect(body).toMatch(/headingPath/);
    expect(body).toMatch(/plugin-lifecycle|Smart Connections plugin/i);
    expect(body).toMatch(/minimum probed|minimum plugin version|v4\.|Smart Connections/i);
  });
});

// (5) FR-018 baseline drift detector entry
describe("FR-018 baseline drift detector", () => {
  it("registered tool's fingerprint appears in _register-baseline.json (after baseline:write)", () => {
    const baselinePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../_register-baseline.json",
    );
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      tools: Array<{ name: string; descriptionFingerprint: string; schemaFingerprint: string }>;
    };
    const entry = baseline.tools.find((t) => t.name === SMART_CONNECTIONS_QUERY_TOOL_NAME);
    expect(entry).toBeDefined();
    expect(typeof entry!.descriptionFingerprint).toBe("string");
    expect(typeof entry!.schemaFingerprint).toBe("string");
  });
});
