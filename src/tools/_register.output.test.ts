// Original — no upstream. Co-located tests for the registerTool typed-result path (068 R6, T066, T067): the toSdkOutputSchema adapter, the boot check on the output root, the three ToolSpec result cases, and structuredContent on success only. Split from _register.test.ts in the PR #91 review to keep that file under 1000 lines.
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { serveOne, textOf } from "./_mcp-client-fixtures.js";
import { registerTool, toSdkOutputSchema } from "./_register.js";
import { READ_ONLY_HINTS } from "./_shared.js";
import { UpstreamError } from "../errors.js";

const SURFACE = { title: "Typed Tool", annotations: READ_ONLY_HINTS } as const;

// The adapter publishes zod's own output emission, adding a root `type: "object"` only to a
// union whose variants are all objects; results carry structuredContent plus the identical
// text, and errors stay text-only.
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
        ...SURFACE,
        description: "scalar result",
        schema: z.strictObject({}),
        outputSchema: z.number(),
        handler: async () => 1,
      }),
    ).toThrow('out_scalar: output schema must emit a top-level "type": "object" (FR-039), got "number"');
  });

  // The two cases below are compile-time contracts: `tsc --noEmit` fails if either spec type-checks.
  it("an outputSchema on a raw-format tool does not type-check", () => {
    const rawWithOutput = () =>
      // @ts-expect-error a raw tool builds its own ToolCallResult, so it cannot publish an outputSchema.
      registerTool({
        name: "out_raw",
        ...SURFACE,
        description: "raw",
        schema: z.strictObject({}),
        outputSchema: objectOut,
        responseFormat: "raw",
        handler: async () => ({ content: [] }),
      });
    expect(rawWithOutput).toBeTypeOf("function");
  });

  it("a handler whose result does not match its outputSchema does not type-check", () => {
    const mismatched = () =>
      // @ts-expect-error the handler returns `names` as a string, not the schema's string array.
      registerTool({
        name: "out_mismatch",
        ...SURFACE,
        description: "mismatch",
        schema: z.strictObject({}),
        outputSchema: objectOut,
        handler: async () => ({ count: 1, names: "x" }),
      });
    expect(mismatched).toBeTypeOf("function");
  });

  it("a success returns structuredContent and the identical JSON text under the published outputSchema", async () => {
    const tool = registerTool({
      name: "out_ok",
      ...SURFACE,
      description: "typed",
      schema: z.strictObject({}),
      outputSchema: unionOut,
      handler: async () => ({ kind: "a" as const, a: "x" }),
    });
    const client = await serveOne(tool, "register-output-test");
    try {
      const { tools } = await client.listTools();
      expect(tools[0]!.outputSchema).toEqual(
        toSdkOutputSchema(unionOut)["~standard"].jsonSchema.output({ target: "draft-2020-12" }),
      );
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
        ...SURFACE,
        description: "typed failure",
        schema: z.strictObject({}),
        outputSchema: objectOut,
        handler: async () => {
          throw new UpstreamError({ code: "CLI_TIMEOUT", cause: null, details: {}, message: "timed out" });
        },
      }),
      "register-output-test",
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
      ...SURFACE,
      description: "untyped",
      schema: z.strictObject({}),
      handler: async () => ({ ok: true }),
    });
    const client = await serveOne(tool, "register-output-test");
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
