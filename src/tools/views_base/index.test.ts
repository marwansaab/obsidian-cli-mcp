// Original — no upstream.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  VIEWS_BASE_DESCRIPTION,
  VIEWS_BASE_TOOL_NAME,
  createViewsBaseTool,
} from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { textOf } from "../_mcp-client-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
import { DOCS_DIR } from "../help/handler.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

// The pre-083 wording that said `vault` was not honoured (spec 083 SC-005).
const STALE_VAULT_CLAIM = /ignored|no-op|parity|inherited|forward compatibility/i;

const stubRegistry: VaultRegistry = {
  async resolveVaultPath(name: string) {
    return `C:/vaults/${name}`;
  },
};

function makeTool(stub?: Parameters<typeof makeStubSpawn>[0]) {
  return createViewsBaseTool({
    logger: silentLogger(),
    queue: createQueue(),
    vaultRegistry: stubRegistry,
    spawnFn: stub ? makeStubSpawn(stub) : makeStubSpawn(),
  });
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createViewsBaseTool — descriptor", () => {
  it("publishes name = 'views_base' (ADR-010)", () => {
    const tool = makeTool();
    expect(tool.descriptor.name).toBe(VIEWS_BASE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("views_base");
  });

  it("description matches exported constant", () => {
    const tool = makeTool();
    expect(tool.descriptor.description).toBe(VIEWS_BASE_DESCRIPTION);
  });

  it("description surfaces base_path / named-Base and drops the old active-mode-only claim", () => {
    const tool = makeTool();
    const desc = tool.descriptor.description;
    expect(desc).toContain("base_path");
    expect(readFileSync(join(DOCS_DIR, "views_base.md"), "utf8")).toContain("Named Base");
    expect(desc).not.toContain("Active-mode-only");
  });

  it("description documents the new error roster (clean names + reasons)", () => {
    const helpPage = readFileSync(join(DOCS_DIR, "views_base.md"), "utf8");
    expect(helpPage).toContain("INVALID_BASE_PATH");
    expect(helpPage).toContain("named-missing");
    expect(helpPage).toContain("not-open");
    expect(helpPage).toContain("VAULT_NOT_FOUND");
  });

  it("emits inputSchema with additionalProperties:false", () => {
    const tool = makeTool();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
  });

  it("description carries Bases-family cohort cross-pointer", () => {
    const desc = makeTool().descriptor.description;
    expect(desc).toContain("bases");
    expect(desc).toContain("query_base");
    expect(desc).toContain("create_base");
  });

  it("083: description routes vault in both modes and carries the closed-vault note", () => {
    const helpPage = readFileSync(join(DOCS_DIR, "views_base.md"), "utf8");
    expect(helpPage).toContain('Command "base:views" not found.');
    expect(helpPage).toContain("VAULT_NOT_FOUND");
    expect(helpPage).toContain("without `base_path`, the views of the Base open in that vault");
    expect(helpPage).toContain("omitted, the vault in front");
    expect(VIEWS_BASE_DESCRIPTION).not.toMatch(STALE_VAULT_CLAIM);
  });

  it("083: docs/tools/views_base.md makes no stale claim about vault", () => {
    const doc = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/views_base.md"), "utf8");
    const stale = doc.split("\n").filter((line) => /vault/i.test(line) && STALE_VAULT_CLAIM.test(line));
    expect(stale).toEqual([]);
  });

  it("deps wired through: handler strips the type label and produces a typed response", async () => {
    const stdout = "All\ttable\nActive\ttable\n";
    const tool = makeTool({ stdout });

    const result = await tool.handler({});
    if ("isError" in result) throw new Error("unexpected error");
    const body = JSON.parse(result.content[0]!.text) as {
      views: string[];
      count: number;
    };
    expect(body.views).toEqual(["All", "Active"]);
    expect(body.count).toBe(2);
  });

  it("081 M16: an invalid locator is a VALIDATION_ERROR result, distinct from every CLI_REPORTED_ERROR cause", async () => {
    const result = await makeTool().handler({ base_path: "Notes/x.md" });

    expect("isError" in result).toBe(true);
    const payload = JSON.parse(result.content[0]!.text) as {
      code: string;
      details: { issues: Array<{ message: string }> };
    };
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.details.issues[0]!.message.startsWith("INVALID_BASE_PATH/wrong-extension")).toBe(true);
  });
});

// BI-0174 item 7 (owner ruling Q1 = C): views_base is not lifted; it keeps registerTool's generic envelope.
describe("createViewsBaseTool — generic validation envelope (BI-0174)", () => {
  it("a non-.base path keeps the generic envelope, with no details.code", async () => {
    const result = await makeTool().handler({ base_path: "x.md" });
    expect("isError" in result && result.isError).toBe(true);
    const payload = JSON.parse(textOf(result)) as { message: string; details: Record<string, unknown> };
    expect(payload.message).toBe("views_base input failed schema validation");
    expect(payload.details).toEqual({
      issues: [
        { path: ["base_path"], message: "INVALID_BASE_PATH/wrong-extension: base_path must end with .base", code: "custom" },
      ],
    });
  });
});
