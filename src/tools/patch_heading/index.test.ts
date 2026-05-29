// Original — no upstream. patch_heading tool registration tests per BI-040 / FR-022 / ADR-005 — descriptor name + help-pointer + docs-file presence + inputSchema.required under-promise pattern + additionalProperties strict-naive client gate.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ExecuteFs } from "./handler.js";
import {
  createPatchHeadingTool,
  PATCH_HEADING_DESCRIPTION,
  PATCH_HEADING_TOOL_NAME,
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

const SAMPLE_NOTE =
  "---\n" +
  "date: 2026-05-21\n" +
  "tags: [daily]\n" +
  "---\n" +
  "\n" +
  "# Daily\n" +
  "\n" +
  "## Tasks\n" +
  "\n" +
  "### TODO\n" +
  "\n" +
  "- Buy groceries\n" +
  "- Submit timesheet\n" +
  "\n" +
  "### Done\n" +
  "\n" +
  "- Reviewed PR #128\n" +
  "\n" +
  "## Notes\n" +
  "\n" +
  "A quick thought.\n";

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

function build(): ReturnType<typeof createPatchHeadingTool> {
  return createPatchHeadingTool({
    logger: silentLogger(),
    queue: createQueue(),
    vaultRegistry: stubRegistry,
  });
}

beforeEach(() => __resetInFlightRegistryForTests());
afterEach(() => __resetInFlightRegistryForTests());

describe("createPatchHeadingTool — handler closure (registered boundary)", () => {
  // Handler-closure execution: VALID input passes Zod, so registerTool runs the
  // `handler: async (input, d) => executePatchHeading(input, d)` closure (not the
  // VALIDATION_ERROR short-circuit). Success fs + registry + eval fixtures copied
  // from handler.test.ts's append case; the wrapped
  // { path, vault, heading_path, mode, bytes_written } envelope proves the closure
  // executed end-to-end.
  it("tool.handler runs the executePatchHeading closure on VALID input and returns a content envelope", async () => {
    const { spawnFn } = makeQueuedSpawn([{ stdout: "=> undefined\n", exitCode: 0 }]);
    const tool = createPatchHeadingTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: successRegistry(),
      fs: fakeFs(SAMPLE_NOTE),
      spawnFn,
    });
    const result = await tool.handler({
      target_mode: "specific",
      vault: "TestVault",
      path: "Daily Notes/2026-05-21.md",
      heading_path: "Daily#Tasks#TODO",
      mode: "append",
      content: "- File expense report\n",
    });
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThanOrEqual(1);
    expect("isError" in result).toBe(false);
    const payload = JSON.parse(result.content[0]!.text) as {
      path: string;
      vault: string;
      heading_path: string;
      mode: string;
      bytes_written: number;
    };
    expect(payload.path).toBe("Daily Notes/2026-05-21.md");
    expect(payload.vault).toBe("TestVault");
    expect(payload.heading_path).toBe("Daily#Tasks#TODO");
    expect(payload.mode).toBe("append");
    expect(payload.bytes_written).toBeGreaterThan(0);
  });
});

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
