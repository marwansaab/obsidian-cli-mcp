// Original — no upstream. get_active_file registration tests (BI-063) — descriptor name "get_active_file"
// (ADR-010 N/A — descriptive, eval-composed), the emitted inputSchema (target_mode/vault/file/path;
// additionalProperties:false; required={target_mode}; folder-scoped locator wording), a description that
// references both modes / the four fields / the { active: null } success / cross-vault / the error roster,
// the schema boundary rejecting bad input + running the closure on valid input, docs presence + completeness,
// and the FR-018 baseline fingerprint gate.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  GET_ACTIVE_FILE_DESCRIPTION,
  GET_ACTIVE_FILE_TOOL_NAME,
  createGetActiveFileTool,
} from "./index.js";
import { createQueue } from "../../queue.js";
import { makeQueuedSpawn, silentLogger } from "../_handler-test-fixtures.js";
import { DOCS_DIR } from "../help/handler.js";

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
  });

  it("emits inputSchema with target_mode/vault/file/path, required={target_mode}, additionalProperties:false, folder-scoped locator wording", () => {
    const schema = makeTool().descriptor.inputSchema as Record<string, unknown>;
    const props = schema.properties as Record<string, { description?: string }>;
    expect(new Set(Object.keys(props))).toEqual(new Set(["target_mode", "vault", "file", "path"]));
    expect(schema.required).toEqual(["target_mode"]);
    expect(schema.additionalProperties).toBe(false);
    // Folder-scoped wording: the locators are published but not accepted.
    expect(props.file!.description).toContain("Not accepted by this tool");
    expect(props.path!.description).toContain("Not accepted by this tool");
  });

  it("description references the tool name, both modes, the four fields, the null success, cross-vault, and the error roster", () => {
    const desc = makeTool().descriptor.description;
    expect(desc).not.toMatch(/specific mode/i);
    const lower = desc.toLowerCase();
    const helpPage = readFileSync(join(DOCS_DIR, "get_active_file.md"), "utf8").toLowerCase();
    expect(lower).toContain("get_active_file");
    expect(helpPage).toContain('target_mode: "active"');
    expect(helpPage).toContain('target_mode: "specific"');
    expect(helpPage).toContain("basename");
    expect(helpPage).toContain("extension");
    expect(helpPage).toContain("cross-vault");
    expect(helpPage).toContain("active: null");
    expect(helpPage).toContain("vault_not_found");
  });

  // 082 F1: the dot is part of the stated name formula; no dot-less join in any spacing or backtick form.
  it('states name as basename + "." + extension, never a dot-less join', () => {
    const helpPage = readFileSync(join(DOCS_DIR, "get_active_file.md"), "utf8");
    expect(helpPage).toContain('`basename + "." + extension`');
    expect(GET_ACTIVE_FILE_DESCRIPTION).not.toMatch(/basename`?\s*\+\s*`?extension/);
  });

  it("documents that no-active-file is a success, NOT ERR_NO_ACTIVE_FILE", () => {
    const helpPage = readFileSync(join(DOCS_DIR, "get_active_file.md"), "utf8");
    expect(helpPage).toContain("ERR_NO_ACTIVE_FILE");
    expect(helpPage.toLowerCase()).toContain("never");
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
      // 082 A2 on the wire: the active-file reason, never the folder-scoped wording.
      expect(payload.details.issues[0].message).toBe(
        "path is not allowed: the active file is the implicit target, so no note may be named",
      );
      expect(result.content[0]!.text).not.toContain("folder-scoped");
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
    // 082 F2: the name row states the dotted formula, with no dot-less join.
    expect(body).toContain('`basename + "." + extension`');
    expect(body).not.toMatch(/basename`?\s*\+\s*`?extension/);
    // 082 F3: every worked example fits name = basename + "." + extension (just basename when extension is "").
    const triplets = [
      ...body.matchAll(/"name": "([^"]*)", "basename": "([^"]*)", "extension": "([^"]*)"/g),
    ];
    expect(triplets.length).toBeGreaterThanOrEqual(3);
    for (const [, name, basename, extension] of triplets) {
      expect(name).toBe(extension ? `${basename}.${extension}` : basename);
    }
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
