// Original — no upstream. Co-located tests for the registerTool publication pipeline + assertToolDocsExist aggregator (FR-001..FR-006).
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

import { UpstreamError } from "../errors.js";
import { registerTool, assertToolDocsExist } from "./_register.js";

import type { RegisteredTool } from "./_shared.js";

describe("registerTool — descriptor publication pipeline", () => {
  it("publishes inputSchema with top-level type === 'object' (FR-002)", () => {
    const tool = registerTool({
      name: "pip_object",
      description: "test tool",
      schema: z.object({ a: z.string() }).strict(),
      handler: async () => ({ ok: true }),
    });
    expect(tool.descriptor.inputSchema.type).toBe("object");
  });

  it("publishes inputSchema with top-level type === 'object' even for discriminated unions (FR-002 envelope)", () => {
    const u = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("a"), av: z.string() }),
      z.object({ kind: z.literal("b"), bv: z.number() }),
    ]);
    const tool = registerTool({
      name: "pip_union",
      description: "test union",
      schema: u,
      handler: async () => ({ ok: true }),
    });
    expect(tool.descriptor.inputSchema.type).toBe("object");
    expect(Array.isArray((tool.descriptor.inputSchema as { oneOf?: unknown[] }).oneOf)).toBe(true);
  });

  it("strips descriptions at every nested depth (FR-006)", () => {
    const schema = z
      .object({
        outer: z.object({ inner: z.string().describe("inner desc") }).describe("outer desc"),
      })
      .describe("root desc");
    const tool = registerTool({
      name: "pip_strip",
      description: "tool description must survive",
      schema,
      handler: async () => ({ ok: true }),
    });

    function findDescriptionsBelowRoot(node: unknown, atRoot: boolean): string[] {
      if (typeof node !== "object" || node === null) return [];
      const found: string[] = [];
      const obj = node as Record<string, unknown>;
      if (!atRoot && typeof obj.description === "string") found.push(obj.description);
      for (const [k, v] of Object.entries(obj)) {
        if (k === "description" && atRoot) continue;
        if (Array.isArray(v)) {
          for (const item of v) found.push(...findDescriptionsBelowRoot(item, false));
        } else if (typeof v === "object" && v !== null) {
          found.push(...findDescriptionsBelowRoot(v, false));
        }
      }
      return found;
    }
    expect(findDescriptionsBelowRoot(tool.descriptor.inputSchema, true)).toEqual([]);
    expect(tool.descriptor.name).toBe("pip_strip");
    expect(tool.descriptor.description).toBe("tool description must survive");
  });

  it("preserves spec.description on the descriptor verbatim", () => {
    const tool = registerTool({
      name: "pip_desc",
      description: "exact description text",
      schema: z.object({}).strict(),
      handler: async () => ({}),
    });
    expect(tool.descriptor.description).toBe("exact description text");
  });
});

describe("registerTool — wrapped handler runtime", () => {
  it("responseFormat 'json' (default) wraps result in { content: [{ type: 'text', text: JSON.stringify(result) }] }", async () => {
    const tool = registerTool({
      name: "wh_json",
      description: "json default",
      schema: z.object({ name: z.string() }).strict(),
      handler: async (input) => ({ greeting: `hello ${input.name}` }),
    });
    const result = await tool.handler({ name: "world" });
    expect("isError" in result).toBe(false);
    if (!("isError" in result)) {
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
      expect(JSON.parse(result.content[0]!.text)).toEqual({ greeting: "hello world" });
    }
  });

  it("responseFormat 'raw' passes the handler's return value through unchanged", async () => {
    const passthrough = { content: [{ type: "text" as const, text: "## Markdown" }] };
    const tool = registerTool({
      name: "wh_raw",
      description: "raw passthrough",
      schema: z.object({}).strict(),
      handler: async () => passthrough,
      responseFormat: "raw",
    });
    const result = await tool.handler({});
    expect(result).toBe(passthrough);
  });

  it("ZodError → VALIDATION_ERROR envelope with details.issues", async () => {
    const tool = registerTool({
      name: "wh_validate",
      description: "validation",
      schema: z.object({ a: z.string() }).strict(),
      handler: async () => ({}),
    });
    const result = await tool.handler({ a: 123 });
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.code).toBe("VALIDATION_ERROR");
      expect(payload.message).toContain("wh_validate");
      expect(Array.isArray(payload.details.issues)).toBe(true);
      expect(payload.details.issues.length).toBeGreaterThan(0);
      expect(payload.details.issues[0]!.path).toEqual(["a"]);
    }
  });

  it("UpstreamError thrown inside handler → asToolError envelope preserving code/message/details", async () => {
    const tool = registerTool({
      name: "wh_upstream",
      description: "upstream",
      schema: z.object({}).strict(),
      handler: async () => {
        throw new UpstreamError({
          code: "CLI_TIMEOUT",
          cause: null,
          details: { timeoutMs: 10_000 },
          message: "timed out",
        });
      },
    });
    const result = await tool.handler({});
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.code).toBe("CLI_TIMEOUT");
      expect(payload.message).toBe("timed out");
      expect(payload.details).toEqual({ timeoutMs: 10_000 });
    }
  });

  it("non-Error throw inside handler is re-thrown unchanged", async () => {
    const tool = registerTool({
      name: "wh_rethrow",
      description: "rethrow",
      schema: z.object({}).strict(),
      handler: async () => {
        throw "string-thrown";
      },
    });
    await expect(tool.handler({})).rejects.toBe("string-thrown");
  });

  it("non-ZodError thrown during parse is re-thrown unchanged", async () => {
    const schema = z.object({}).strict();
    const tool = registerTool({
      name: "wh_parse_throw",
      description: "parse throw",
      schema,
      handler: async () => ({}),
    });
    const sentinel = new TypeError("parse blew up");
    const spy = vi.spyOn(schema, "parse").mockImplementation(() => {
      throw sentinel;
    });
    try {
      await expect(tool.handler({})).rejects.toBe(sentinel);
    } finally {
      spy.mockRestore();
    }
  });

  it("forwards spec.deps to the handler closure", async () => {
    const deps = { tag: "marker" };
    const tool = registerTool({
      name: "wh_deps",
      description: "deps",
      schema: z.object({}).strict(),
      deps,
      handler: async (_input, d) => ({ tag: d.tag }),
    });
    const result = await tool.handler({});
    if (!("isError" in result)) {
      expect(JSON.parse(result.content[0]!.text)).toEqual({ tag: "marker" });
    }
  });
});

describe("assertToolDocsExist — aggregated boot-failure message (FR-005 / Q4)", () => {
  function fakeTool(name: string): RegisteredTool {
    return {
      descriptor: { name, description: "x", inputSchema: { type: "object" } },
      handler: async () => ({ content: [{ type: "text", text: "" }] }),
    };
  }

  it("returns silently when every doc file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "register-docs-"));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "alpha.md"), "alpha");
      writeFileSync(join(dir, "beta.md"), "beta");
      expect(() => assertToolDocsExist([fakeTool("alpha"), fakeTool("beta")], dir)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("aggregates ALL missing files into a single error message (Q4 — fail-fast forbidden)", () => {
    const dir = mkdtempSync(join(tmpdir(), "register-docs-"));
    try {
      writeFileSync(join(dir, "present.md"), "ok");
      const tools = [fakeTool("present"), fakeTool("missing-a"), fakeTool("missing-b")];
      let caught: Error | null = null;
      try {
        assertToolDocsExist(tools, dir);
      } catch (err) {
        caught = err as Error;
      }
      expect(caught).not.toBeNull();
      expect(caught!.message).toContain("Missing tool documentation files");
      expect(caught!.message).toContain("docs/tools/missing-a.md");
      expect(caught!.message).toContain("docs/tools/missing-b.md");
      expect(caught!.message).not.toContain("docs/tools/present.md");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns silently for empty input", () => {
    expect(() => assertToolDocsExist([], "/no/such/dir")).not.toThrow();
  });
});
