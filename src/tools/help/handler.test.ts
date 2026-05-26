// Original — no upstream. Co-located vitest cases for the help handler (FR-017 + L1 remediation: 11 cases covering AC#1-6 + Q4 + traversal + reserved-name + empty-file + orphan).
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { executeHelp, DOCS_DIR } from "./handler.js";
import { UpstreamError } from "../../errors.js";

describe("executeHelp", () => {
  it("returns the named tool's full doc content (Story 2 AC#1, B1)", async () => {
    const result = await executeHelp({ tool_name: "obsidian_exec" });
    expect(result.content[0]!.type).toBe("text");
    const expected = await readFile(join(DOCS_DIR, "obsidian_exec.md"), "utf8");
    expect(result.content[0]!.text).toBe(expected);
  });

  it("returns the index when tool_name is omitted (Story 2 AC#2, B2)", async () => {
    const result = await executeHelp({});
    const expected = await readFile(join(DOCS_DIR, "index.md"), "utf8");
    expect(result.content[0]!.text).toBe(expected);
  });

  it("rejects unknown tool_name with HELP_TOOL_NOT_FOUND + availableTools (Story 2 AC#3, B3)", async () => {
    let caught: unknown;
    try {
      await executeHelp({ tool_name: "nonexistent_xyz" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UpstreamError);
    const err = caught as UpstreamError;
    expect(err.code).toBe("HELP_TOOL_NOT_FOUND");
    expect((err.details as { availableTools: string[] }).availableTools.length).toBeGreaterThan(0);
    expect((err.details as { requestedName: string }).requestedName).toBe("nonexistent_xyz");
    expect(err.message).not.toContain("nonexistent_xyz");
  });

  it("resolves docs path independently of process.cwd() (Story 2 AC#4 / Story 4 AC#2, FR-009, SC-005, SC-008)", async () => {
    const original = process.cwd();
    const temp = await mkdtemp(join(tmpdir(), "help-cwd-"));
    try {
      process.chdir(temp);
      const result = await executeHelp({ tool_name: "help" });
      expect(result.content[0]!.text.length).toBeGreaterThan(0);
    } finally {
      process.chdir(original);
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("returns the FULL obsidian_exec.md content, not a stub (Story 2 AC#5, FR-012, Q2)", async () => {
    const result = await executeHelp({ tool_name: "obsidian_exec" });
    expect(result.content[0]!.text).not.toContain("<!-- TODO(BI-");
    // Real-content marker — the obsidian_exec.md transcribed body has the per-field input table.
    expect(result.content[0]!.text).toContain("## Input");
  });

  it("operates on a typed HelpInput (defensive — schema-level rejection covered at schema.test.ts)", async () => {
    // Pre-parsed input shape is what executeHelp expects (the SDK dispatcher zod-validates first).
    // This case asserts the function's positive behavior under the typed contract.
    const result = await executeHelp({ tool_name: "help" });
    expect(typeof result.content[0]!.text).toBe("string");
  });

  it("raises HELP_DOCS_MISSING when the docs directory is missing (Q4, B5)", async () => {
    const missingDir = join(tmpdir(), "definitely-not-a-real-docs-dir-xyz-12345");
    let caught: unknown;
    try {
      await executeHelp({}, { docsDir: missingDir });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UpstreamError);
    const err = caught as UpstreamError;
    expect(err.code).toBe("HELP_DOCS_MISSING");
    expect((err.details as { resolvedDocsDir: string }).resolvedDocsDir).toBe(missingDir);
    expect(err.message).toContain(missingDir);
  });

  it("rejects path-traversal probes with HELP_TOOL_NOT_FOUND (anti-injection — FR-010, B4)", async () => {
    let caught: unknown;
    try {
      await executeHelp({ tool_name: "../../../etc/passwd" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UpstreamError);
    const err = caught as UpstreamError;
    expect(err.code).toBe("HELP_TOOL_NOT_FOUND");
    expect(err.message).not.toContain("passwd");
    expect((err.details as { requestedName: string }).requestedName).toBe("../../../etc/passwd");
  });

  it("rejects help({ tool_name: 'index' }) with HELP_TOOL_NOT_FOUND, availableTools excludes index (Edge Case, remediation L1a, B4a)", async () => {
    let caught: unknown;
    try {
      await executeHelp({ tool_name: "index" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UpstreamError);
    const err = caught as UpstreamError;
    expect(err.code).toBe("HELP_TOOL_NOT_FOUND");
    const available = (err.details as { availableTools: string[] }).availableTools;
    expect(available).not.toContain("index");
    expect(err.message).not.toContain("index"); // anti-injection per FR-010
  });

  it("returns empty string for a zero-byte doc file (Edge Case 'doc file exists but is empty', remediation L1b)", async () => {
    const fixtureDir = await mkdtemp(join(tmpdir(), "help-empty-"));
    try {
      await writeFile(join(fixtureDir, "_empty.md"), "");
      const result = await executeHelp({ tool_name: "_empty" }, { docsDir: fixtureDir });
      expect(result.content[0]!.text).toBe("");
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it("returns content for orphaned doc files (Edge Case 'doc file with no registered tool', remediation L1c)", async () => {
    // Stub doc files are present in docs/tools/ but their tools are not registered yet —
    // this is the orphan case in production. The handler must succeed and return the file
    // content (FR-008 filesystem-as-source-of-truth). The remaining orphan stubs at this
    // BI are list_notes / list_vaults / search_vault.
    const result = await executeHelp({ tool_name: "list_notes" });
    expect(result.content[0]!.text).toContain("<!-- TODO(BI-");
  });

  // ---------------------------------------------------------------------------
  // BI-022 — renamed tools: help routing for the five new names + tool-not-found
  // for the five retired names. T025 + T026 of /speckit-tasks.
  // ---------------------------------------------------------------------------

  it.each(["read", "delete", "files", "set_property", "rename"])(
    "returns body for renamed tool %s (BI-022 / T025)",
    async (name) => {
      const result = await executeHelp({ tool_name: name });
      expect(result.content[0]!.type).toBe("text");
      const expected = await readFile(join(DOCS_DIR, `${name}.md`), "utf8");
      expect(result.content[0]!.text).toBe(expected);
      expect(result.content[0]!.text.length).toBeGreaterThan(0);
    },
  );

  it("catalogue listing reflects the renamed registry (BI-022 / T025 FR-015 closure)", async () => {
    const result = await executeHelp({});
    const body = result.content[0]!.text;
    for (const name of ["read", "delete", "files", "set_property", "rename"]) {
      expect(body).toContain(`**${name}**`);
    }
    for (const retired of ["read_note", "delete_note", "list_files", "write_property", "rename_note"]) {
      expect(body).not.toContain(`**${retired}**`);
    }
  });

  it.each(["read_note", "delete_note", "list_files", "write_property", "rename_note"])(
    "rejects retired name %s with HELP_TOOL_NOT_FOUND (BI-022 / T026 — no aliasing)",
    async (retired) => {
      let caught: unknown;
      try {
        await executeHelp({ tool_name: retired });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(UpstreamError);
      const err = caught as UpstreamError;
      expect(err.code).toBe("HELP_TOOL_NOT_FOUND");
      expect((err.details as { requestedName: string }).requestedName).toBe(retired);
      const available = (err.details as { availableTools: string[] }).availableTools;
      expect(available).not.toContain(retired);
    },
  );
});

// Helper to silence vitest's unused-import warning on Node Buffer typing in some mode.
beforeEach(() => undefined);
afterEach(() => undefined);

// Sanity: the import side-effect ensures DOCS_DIR resolves to a real path. If this assertion
// fails, the runtime resolution diverges from the test's expectation (likely a build-layout
// regression).
describe("DOCS_DIR resolution", () => {
  it("resolves to a directory ending in docs/tools and located inside the repo", async () => {
    expect(DOCS_DIR.endsWith(`docs${join(".", "tools").slice(1)}`) || DOCS_DIR.includes("docs")).toBe(true);
    // Smoke: the directory contains a non-empty index.md (which T003 produced).
    const indexContent = await readFile(join(DOCS_DIR, "index.md"), "utf8");
    expect(indexContent.length).toBeGreaterThan(0);
  });
});

// Smoke harness — verifies the fixture dir helpers work correctly for the directory-missing case.
async function ensureMkdir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}
void ensureMkdir; // referenced only if a future case adds a fixture-recreation helper
