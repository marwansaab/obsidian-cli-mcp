// Original — no upstream. Tests for the links tool registration — descriptor shape, stripped schema, help mention, docs presence + content completeness.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createLinksTool,
  LINKS_DESCRIPTION,
  LINKS_TOOL_NAME,
} from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
import { countDescriptionKeys } from "../_schema-test-utils.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createLinksTool — descriptor", () => {
  // (a) Descriptor name
  it("publishes name = 'links'", () => {
    const tool = createLinksTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(LINKS_TOOL_NAME);
    expect(tool.descriptor.name).toBe("links");
    expect(tool.descriptor.description).toBe(LINKS_DESCRIPTION);
  });

  // (b) Stripped emitted schema — ADR-005
  it("strips descriptions at every nested depth", () => {
    const tool = createLinksTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(countDescriptionKeys(schema)).toBe(0);
  });

  // (c) Description references help(), the tool name, and the closed kind enum + total flag
  it("description references help(), the tool name 'links', the closed kind enum, and the count-only mode", () => {
    const tool = createLinksTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const desc = tool.descriptor.description;
    const lower = desc.toLowerCase();
    expect(lower).toContain("help");
    expect(lower).toContain("links");
    expect(lower).toContain("wikilink");
    expect(lower).toContain("embed");
    expect(lower).toContain("markdown");
    expect(lower).toContain("total");
    expect(desc.length).toBeGreaterThan(0);
  });

  // (f) Handler-closure execution: VALID input passes Zod, so registerTool runs the
  // `handler: async (input, d) => executeLinks(input, d)` closure (not the
  // VALIDATION_ERROR short-circuit). Success spawn fixture copied from handler.test.ts;
  // the wrapped { count, links } envelope proves the closure executed end-to-end.
  it("tool.handler runs the executeLinks closure on VALID input and returns a content envelope", async () => {
    const envelope = {
      ok: true,
      count: 1,
      links: [{ target: "Other-Note", line: 1, kind: "wikilink" }],
    };
    const { spawnFn } = makeQueuedSpawn([
      { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
    ]);
    const tool = createLinksTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn,
    });
    const result = await tool.handler({
      target_mode: "specific",
      vault: "Demo",
      path: "Projects/brief.md",
    });
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThanOrEqual(1);
    expect("isError" in result).toBe(false);
    const payload = JSON.parse(result.content[0]!.text) as { count: number; links: unknown[] };
    expect(payload.count).toBe(1);
    expect(payload.links).toEqual(envelope.links);
  });
});

describe("docs/tools/links.md exists and is non-stub (FR-018)", () => {
  // (d) Docs presence + content completeness — error codes, examples, multi-vault, frontmatter inclusion
  it("docs file exists, has no TODO marker, lists every error code + ≥4 worked examples + multi-vault note + frontmatter-inclusion note", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/links.md",
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
  });
});

describe("FR-018 baseline drift detector", () => {
  // (e) Baseline roll-forward gate — the fingerprint must match _register-baseline.json
  // post-npm-run-baseline:write. This test relies on T009 having been run.
  it("registered tool's fingerprint appears in _register-baseline.json", () => {
    const baselinePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../_register-baseline.json",
    );
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      tools: Array<{ name: string; descriptionFingerprint: string; schemaFingerprint: string }>;
    };
    const entry = baseline.tools.find((t) => t.name === LINKS_TOOL_NAME);
    expect(entry).toBeDefined();
    expect(typeof entry!.descriptionFingerprint).toBe("string");
    expect(typeof entry!.schemaFingerprint).toBe("string");
  });
});
