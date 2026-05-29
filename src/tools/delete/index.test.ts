// Original — no upstream. Tests for the delete tool registration — descriptor shape, stripped schema, help mention + irreversibility warning, docs presence.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDeleteTool, DELETE_DESCRIPTION, DELETE_TOOL_NAME } from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
import { countDescriptionKeys } from "../_schema-test-utils.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createDeleteTool — descriptor", () => {
  // (a) Story 7 AC#1 base — descriptor name
  it("publishes name = 'delete' and description verbatim (Story 7 AC#1)", () => {
    const tool = createDeleteTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    expect(tool.descriptor.name).toBe(DELETE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("delete");
    expect(tool.descriptor.description).toBe(DELETE_DESCRIPTION);
  });

  // (b) Story 7 AC#1 + AC#2 — emitted inputSchema shape
  it("emits a post-010 inputSchema with descriptions stripped at every nested depth (Story 7 AC#2)", () => {
    const tool = createDeleteTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.oneOf).toBeUndefined();
    expect(countDescriptionKeys(schema)).toBe(0);
  });

  // (c) Story 7 AC#3 — description mentions help, the tool's own name, AND surfaces the safety-default disclosure
  it("description references help(), the tool name 'delete', and surfaces the safety-default + irreversibility disclosure (Story 7 AC#3, FR-012)", () => {
    const tool = createDeleteTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const desc = tool.descriptor.description;
    const lower = desc.toLowerCase();
    expect(lower).toContain("help");
    expect(lower).toContain("delete");
    expect(desc).toMatch(/trash|recoverable|irreversible|permanent/i);
    expect(desc.length).toBeGreaterThan(0);
  });
});

describe("createDeleteTool — handler integration via registerTool", () => {
  // (d) End-to-end VALIDATION_ERROR propagation
  it("missing required vault+locator surfaces as VALIDATION_ERROR isError envelope (registerTool ZodError wrap)", async () => {
    const tool = createDeleteTool({ logger: silentLogger(), queue: createQueue(), spawnFn: makeStubSpawn() });
    const result = (await tool.handler({ target_mode: "specific" })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.message).toContain("delete");
  });

  // (d2) VALID input drives the index.ts closure `async (input, d) => executeDeleteNote(input, d)`.
  // Case (d) above stops at _register's validation gate before the closure runs; this case
  // passes a schema-valid payload so the closure executes through to a success envelope.
  it("valid input drives the handler closure → executeDeleteNote → success { deleted, path, toTrash } envelope", async () => {
    const tool = createDeleteTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn({ stdout: "Moved to trash: Inbox/Old.md\n", exitCode: 0 }),
    });
    const result = (await tool.handler({
      target_mode: "specific",
      vault: "MyVault",
      path: "Inbox/Old.md",
      permanent: false,
    })) as { isError?: boolean; content: { type: string; text: string }[] };
    expect(result.isError).toBeUndefined();
    expect(Array.isArray(result.content)).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload).toEqual({ deleted: true, path: "Inbox/Old.md", toTrash: true });
  });
});

describe("docs/tools/delete.md exists and is non-stub (FR-014, FR-016 case e)", () => {
  // (e) Story 7 AC#4 / FR-014 / FR-016 case (e) — docs file presence + content
  it("docs file resolves via import.meta.url, has no TODO marker, contains all 5 error codes + 4 example shapes + irreversibility warning", () => {
    const docsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/delete.md");
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
    expect(body).toMatch(/target_mode[\s\S]*?specific[\s\S]*?path/);
    expect(body).toMatch(/target_mode[\s\S]*?specific[\s\S]*?file/);
    expect(body).toMatch(/target_mode[\s\S]*?specific[\s\S]*?permanent/);
    expect(body).toMatch(/non-existent|not found/i);
    expect(body).toMatch(/irreversibl|cannot be undone|unrecoverable/i);
  });
});
