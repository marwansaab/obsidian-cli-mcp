// Original — no upstream.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BASES_DESCRIPTION,
  BASES_TOOL_NAME,
  createBasesTool,
} from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { silentLogger, stubVaultRegistry } from "../_handler-test-fixtures.js";
import { makeRegistrationStubSpawn as makeStubSpawn } from "../_registration-stub.js";
import { DOCS_DIR } from "../help/handler.js";

const registry = stubVaultRegistry("Work", "/vaults/Work");

// The pre-083 wording that said `vault` was not honoured (spec 083 SC-005).
const STALE_VAULT_CLAIM = /ignored|no-op|parity|inherited|forward compatibility/i;

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createBasesTool — descriptor", () => {
  it("publishes name = 'bases' (ADR-010)", () => {
    const tool = createBasesTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.name).toBe(BASES_TOOL_NAME);
    expect(tool.descriptor.name).toBe("bases");
  });

  it("description matches exported constant", () => {
    const tool = createBasesTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
      spawnFn: makeStubSpawn(),
    });
    expect(tool.descriptor.description).toBe(BASES_DESCRIPTION);
  });

  it("emits inputSchema with additionalProperties:false", () => {
    const tool = createBasesTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
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
      vaultRegistry: registry,
      spawnFn: makeStubSpawn(),
    });
    const desc = tool.descriptor.description;
    expect(desc).toContain("query_base");
    expect(desc).toContain("views_base");
    expect(desc).toContain("create_base");
  });

  it("083: description states the routed vault, VAULT_NOT_FOUND and the closed-vault note", () => {
    const helpPage = readFileSync(join(DOCS_DIR, "bases.md"), "utf8");
    expect(helpPage).toContain('Command "bases" not found.');
    expect(helpPage).toContain("VAULT_NOT_FOUND");
    expect(helpPage).toContain(
      "Optional `vault` (string): lists that vault's Bases. Omit to list the vault in front.",
    );
    expect(BASES_DESCRIPTION).not.toMatch(STALE_VAULT_CLAIM);
  });

  it("083: docs/tools/bases.md makes no stale claim about vault", () => {
    const doc = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/tools/bases.md"), "utf8");
    const stale = doc.split("\n").filter((line) => /vault/i.test(line) && STALE_VAULT_CLAIM.test(line));
    expect(stale).toEqual([]);
  });

  it("deps wired through: handler receives stubbed CLI and produces typed response", async () => {
    const stdout = "a.base\nb.base\n";
    const tool = createBasesTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
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
