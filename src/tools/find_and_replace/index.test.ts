// Original — no upstream. find_and_replace registration tests — descriptor shape, name, inputSchema property set + additionalProperties:false + required keys, error-mapping path (Zod issues → typed details.code + details.reason envelope).
import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  FIND_AND_REPLACE_DESCRIPTION,
  FIND_AND_REPLACE_TOOL_NAME,
  createFindAndReplaceTool,
} from "./index.js";
import { createLogger } from "../../logger.js";
import { createQueue } from "../../queue.js";

import type { VaultRegistry } from "../../vault-registry/registry.js";

function silentLogger() {
  return createLogger({ stream: new Writable({ write(_c, _e, cb) { cb(); } }) });
}

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
      "case_insensitive",
      "commit",
      "include_code_blocks",
      "include_html_comments",
      "mode",
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

  it("path-traversal subfolder → INVALID_SUBFOLDER + path-traversal", async () => {
    const tool = createFindAndReplaceTool({
      logger: silentLogger(),
      queue: createQueue(),
      vaultRegistry: fakeRegistry(),
    });
    const result = await tool.handler({
      pattern: "x",
      replacement: "y",
      subfolder: "../escape",
    });
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.details.code).toBe("INVALID_SUBFOLDER");
      expect(payload.details.reason).toBe("path-traversal");
    }
  });
});
