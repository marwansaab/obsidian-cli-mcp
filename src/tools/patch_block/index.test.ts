// Original — no upstream. patch_block tool registration tests per BI-043 / FR-022 / ADR-005 — descriptor name + help-pointer + docs-file presence + inputSchema.required under-promise pattern + additionalProperties strict-naive client gate.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ExecuteFs } from "./handler.js";
import {
  createPatchBlockTool,
  PATCH_BLOCK_DESCRIPTION,
  PATCH_BLOCK_TOOL_NAME,
} from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

const stubRegistry: VaultRegistry = {
  resolveVaultPath: async () => "C:\\stub-vault",
  resolveVaultDisplayName: () => null,
};

const VAULT_ROOT = resolve("/test-vault");

/** Minimal in-memory ExecuteFs mirroring handler.test.ts's fakeFs (vi-free). */
function fakeFs(content: string): ExecuteFs {
  const enoent = (): NodeJS.ErrnoException => {
    const e = new Error("ENOENT") as NodeJS.ErrnoException;
    e.code = "ENOENT";
    return e;
  };
  return {
    readFile: async () => content,
    writeFile: async () => {},
    rename: async () => {},
    realpath: async (p: string) => {
      if (p === VAULT_ROOT) return VAULT_ROOT;
      throw enoent();
    },
    unlink: async () => {},
  };
}

function successRegistry(): VaultRegistry {
  return {
    resolveVaultPath: async () => VAULT_ROOT,
    resolveVaultDisplayName: () => null,
  };
}

function build(): ReturnType<typeof createPatchBlockTool> {
  return createPatchBlockTool({
    logger: silentLogger(),
    queue: createQueue(),
    vaultRegistry: stubRegistry,
  });
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createPatchBlockTool — handler closure (registered boundary)", () => {
  // Handler-closure execution: VALID input passes Zod, so registerTool runs the
  // `handler: async (input, d) => executePatchBlock(input, d)` closure (not the
  // VALIDATION_ERROR short-circuit). Success fs + registry + eval fixtures copied
  // from handler.test.ts's paragraph-replace case; the wrapped
  // { path, vault, block_id, block_shape, bytes_written } envelope proves the
  // closure executed end-to-end.
  it("tool.handler runs the executePatchBlock closure on VALID input and returns a content envelope", async () => {
    const note = "intro\n\nA simple paragraph. ^foo\n\nclosing\n";
    const { spawnFn } = makeQueuedSpawn([{ stdout: "=> undefined\n", exitCode: 0 }]);
    const tool = createPatchBlockTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: successRegistry(),
      fs: fakeFs(note),
      spawnFn,
    });
    const result = await tool.handler({
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      block_id: "foo",
      content: "Replaced text.",
    });
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThanOrEqual(1);
    expect("isError" in result).toBe(false);
    const payload = JSON.parse(result.content[0]!.text) as {
      path: string;
      vault: string;
      block_id: string;
      block_shape: string;
      bytes_written: number;
    };
    expect(payload.path).toBe("n.md");
    expect(payload.vault).toBe("TestVault");
    expect(payload.block_id).toBe("foo");
    expect(payload.block_shape).toBe("paragraph");
    expect(payload.bytes_written).toBeGreaterThan(0);
  });
});

describe("createPatchBlockTool — descriptor (BI-043 / ADR-005)", () => {
  it("publishes name = 'patch_block'", () => {
    const tool = build();
    expect(tool.descriptor.name).toBe(PATCH_BLOCK_TOOL_NAME);
    expect(tool.descriptor.name).toBe("patch_block");
  });

  it("description references the help-pointer for patch_block (ADR-005)", () => {
    const tool = build();
    expect(tool.descriptor.description).toBe(PATCH_BLOCK_DESCRIPTION);
    expect(tool.descriptor.description).toContain('help({ tool_name: "patch_block" })');
  });

  it("docs/tools/patch_block.md exists at the expected path", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/patch_block.md",
    );
    expect(existsSync(docsPath)).toBe(true);
  });

  it("inputSchema.required includes target_mode, block_id, content", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.required).toEqual(
      expect.arrayContaining(["target_mode", "block_id", "content"]),
    );
  });

  it("inputSchema.additionalProperties is false (FR-022 strict-naive client gate)", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.additionalProperties).toBe(false);
  });

  it("inputSchema publishes the contract's six top-level keys exactly", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown>;
    expect(new Set(Object.keys(properties))).toEqual(
      new Set(["target_mode", "vault", "file", "path", "block_id", "content"]),
    );
  });
});
