// Original — no upstream. get_active_file registration tests (BI-063) — descriptor name "get_active_file"
// (ADR-010 N/A — descriptive, eval-composed), the stripped emitted inputSchema (target_mode/vault/file/path;
// additionalProperties:false; required={target_mode}; no description keys), a description that references
// both modes / the four fields / the { active: null } success / cross-vault / the error roster / help(),
// the schema boundary rejecting bad input + running the closure on valid input, docs presence + completeness,
// and the FR-018 baseline fingerprint gate.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  GET_ACTIVE_FILE_DESCRIPTION,
  GET_ACTIVE_FILE_TOOL_NAME,
  createGetActiveFileTool,
} from "./index.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";
import { countDescriptionKeys } from "../_schema-test-utils.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

function fakeRegistry(): VaultRegistry {
  return { resolveVaultPath: async () => "/vaults/Work" };
}

function makeTool() {
  return createGetActiveFileTool({
    logger: silentLogger(),
    queue: createQueue(),
    vaultRegistry: fakeRegistry(),
  });
}

describe("createGetActiveFileTool — descriptor", () => {
  it("publishes name = 'get_active_file' (descriptive — ADR-010 N/A)", () => {
    const tool = makeTool();
    expect(tool.descriptor.name).toBe(GET_ACTIVE_FILE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("get_active_file");
    expect(tool.descriptor.description).toBe(GET_ACTIVE_FILE_DESCRIPTION);
    expect(tool.descriptor.description.length).toBeGreaterThan(300);
  });

  it("emits inputSchema with target_mode/vault/file/path, required={target_mode}, additionalProperties:false, no description keys", () => {
    const schema = makeTool().descriptor.inputSchema as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown>;
    expect(new Set(Object.keys(props))).toEqual(new Set(["target_mode", "vault", "file", "path"]));
    expect(schema.required).toEqual(["target_mode"]);
    expect(schema.additionalProperties).toBe(false);
    expect(countDescriptionKeys(schema)).toBe(0);
  });

  it("description references help(), the tool name, both modes, the four fields, the null success, cross-vault, and the error roster", () => {
    const lower = makeTool().descriptor.description.toLowerCase();
    expect(lower).toContain("help");
    expect(lower).toContain("get_active_file");
    expect(lower).toContain('target_mode: "active"');
    expect(lower).toContain('target_mode: "specific"');
    expect(lower).toContain("basename");
    expect(lower).toContain("extension");
    expect(lower).toContain("cross-vault");
    expect(lower).toContain("active: null");
    expect(lower).toContain("vault_not_found");
  });

  it("documents that no-active-file is a success, NOT ERR_NO_ACTIVE_FILE", () => {
    const desc = makeTool().descriptor.description;
    expect(desc).toContain("ERR_NO_ACTIVE_FILE");
    expect(desc.toLowerCase()).toContain("never");
  });
});

describe("createGetActiveFileTool — schema-layer rejections route through the registered boundary", () => {
  it("specific mode without vault → VALIDATION_ERROR (no eval spawn)", async () => {
    const result = await makeTool().handler({ target_mode: "specific" });
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.code).toBe("VALIDATION_ERROR");
    }
  });

  it("active mode with a locator → VALIDATION_ERROR (no locator accepted)", async () => {
    const result = await makeTool().handler({ target_mode: "active", path: "x.md" });
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.code).toBe("VALIDATION_ERROR");
    }
  });

  // Valid input passes Zod, so registerTool runs the executeGetActiveFile closure end-to-end.
  it("tool.handler runs the executeGetActiveFile closure on VALID input and returns a content envelope", async () => {
    const envelope = {
      active: { path: "Folder/note.md", name: "note.md", basename: "note", extension: "md" },
    };
    const { spawnFn } = makeQueuedSpawn([
      { stdout: `=> ${JSON.stringify(envelope)}\n`, exitCode: 0 },
    ]);
    const tool = createGetActiveFileTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
      spawnFn,
    });
    const result = await tool.handler({ target_mode: "active" });
    expect("isError" in result).toBe(false);
    const payload = JSON.parse(result.content[0]!.text) as { active: unknown };
    expect(payload).toEqual({
      active: { path: "Folder/note.md", name: "note.md", basename: "note", extension: "md" },
    });
  });

  it("tool.handler wraps the { active: null } success as a non-error content envelope", async () => {
    const { spawnFn } = makeQueuedSpawn([
      { stdout: `=> ${JSON.stringify({ active: null })}\n`, exitCode: 0 },
    ]);
    const tool = createGetActiveFileTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
      spawnFn,
    });
    const result = await tool.handler({ target_mode: "active" });
    expect("isError" in result).toBe(false);
    expect(JSON.parse(result.content[0]!.text)).toEqual({ active: null });
  });
});

describe("docs/tools/get_active_file.md exists and is non-stub", () => {
  it("docs file exists, has no TODO marker, lists every error code + ≥4 examples + cross-vault/null-success notes + help pointer", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/get_active_file.md",
    );
    expect(existsSync(docsPath)).toBe(true);
    const body = readFileSync(docsPath, "utf8");
    expect(body).not.toContain("<!-- TODO");
    for (const code of [
      "VALIDATION_ERROR",
      "VAULT_NOT_FOUND",
      "CLI_REPORTED_ERROR",
      "CLI_NON_ZERO_EXIT",
      "CLI_BINARY_NOT_FOUND",
    ]) {
      expect(body).toContain(code);
    }
    const exampleHeadings = (body.match(/### Example/g) ?? []).length;
    expect(exampleHeadings).toBeGreaterThanOrEqual(4);
    expect(body).toMatch(/cross-vault/i);
    expect(body).toMatch(/\{ "active": null \}/);
    expect(body).toContain("ERR_NO_ACTIVE_FILE");
    expect(body).toMatch(/help\(\{ tool_name: "get_active_file" \}\)/);
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
    const entry = baseline.tools.find((t) => t.name === GET_ACTIVE_FILE_TOOL_NAME);
    expect(entry).toBeDefined();
    expect(typeof entry!.descriptionFingerprint).toBe("string");
    expect(typeof entry!.schemaFingerprint).toBe("string");
  });
});
