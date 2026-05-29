// Original — no upstream. append_note tool registration tests per BI-044 / FR-027 / ADR-005 — descriptor name + help-pointer + docs-file presence + inputSchema.required under-promise pattern + additionalProperties strict-naive client gate.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { type ExecuteFs } from "./handler.js";
import {
  APPEND_NOTE_DESCRIPTION,
  APPEND_NOTE_TOOL_NAME,
  createAppendNoteTool,
} from "./index.js";
import { __resetInFlightRegistryForTests } from "../../cli-adapter/_dispatch.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger, type StubResponse } from "../_handler-test-fixtures.js";

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

// Exercises the index.ts handler closure `async (input, d) => executeAppendNote(input, d)`
// — the descriptor-only cases above never call tool.handler, and the existing
// validation-failure path short-circuits in _register before the closure runs.
describe("createAppendNoteTool — handler closure executes on VALID input", () => {
  const VAULT_ROOT = resolve("/test-vault");

  it("tool.handler(valid input) drives the closure → executeAppendNote → success envelope", async () => {
    __resetInFlightRegistryForTests();
    const reads: string[] = [];
    const writes: Array<[string, string]> = [];
    const fs: ExecuteFs = {
      readFile: vi.fn(async (p: string) => {
        reads.push(p);
        return "abc\n";
      }),
      writeFile: vi.fn(async (p: string, c: string) => {
        writes.push([p, c]);
      }),
      rename: vi.fn(async () => {}),
      realpath: vi.fn(async (p: string) => {
        if (p === VAULT_ROOT) return VAULT_ROOT;
        return resolve(VAULT_ROOT, "n.md");
      }),
      unlink: vi.fn(async () => {}),
    };
    const registry: VaultRegistry = {
      resolveVaultPath: vi.fn(async () => VAULT_ROOT),
      resolveVaultDisplayName: vi.fn(() => "TestVault"),
    };
    const evalOk: StubResponse = { stdout: "=> undefined\n", exitCode: 0 };
    const { spawnFn } = makeQueuedSpawn([evalOk]);
    const tool = createAppendNoteTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: registry,
      spawnFn,
      env: {},
      fs,
    });

    const result = (await tool.handler({
      target_mode: "specific",
      vault: "TestVault",
      path: "n.md",
      content: "def",
      inline: false,
    })) as { content: Array<{ type: string; text: string }>; isError?: boolean };

    expect(Array.isArray(result.content)).toBe(true);
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload).toEqual({
      path: "n.md",
      vault: "TestVault",
      bytes_written: 3,
      inline: false,
    });
    expect(writes[0]![1]).toBe("abc\ndef");
    __resetInFlightRegistryForTests();
  });
});
