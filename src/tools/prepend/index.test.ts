// Original — no upstream. prepend tool registration tests per BI-045 / FR-027 / ADR-005 / ADR-010 — descriptor name (mirror-name convention, NOT prepend_note) + help-pointer + docs-file presence + inputSchema.required under-promise pattern + additionalProperties strict-naive client gate + content maxLength tied to MAX_CONTENT_LENGTH (BI-047 lowered the cap from 24576 to 3072 per empirical upstream-defect bisect).
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  createPrependTool,
  PREPEND_DESCRIPTION,
  PREPEND_TOOL_NAME,
} from "./index.js";
import { MAX_CONTENT_LENGTH } from "./schema.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

const stubRegistry: VaultRegistry = {
  resolveVaultPath: async () => "C:\\stub-vault",
  resolveVaultDisplayName: () => null,
};

function build(): ReturnType<typeof createPrependTool> {
  return createPrependTool({
    logger: silentLogger(),
    queue: createQueue(),
    vaultRegistry: stubRegistry,
  });
}

describe("createPrependTool — descriptor (BI-045 / ADR-005 / ADR-010)", () => {
  it("publishes name = 'prepend' (mirror-name per ADR-010, NOT 'prepend_note')", () => {
    const tool = build();
    expect(tool.descriptor.name).toBe(PREPEND_TOOL_NAME);
    expect(tool.descriptor.name).toBe("prepend");
    expect(tool.descriptor.name).not.toBe("prepend_note");
  });

  it("description references the help-pointer for prepend (ADR-005)", () => {
    const tool = build();
    expect(tool.descriptor.description).toBe(PREPEND_DESCRIPTION);
    expect(tool.descriptor.description).toContain('help({ tool_name: "prepend" })');
  });

  it("description names the content cap (SC-008 contract-and-implementation match)", () => {
    const tool = build();
    expect(tool.descriptor.description).toContain(String(MAX_CONTENT_LENGTH));
  });

  it("docs/tools/prepend.md exists at the expected path", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/prepend.md",
    );
    expect(existsSync(docsPath)).toBe(true);
  });

  it("inputSchema.required includes target_mode and content", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.required).toEqual(
      expect.arrayContaining(["target_mode", "content"]),
    );
  });

  it("inputSchema.additionalProperties is false (strict-naive client gate)", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.additionalProperties).toBe(false);
  });

  it("inputSchema publishes the six top-level keys exactly", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown>;
    expect(new Set(Object.keys(properties))).toEqual(
      new Set(["target_mode", "vault", "file", "path", "content", "inline"]),
    );
  });

  it("inputSchema.properties.content carries the schema's MAX_CONTENT_LENGTH (FR-018)", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.content!.maxLength).toBe(MAX_CONTENT_LENGTH);
  });
});
