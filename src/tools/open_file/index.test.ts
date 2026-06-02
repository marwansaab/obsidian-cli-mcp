// Original — no upstream. open_file registration tests (BI-057; cross-vault rewrite ADR-031) —
// descriptor name = "open_file" (ADR-010 N/A descriptive name asserted so the choice reads as
// designed); stripped emitted inputSchema (vault/path/file/new_tab; additionalProperties:false;
// required={vault}; NO target_mode; new_tab default; no description keys); description references the
// cross-vault contract + placement, both locator shapes, new_tab, the error roster and help(), and the
// stale B1 focused-vault precondition is GONE; docs presence + completeness; baseline fingerprint gate.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  OPEN_FILE_DESCRIPTION,
  OPEN_FILE_TOOL_NAME,
  createOpenFileTool,
} from "./index.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";
import { countDescriptionKeys } from "../_schema-test-utils.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

function fakeRegistry(): VaultRegistry {
  return {
    resolveVaultPath: async () => "/no-such-vault",
  };
}

function makeTool() {
  return createOpenFileTool({
    logger: silentLogger(),
    queue: createQueue(),
    vaultRegistry: fakeRegistry(),
  });
}

describe("createOpenFileTool — descriptor", () => {
  it("publishes name = 'open_file' (descriptive — ADR-010 N/A)", () => {
    const tool = makeTool();
    expect(tool.descriptor.name).toBe(OPEN_FILE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("open_file");
    expect(tool.descriptor.description).toBe(OPEN_FILE_DESCRIPTION);
    expect(tool.descriptor.description.length).toBeGreaterThan(300);
  });

  it("emits inputSchema with NO target_mode, new_tab default, no description keys at any nested depth", () => {
    const tool = makeTool();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props)).not.toContain("target_mode");
    // new_tab carries its default in the published schema.
    expect((props.new_tab as Record<string, unknown>).default).toBe(false);
    expect(countDescriptionKeys(schema)).toBe(0);
  });

  it("description references help(), the tool name, the cross-vault contract + placement, both locators and new_tab", () => {
    const desc = makeTool().descriptor.description;
    const lower = desc.toLowerCase();
    expect(lower).toContain("help");
    expect(lower).toContain("open_file");
    expect(lower).toContain("cross-vault");
    expect(lower).toContain("placement");
    expect(lower).toContain("switches focus");
    expect(lower).toContain("new_tab");
    expect(lower).toContain("path");
    expect(lower).toContain("file");
    expect(lower).toContain("unsupported_file_type");
  });

  it("the stale BI-057 focused-vault precondition is gone (ADR-031 — closed/unfocused is a success path)", () => {
    const lower = makeTool().descriptor.description.toLowerCase();
    expect(lower).not.toContain("precondition");
    expect(lower).not.toContain("not-open");
    expect(lower).not.toContain("vault_not_focused");
  });
});

describe("createOpenFileTool — schema-layer rejections route through the registered boundary", () => {
  it("both path AND file → VALIDATION_ERROR (no eval spawn)", async () => {
    const result = await makeTool().handler({ vault: "Work", path: "a.md", file: "a" });
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.code).toBe("VALIDATION_ERROR");
    }
  });

  // Handler-closure execution: VALID input passes Zod, so registerTool runs the
  // `handler: async (input, d) => executeOpenFile(input, d)` closure (not the
  // VALIDATION_ERROR short-circuit). Success eval-envelope fixture copied from
  // handler.test.ts; the wrapped { opened, vault, new_tab } envelope proves the
  // closure executed end-to-end.
  it("tool.handler runs the executeOpenFile closure on VALID input and returns a content envelope", async () => {
    const envelope = { ok: true, opened: "Projects/Roadmap.md", new_tab: false, placement: "active_tab_used" };
    const { spawnFn } = makeQueuedSpawn([
      { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
    ]);
    const tool = createOpenFileTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: { resolveVaultPath: async () => "/vaults/Work" },
      spawnFn,
    });
    const result = await tool.handler({ vault: "Work", path: "Projects/Roadmap.md" });
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThanOrEqual(1);
    expect("isError" in result).toBe(false);
    const payload = JSON.parse(result.content[0]!.text) as {
      opened: string;
      vault: string;
      new_tab: boolean;
      placement: string;
    };
    expect(payload).toEqual({
      opened: "Projects/Roadmap.md",
      vault: "Work",
      new_tab: false,
      placement: "active_tab_used",
    });
  });
});

describe("docs/tools/open_file.md exists and is non-stub", () => {
  it("docs file exists, has no TODO marker, lists every error code + ≥4 worked examples + cross-vault/placement notes + help pointer", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/open_file.md",
    );
    expect(existsSync(docsPath)).toBe(true);
    const body = readFileSync(docsPath, "utf8");
    expect(body).not.toContain("<!-- TODO");
    for (const code of [
      "VALIDATION_ERROR",
      "VAULT_NOT_FOUND",
      "FILE_NOT_FOUND",
      "UNSUPPORTED_FILE_TYPE",
      "CLI_BINARY_NOT_FOUND",
      "CLI_NON_ZERO_EXIT",
      "INTERNAL_ERROR",
    ]) {
      expect(body).toContain(code);
    }
    const exampleHeadings = (body.match(/### Example/g) ?? []).length;
    expect(exampleHeadings).toBeGreaterThanOrEqual(4);
    expect(body).toMatch(/cross-vault/i);
    expect(body).toMatch(/placement/i);
    // The stale focused-vault precondition (and its retired reason) must be gone.
    expect(body).not.toMatch(/not-open/);
    expect(body).toMatch(/help\(\{ tool_name: "open_file" \}\)/);
  });
});

describe("FR-018 baseline drift detector", () => {
  it("registered tool's fingerprint appears in _register-baseline.json", () => {
    const baselinePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../_register-baseline.json",
    );
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      tools: Array<{ name: string; descriptionFingerprint: string; schemaFingerprint: string }>;
    };
    const entry = baseline.tools.find((t) => t.name === OPEN_FILE_TOOL_NAME);
    expect(entry).toBeDefined();
    expect(typeof entry!.descriptionFingerprint).toBe("string");
    expect(typeof entry!.schemaFingerprint).toBe("string");
  });
});
