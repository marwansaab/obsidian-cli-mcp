// Original — no upstream. find_and_replace registration tests — descriptor shape, name, inputSchema property set + additionalProperties:false + required keys, error-mapping path (Zod issues → typed details.code + details.reason envelope).
import { describe, expect, it } from "vitest";

import { baseDeps, inMemoryFs, relToAbs, VAULT_ROOT } from "./_handler-fixtures.js";
import {
  FIND_AND_REPLACE_DESCRIPTION,
  FIND_AND_REPLACE_TOOL_NAME,
  createFindAndReplaceTool,
} from "./index.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

function fakeRegistry(): VaultRegistry {
  return {
    resolveVaultPath: async () => "/no-such-vault",
  };
}

describe("createFindAndReplaceTool — descriptor", () => {
  it("name = 'find_and_replace' with non-empty description", () => {
    const tool = createFindAndReplaceTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
    });
    expect(tool.descriptor.name).toBe(FIND_AND_REPLACE_TOOL_NAME);
    expect(tool.descriptor.name).toBe("find_and_replace");
    expect(tool.descriptor.description).toBe(FIND_AND_REPLACE_DESCRIPTION);
    expect(tool.descriptor.description.length).toBeGreaterThan(300);
  });

  it("description advertises the single-note scope (path / file / active_note)", () => {
    expect(FIND_AND_REPLACE_DESCRIPTION).toContain("active_note");
    expect(FIND_AND_REPLACE_DESCRIPTION).toContain("SCOPE_CONFLICT");
    expect(FIND_AND_REPLACE_DESCRIPTION).toContain("single-note");
    // The contradictory pre-feature warning is gone.
    expect(FIND_AND_REPLACE_DESCRIPTION).not.toContain("no single-file mode");
    expect(FIND_AND_REPLACE_DESCRIPTION).not.toContain("There is NO single-file scoping option");
  });

  it("description lists only the unknown-vault sub-reason, not the never-emitted not-open (spec 072 SC-004)", () => {
    expect(FIND_AND_REPLACE_DESCRIPTION).toContain("`VAULT_NOT_FOUND`/`unknown`");
    expect(FIND_AND_REPLACE_DESCRIPTION).not.toContain("not-open");
  });

  it("inputSchema has additionalProperties:false and the expected property set + required keys", () => {
    const tool = createFindAndReplaceTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
    });
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual([
      "active_note",
      "case_insensitive",
      "case_sensitive",
      "commit",
      "file",
      "folder",
      "include_code_blocks",
      "include_html_comments",
      "mode",
      "path",
      "pattern",
      "replacement",
      "subfolder",
      "vault",
    ]);
    expect((schema.required as string[]).sort()).toEqual(
      ["pattern", "replacement"].sort(),
    );
  });
});

describe("createFindAndReplaceTool — wrapped handler error mapping", () => {
  it("empty pattern → VALIDATION_ERROR + details.code:INVALID_PATTERN + details.reason:empty", async () => {
    const tool = createFindAndReplaceTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
    });
    const result = await tool.handler({ pattern: "", replacement: "x" });
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.code).toBe("VALIDATION_ERROR");
      expect(payload.details.code).toBe("INVALID_PATTERN");
      expect(payload.details.reason).toBe("empty");
    }
  });

  it("over-cap pattern → INVALID_PATTERN + too-long", async () => {
    const tool = createFindAndReplaceTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
    });
    const result = await tool.handler({
      pattern: "x".repeat(1001),
      replacement: "y",
    });
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.details.code).toBe("INVALID_PATTERN");
      expect(payload.details.reason).toBe("too-long");
    }
  });

  it("invalid regex syntax in regex mode → INVALID_PATTERN + regex-syntax", async () => {
    const tool = createFindAndReplaceTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
    });
    const result = await tool.handler({
      pattern: "[unclosed",
      replacement: "y",
      mode: "regex",
    });
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.details.code).toBe("INVALID_PATTERN");
      expect(payload.details.reason).toBe("regex-syntax");
    }
  });

  it("over-cap replacement → INVALID_REPLACEMENT", async () => {
    const tool = createFindAndReplaceTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
    });
    const result = await tool.handler({
      pattern: "x",
      replacement: "y".repeat(1001),
    });
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.details.code).toBe("INVALID_REPLACEMENT");
    }
  });

  it("path-traversal folder → INVALID_SUBFOLDER + path-traversal", async () => {
    const tool = createFindAndReplaceTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
    });
    const result = await tool.handler({
      pattern: "x",
      replacement: "y",
      folder: "../escape",
    });
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.message).toBe("folder is not structurally safe");
      expect(payload.details.code).toBe("INVALID_SUBFOLDER");
      expect(payload.details.reason).toBe("path-traversal");
    }
  });

  it("invalid mode enum → generic VALIDATION_ERROR fallback: details.issues present, NO details.code/details.reason", async () => {
    const tool = createFindAndReplaceTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
    });
    // pattern + replacement are valid, so the only failing issue is the `mode`
    // enum — it matches NO pattern/replacement/folder sub-discriminator branch
    // in mapZodIssuesToToolError, exercising the L109-113 generic fallback.
    const result = await tool.handler({
      pattern: "x",
      replacement: "y",
      mode: "bogus",
    });
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.code).toBe("VALIDATION_ERROR");
      expect(payload.message).toBe(
        `${FIND_AND_REPLACE_TOOL_NAME} input failed schema validation`,
      );
      // Generic fallback carries the raw issues...
      expect(Array.isArray(payload.details.issues)).toBe(true);
      expect(payload.details.issues.length).toBeGreaterThan(0);
      expect(
        payload.details.issues.some(
          (i: { path: unknown[] }) => i.path[0] === "mode",
        ),
      ).toBe(true);
      // ...but NOT the branch-specific discriminators (this is what distinguishes
      // the generic envelope from INVALID_PATTERN / INVALID_REPLACEMENT / INVALID_SUBFOLDER).
      expect(payload.details.code).toBeUndefined();
      expect(payload.details.reason).toBeUndefined();
    }
  });

  it("[[…]] file form → generic VALIDATION_ERROR (standard channel, no details.code) (066-file-scope)", async () => {
    const tool = createFindAndReplaceTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
    });
    const result = await tool.handler({
      pattern: "x",
      replacement: "y",
      file: "[[Alpha]]",
    });
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.code).toBe("VALIDATION_ERROR");
      // Standard channel — no sub-discriminator, but the raw issue is carried.
      expect(payload.details.code).toBeUndefined();
      expect(payload.details.reason).toBeUndefined();
      expect(
        payload.details.issues.some((i: { message: string }) => i.message.includes("[[")),
      ).toBe(true);
    }
  });

  it.each([
    ["file", "../escape.md"],
    ["path", "../escape.md"],
  ])("structurally-unsafe %s → INVALID_NOTE + path-traversal (066-file-scope)", async (field, value) => {
    const tool = createFindAndReplaceTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
    });
    const result = await tool.handler({ pattern: "x", replacement: "y", [field]: value });
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.code).toBe("VALIDATION_ERROR");
      expect(payload.details.code).toBe("INVALID_NOTE");
      expect(payload.details.reason).toBe("path-traversal");
    }
  });

  it.each([
    [{ file: "A", path: "A.md" }, "file+path"],
    [{ path: "A.md", folder: "Drafts" }, "note+folder"],
    [{ active_note: true, file: "A" }, "active+note"],
    [{ active_note: true, folder: "Drafts" }, "active+folder"],
    [{ active_note: true, vault: "Work" }, "active+vault"],
  ])("SCOPE_CONFLICT mapping for %o → reason %s (066-file-scope, T018)", async (input, reason) => {
    const tool = createFindAndReplaceTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
    });
    const result = await tool.handler({ pattern: "x", replacement: "y", ...input });
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.code).toBe("VALIDATION_ERROR");
      expect(payload.details.code).toBe("SCOPE_CONFLICT");
      expect(payload.details.reason).toBe(reason);
    }
  });

  it("unknown key (strict) → generic VALIDATION_ERROR fallback with no details.code", async () => {
    const tool = createFindAndReplaceTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
    });
    // `.strict()` rejects the unrecognized `strict` key; that issue matches no
    // sub-discriminator branch, so it too falls through to the generic fallback.
    const result = await tool.handler({
      pattern: "x",
      replacement: "y",
      strict: true,
    });
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.code).toBe("VALIDATION_ERROR");
      expect(payload.message).toBe(
        `${FIND_AND_REPLACE_TOOL_NAME} input failed schema validation`,
      );
      expect(Array.isArray(payload.details.issues)).toBe(true);
      expect(payload.details.code).toBeUndefined();
      expect(payload.details.reason).toBeUndefined();
    }
  });
});

describe("createFindAndReplaceTool — deprecated names (spec 073)", () => {
  function setup() {
    const { fs, state } = inMemoryFs(
      [
        { abs: relToAbs("Notes/A.md"), content: "Alpha alpha\n" },
        { abs: relToAbs("Other/B.md"), content: "alpha\n" },
      ],
      VAULT_ROOT,
    );
    return { tool: createFindAndReplaceTool(baseDeps({ fs })), state };
  }
  type Result = { isError?: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown> };

  it("O1: a new-name call carries no deprecated_parameters", async () => {
    const { tool } = setup();
    const result = (await tool.handler({ vault: "V", pattern: "alpha", replacement: "x", case_sensitive: false, folder: "Notes" })) as Result;
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ mode: "preview", total_occurrences: 2 });
    expect(result.structuredContent).not.toHaveProperty("deprecated_parameters");
  });

  it("O2/O3: an old-name call gets today's result plus the notice, identical in text and structuredContent", async () => {
    const viaNew = (await setup().tool.handler({ vault: "V", pattern: "alpha", replacement: "x", case_sensitive: false, folder: "Notes" })) as Result;
    const viaOld = (await setup().tool.handler({ vault: "V", pattern: "alpha", replacement: "x", case_insensitive: true, subfolder: "Notes" })) as Result;
    expect(viaOld.structuredContent).toEqual({
      ...viaNew.structuredContent,
      deprecated_parameters: [
        {
          parameter: "case_insensitive",
          replacement: "case_sensitive",
          note: "case_insensitive: true equals case_sensitive: false (opposite polarity).",
        },
        { parameter: "subfolder", replacement: "folder" },
      ],
    });
    expect(JSON.parse(viaOld.content[0]!.text)).toEqual(viaOld.structuredContent);
  });

  it("O4: old + new for one concept → VALIDATION_ERROR before any read", async () => {
    const { tool, state } = setup();
    const result = (await tool.handler({ vault: "V", pattern: "alpha", replacement: "x", folder: "Notes", subfolder: "Notes" })) as Result;
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.details.issues).toEqual([
      expect.objectContaining({ path: ["subfolder"], message: "`subfolder` is deprecated and replaced by `folder`; supply only `folder`" }),
    ]);
    expect(state.reads).toEqual([]);
  });

  it("O7: subfolder + path → SCOPE_CONFLICT/note+folder, message naming folder", async () => {
    const { tool } = setup();
    const result = (await tool.handler({ pattern: "alpha", replacement: "x", subfolder: "Notes", path: "Notes/A.md" })) as Result;
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.details.code).toBe("SCOPE_CONFLICT");
    expect(payload.details.reason).toBe("note+folder");
    expect(payload.message).toContain("`folder` scope");
  });

  it("description uses the new names and lists the deprecated ones", () => {
    expect(FIND_AND_REPLACE_DESCRIPTION).toContain("Optional `case_sensitive` (boolean, default true).");
    expect(FIND_AND_REPLACE_DESCRIPTION).not.toContain("Optional `case_insensitive`");
    expect(FIND_AND_REPLACE_DESCRIPTION).toContain(
      "Deprecated names (accepted until the next major release; a call that uses one gets `deprecated_parameters` in its result): `case_insensitive` → `case_sensitive` (opposite value), `subfolder` → `folder`.",
    );
    expect(FIND_AND_REPLACE_DESCRIPTION.replace(/Deprecated names[^\n]*$/, "")).not.toContain("subfolder`");
  });
});
