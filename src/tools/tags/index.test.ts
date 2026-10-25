// Original — no upstream. Tests for the tags tool registration — descriptor name and description (tag vs tags disambiguation), stripped JSON Schema (ADR-005), the handler closure driven to a success envelope, the server-side validation pathway with zero spawns for every SC-003 rejection class (AC 9–12, FR-012), help-document completeness (AC 14) and the catalogue line.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTagsTool, TAGS_DESCRIPTION, TAGS_TOOL_NAME } from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
import { countDescriptionKeys } from "../_schema-test-utils.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

describe("createTagsTool — descriptor", () => {
  it("publishes name = 'tags'", () => {
    const tool = createTagsTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(TAGS_TOOL_NAME);
    expect(tool.descriptor.name).toBe("tags");
  });

  it("description disambiguates tags (inventory) from tag and points to help", () => {
    const tool = createTagsTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.description).toBe(TAGS_DESCRIPTION);
    expect(TAGS_DESCRIPTION).toContain("Pick `tag`");
    expect(TAGS_DESCRIPTION).toContain("{ total, tags: [{ name, count? }] }");
    expect(TAGS_DESCRIPTION).toContain('help({ tool_name: "tags" })');
  });

  it("ADR-005 — the published inputSchema carries zero description keys", () => {
    const tool = createTagsTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(countDescriptionKeys(tool.descriptor.inputSchema)).toBe(0);
  });
});

describe("createTagsTool — handler closure execution", () => {
  it("a VALID input drives the handler closure to a success envelope", async () => {
    const { spawnFn } = makeQueuedSpawn([{ stdout: "No tags found.\n", exitCode: 0 }]);
    const tool = createTagsTool({ logger: silentLogger(), queue: createQueue(), spawnFn });
    const result = (await tool.handler({ target_mode: "specific", vault: "V" })) as ToolResult;
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual({ total: 0, tags: [] });
  });

  it("an upstream failure surfaces as an isError envelope carrying the UpstreamError code", async () => {
    const { spawnFn } = makeQueuedSpawn([{ stdout: "Vault not found.\n", exitCode: 0 }]);
    const tool = createTagsTool({ logger: silentLogger(), queue: createQueue(), spawnFn });
    const result = (await tool.handler({ target_mode: "specific", vault: "Nope" })) as ToolResult;
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]!.text).code).toBe("CLI_REPORTED_ERROR");
  });
});

// Every SC-003 validation class, driven through the registered tool's handler so the
// zod parse in registerTool runs before executeTags: the envelope is VALIDATION_ERROR
// and the spawn recorder sees zero calls.
describe("createTagsTool — server-side validation pathway (zero CLI calls)", () => {
  async function rejectAtBoundary(args: Record<string, unknown>): Promise<string[]> {
    const { spawnFn, getCount } = makeQueuedSpawn([]);
    const tool = createTagsTool({ logger: silentLogger(), queue: createQueue(), spawnFn });
    const result = (await tool.handler(args)) as ToolResult;
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text) as {
      code: string;
      details: { issues: Array<{ path: Array<string | number> }> };
    };
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(getCount()).toBe(0);
    return payload.details.issues.map((i) => i.path.join("."));
  }

  // Client-class note: clients that pre-validate against the published inputSchema
  // (additionalProperties: false) reject an unknown key themselves and never reach the
  // server. This test covers the other class — clients that forward the key — whose
  // request reaches registerTool and is rejected there.
  it("AC 11 (server-side pathway; pre-validating clients reject client-side) — unknown key → VALIDATION_ERROR, 0 spawns", async () => {
    await rejectAtBoundary({ target_mode: "specific", vault: "V", bogus: 1 });
  });

  it("AC 9 — file + path → VALIDATION_ERROR naming both keys, 0 spawns", async () => {
    const paths = await rejectAtBoundary({ target_mode: "specific", vault: "V", file: "A", path: "A.md" });
    expect(paths.sort()).toEqual(["file", "path"]);
  });

  it("AC 9 — path + activeOnly in active mode → VALIDATION_ERROR, 0 spawns", async () => {
    const paths = await rejectAtBoundary({ target_mode: "active", path: "A.md", activeOnly: true });
    expect(paths.sort()).toEqual(["activeOnly", "path"]);
  });

  it("FR-012 — path '../x.md' → VALIDATION_ERROR on path, 0 spawns", async () => {
    expect(await rejectAtBoundary({ target_mode: "specific", vault: "V", path: "../x.md" })).toContain("path");
  });

  it("AC 10 — specific mode without vault → VALIDATION_ERROR on vault, 0 spawns", async () => {
    expect(await rejectAtBoundary({ target_mode: "specific" })).toEqual(["vault"]);
  });

  it("AC 12 — active mode with vault → VALIDATION_ERROR on vault, 0 spawns", async () => {
    expect(await rejectAtBoundary({ target_mode: "active", vault: "V" })).toEqual(["vault"]);
  });
});

describe("AC 14 — help document and catalogue", () => {
  const docsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools");

  it("docs/tools/tags.md carries the contract sections, scope semantics, ≥4 examples and the error roster", () => {
    const docsPath = resolve(docsDir, "tags.md");
    expect(existsSync(docsPath)).toBe(true);
    const body = readFileSync(docsPath, "utf8");
    for (const heading of ["## Input contract", "## Output shape", "## Errors", "Scope semantics"]) {
      expect(body).toContain(heading);
    }
    const exampleHeadings = body.match(/^### Example/gm) ?? [];
    expect(exampleHeadings.length).toBeGreaterThanOrEqual(4);
    expect(body).toMatch(/^### Example.*vault-wide/im);
    expect(body).toMatch(/^### Example.*`file`/m);
    expect(body).toMatch(/^### Example.*`sortByCount`/m);
    expect(body).toMatch(/^### Example.*`activeOnly`/m);
    for (const code of ["VALIDATION_ERROR", "ERR_NO_ACTIVE_FILE", "CLI_REPORTED_ERROR", "CLI_OUTPUT_TOO_LARGE"]) {
      expect(body).toContain(code);
    }
  });

  it("docs/tools/index.md lists **tags**", () => {
    expect(readFileSync(resolve(docsDir, "index.md"), "utf8")).toContain("**tags**");
  });
});
