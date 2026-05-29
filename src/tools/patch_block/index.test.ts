// Original — no upstream. patch_block tool registration tests per BI-043 / FR-022 / ADR-005 — descriptor name + help-pointer + docs-file presence + inputSchema.required under-promise pattern + additionalProperties strict-naive client gate.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  createPatchBlockTool,
  PATCH_BLOCK_DESCRIPTION,
  PATCH_BLOCK_TOOL_NAME,
} from "./index.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

const stubRegistry: VaultRegistry = {
  resolveVaultPath: async () => "C:\\stub-vault",
  resolveVaultDisplayName: () => null,
};

function build(): ReturnType<typeof createPatchBlockTool> {
  return createPatchBlockTool({
    logger: silentLogger(),
    queue: createQueue(),
    vaultRegistry: stubRegistry,
  });
}

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
