// Original — no upstream. patch_heading tool registration tests per BI-040 / FR-022 / ADR-005 — descriptor name + help-pointer + docs-file presence + inputSchema.required under-promise pattern + additionalProperties strict-naive client gate.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  createPatchHeadingTool,
  PATCH_HEADING_DESCRIPTION,
  PATCH_HEADING_TOOL_NAME,
} from "./index.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

const stubRegistry: VaultRegistry = {
  resolveVaultPath: async () => "C:\\stub-vault",
  resolveVaultDisplayName: () => null,
};

const silentLogger = () =>
  createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });

function build(): ReturnType<typeof createPatchHeadingTool> {
  return createPatchHeadingTool({
    logger: silentLogger(),
    queue: createQueue(),
    vaultRegistry: stubRegistry,
  });
}

describe("createPatchHeadingTool — descriptor (BI-040 / ADR-005)", () => {
  it("publishes name = 'patch_heading'", () => {
    const tool = build();
    expect(tool.descriptor.name).toBe(PATCH_HEADING_TOOL_NAME);
    expect(tool.descriptor.name).toBe("patch_heading");
  });

  it("description references the help-pointer for patch_heading (ADR-005)", () => {
    const tool = build();
    expect(tool.descriptor.description).toBe(PATCH_HEADING_DESCRIPTION);
    expect(tool.descriptor.description).toContain('help({ tool_name: "patch_heading" })');
  });

  it("docs/tools/patch_heading.md exists at the expected path", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/patch_heading.md",
    );
    expect(existsSync(docsPath)).toBe(true);
  });

  it("inputSchema.required includes target_mode, heading_path, mode, content", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.required).toEqual(
      expect.arrayContaining(["target_mode", "heading_path", "mode", "content"]),
    );
  });

  it("inputSchema.additionalProperties is false (FR-022 strict-naive client gate)", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.additionalProperties).toBe(false);
  });

  it("inputSchema publishes the contract's seven top-level keys exactly", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown>;
    expect(new Set(Object.keys(properties))).toEqual(
      new Set(["target_mode", "vault", "file", "path", "heading_path", "mode", "content"]),
    );
  });
});
