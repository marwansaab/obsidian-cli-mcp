// Original — no upstream.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BASES_DESCRIPTION,
  BASES_TOOL_NAME,
  createBasesTool,
} from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createBasesTool — descriptor", () => {
  it("publishes name = 'bases' (ADR-010)", () => {
    const tool = createBasesTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(BASES_TOOL_NAME);
    expect(tool.descriptor.name).toBe("bases");
  });

  it("description length >= 400 chars", () => {
    const tool = createBasesTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.description.length).toBeGreaterThanOrEqual(400);
  });

  it("description matches exported constant", () => {
    const tool = createBasesTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.description).toBe(BASES_DESCRIPTION);
  });

  it("emits inputSchema with additionalProperties:false", () => {
    const tool = createBasesTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
  });

  it("description carries Bases-family cohort cross-pointer", () => {
    const tool = createBasesTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn(),
    });
    const desc = tool.descriptor.description;
    expect(desc).toContain("query_base");
    expect(desc).toContain("views_base");
    expect(desc).toContain("create_base");
  });

  it("deps wired through: handler receives stubbed CLI and produces typed response", async () => {
    const stdout = "a.base\nb.base\n";
    const tool = createBasesTool({
      logger: silentLogger(),
      queue: createQueue(),
      spawnFn: makeStubSpawn({ stdout }),
    });

    const result = await tool.handler({});
    if ("isError" in result) throw new Error("unexpected error");
    const body = JSON.parse(result.content[0]!.text) as {
      bases: string[];
      count: number;
    };
    expect(body.bases).toEqual(["a.base", "b.base"]);
    expect(body.count).toBe(2);
  });
});
