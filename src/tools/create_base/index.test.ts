// Original — no upstream.
import { Writable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CREATE_BASE_DESCRIPTION,
  CREATE_BASE_TOOL_NAME,
  createCreateBaseTool,
} from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";

const silentLogger = () =>
  createLogger({
    stream: new Writable({ write(_c, _e, cb) { cb(); } }),
  });

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createCreateBaseTool — descriptor", () => {
  it("publishes name = 'create_base' (ADR-010)", () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(CREATE_BASE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("create_base");
  });

  it("description length >= 400 chars", () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.description.length).toBeGreaterThanOrEqual(400);
  });

  it("description matches exported constant", () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.description).toBe(CREATE_BASE_DESCRIPTION);
  });

  it("emits inputSchema with additionalProperties:false and expected properties", () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["content", "name", "path", "vault", "view"]);
    expect(schema.required).toEqual(["path", "name"]);
  });

  it("description carries Bases-family cohort cross-pointer", () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
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
      spawnFn: makeStubSpawn({ stdout: "Created: New item.md\n" }),
    });

    const result = await tool.handler({
      path: "Tasks.base",
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

  it("schema-layer validation: empty path → VALIDATION_ERROR envelope", async () => {
    const tool = createCreateBaseTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });

    const result = await tool.handler({ path: "", name: "x" });
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
            i.path[0] === "path" && i.message.includes("INVALID_BASE_PATH"),
        ),
      ).toBe(true);
    }
  });
});
