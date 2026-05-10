// Original — no upstream. Tests for the write_note tool registration per ADR-009 — descriptor name, help-pointer in description (ADR-005), docs-file presence, inputSchema.required under-promise pattern, and additionalProperties strict-naive client gate (FR-016).
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createWriteNoteTool, WRITE_NOTE_DESCRIPTION, WRITE_NOTE_TOOL_NAME } from "./index.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

// Stub registry — descriptor tests never reach the handler.
const stubRegistry: VaultRegistry = {
  resolveVaultPath: async () => "C:\\stub-vault",
};

const silentLogger = () =>
  createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });

function build(): ReturnType<typeof createWriteNoteTool> {
  return createWriteNoteTool({
    logger: silentLogger(),
    queue: createQueue(),
    vaultRegistry: stubRegistry,
  });
}

describe("createWriteNoteTool — descriptor (US5 / FR-022 / ADR-005)", () => {
  // (1) Tool name is exactly "write_note"
  it("publishes name = 'write_note'", () => {
    const tool = build();
    expect(tool.descriptor.name).toBe(WRITE_NOTE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("write_note");
  });

  // (2) Tool description ends with `Call help({ tool_name: "write_note" })` per ADR-005
  it("description references the help-pointer for write_note (ADR-005)", () => {
    const tool = build();
    expect(tool.descriptor.description).toBe(WRITE_NOTE_DESCRIPTION);
    // Help-pointer convention — present and references the tool name verbatim.
    expect(tool.descriptor.description).toContain('help({ tool_name: "write_note" })');
  });

  // (3) docs/tools/write_note.md exists at the import.meta.url-anchored path (ADR-005)
  it("docs/tools/write_note.md exists at the expected path", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/write_note.md",
    );
    expect(existsSync(docsPath)).toBe(true);
  });

  // (4) inputSchema.required includes target_mode (under-promise pattern)
  it("inputSchema.required includes target_mode (under-promise per architecture)", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.required).toEqual(expect.arrayContaining(["target_mode"]));
  });

  // (5) inputSchema.additionalProperties is false (catches `template` etc. at strict-naive clients)
  it("inputSchema.additionalProperties is false (FR-016 strict-naive client gate)", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.additionalProperties).toBe(false);
  });
});
