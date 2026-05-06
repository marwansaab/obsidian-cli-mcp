// Original — no upstream. Co-located tests for the registerTool publication pipeline + assertToolDocsExist aggregator (FR-001..FR-006). Extended in feature 009 with three drift-detector groups (FR-006 / FR-007 / FR-008) — Group 1 (unit-layer registry walk), Group 2 (full SDK round-trip via InMemoryTransport), Group 3 (synthetic Pattern (a)/(b) fixtures).
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { z } from "zod";

import { registerTool, assertToolDocsExist } from "./_register.js";
import { UpstreamError } from "../errors.js";
import { createServer } from "../server.js";
import { targetModeSchema } from "../target-mode/target-mode.js";

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

// ---------------------------------------------------------------------------
// Feature 009 — parameterised drift detector. The detector observes the
// actual published `inputSchema` for every registered tool and asserts
// per-tool invariants. It is the durable forcing function (FR-006 / FR-007
// / FR-008) that closes feature 007's deferred T004 detector and feature
// 008's missing wire-level assertion in one move. See
// specs/009-fix-inputschema-publication/contracts/drift-detector.contract.md
// and specs/009-fix-inputschema-publication/data-model.md §5.
// ---------------------------------------------------------------------------

type ToolInvariant = {
  type: "object";
  properties_includes?: ReadonlyArray<string>;
  properties_equals_set?: ReadonlyArray<string>;
  required_includes?: ReadonlyArray<string>;
  required_equals?: ReadonlyArray<string>;
  additionalProperties?: true | false;
};

const invariants: Readonly<Record<string, ToolInvariant>> = {
  // FR-001 / FR-002 / SC-001 — read_note publishes the four target-mode
  // property names at top level so strict-naive clients can preserve them
  // through their outgoing-argument stripping pass.
  read_note: {
    type: "object",
    properties_includes: ["target_mode", "vault", "file", "path"],
    required_includes: ["target_mode"],
    additionalProperties: true,
  },
  // FR-005 / FR-007 / SC-004 — obsidian_exec's flat-z.object shape is
  // STRICTLY pinned. A future change that widens additionalProperties to
  // true (e.g. accidentally routes a flat-z.object through the wrap-branch
  // widening) fails this assertion.
  obsidian_exec: {
    type: "object",
    properties_equals_set: ["command", "vault", "parameters", "flags", "copy", "timeoutMs"],
    required_equals: ["command"],
    additionalProperties: false,
  },
  // help — flat z.object with one optional field. No required invariant
  // since help's runtime schema permits zero-arg or with-arg invocation.
  help: {
    type: "object",
    properties_includes: ["tool_name"],
  },
};

function assertInvariant(name: string, schema: Record<string, unknown>): void {
  const invariant = invariants[name];
  expect(
    invariant,
    `Tool '${name}' has no invariant entry — add one to specs/009-fix-inputschema-publication/data-model.md §5 and to src/tools/_register.test.ts's invariants table`,
  ).toBeDefined();
  expect(schema.type, `Tool '${name}' inputSchema.type`).toBe(invariant!.type);
  if (invariant!.properties_includes) {
    const keys = Object.keys((schema.properties ?? {}) as Record<string, unknown>);
    expect(keys, `Tool '${name}' inputSchema.properties keys`).toEqual(
      expect.arrayContaining([...invariant!.properties_includes]),
    );
  }
  if (invariant!.properties_equals_set) {
    const keys = new Set(Object.keys((schema.properties ?? {}) as Record<string, unknown>));
    expect(keys, `Tool '${name}' inputSchema.properties keys (exact set)`).toEqual(
      new Set(invariant!.properties_equals_set),
    );
  }
  if (invariant!.required_includes) {
    expect(schema.required, `Tool '${name}' inputSchema.required`).toEqual(
      expect.arrayContaining([...invariant!.required_includes]),
    );
  }
  if (invariant!.required_equals) {
    expect(schema.required, `Tool '${name}' inputSchema.required (exact)`).toEqual([
      ...invariant!.required_equals,
    ]);
  }
  if (invariant!.additionalProperties !== undefined) {
    expect(
      schema.additionalProperties,
      `Tool '${name}' inputSchema.additionalProperties`,
    ).toBe(invariant!.additionalProperties);
  }
}

type ListToolsHandler = (req: unknown) => Promise<{
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
}>;

async function listToolsViaRegistry(): Promise<
  Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>
> {
  const { server } = createServer({ registerSignalHandlers: false });
  const handlers = (
    server as unknown as { _requestHandlers: Map<string, ListToolsHandler> }
  )._requestHandlers;
  const listHandler = handlers.get("tools/list");
  if (!listHandler) throw new Error("tools/list handler not registered");
  const result = await listHandler({ method: "tools/list", params: {} });
  return result.tools;
}

// Group 1 — Unit layer: registry-level published-shape invariants (FR-006 / FR-007).
describe("registry: published inputSchema invariants (unit layer)", () => {
  it("every registered tool has an invariant entry (forces future typed-tool authors to declare a published-shape contract)", async () => {
    const tools = await listToolsViaRegistry();
    const missing = tools.map((t) => t.name).filter((n) => !(n in invariants));
    expect(
      missing,
      `tools missing invariant entry: ${missing.join(", ")}. Add an entry to specs/009-fix-inputschema-publication/data-model.md §5 and to src/tools/_register.test.ts's invariants table.`,
    ).toEqual([]);
  });

  it.each(Object.keys(invariants))(
    "tool %s satisfies its invariant",
    async (toolName: string) => {
      const tools = await listToolsViaRegistry();
      const tool = tools.find((t) => t.name === toolName);
      expect(tool, `Tool '${toolName}' not found in live registry`).toBeDefined();
      assertInvariant(toolName, tool!.inputSchema);
    },
  );
});

// Group 2 — Integration layer: full SDK round-trip via InMemoryTransport (FR-008).
// Catches future MCP SDK behaviour changes that might transform the descriptor
// in transit (e.g. wire-level validators that strip unknown keys).
describe("registry: published inputSchema invariants (integration layer — SDK round-trip)", () => {
  let client: Client;
  let listResponse: {
    tools: Array<{ name: string; inputSchema: Record<string, unknown> }>;
  };

  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const created = createServer({ registerSignalHandlers: false });
    await created.server.connect(serverTransport);
    client = new Client({ name: "drift-detector", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientTransport);
    listResponse = (await client.listTools()) as typeof listResponse;
  });

  afterAll(async () => {
    await client.close();
  });

  it.each(Object.keys(invariants))(
    "tool %s wire-side satisfies its invariant",
    (toolName: string) => {
      const tool = listResponse.tools.find((t) => t.name === toolName);
      expect(tool, `Tool '${toolName}' missing from tools/list response`).toBeDefined();
      assertInvariant(toolName, tool!.inputSchema);
    },
  );
});

// Group 3 — Synthetic Pattern (a) / Pattern (b) fixtures (FR-003 / SC-009).
// These do NOT register with the live server — they call registerTool directly
// to produce a RegisteredTool, then assert on the published descriptor it
// carries. Verifies that future Pattern (a) consumers (write_note / append_note)
// and Pattern (b) consumers (fresh discriminated union with union-level
// superRefine) inherit the publication-pipeline fix automatically.
describe("future-tool pattern fixtures", () => {
  it("Pattern (a) — targetModeSchema.and(z.object({ note_text: z.string() })) publishes note_text + the four target-mode keys", () => {
    const schema = targetModeSchema.and(z.object({ note_text: z.string() }));
    const tool = registerTool({
      name: "synthetic_pattern_a",
      description: "fixture",
      schema,
      handler: async () => ({ content: [{ type: "text" as const, text: "" }] }),
    });
    const inputSchema = tool.descriptor.inputSchema as Record<string, unknown>;
    const props = Object.keys((inputSchema.properties ?? {}) as Record<string, unknown>);
    expect(props).toEqual(
      expect.arrayContaining(["target_mode", "vault", "file", "path", "note_text"]),
    );
    expect(inputSchema.required).toEqual(
      expect.arrayContaining(["target_mode", "note_text"]),
    );
    expect(inputSchema.type).toBe("object");
    expect(inputSchema.additionalProperties).toBe(true);
  });

  it("Pattern (b) — fresh discriminated union over write_note-shape bases publishes the union of branch keys", () => {
    const writeNoteSpecific = z
      .object({
        target_mode: z.literal("specific"),
        vault: z.string().min(1),
        file: z.string().optional(),
        path: z.string().optional(),
        note_text: z.string(),
      })
      .passthrough();
    const writeNoteActive = z
      .object({
        target_mode: z.literal("active"),
        note_text: z.string(),
      })
      .passthrough();
    const schema = z
      .discriminatedUnion("target_mode", [writeNoteSpecific, writeNoteActive])
      .superRefine(() => {});
    const tool = registerTool({
      name: "synthetic_pattern_b",
      description: "fixture",
      schema,
      handler: async () => ({ content: [{ type: "text" as const, text: "" }] }),
    });
    const inputSchema = tool.descriptor.inputSchema as Record<string, unknown>;
    const props = Object.keys((inputSchema.properties ?? {}) as Record<string, unknown>);
    expect(props).toEqual(
      expect.arrayContaining(["target_mode", "vault", "file", "path", "note_text"]),
    );
    // note_text is required in BOTH branches, so it survives the intersection.
    expect(inputSchema.required).toEqual(
      expect.arrayContaining(["target_mode", "note_text"]),
    );
    expect(inputSchema.type).toBe("object");
    expect(inputSchema.additionalProperties).toBe(true);
  });
});
