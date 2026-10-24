// Original — no upstream. Tests for the tags tool registration — descriptor name/description and published inputSchema (six properties, additionalProperties: false, no target_mode), the handler closure success envelope, end-to-end validation errors through mapValidationError with a spawn spy that is never called (SCOPE_CONFLICT reasons, INVALID_NOTE/path-traversal with field paths, `[[…]]`, unknown keys — AC-9/11/12, FR-006/007), the FR-010 duplicate-name safety net surfacing as INTERNAL_ERROR, the help-page content check (AC-14) and the FR-018 baseline entry.
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

const here = dirname(fileURLToPath(import.meta.url));

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

interface ErrorPayload {
  code: string;
  message: string;
  details: {
    code?: string;
    reason?: string;
    issues: Array<{ path: Array<string | number>; message: string; code: string }>;
  };
}

function parseError(result: ToolResult): ErrorPayload {
  expect(result.isError).toBe(true);
  return JSON.parse(result.content[0]!.text) as ErrorPayload;
}

/** A tool whose spawn must never fire — every call here is rejected at the boundary. */
function toolWithSpy() {
  const { spawnFn, getCount } = makeQueuedSpawn([]);
  const tool = createTagsTool({ logger: silentLogger(), queue: createQueue(), spawnFn });
  return { tool, getCount };
}

describe("createTagsTool — descriptor", () => {
  it("publishes name = 'tags' and the description pointing at help", () => {
    const tool = createTagsTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(TAGS_TOOL_NAME);
    expect(tool.descriptor.name).toBe("tags");
    expect(tool.descriptor.description).toBe(TAGS_DESCRIPTION);
    expect(TAGS_DESCRIPTION).toContain('help({ tool_name: "tags" })');
    expect(TAGS_DESCRIPTION).toContain("`tag`");
  });

  it("inputSchema has exactly the six properties, additionalProperties: false, and no target_mode", () => {
    const tool = createTagsTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(
      ["activeOnly", "file", "includeCounts", "path", "sortByCount", "vault"].sort(),
    );
    expect(schema.additionalProperties).toBe(false);
    expect(props).not.toHaveProperty("target_mode");
    expect(schema.required ?? []).toEqual([]);
    let nested = 0;
    for (const child of Object.values(props)) nested += countDescriptionKeys(child);
    expect(nested).toBe(0);
  });
});

describe("createTagsTool — handler closure", () => {
  it("VALID input drives the closure to a JSON text content block", async () => {
    const { spawnFn } = makeQueuedSpawn([
      { stdout: JSON.stringify([{ tag: "#b", count: "1" }, { tag: "#a", count: "2" }]), exitCode: 0 },
    ]);
    const tool = createTagsTool({ logger: silentLogger(), queue: createQueue(), spawnFn });
    const result = (await tool.handler({ vault: "V" })) as ToolResult;
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.type).toBe("text");
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      total: 2,
      tags: [
        { name: "a", count: 2 },
        { name: "b", count: 1 },
      ],
    });
  });

  it("ERR_NO_ACTIVE_FILE surfaces with the tags recovery message", async () => {
    const { spawnFn } = makeQueuedSpawn([
      { stdout: "Error: No active file. Use file=<name> or path=<path> to specify a file.\n", exitCode: 0 },
    ]);
    const tool = createTagsTool({ logger: silentLogger(), queue: createQueue(), spawnFn });
    const err = parseError((await tool.handler({ activeOnly: true })) as ToolResult);
    expect(err.code).toBe("ERR_NO_ACTIVE_FILE");
    expect(err.message).toContain("call tags with `file` or `path`");
  });

  it("FR-010 safety net: a duplicate name after the # strip surfaces as INTERNAL_ERROR", async () => {
    const { spawnFn } = makeQueuedSpawn([
      { stdout: JSON.stringify([{ tag: "#a", count: "1" }, { tag: "a", count: "2" }]), exitCode: 0 },
    ]);
    const tool = createTagsTool({ logger: silentLogger(), queue: createQueue(), spawnFn });
    const err = parseError((await tool.handler({})) as ToolResult);
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.details.issues.length).toBeGreaterThan(0);
  });
});

describe("createTagsTool — validation before any spawn (AC-9, AC-11, AC-12, FR-006, FR-007)", () => {
  it.each([
    [{ file: "a", path: "b.md" }, "file+path"],
    [{ activeOnly: true, file: "a" }, "active+note"],
    [{ activeOnly: true, path: "a.md" }, "active+note"],
    [{ activeOnly: true, vault: "V" }, "active+vault"],
  ])("%j → VALIDATION_ERROR / SCOPE_CONFLICT / %s, no spawn", async (input, reason) => {
    const { tool, getCount } = toolWithSpy();
    const err = parseError((await tool.handler(input)) as ToolResult);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details.code).toBe("SCOPE_CONFLICT");
    expect(err.details.reason).toBe(reason);
    expect(err.details.issues.length).toBeGreaterThan(0);
    for (const i of err.details.issues) expect(Object.keys(i).sort()).toEqual(["code", "message", "path"]);
    expect(getCount()).toBe(0);
  });

  it.each([
    [{ path: "../x.md" }, "path"],
    [{ file: "/abs" }, "file"],
    [{ vault: "V", path: "C:\\x.md" }, "path"],
  ])("%j → VALIDATION_ERROR / INVALID_NOTE / path-traversal with issues[0].path = [%s], no spawn", async (input, field) => {
    const { tool, getCount } = toolWithSpy();
    const err = parseError((await tool.handler(input)) as ToolResult);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details.code).toBe("INVALID_NOTE");
    expect(err.details.reason).toBe("path-traversal");
    expect(err.details.issues[0]!.path).toEqual([field]);
    expect(getCount()).toBe(0);
  });

  it("{ file: \"[[x]]\" } → generic VALIDATION_ERROR asking for the bare name, no spawn", async () => {
    const { tool, getCount } = toolWithSpy();
    const err = parseError((await tool.handler({ file: "[[x]]" })) as ToolResult);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details.code).toBeUndefined();
    expect(err.details.issues[0]!.path).toEqual(["file"]);
    expect(err.details.issues[0]!.message).toContain("bare note name");
    expect(getCount()).toBe(0);
  });

  it.each([[{ target_mode: "specific" }], [{ sort: "count" }], [{ foo: 1 }]])(
    "unknown key %j → generic VALIDATION_ERROR with issues, no spawn (forwarding-client pathway)",
    async (input) => {
      const { tool, getCount } = toolWithSpy();
      const err = parseError((await tool.handler(input)) as ToolResult);
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.details.code).toBeUndefined();
      expect(err.details.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
      expect(getCount()).toBe(0);
    },
  );

  it("{ vault: \"\" } → generic VALIDATION_ERROR with issues[0].path = [vault], no spawn", async () => {
    const { tool, getCount } = toolWithSpy();
    const err = parseError((await tool.handler({ vault: "" })) as ToolResult);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details.issues[0]!.path).toEqual(["vault"]);
    expect(getCount()).toBe(0);
  });
});

describe("docs/tools/tags.md (AC-14)", () => {
  const body = readFileSync(resolve(here, "../../../docs/tools/tags.md"), "utf8");

  it("covers every input field, the output shape and the error roster", () => {
    for (const field of ["vault", "file", "path", "activeOnly", "sortByCount", "includeCounts", "total"]) {
      expect(body).toContain(`\`${field}\``);
    }
    for (const code of [
      "VALIDATION_ERROR",
      "SCOPE_CONFLICT",
      "INVALID_NOTE",
      "path-traversal",
      "file+path",
      "active+note",
      "active+vault",
      "ERR_NO_ACTIVE_FILE",
      "CLI_REPORTED_ERROR",
      "Vault not found.",
      "json-parse",
      "upstream-shape",
      "CLI_OUTPUT_TOO_LARGE",
      "CLI_TIMEOUT",
      "CLI_NON_ZERO_EXIT",
      "CLI_BINARY_NOT_FOUND",
      "INTERNAL_ERROR",
    ]) {
      expect(body).toContain(code);
    }
    expect(body).toContain("## Error roster");
    expect(body).toContain("## Inherited limitations");
  });

  it("has at least four example headings covering vault-wide, file-scoped, sortByCount and activeOnly", () => {
    const headings = body.match(/^### Example .*$/gm) ?? [];
    expect(headings.length).toBeGreaterThanOrEqual(4);
    const joined = headings.join("\n");
    expect(joined).toMatch(/Vault-wide/);
    expect(joined).toMatch(/File-scoped/);
    expect(joined).toMatch(/sortByCount/);
    expect(joined).toMatch(/activeOnly/);
  });

  it("docs/tools/index.md lists **tags**", () => {
    const index = readFileSync(resolve(here, "../../../docs/tools/index.md"), "utf8");
    expect(index).toMatch(/^- \*\*tags\*\* — /m);
  });
});

describe("FR-018 baseline contains a tags entry", () => {
  it("baseline JSON includes a tools[] entry with name === 'tags'", () => {
    const baselinePath = resolve(here, "../_register-baseline.json");
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      tools: Array<{ name: string; descriptionFingerprint: string; schemaFingerprint: string }>;
    };
    const entry = baseline.tools.find((t) => t.name === "tags");
    expect(entry, "baseline must include a `tags` entry — run `npm run baseline:write`").toBeDefined();
    expect(entry!.descriptionFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(entry!.schemaFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
