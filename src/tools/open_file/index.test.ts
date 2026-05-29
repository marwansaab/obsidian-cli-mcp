// Original — no upstream. open_file registration tests (BI-057) — descriptor name = "open_file"
// (ADR-010 N/A descriptive name asserted so the choice reads as designed); stripped emitted
// inputSchema (vault/path/file/new_tab; additionalProperties:false; required={vault}; NO target_mode;
// new_tab default; no description keys); description references the focused-vault precondition, both
// locator shapes, new_tab, the error roster and help(); docs presence + completeness; baseline
// fingerprint roll-forward gate.
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
import { silentLogger } from "../_handler-test-fixtures.js";

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

function walkSchema(node: unknown, fn: (n: Record<string, unknown>) => void): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkSchema(item, fn);
    return;
  }
  fn(node as Record<string, unknown>);
  for (const value of Object.values(node as Record<string, unknown>)) walkSchema(value, fn);
}

describe("createOpenFileTool — descriptor", () => {
  it("publishes name = 'open_file' (descriptive — ADR-010 N/A)", () => {
    const tool = makeTool();
    expect(tool.descriptor.name).toBe(OPEN_FILE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("open_file");
    expect(tool.descriptor.description).toBe(OPEN_FILE_DESCRIPTION);
    expect(tool.descriptor.description.length).toBeGreaterThan(300);
  });

  it("emits inputSchema with vault/path/file/new_tab, additionalProperties:false, required={vault}, NO target_mode, no description keys", () => {
    const tool = makeTool();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["file", "new_tab", "path", "vault"]);
    expect(Object.keys(props)).not.toContain("target_mode");
    expect((schema.required as string[]).sort()).toEqual(["vault"]);
    // new_tab carries its default in the published schema.
    expect((props.new_tab as Record<string, unknown>).default).toBe(false);
    let descriptionKeysFound = 0;
    walkSchema(schema, (n) => {
      if (Object.prototype.hasOwnProperty.call(n, "description")) descriptionKeysFound += 1;
    });
    expect(descriptionKeysFound).toBe(0);
  });

  it("description references help(), the tool name, the focused-vault precondition, both locators and new_tab", () => {
    const desc = makeTool().descriptor.description;
    const lower = desc.toLowerCase();
    expect(lower).toContain("help");
    expect(lower).toContain("open_file");
    expect(lower).toContain("focused vault");
    expect(lower).toContain("new_tab");
    expect(lower).toContain("path");
    expect(lower).toContain("file");
    expect(lower).toContain("unsupported_file_type");
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
});

describe("docs/tools/open_file.md exists and is non-stub", () => {
  it("docs file exists, has no TODO marker, lists every error code + ≥4 worked examples + focused-vault note + help pointer", () => {
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
    expect(body).toMatch(/focused vault/i);
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
