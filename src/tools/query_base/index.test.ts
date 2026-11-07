// Original — no upstream. query_base registration tests.
import { readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";

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
import { folderMissingDetails, missingFolderRealpath, silentLogger } from "../_handler-test-fixtures.js";
import { textOf } from "../_mcp-client-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
import { DOCS_DIR } from "../help/handler.js";

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
    readFile: async () => "views:\n  - type: table\n    name: Open\n",
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
    const helpPage = readFileSync(join(DOCS_DIR, "query_base.md"), "utf8");
    expect(helpPage).toContain("BASE_NOT_FOUND");
    expect(helpPage).toContain("BASE_MALFORMED");
    expect(helpPage).toContain("VIEW_NOT_FOUND");
    expect(helpPage).toContain("VAULT_NOT_FOUND");
  });

  // spec 072 FR-008: the shared closed-vault note, naming this tool's subcommand (wording pinned in _shared.test.ts)
  it("description carries the closed-vault note for `base:query`", () => {
    const helpPage = readFileSync(join(DOCS_DIR, "query_base.md"), "utf8");
    expect(helpPage).toContain('Command "base:query" not found.');
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

  // BI-0185 acceptance criterion 6: the registered tool answers a missing vault folder with the
  // JSON {code, message, details} envelope, never the SDK's free-text error.
  it("registered vault whose folder is missing → isError JSON envelope, VAULT_NOT_FOUND/folder-missing, no path", async () => {
    const tool = createQueryBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
      vaultRegistry: stubRegistry(),
      fs: { ...stubFs(), realpath: missingFolderRealpath(TEST_VAULT_ROOT) },
    });
    const result = await tool.handler({ base_path: "x.base", view_name: "All", vault: "Gone" });
    expect("isError" in result && result.isError).toBe(true);
    const text = result.content[0]!.text;
    const payload = JSON.parse(text) as { code: string; message: string; details: unknown };
    expect(payload.code).toBe("CLI_REPORTED_ERROR");
    expect(payload.details).toEqual(folderMissingDetails("Gone"));
    expect(payload.message).toContain("Restore the folder, or re-open the vault in Obsidian");
    expect(text).not.toContain(JSON.stringify(TEST_VAULT_ROOT).slice(1, -1));
  });
});

// BI-0174 item 7: the registered tool lifts INVALID_BASE_PATH / INVALID_VIEW_NAME's ADR-015 params into details.
describe("createQueryBaseTool — schema-layer sub-codes in details (BI-0174)", () => {
  async function rejected(args: Record<string, unknown>): Promise<{ code: string; message: string; details: Record<string, unknown> }> {
    const tool = createQueryBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
      vaultRegistry: stubRegistry(),
      fs: stubFs(),
    });
    const result = await tool.handler(args);
    expect("isError" in result && result.isError).toBe(true);
    return JSON.parse(textOf(result));
  }

  it("a non-.base path → INVALID_BASE_PATH / wrong-extension with field and value", async () => {
    const payload = await rejected({ base_path: "x.md", view_name: "All" });
    const message = "INVALID_BASE_PATH/wrong-extension: base_path must end with .base";
    expect(payload).toEqual({
      code: "VALIDATION_ERROR",
      message,
      details: {
        code: "INVALID_BASE_PATH",
        reason: "wrong-extension",
        field: "base_path",
        value: "x.md",
        issues: [{ path: ["base_path"], message, code: "custom" }],
      },
    });
  });

  it("an over-long view_name → INVALID_VIEW_NAME / too-long with value_length", async () => {
    const payload = await rejected({ base_path: "x.base", view_name: "v".repeat(1001) });
    expect(payload.message).toBe("INVALID_VIEW_NAME/too-long: view_name exceeds 1000 UTF-16 code units");
    expect(payload.details).toMatchObject({
      code: "INVALID_VIEW_NAME",
      reason: "too-long",
      field: "view_name",
      value_length: 1001,
    });
  });

  it("a failure without a sub-code keeps the generic envelope", async () => {
    const payload = await rejected({ base_path: "x.base", view_name: "All", extra: 1 });
    expect(payload.message).toBe("query_base input failed schema validation");
    expect(payload.details["code"]).toBeUndefined();
    expect(payload.details["issues"]).toBeDefined();
  });
});
