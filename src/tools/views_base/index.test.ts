// Original — no upstream.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  VIEWS_BASE_DESCRIPTION,
  VIEWS_BASE_TOOL_NAME,
  createViewsBaseTool,
} from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

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

  it("description length >= 400 chars", () => {
    const tool = makeTool();
    expect(tool.descriptor.description.length).toBeGreaterThanOrEqual(400);
  });

  it("description matches exported constant", () => {
    const tool = makeTool();
    expect(tool.descriptor.description).toBe(VIEWS_BASE_DESCRIPTION);
  });

  it("description surfaces base_path / named-Base and drops the old active-mode-only claim", () => {
    const tool = makeTool();
    const desc = tool.descriptor.description;
    expect(desc).toContain("base_path");
    expect(desc).toContain("Named Base");
    expect(desc).not.toContain("Active-mode-only");
  });

  it("description documents the new error roster (clean names + reasons)", () => {
    const desc = makeTool().descriptor.description;
    expect(desc).toContain("INVALID_BASE_PATH");
    expect(desc).toContain("named-missing");
    expect(desc).toContain("not-open");
    expect(desc).toContain("VAULT_NOT_FOUND");
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
});
