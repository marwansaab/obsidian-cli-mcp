// Original — no upstream. append_note tool registration tests per BI-044 / FR-027 / ADR-005 — descriptor name + help-pointer + docs-file presence + inputSchema.required under-promise pattern + additionalProperties strict-naive client gate.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  APPEND_NOTE_DESCRIPTION,
  APPEND_NOTE_TOOL_NAME,
  createAppendNoteTool,
} from "./index.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

const stubRegistry: VaultRegistry = {
  resolveVaultPath: async () => "C:\\stub-vault",
  resolveVaultDisplayName: () => null,
};

function build(): ReturnType<typeof createAppendNoteTool> {
  return createAppendNoteTool({
    logger: silentLogger(),
    queue: createQueue(),
    vaultRegistry: stubRegistry,
  });
}

describe("createAppendNoteTool — descriptor (BI-044 / ADR-005)", () => {
  it("publishes name = 'append_note'", () => {
    const tool = build();
    expect(tool.descriptor.name).toBe(APPEND_NOTE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("append_note");
  });

  it("description references the help-pointer for append_note (ADR-005)", () => {
    const tool = build();
    expect(tool.descriptor.description).toBe(APPEND_NOTE_DESCRIPTION);
    expect(tool.descriptor.description).toContain('help({ tool_name: "append_note" })');
  });

  it("docs/tools/append_note.md exists at the expected path", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/append_note.md",
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

  it("inputSchema publishes the contract's five top-level keys exactly", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown>;
    expect(new Set(Object.keys(properties))).toEqual(
      new Set(["target_mode", "vault", "file", "path", "content", "inline"]),
    );
  });
});
