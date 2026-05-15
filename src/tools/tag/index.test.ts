// Original — no upstream. Tests for the tag tool registration — descriptor name + description, stripped JSON Schema (ADR-005), docs file presence + content completeness, and the FR-018 baseline drift-detector lock rolled forward by `npm run baseline:write` post-implementation.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTagTool, TAG_DESCRIPTION, TAG_TOOL_NAME } from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";

const silentLogger = () =>
  createLogger({
    stream: new Writable({
      write(_c, _e, cb) {
        cb();
      },
    }),
  });

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

describe("createTagTool — descriptor", () => {
  // (1) descriptor.name === "tag"
  it("publishes name = 'tag'", () => {
    const tool = createTagTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(TAG_TOOL_NAME);
    expect(tool.descriptor.name).toBe("tag");
  });

  // (2) inputSchema has descriptions stripped (ADR-005) and exact key set
  it("emits inputSchema with descriptions stripped + exact properties set {tag, vault, total}", () => {
    const tool = createTagTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(new Set(Object.keys(props))).toEqual(new Set(["tag", "vault", "total"]));
    expect(schema.required).toEqual(["tag"]);
    let descriptionKeysFound = 0;
    walkSchema(schema, (n) => {
      if (Object.prototype.hasOwnProperty.call(n, "description")) descriptionKeysFound += 1;
    });
    expect(descriptionKeysFound).toBe(0);
  });

  // (3) TAG_DESCRIPTION mentions help({ tool_name: "tag" })
  it('TAG_DESCRIPTION mentions help({ tool_name: "tag" })', () => {
    const tool = createTagTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.description).toBe(TAG_DESCRIPTION);
    expect(TAG_DESCRIPTION).toContain('help({ tool_name: "tag" })');
  });
});

// (4) docs/tools/tag.md exists with non-stub content
describe("docs/tools/tag.md exists and is non-stub", () => {
  it("docs file resolves, mentions inherited error codes, ≥4 example sections, has a Worked example heading and an Error roster", () => {
    const docsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/tag.md");
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

// (5) FR-018 baseline drift-detector lock — the rolled-forward baseline contains a `tag` entry
describe("FR-018 baseline contains tag entry (post-impl baseline roll-forward)", () => {
  it("baseline JSON includes a tools[] entry with name === 'tag'", () => {
    const baselinePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../_register-baseline.json",
    );
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      tools: Array<{ name: string; descriptionFingerprint: string; schemaFingerprint: string }>;
    };
    const entry = baseline.tools.find((t) => t.name === "tag");
    expect(
      entry,
      "baseline must include a `tag` entry — run `npm run baseline:write`",
    ).toBeDefined();
    expect(entry!.descriptionFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(entry!.schemaFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
