// Original — no upstream. backlinks registration tests — descriptor name + stripped emitted schema (target_mode/vault/file/path/with_counts/total/limit; additionalProperties:false; required={target_mode}; no description keys), help() / sibling-pointer / cap-bypass references in the description, docs presence + content completeness, baseline fingerprint roll-forward gate.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BACKLINKS_DESCRIPTION,
  BACKLINKS_TOOL_NAME,
  createBacklinksTool,
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

describe("createBacklinksTool — descriptor", () => {
  // (a) Descriptor name and description constant
  it("publishes name = 'backlinks'", () => {
    const tool = createBacklinksTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(BACKLINKS_TOOL_NAME);
    expect(tool.descriptor.name).toBe("backlinks");
    expect(tool.descriptor.description).toBe(BACKLINKS_DESCRIPTION);
    expect(tool.descriptor.description.length).toBeGreaterThan(200);
  });

  // (b) Stripped emitted schema — ADR-005
  it("emits inputSchema with target_mode/vault/file/path/with_counts/total/limit, additionalProperties:false, required={target_mode}, no description keys", () => {
    const tool = createBacklinksTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual([
      "file",
      "limit",
      "path",
      "target_mode",
      "total",
      "vault",
      "with_counts",
    ]);
    const required = schema.required as string[];
    expect([...required].sort()).toEqual(["target_mode"]);
    let descriptionKeysFound = 0;
    walkSchema(schema, (n) => {
      if (Object.prototype.hasOwnProperty.call(n, "description")) descriptionKeysFound += 1;
    });
    expect(descriptionKeysFound).toBe(0);
  });

  // (c) Description references help(), the tool name, the sibling `links`, the .md-only and cap-bypass clarifications
  it("description references help(), the tool name 'backlinks', the sibling 'links', .md-only corpus, and the total cap-bypass", () => {
    const tool = createBacklinksTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const desc = tool.descriptor.description;
    const lower = desc.toLowerCase();
    expect(lower).toContain("help");
    expect(lower).toContain("backlinks");
    expect(lower).toContain("links");
    expect(lower).toContain(".md");
    expect(lower).toContain("bypass");
    expect(lower).toContain("self-reference");
    expect(lower).toContain("frontmatter");
  });
});

describe("docs/tools/backlinks.md exists and is non-stub (FR-026)", () => {
  it("docs file exists, has no TODO marker, lists every error code + ≥4 worked examples + multi-vault note + frontmatter-inclusion note + sibling-pointer", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/backlinks.md",
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
    expect(body).toMatch(/frontmatter/i);
    expect(body).toMatch(/links\.md|\[links\]/i);
  });
});

describe("FR-026 baseline drift detector", () => {
  it("registered tool's fingerprint appears in _register-baseline.json", () => {
    const baselinePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../_register-baseline.json",
    );
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      tools: Array<{ name: string; descriptionFingerprint: string; schemaFingerprint: string }>;
    };
    const entry = baseline.tools.find((t) => t.name === BACKLINKS_TOOL_NAME);
    expect(entry).toBeDefined();
    expect(typeof entry!.descriptionFingerprint).toBe("string");
    expect(typeof entry!.schemaFingerprint).toBe("string");
  });
});
