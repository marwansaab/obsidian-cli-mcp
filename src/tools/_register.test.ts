// Original — no upstream. Co-located tests for the registerTool publication pipeline + assertToolDocsExist aggregator. Drift detector consolidated post-010 from three groups to one (registry walk + SDK round-trip + synthetic Pattern (a) fixture). 068 (T030/T033): the SDK v2 pass-through input-schema adapter is proven through a real Client over an in-memory transport, and every registry read goes through the published tools/list.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { z } from "zod";

import { connectInMemoryClient } from "./_mcp-client-fixtures.js";
import { fingerprintLiveRegistry, type RegisterBaseline } from "./_register-baseline.js";
import { registerTool, assertToolDocsExist, toSdkInputSchema, toSdkOutputSchema } from "./_register.js";
import { UpstreamError } from "../errors.js";
import { createServer } from "../server.js";
import {
  applyTargetModeRefinement,
  targetModeBaseSchema,
} from "../target-mode/target-mode.js";

import type { RegisteredTool } from "./_shared.js";
import type { Client } from "@modelcontextprotocol/client";

/** Title and annotations every fixture spec needs (068 T045: both are required on ToolSpec). */
const TEST_SURFACE = {
  title: "Test Tool",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
} as const;

const BASELINE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "_register-baseline.json");

function readBaseline(): RegisterBaseline {
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as RegisterBaseline;
}

/** Serve a single registered tool on a fresh McpServer and return a connected client. */
async function serveOne(tool: RegisteredTool): Promise<Client> {
  const server = new McpServer({ name: "spike", version: "0.0.0" }, { capabilities: { tools: { listChanged: false } } });
  tool.register(server);
  return connectInMemoryClient(server, "register-test");
}

function textOf(result: unknown): string {
  return (result as { content: Array<{ type: string; text: string }> }).content[0]!.text;
}

// 068 T030 (research R2, T0 spike): McpServer validates input itself and would replace the
// project's {code, message, details} envelope with free text, so the SDK receives a
// pass-through adapter. These cases prove the adapter publishes zod's own draft-2020-12
// emission and that a bad input still reaches the project callback.
describe("toSdkInputSchema — SDK v2 pass-through adapter (068 R2, T030)", () => {
  const schema = z.strictObject({
    name: z.string().min(1).describe("who to greet"),
    loud: z.boolean().optional().default(false),
  });
  const tool = registerTool({
    name: "spike_greet",
    ...TEST_SURFACE,
    description: "spike tool",
    schema,
    handler: async (input) => ({ greeting: `hello ${input.name}` }),
  });
  let client: Client;

  beforeAll(async () => {
    client = await serveOne(tool);
  });

  afterAll(async () => {
    await client.close();
  });

  it("published inputSchema deep-equals z.toJSONSchema(schema, {io:'input', target:'draft-2020-12'}), descriptions included", async () => {
    const { tools } = await client.listTools();
    expect(tools[0]!.inputSchema).toEqual(z.toJSONSchema(schema, { io: "input", target: "draft-2020-12" }));
    expect(tools[0]!.inputSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });

  it("publishes the spec's title and all four annotations (068 T045)", async () => {
    const { tools } = await client.listTools();
    expect(tools[0]!.title).toBe(TEST_SURFACE.title);
    expect(tools[0]!.annotations).toEqual(TEST_SURFACE.annotations);
    expect(tool.descriptor.annotations).toEqual(TEST_SURFACE.annotations);
  });

  it("keeps additionalProperties: false from strictObject, and a defaulted field is not required (io: input)", async () => {
    const { tools } = await client.listTools();
    expect(tools[0]!.inputSchema.additionalProperties).toBe(false);
    expect(tools[0]!.inputSchema.required).toEqual(["name"]);
  });

  it("the project descriptor carries the same inputSchema the client receives", async () => {
    const { tools } = await client.listTools();
    expect(tool.descriptor.inputSchema).toEqual(tools[0]!.inputSchema);
  });

  it("an invalid input reaches the callback and returns the VALIDATION_ERROR envelope, not SDK text", async () => {
    const result = await client.callTool({ name: "spike_greet", arguments: { name: 5 } });
    expect(result.isError).toBe(true);
    const payload = JSON.parse(textOf(result));
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.message).toBe("spike_greet input failed schema validation");
    expect(payload.details.issues[0].path).toEqual(["name"]);
  });

  it("a valid input succeeds through the client", async () => {
    const result = await client.callTool({ name: "spike_greet", arguments: { name: "world" } });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(textOf(result))).toEqual({ greeting: "hello world" });
  });

  it("the adapter's validate accepts any value unchanged", async () => {
    const adapter = toSdkInputSchema(schema);
    const value = { anything: [1, 2] };
    expect(await adapter["~standard"].validate(value)).toEqual({ value });
  });

  it("the adapter's output emission keeps nested descriptions too (068 FR-029)", () => {
    const adapter = toSdkInputSchema(schema);
    const out = adapter["~standard"].jsonSchema.output({ target: "draft-2020-12" });
    expect(JSON.stringify(out)).toContain("who to greet");
  });
});

describe("registerTool — callback outcomes through McpServer (068 T033)", () => {
  it("an UpstreamError is returned as the project envelope (isError, code/message/details)", async () => {
    const client = await serveOne(
      registerTool({
        name: "cb_upstream",
        ...TEST_SURFACE,
        description: "upstream",
        schema: z.strictObject({}),
        handler: async () => {
          throw new UpstreamError({ code: "CLI_TIMEOUT", cause: null, details: { timeoutMs: 1 }, message: "timed out" });
        },
      }),
    );
    try {
      const result = await client.callTool({ name: "cb_upstream", arguments: {} });
      expect(result.isError).toBe(true);
      expect(JSON.parse(textOf(result))).toEqual({ code: "CLI_TIMEOUT", message: "timed out", details: { timeoutMs: 1 } });
    } finally {
      await client.close();
    }
  });

  it("any other thrown error is rethrown by the callback and becomes the SDK's isError text", async () => {
    const client = await serveOne(
      registerTool({
        name: "cb_rethrow",
        ...TEST_SURFACE,
        description: "rethrow",
        schema: z.strictObject({}),
        handler: async () => {
          throw new TypeError("boom");
        },
      }),
    );
    try {
      const result = await client.callTool({ name: "cb_rethrow", arguments: {} });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe("boom");
    } finally {
      await client.close();
    }
  });

  it("a call with no arguments reaches the callback as an empty object", async () => {
    let seen: unknown;
    const client = await serveOne(
      registerTool({
        name: "cb_noargs",
        ...TEST_SURFACE,
        description: "no args",
        schema: z.strictObject({}),
        handler: async (input) => {
          seen = input;
          return { ok: true };
        },
      }),
    );
    try {
      const result = await client.callTool({ name: "cb_noargs" });
      expect(result.isError).toBeFalsy();
      expect(seen).toEqual({});
    } finally {
      await client.close();
    }
  });
});

// 068 R6 / T066–T067: typed results. The adapter publishes zod's own output emission, adding a
// root `type: "object"` only to a union whose variants are all objects; results carry
// structuredContent plus the identical text, and errors stay text-only.
describe("toSdkOutputSchema and typed results (068 R6, T066, T067)", () => {
  const objectOut = z.strictObject({ count: z.number().int(), names: z.array(z.string()) });
  const unionOut = z.union([
    z.strictObject({ kind: z.literal("a"), a: z.string() }),
    z.strictObject({ kind: z.literal("b"), b: z.number() }),
  ]);

  it("an object-root schema is published exactly as zod emits it", () => {
    const out = toSdkOutputSchema(objectOut)["~standard"].jsonSchema.output({ target: "draft-2020-12" });
    expect(out).toEqual(objectOut["~standard"].jsonSchema.output({ target: "draft-2020-12" }));
  });

  it("a union of objects gains root type: 'object' and nothing else changes", () => {
    const zodOut = unionOut["~standard"].jsonSchema.output({ target: "draft-2020-12" });
    expect(zodOut.type).toBeUndefined();
    const out = toSdkOutputSchema(unionOut)["~standard"].jsonSchema.output({ target: "draft-2020-12" });
    expect(out).toEqual({ type: "object", ...zodOut });
  });

  it("a union with a non-object variant is left without a root type", () => {
    const mixed = z.union([z.strictObject({ a: z.string() }), z.number()]);
    const out = toSdkOutputSchema(mixed)["~standard"].jsonSchema.output({ target: "draft-2020-12" });
    expect(out.type).toBeUndefined();
  });

  it("validate delegates to zod (accepts a valid value, rejects an invalid one)", async () => {
    const adapter = toSdkOutputSchema(unionOut);
    expect(await adapter["~standard"].validate({ kind: "b", b: 1 })).toEqual({ value: { kind: "b", b: 1 } });
    const bad = await adapter["~standard"].validate({ kind: "b", b: "x" });
    expect("issues" in bad && bad.issues !== undefined && bad.issues.length > 0).toBe(true);
  });

  it("registerTool refuses a non-object output root at boot (FR-039)", () => {
    expect(() =>
      registerTool({
        name: "out_scalar",
        ...TEST_SURFACE,
        description: "scalar result",
        schema: z.strictObject({}),
        outputSchema: z.number(),
        handler: async () => 1,
      }),
    ).toThrow('out_scalar: output schema must emit a top-level "type": "object" (FR-039), got "number"');
  });

  it("registerTool refuses an outputSchema on a raw-format tool", () => {
    expect(() =>
      registerTool({
        name: "out_raw",
        ...TEST_SURFACE,
        description: "raw",
        schema: z.strictObject({}),
        outputSchema: objectOut,
        responseFormat: "raw",
        handler: async () => ({ content: [] }),
      }),
    ).toThrow('out_raw: an outputSchema requires responseFormat "json"');
  });

  it("a success returns structuredContent and the identical JSON text; the descriptor carries the published outputSchema", async () => {
    const tool = registerTool({
      name: "out_ok",
      ...TEST_SURFACE,
      description: "typed",
      schema: z.strictObject({}),
      outputSchema: unionOut,
      handler: async () => ({ kind: "a", a: "x" }),
    });
    const client = await serveOne(tool);
    try {
      const { tools } = await client.listTools();
      expect(tools[0]!.outputSchema).toEqual(tool.descriptor.outputSchema);
      expect(tools[0]!.outputSchema?.type).toBe("object");
      const result = await client.callTool({ name: "out_ok", arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({ kind: "a", a: "x" });
      expect(JSON.parse(textOf(result))).toEqual(result.structuredContent);
    } finally {
      await client.close();
    }
  });

  it("a failure from a tool with an outputSchema is text-only (FR-040)", async () => {
    const client = await serveOne(
      registerTool({
        name: "out_err",
        ...TEST_SURFACE,
        description: "typed failure",
        schema: z.strictObject({}),
        outputSchema: objectOut,
        handler: async () => {
          throw new UpstreamError({ code: "CLI_TIMEOUT", cause: null, details: {}, message: "timed out" });
        },
      }),
    );
    try {
      const result = await client.callTool({ name: "out_err", arguments: {} });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      expect(JSON.parse(textOf(result)).code).toBe("CLI_TIMEOUT");
    } finally {
      await client.close();
    }
  });

  it("a tool without an outputSchema publishes none and returns no structuredContent", async () => {
    const tool = registerTool({
      name: "out_none",
      ...TEST_SURFACE,
      description: "untyped",
      schema: z.strictObject({}),
      handler: async () => ({ ok: true }),
    });
    expect(tool.descriptor.outputSchema).toBeUndefined();
    const client = await serveOne(tool);
    try {
      const { tools } = await client.listTools();
      expect(tools[0]!.outputSchema).toBeUndefined();
      const result = await client.callTool({ name: "out_none", arguments: {} });
      expect(result.structuredContent).toBeUndefined();
    } finally {
      await client.close();
    }
  });
});

describe("registerTool — descriptor publication pipeline", () => {
  it("publishes inputSchema with top-level type === 'object' (FR-002)", () => {
    const tool = registerTool({
      name: "pip_object",
      ...TEST_SURFACE,
      description: "test tool",
      schema: z.strictObject({ a: z.string() }),
      handler: async () => ({ ok: true }),
    });
    expect(tool.descriptor.inputSchema.type).toBe("object");
  });

  it("refuses at boot a schema that emits no object root, naming the tool (FR-002 boundary)", () => {
    expect(() =>
      registerTool({
        name: "pip_union_root",
        ...TEST_SURFACE,
        description: "test tool",
        schema: z.discriminatedUnion("kind", [
          z.strictObject({ kind: z.literal("a") }),
          z.strictObject({ kind: z.literal("b") }),
        ]),
        handler: async () => ({ ok: true }),
      }),
    ).toThrow('pip_union_root: input schema must emit a top-level "type": "object" (FR-002), got undefined');
  });

  it("keeps descriptions at every nested depth (068 FR-029; the FR-006 stripping is retired)", () => {
    const schema = z.strictObject({
      outer: z.strictObject({ inner: z.string().describe("inner desc") }).describe("outer desc"),
    });
    const tool = registerTool({
      name: "pip_keep",
      ...TEST_SURFACE,
      description: "tool description must survive",
      schema,
      handler: async () => ({ ok: true }),
    });
    const outer = (tool.descriptor.inputSchema.properties as Record<string, Record<string, unknown>>).outer!;
    expect(outer.description).toBe("outer desc");
    expect((outer.properties as Record<string, Record<string, unknown>>).inner!.description).toBe("inner desc");
    expect(tool.descriptor.description).toBe("tool description must survive");
  });

  it("preserves spec.description on the descriptor verbatim", () => {
    const tool = registerTool({
      name: "pip_desc",
      ...TEST_SURFACE,
      description: "exact description text",
      schema: z.strictObject({}),
      handler: async () => ({}),
    });
    expect(tool.descriptor.description).toBe("exact description text");
  });
});

describe("registerTool — wrapped handler runtime", () => {
  it("responseFormat 'json' (default) wraps result in { content: [{ type: 'text', text: JSON.stringify(result) }] }", async () => {
    const tool = registerTool({
      name: "wh_json",
      ...TEST_SURFACE,
      description: "json default",
      schema: z.strictObject({ name: z.string() }),
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
      ...TEST_SURFACE,
      description: "raw passthrough",
      schema: z.strictObject({}),
      handler: async () => passthrough,
      responseFormat: "raw",
    });
    const result = await tool.handler({});
    expect(result).toBe(passthrough);
  });

  it("ZodError → VALIDATION_ERROR envelope with details.issues", async () => {
    const tool = registerTool({
      name: "wh_validate",
      ...TEST_SURFACE,
      description: "validation",
      schema: z.strictObject({ a: z.string() }),
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
      ...TEST_SURFACE,
      description: "upstream",
      schema: z.strictObject({}),
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
      ...TEST_SURFACE,
      description: "rethrow",
      schema: z.strictObject({}),
      handler: async () => {
        throw "string-thrown";
      },
    });
    await expect(tool.handler({})).rejects.toBe("string-thrown");
  });

  it("non-ZodError thrown during parse is re-thrown unchanged", async () => {
    const schema = z.strictObject({});
    const tool = registerTool({
      name: "wh_parse_throw",
      ...TEST_SURFACE,
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
      ...TEST_SURFACE,
      description: "deps",
      schema: z.strictObject({}),
      deps,
      handler: async (_input, d) => ({ tag: d.tag }),
    });
    const result = await tool.handler({});
    if (!("isError" in result)) {
      expect(JSON.parse(result.content[0]!.text)).toEqual({ tag: "marker" });
    }
  });

  it("mapValidationError hook customises the input VALIDATION_ERROR envelope", async () => {
    const tool = registerTool({
      name: "wh_hook",
      ...TEST_SURFACE,
      description: "hook",
      schema: z.strictObject({ a: z.string() }),
      handler: async () => ({}),
      mapValidationError: (issues) => ({
        code: "VALIDATION_ERROR",
        message: "custom message",
        details: { code: "CUSTOM_CODE", issueCount: issues.length },
      }),
    });
    const result = await tool.handler({ a: 123 });
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.message).toBe("custom message");
      expect(payload.details.code).toBe("CUSTOM_CODE");
      expect(payload.details.issueCount).toBeGreaterThan(0);
    }
  });

  it("mapValidationError receives the raw unparsed args", async () => {
    let seen: unknown;
    const tool = registerTool({
      name: "wh_hook_args",
      ...TEST_SURFACE,
      description: "hook args",
      schema: z.strictObject({ a: z.string() }),
      handler: async () => ({}),
      mapValidationError: (_issues, rawArgs) => {
        seen = rawArgs;
        return { code: "VALIDATION_ERROR", message: "x", details: {} };
      },
    });
    await tool.handler({ a: 123, extra: "raw" });
    expect(seen).toEqual({ a: 123, extra: "raw" });
  });

  it("runtime ZodError thrown inside the handler → INTERNAL_ERROR (output-contract break, not input)", async () => {
    const tool = registerTool({
      name: "wh_runtime_zod",
      ...TEST_SURFACE,
      description: "runtime zod",
      schema: z.strictObject({}),
      handler: async () => {
        // Simulate a defensive output parse that fails at runtime — the handler's
        // OWN output is malformed, the client's input was valid.
        z.object({ n: z.number() }).parse({ n: "not a number" });
        return {};
      },
    });
    const result = await tool.handler({});
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.code).toBe("INTERNAL_ERROR");
      expect(payload.message).toContain("wh_runtime_zod");
      expect(payload.message).toContain("output contract");
      expect(Array.isArray(payload.details.issues)).toBe(true);
    }
  });

  it("runtime ZodError bypasses mapValidationError — an output-contract break is INTERNAL_ERROR even when an input hook is present", async () => {
    const tool = registerTool({
      name: "wh_runtime_hook",
      ...TEST_SURFACE,
      description: "runtime hook",
      schema: z.strictObject({}),
      handler: async () => {
        z.object({ n: z.number() }).parse({ n: "nope" });
        return {};
      },
      // The input hook must NOT fire for an output-contract ZodError — its issue
      // shape is output-shaped, not input-shaped.
      mapValidationError: () => ({
        code: "VALIDATION_ERROR",
        message: "mapped runtime",
        details: { code: "RUNTIME" },
      }),
    });
    const result = await tool.handler({});
    expect("isError" in result && result.isError).toBe(true);
    if ("isError" in result && result.isError) {
      const payload = JSON.parse(result.content[0]!.text);
      expect(payload.code).toBe("INTERNAL_ERROR");
      expect(payload.message).not.toBe("mapped runtime");
      expect(payload.details.code).not.toBe("RUNTIME");
    }
  });
});

describe("assertToolDocsExist — aggregated boot-failure message (FR-005 / Q4)", () => {
  function fakeTool(name: string): RegisteredTool {
    return {
      descriptor: { name, description: "x", annotations: TEST_SURFACE.annotations, inputSchema: { type: "object" } },
      handler: async () => ({ content: [{ type: "text", text: "" }] }),
      register: () => undefined,
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

// Post-010 consolidated drift detector (FR-008 / FR-009 / SC-005 / SC-008).
// Single describe; the SDK round-trip (068: the only registry read, through the published
// tools/list) plus one synthetic Pattern (a) fixture. Supersedes feature 009's three-group
// structure.

type ToolInvariant = {
  type: "object";
  properties_equals_set: ReadonlyArray<string>;
  required_equals: ReadonlyArray<string>;
  additionalProperties: true | false;
};

const invariants: Readonly<Record<string, ToolInvariant>> = {
  append_note: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "content", "inline"],
    required_equals: ["target_mode", "content"],
    additionalProperties: false,
  },
  backlinks: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "with_counts", "total", "limit"],
    required_equals: ["target_mode"],
    additionalProperties: false,
  },
  context_search: {
    type: "object",
    properties_equals_set: ["query", "folder", "limit", "case_sensitive", "vault"],
    required_equals: ["query"],
    additionalProperties: false,
  },
  read: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path"],
    required_equals: ["target_mode"],
    additionalProperties: false,
  },
  write_note: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "content", "overwrite", "open"],
    required_equals: ["target_mode", "content"],
    additionalProperties: false,
  },
  delete: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "permanent"],
    required_equals: ["target_mode"],
    additionalProperties: false,
  },
  read_heading: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "heading"],
    required_equals: ["target_mode", "heading"],
    additionalProperties: false,
  },
  read_property: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "name"],
    required_equals: ["target_mode", "name"],
    additionalProperties: false,
  },
  rename: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "name"],
    required_equals: ["target_mode", "name"],
    additionalProperties: false,
  },
  move: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "to"],
    required_equals: ["target_mode", "to"],
    additionalProperties: false,
  },
  find_by_property: {
    type: "object",
    properties_equals_set: ["vault", "property", "value", "folder", "arrayMatch", "caseSensitive"],
    required_equals: ["property", "value"],
    additionalProperties: false,
  },
  get_active_file: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path"],
    required_equals: ["target_mode"],
    additionalProperties: false,
  },
  set_property: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "name", "value", "type"],
    required_equals: ["target_mode", "name", "value"],
    additionalProperties: false,
  },
  files: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "folder", "ext", "total"],
    required_equals: ["target_mode"],
    additionalProperties: false,
  },
  find_and_replace: {
    type: "object",
    properties_equals_set: [
      "active_note",
      "case_insensitive",
      "commit",
      "file",
      "include_code_blocks",
      "include_html_comments",
      "mode",
      "path",
      "pattern",
      "replacement",
      "subfolder",
      "vault",
    ],
    required_equals: ["pattern", "replacement"],
    additionalProperties: false,
  },
  obsidian_exec: {
    type: "object",
    properties_equals_set: ["command", "vault", "parameters", "flags", "copy", "timeoutMs"],
    required_equals: ["command"],
    additionalProperties: false,
  },
  open_file: {
    type: "object",
    properties_equals_set: ["vault", "path", "file", "new_tab"],
    required_equals: ["vault"],
    additionalProperties: false,
  },
  outline: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "total"],
    required_equals: ["target_mode"],
    additionalProperties: false,
  },
  patch_block: {
    type: "object",
    properties_equals_set: [
      "target_mode",
      "vault",
      "file",
      "path",
      "block_id",
      "content",
    ],
    required_equals: ["target_mode", "block_id", "content"],
    additionalProperties: false,
  },
  patch_heading: {
    type: "object",
    properties_equals_set: [
      "target_mode",
      "vault",
      "file",
      "path",
      "heading_path",
      "mode",
      "content",
    ],
    required_equals: ["target_mode", "heading_path", "mode", "content"],
    additionalProperties: false,
  },
  prepend: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "content", "inline"],
    required_equals: ["target_mode", "content"],
    additionalProperties: false,
  },
  properties: {
    type: "object",
    properties_equals_set: ["vault", "total"],
    required_equals: [],
    additionalProperties: false,
  },
  help: {
    type: "object",
    properties_equals_set: ["tool_name"],
    required_equals: [],
    additionalProperties: false,
  },
  links: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "total"],
    required_equals: ["target_mode"],
    additionalProperties: false,
  },
  smart_connections_query: {
    type: "object",
    properties_equals_set: ["query", "vault", "limit", "total"],
    required_equals: ["query"],
    additionalProperties: false,
  },
  smart_connections_similar: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "limit", "total"],
    required_equals: ["target_mode"],
    additionalProperties: false,
  },
  tag: {
    type: "object",
    properties_equals_set: ["tag", "vault", "total"],
    required_equals: ["tag"],
    additionalProperties: false,
  },
  paths: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "folder", "depth", "ext", "total"],
    required_equals: ["target_mode"],
    additionalProperties: false,
  },
  pattern_search: {
    type: "object",
    properties_equals_set: ["pattern", "folder", "limit", "case_sensitive", "vault"],
    required_equals: ["pattern"],
    additionalProperties: false,
  },
  bases: {
    type: "object",
    properties_equals_set: ["vault"],
    required_equals: [],
    additionalProperties: false,
  },
  create_base: {
    type: "object",
    properties_equals_set: ["path", "name", "content", "view", "vault"],
    required_equals: ["path", "name"],
    additionalProperties: false,
  },
  query_base: {
    type: "object",
    properties_equals_set: ["base_path", "view_name", "vault"],
    required_equals: ["base_path", "view_name"],
    additionalProperties: false,
  },
  views_base: {
    type: "object",
    properties_equals_set: ["vault", "base_path"],
    required_equals: [],
    additionalProperties: false,
  },
  search: {
    type: "object",
    properties_equals_set: ["query", "folder", "limit", "case_sensitive", "context_lines", "vault"],
    required_equals: ["query"],
    additionalProperties: false,
  },
  vaults: {
    type: "object",
    properties_equals_set: [],
    required_equals: [],
    additionalProperties: false,
  },
  synthetic_pattern_a: {
    type: "object",
    properties_equals_set: ["target_mode", "vault", "file", "path", "note_text"],
    required_equals: ["target_mode", "note_text"],
    additionalProperties: false,
  },
};

const liveRegistryToolNames = Object.keys(invariants).filter((n) => n !== "synthetic_pattern_a");

function assertInvariant(name: string, schema: Record<string, unknown>): void {
  const invariant = invariants[name];
  expect(invariant, `Tool '${name}' missing invariant entry`).toBeDefined();
  expect(schema.type, `Tool '${name}' inputSchema.type`).toBe(invariant!.type);
  const keys = new Set(Object.keys((schema.properties ?? {}) as Record<string, unknown>));
  expect(keys, `Tool '${name}' inputSchema.properties keys (exact set)`).toEqual(
    new Set(invariant!.properties_equals_set),
  );
  const required = Array.isArray(schema.required) ? (schema.required as string[]).slice() : [];
  expect([...required].sort(), `Tool '${name}' inputSchema.required (exact)`).toEqual(
    [...invariant!.required_equals].sort(),
  );
  expect(schema.additionalProperties, `Tool '${name}' inputSchema.additionalProperties`).toBe(
    invariant!.additionalProperties,
  );
}

describe("registry: published inputSchema invariants (post-010)", () => {
  describe("SDK round-trip", () => {
    let client: Client;
    let listResponse: { tools: Array<{ name: string; inputSchema: Record<string, unknown> }> };

    beforeAll(async () => {
      const created = createServer({ registerSignalHandlers: false });
      client = await connectInMemoryClient(created.buildMcpServer(), "drift-detector");
      listResponse = (await client.listTools()) as typeof listResponse;
    });

    afterAll(async () => {
      await client.close();
    });

    it("every registered tool has an invariant entry", () => {
      const missing = listResponse.tools.map((t) => t.name).filter((n) => !(n in invariants));
      expect(missing, `tools missing invariant entry: ${missing.join(", ")}`).toEqual([]);
    });

    it.each(liveRegistryToolNames)(
      "tool %s wire-side satisfies its invariant",
      (toolName: string) => {
        const tool = listResponse.tools.find((t) => t.name === toolName);
        expect(tool, `Tool '${toolName}' missing from tools/list response`).toBeDefined();
        assertInvariant(toolName, tool!.inputSchema);
      },
    );

    it("does NOT publish any retired tool name (BI-022)", () => {
      const live = listResponse.tools.map((t) => t.name);
      const retired = ["read_note", "delete_note", "list_files", "write_property", "rename_note"];
      const intersection = retired.filter((r) => live.includes(r));
      expect(
        intersection,
        `retired names re-appeared in tools/list: ${intersection.join(", ")}`,
      ).toEqual([]);
    });
  });

  it("synthetic Pattern (a) — applyTargetModeRefinement(base.extend({ note_text })) publishes the union of base + extension keys", () => {
    const schema = applyTargetModeRefinement(
      targetModeBaseSchema.extend({ note_text: z.string() }),
    );
    const tool = registerTool({
      name: "synthetic_pattern_a",
      ...TEST_SURFACE,
      description: "drift-detector fixture",
      schema,
      handler: async () => ({ content: [{ type: "text" as const, text: "" }] }),
    });
    assertInvariant("synthetic_pattern_a", tool.descriptor.inputSchema as Record<string, unknown>);
  });
});

describe("registry: stability baseline (FR-018)", () => {
  it("live registry fingerprints match the checked-in baseline", async () => {
    const baseline = readBaseline();
    const live = await fingerprintLiveRegistry();
    expect(live).toEqual(baseline.tools);
  });

  it("baseline file conforms to the documented schema", () => {
    const baseline = readBaseline();
    expect(baseline.schemaVersion).toBe(2);
    expect(Array.isArray(baseline.tools)).toBe(true);
    for (const entry of baseline.tools) {
      expect(typeof entry.name).toBe("string");
      expect(entry.descriptionFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.schemaFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.titleFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.annotationsFingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
    const sortedNames = [...baseline.tools].map((t) => t.name);
    expect(sortedNames).toEqual([...sortedNames].sort());
  });

  it("baseline does NOT include any retired tool name (BI-022)", () => {
    const baseline = readBaseline();
    const names = baseline.tools.map((t) => t.name);
    const retired = ["read_note", "delete_note", "list_files", "write_property", "rename_note"];
    const found = retired.filter((r) => names.includes(r));
    expect(
      found,
      `retired names should be absent from baseline: ${found.join(", ")}`,
    ).toEqual([]);
  });
});
