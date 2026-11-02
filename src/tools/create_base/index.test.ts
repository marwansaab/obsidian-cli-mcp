// Original — no upstream.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CREATE_BASE_DESCRIPTION,
  CREATE_BASE_TOOL_NAME,
  createCreateBaseTool,
} from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger, stubVaultRegistry } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
import { closedVaultNote } from "../_shared.js";

const registry = stubVaultRegistry("Work", resolve("/vaults/Work"));

// The pre-083 wording that said `vault` was not honoured (spec 083 SC-005).
const STALE_VAULT_CLAIM = /ignored|no-op|parity|inherited|forward compatibility/i;

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createCreateBaseTool — descriptor", () => {
  it("publishes name = 'create_base' (ADR-010)", () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(CREATE_BASE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("create_base");
  });

  it("description length >= 400 chars", () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.description.length).toBeGreaterThanOrEqual(400);
  });

  it("description matches exported constant", () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.description).toBe(CREATE_BASE_DESCRIPTION);
  });

  it("emits inputSchema with additionalProperties:false and expected properties", () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
      spawnFn: makeStubSpawn(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["base_path", "content", "name", "path", "vault", "view", "view_name"]);
    expect(schema.required).toEqual(["name"]);
  });

  it("description carries Bases-family cohort cross-pointer", () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
      spawnFn: makeStubSpawn(),
    });
    const desc = tool.descriptor.description;
    expect(desc).toContain("bases");
    expect(desc).toContain("query_base");
    expect(desc).toContain("views_base");
  });

  it("description names error states", () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
      spawnFn: makeStubSpawn(),
    });
    const desc = tool.descriptor.description;
    expect(desc).toContain("INVALID_BASE_PATH");
    expect(desc).toContain("INVALID_NAME");
    expect(desc).toContain("CONTENT_TOO_LARGE");
    expect(desc).toContain("BASE_NOT_FOUND");
  });

  it("deps wired through: handler receives stubbed CLI and produces typed response", async () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
      spawnFn: makeStubSpawn({ stdout: "Created: New item.md\n" }),
    });

    const result = await tool.handler({
      base_path: "Tasks.base",
      name: "New item",
    });
    if ("isError" in result) throw new Error("unexpected error");
    const body = JSON.parse(result.content[0]!.text) as {
      path: string;
      name: string;
    };
    expect(body.path).toBe("Tasks/New item.md");
    expect(body.name).toBe("New item.md");
  });

  it("schema-layer validation: empty base_path → VALIDATION_ERROR envelope", async () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
      spawnFn: makeStubSpawn(),
    });

    const result = await tool.handler({ base_path: "", name: "x" });
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

describe("createCreateBaseTool — deprecated names (spec 073)", () => {
  type Result = { isError?: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown> };

  it("O1: a new-name call carries no deprecated_parameters", async () => {
    const tool = createCreateBaseTool({ logger: silentLogger(), queue: createQueue(), vaultRegistry: registry, spawnFn: makeStubSpawn({ stdout: "Created: New item.md\n" }) });
    const result = (await tool.handler({ base_path: "Tasks.base", name: "New item", view_name: "All" })) as Result;
    expect(result.structuredContent).toEqual({ path: "Tasks/New item.md", name: "New item.md" });
  });

  it("O2: an old-name call gets today's result plus the notice, identical in text and structuredContent", async () => {
    const tool = createCreateBaseTool({ logger: silentLogger(), queue: createQueue(), vaultRegistry: registry, spawnFn: makeStubSpawn({ stdout: "Created: New item.md\n" }) });
    const result = (await tool.handler({ path: "Tasks.base", name: "New item", view: "All" })) as Result;
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      path: "Tasks/New item.md",
      name: "New item.md",
      deprecated_parameters: [
        { parameter: "path", replacement: "base_path" },
        { parameter: "view", replacement: "view_name" },
      ],
    });
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
  });

  it("083 C11: deprecated names with a named vault fold as today and report deprecated_parameters", async () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
      fs: { realpath: async (p: string) => p },
      spawnFn: makeQueuedSpawn([
        { stdout: `=> ${JSON.stringify({ ok: true, folder: "Tasks" })}` },
        { stdout: "Created: New item.md\n" },
      ]).spawnFn,
    });
    const result = (await tool.handler({ path: "Tasks.base", name: "New item", view: "All", vault: "Work" })) as Result;
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      path: "Tasks/New item.md",
      name: "New item.md",
      deprecated_parameters: [
        { parameter: "path", replacement: "base_path" },
        { parameter: "view", replacement: "view_name" },
      ],
    });
  });

  it("O4: old + new → VALIDATION_ERROR, nothing spawned", async () => {
    let spawned = false;
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
      spawnFn: () => {
        spawned = true;
        throw new Error("spawn on a rejected call");
      },
    });
    const result = (await tool.handler({ base_path: "Tasks.base", path: "Tasks.base", name: "x" })) as Result;
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.details.issues).toEqual([
      expect.objectContaining({ path: ["path"], message: "`path` is deprecated and replaced by `base_path`; supply only `base_path`" }),
    ]);
    expect(spawned).toBe(false);
  });

  it("083: description states the routed vault, its containment errors and the closed-vault note", () => {
    expect(CREATE_BASE_DESCRIPTION).toContain(closedVaultNote("base:create"));
    expect(CREATE_BASE_DESCRIPTION).toContain("VAULT_NOT_FOUND");
    expect(CREATE_BASE_DESCRIPTION).toContain("`PATH_ESCAPES_VAULT` (only when `vault` is named");
    expect(CREATE_BASE_DESCRIPTION).toContain(
      "Optional `vault` (string): creates the item in that vault's Base; omit for the vault in front.",
    );
    expect(CREATE_BASE_DESCRIPTION).not.toMatch(STALE_VAULT_CLAIM);
  });

  it("083: docs/tools/create_base.md makes no stale claim about vault", () => {
    const doc = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/create_base.md"), "utf8");
    const stale = doc.split("\n").filter((line) => /vault/i.test(line) && STALE_VAULT_CLAIM.test(line));
    expect(stale).toEqual([]);
  });

  it("description uses the new names and lists the deprecated ones", () => {
    expect(CREATE_BASE_DESCRIPTION).toContain("Required `base_path` (string, 1..1000 chars)");
    expect(CREATE_BASE_DESCRIPTION).toContain("Optional `view_name` (string)");
    expect(CREATE_BASE_DESCRIPTION).toContain("`path` in the response is the wrapper-constructed vault-relative path of the created item");
    expect(CREATE_BASE_DESCRIPTION).toContain(
      "Deprecated names (accepted until the next major release; a call that uses one gets `deprecated_parameters` in its result): `path` → `base_path`, `view` → `view_name`.",
    );
  });
});
