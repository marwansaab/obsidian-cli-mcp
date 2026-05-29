// Original — no upstream. Tests for the read_heading tool registration — descriptor shape, stripped schema, help mention, docs presence + content completeness, drift-detector parameterised lock.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createReadHeadingTool,
  READ_HEADING_DESCRIPTION,
  READ_HEADING_TOOL_NAME,
} from "./index.js";
import { __resetInFlightRegistryForTests, type SpawnLike } from "../../cli-adapter/_dispatch.js";
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

describe("createReadHeadingTool — descriptor", () => {
  // (51) Descriptor name
  it("publishes name = 'read_heading'", () => {
    const tool = createReadHeadingTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(READ_HEADING_TOOL_NAME);
    expect(tool.descriptor.name).toBe("read_heading");
    expect(tool.descriptor.description).toBe(READ_HEADING_DESCRIPTION);
  });

  // (52) Stripped emitted schema
  it("emits a flat post-010 inputSchema with all 5 properties, additionalProperties:false, required={target_mode, heading}, no description keys", () => {
    const tool = createReadHeadingTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["file", "heading", "path", "target_mode", "vault"]);
    const required = schema.required as string[];
    expect([...required].sort()).toEqual(["heading", "target_mode"]);
    let descriptionKeysFound = 0;
    walkSchema(schema, (n) => {
      if (Object.prototype.hasOwnProperty.call(n, "description")) descriptionKeysFound += 1;
    });
    expect(descriptionKeysFound).toBe(0);
  });

  // (53) Descriptor description references help, the tool name, and heading-path requirement
  it("description references help(), the tool name 'read_heading', and surfaces the heading-path requirement", () => {
    const tool = createReadHeadingTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const desc = tool.descriptor.description;
    const lower = desc.toLowerCase();
    expect(lower).toContain("help");
    expect(lower).toContain("read_heading");
    expect(desc).toMatch(/heading.*path|::|two.*segment/i);
    expect(desc.length).toBeGreaterThan(0);
  });
});

describe("createReadHeadingTool — handler integration via registerTool", () => {
  // (54) FR-018 — VALIDATION_ERROR envelope + spawn-spy gate
  it("single-segment heading surfaces as VALIDATION_ERROR isError envelope; spawn never called (FR-018)", async () => {
    let spawnCalled = false;
    const spawnSpy: SpawnLike = () => {
      spawnCalled = true;
      throw new Error("spawnFn called on validation failure — FR-018 violation");
    };
    const tool = createReadHeadingTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: spawnSpy,
    });
    const result = (await tool.handler({ target_mode: "active", heading: "single-segment" })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.message).toContain("read_heading");
    expect(spawnCalled).toBe(false);
  });
});

describe("docs/tools/read_heading.md exists and is non-stub (FR-023)", () => {
  // (55) FR-023 docs presence + content completeness
  it("docs file resolves via import.meta.url, has no TODO marker, contains all 5 error codes + ≥4 example sections + multi-vault note + out-of-reach fallback", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/read_heading.md",
    );
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
    expect(body).toMatch(/multi-?vault|multiple vaults|focused vault/i);
    expect(body).toMatch(/single-?segment|setext|::.*literally/i);
  });
});
