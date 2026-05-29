// Original — no upstream. query_base registration tests.
import { resolve as resolvePath } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Platform-absolute vault root (POSIX: `/vault`, Windows: `<drive>:\vault`).
const TEST_VAULT_ROOT = resolvePath("/vault");

import {
  QUERY_BASE_DESCRIPTION,
  QUERY_BASE_TOOL_NAME,
  createQueryBaseTool,
} from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

function stubRegistry(): VaultRegistry {
  return {
    async resolveVaultPath(_n: string) {
      return TEST_VAULT_ROOT;
    },
  };
}

function stubFs() {
  return {
    stat: async () => ({ size: 100 }),
    realpath: async (p: string) => p,
  };
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createQueryBaseTool — descriptor", () => {
  it("publishes name = 'query_base' with non-empty description", () => {
    const tool = createQueryBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
      vaultRegistry: stubRegistry(),
      fs: stubFs(),
    });
    expect(tool.descriptor.name).toBe(QUERY_BASE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("query_base");
    expect(tool.descriptor.description).toBe(QUERY_BASE_DESCRIPTION);
    expect(tool.descriptor.description.length).toBeGreaterThan(0);
  });

  it("emits inputSchema with additionalProperties:false and the expected property set", () => {
    const tool = createQueryBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
      vaultRegistry: stubRegistry(),
      fs: stubFs(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["base_path", "vault", "view_name"]);
    expect(schema.required).toEqual(["base_path", "view_name"]);
  });

  it("description length > 300 chars (worked-example + failure-mode + cohort-pointer budget)", () => {
    const tool = createQueryBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
      vaultRegistry: stubRegistry(),
      fs: stubFs(),
    });
    expect(tool.descriptor.description.length).toBeGreaterThan(300);
  });

  it("description carries the Bases-family cohort cross-pointer", () => {
    const tool = createQueryBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
      vaultRegistry: stubRegistry(),
      fs: stubFs(),
    });
    expect(tool.descriptor.description).toContain("bases");
    expect(tool.descriptor.description).toContain("views_base");
    expect(tool.descriptor.description).toContain("create_base");
  });

  it("description names the four typed failure states (BASE_NOT_FOUND, BASE_MALFORMED, VIEW_NOT_FOUND, VAULT_NOT_FOUND)", () => {
    const tool = createQueryBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
      vaultRegistry: stubRegistry(),
      fs: stubFs(),
    });
    const desc = tool.descriptor.description;
    expect(desc).toContain("BASE_NOT_FOUND");
    expect(desc).toContain("BASE_MALFORMED");
    expect(desc).toContain("VIEW_NOT_FOUND");
    expect(desc).toContain("VAULT_NOT_FOUND");
  });

  it("deps wired through: handler receives stubbed CLI envelope and produces typed response", async () => {
    const envelope = JSON.stringify([{ path: "x.md", status: "open" }]);
    const tool = createQueryBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn({ stdout: envelope }),
      vaultRegistry: stubRegistry(),
      fs: stubFs(),
    });
    const result = await tool.handler({
      base_path: "Indexes/Active.base",
      view_name: "Open",
      vault: "Demo",
    });
    if ("isError" in result) throw new Error("unexpected error envelope");
    const body = JSON.parse(result.content[0]!.text) as {
      columns: string[];
      rows: unknown[];
      truncated: boolean;
    };
    expect(body.columns[0]).toBe("path");
    expect(body.rows).toEqual([{ path: "x.md", status: "open" }]);
    expect(body.truncated).toBe(false);
  });

  it("schema-layer validation: empty base_path → VALIDATION_ERROR envelope", async () => {
    const tool = createQueryBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
      vaultRegistry: stubRegistry(),
      fs: stubFs(),
    });
    const result = await tool.handler({
      base_path: "",
      view_name: "Open",
    });
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text) as {
        code: string;
        details: { issues: Array<{ path: unknown[]; message: string }> };
      };
      expect(payload.code).toBe("VALIDATION_ERROR");
      expect(
        payload.details.issues.some(
          (i) =>
            i.path[0] === "base_path" && i.message.includes("INVALID_BASE_PATH"),
        ),
      ).toBe(true);
    }
  });
});
