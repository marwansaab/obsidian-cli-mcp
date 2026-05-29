// Original — no upstream. Tests for the outline tool registration — descriptor name + description, stripped JSON Schema (ADR-005), help-facility doc presence + content completeness (≥4 worked examples + error roster), and the FR-018 baseline drift-detector lock (rolled forward by `npm run baseline:write` post-T009).
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOutlineTool, OUTLINE_DESCRIPTION, OUTLINE_TOOL_NAME } from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
import { countDescriptionKeys } from "../_schema-test-utils.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createOutlineTool — descriptor", () => {
  // (a) descriptor.name === "outline"
  it("publishes name = 'outline'", () => {
    const tool = createOutlineTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(OUTLINE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("outline");
  });

  // (b) inputSchema has descriptions stripped (ADR-005)
  it("emits inputSchema with descriptions stripped at every nested depth", () => {
    const tool = createOutlineTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(countDescriptionKeys(schema)).toBe(0);
  });

  // (c) OUTLINE_DESCRIPTION mentions help({ tool_name: "outline" })
  it("OUTLINE_DESCRIPTION mentions help({ tool_name: \"outline\" })", () => {
    const tool = createOutlineTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.description).toBe(OUTLINE_DESCRIPTION);
    expect(OUTLINE_DESCRIPTION).toContain('help({ tool_name: "outline" })');
  });

  // (c2) Handler-closure execution: VALID input passes Zod, so registerTool runs the
  // `handler: async (input, d) => executeOutline(input, d)` closure (not the
  // VALIDATION_ERROR short-circuit). Success spawn fixture copied from handler.test.ts;
  // the wrapped { count, headings } envelope proves the closure executed end-to-end.
  it("tool.handler runs the executeOutline closure on VALID input and returns a content envelope", async () => {
    const upstream = JSON.stringify([
      { level: 1, heading: "Top", line: 1 },
      { level: 2, heading: "Sub A", line: 3 },
    ]);
    const { spawnFn } = makeQueuedSpawn([{ stdout: upstream + "\n", exitCode: 0 }]);
    const tool = createOutlineTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn,
    });
    const result = await tool.handler({
      target_mode: "specific",
      vault: "Demo",
      path: "Notes/x.md",
    });
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThanOrEqual(1);
    expect("isError" in result).toBe(false);
    const payload = JSON.parse(result.content[0]!.text) as {
      count: number;
      headings: Array<{ level: number; text: string; line: number }>;
    };
    expect(payload.count).toBe(2);
    expect(payload.headings).toEqual([
      { level: 1, text: "Top", line: 1 },
      { level: 2, text: "Sub A", line: 3 },
    ]);
  });
});

// (d) docs/tools/outline.md exists with non-stub content (≥4 worked examples + error roster)
describe("docs/tools/outline.md exists and is non-stub", () => {
  it("docs file resolves, mentions inherited error codes, ≥4 example sections, has a Worked example heading and an Error roster", () => {
    const docsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/outline.md");
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
      "ERR_NO_ACTIVE_FILE",
    ]) {
      expect(body).toContain(code);
    }
    const exampleHeadings = (body.match(/### Example/g) ?? []).length;
    expect(exampleHeadings).toBeGreaterThanOrEqual(4);
  });
});

// (e) FR-018 baseline drift-detector lock — the rolled-forward baseline at
// src/tools/_register-baseline.json contains an `outline` entry.
describe("FR-018 baseline contains outline entry (post-T009 baseline roll-forward)", () => {
  it("baseline JSON includes a tools[] entry with name === 'outline'", () => {
    const baselinePath = resolve(dirname(fileURLToPath(import.meta.url)), "../_register-baseline.json");
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      tools: Array<{ name: string; descriptionFingerprint: string; schemaFingerprint: string }>;
    };
    const entry = baseline.tools.find((t) => t.name === "outline");
    expect(entry, "baseline must include an `outline` entry — run `npm run baseline:write`").toBeDefined();
    expect(entry!.descriptionFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(entry!.schemaFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
