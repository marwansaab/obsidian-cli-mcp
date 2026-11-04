// Original — no upstream. prepend tool registration tests per BI-045 / FR-027 / ADR-005 / ADR-010 — descriptor name (mirror-name convention, NOT prepend_note) + description + docs-file presence + inputSchema.required under-promise pattern + additionalProperties strict-naive client gate + content maxLength tied to MAX_CONTENT_LENGTH (BI-047 lowered the cap from 24576 to 3072 per empirical upstream-defect bisect).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  createPrependTool,
  PREPEND_DESCRIPTION,
  PREPEND_TOOL_NAME,
} from "./index.js";
import { MAX_CONTENT_BYTES, MAX_CONTENT_LENGTH } from "./schema.js";
import { createQueue } from "../../queue.js";
import { silentLogger } from "../_handler-test-fixtures.js";
import { textOf } from "../_mcp-client-fixtures.js";
import { DOCS_DIR } from "../help/handler.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

const stubRegistry: VaultRegistry = {
  resolveVaultPath: async () => "C:\\stub-vault",
  resolveVaultDisplayName: () => null,
};

function build(): ReturnType<typeof createPrependTool> {
  return createPrependTool({
    logger: silentLogger(),
    queue: createQueue(),
    vaultRegistry: stubRegistry,
  });
}

describe("createPrependTool — descriptor (BI-045 / ADR-005 / ADR-010)", () => {
  it("publishes name = 'prepend' (mirror-name per ADR-010, NOT 'prepend_note')", () => {
    const tool = build();
    expect(tool.descriptor.name).toBe(PREPEND_TOOL_NAME);
    expect(tool.descriptor.name).toBe("prepend");
    expect(tool.descriptor.name).not.toBe("prepend_note");
  });

  it("publishes PREPEND_DESCRIPTION verbatim", () => {
    const tool = build();
    expect(tool.descriptor.description).toBe(PREPEND_DESCRIPTION);
  });

  it("description names the content cap (SC-008 contract-and-implementation match)", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.content!.description as string).toContain(String(MAX_CONTENT_LENGTH));
  });

  it("docs/tools/prepend.md exists at the expected path", () => {
    const docsPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../docs/tools/prepend.md",
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

  it("inputSchema publishes the six top-level keys exactly", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown>;
    expect(new Set(Object.keys(properties))).toEqual(
      new Set(["target_mode", "vault", "file", "path", "content", "inline"]),
    );
  });

  it("inputSchema.properties.content carries the schema's MAX_CONTENT_LENGTH (FR-018)", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.content!.maxLength).toBe(MAX_CONTENT_LENGTH);
  });

  it("description names the size limit (spec 078 FR-009)", () => {
    const helpPage = readFileSync(join(DOCS_DIR, "prepend.md"), "utf8");
    expect(helpPage).toContain(`${MAX_CONTENT_BYTES} UTF-8 bytes`);
    expect(helpPage).toContain(`details.reason: "bytes"`);
  });

  it("inputSchema.properties.content.description states both limits (spec 078 FR-009)", () => {
    const tool = build();
    const schema = tool.descriptor.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const description = properties.content!.description as string;
    expect(description).toContain(`${MAX_CONTENT_LENGTH} characters`);
    expect(description).toContain(`${MAX_CONTENT_BYTES} bytes as UTF-8`);
  });
});

// BI-0174 item 7: the registered tool maps empty content to details.code CONTENT_EMPTY.
describe("createPrependTool — CONTENT_EMPTY (BI-0174)", () => {
  async function rejected(args: Record<string, unknown>): Promise<{ code: string; message: string; details: Record<string, unknown> }> {
    const result = await build().handler({ target_mode: "specific", vault: "V", path: "n.md", ...args });
    expect("isError" in result && result.isError).toBe(true);
    return JSON.parse(textOf(result));
  }

  it("empty content → CONTENT_EMPTY with the schema's message, issues kept", async () => {
    const message = "Too small: expected string to have >=1 characters";
    const payload = await rejected({ content: "" });
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.message).toBe(message);
    expect(payload.details["code"]).toBe("CONTENT_EMPTY");
    expect(payload.details["issues"]).toContainEqual({ path: ["content"], message, code: "too_small" });
  });

  it("any other failure keeps the generic envelope", async () => {
    const payload = await rejected({ file: "n", content: "x" });
    expect(payload.message).toBe("prepend input failed schema validation");
    expect(payload.details["code"]).toBeUndefined();
  });
});
