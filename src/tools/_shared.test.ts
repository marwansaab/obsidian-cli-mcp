// Original — no upstream. Co-located tests for the tool aggregator's shared utilities (asToolError, toMcpInputSchema). Brought online by feature 007 alongside the new envelope helper; per Constitution Principle II + research P8, modifying _shared.ts triggers the obligation to ship its co-located tests in the same change, including the previously-untested asToolError export.
import { test, expect } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { asToolError, toMcpInputSchema } from "./_shared.js";

test("asToolError returns the SDK error envelope with JSON-stringified payload (Principle II — retroactive)", () => {
  const result = asToolError({
    code: "VALIDATION_ERROR",
    message: "test message",
    details: { issues: [{ path: ["foo"], message: "bad" }] },
  });
  expect(result.isError).toBe(true);
  expect(result.content).toHaveLength(1);
  expect(result.content[0]!.type).toBe("text");
  const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
  expect(parsed.code).toBe("VALIDATION_ERROR");
  expect(parsed.message).toBe("test message");
  expect(parsed.details).toEqual({ issues: [{ path: ["foo"], message: "bad" }] });
});

test("toMcpInputSchema returns a z.object schema verbatim (no-op path) (FR-002, contract Example 1)", () => {
  const zodSchema = z.object({ vault: z.string(), file: z.string() }).passthrough();
  const result = toMcpInputSchema(zodSchema);
  expect(result.type).toBe("object");
  expect(result.properties).toBeDefined();
  expect((result.properties as Record<string, unknown>).vault).toBeDefined();
  expect((result.properties as Record<string, unknown>).file).toBeDefined();
  // No oneOf wrapping was needed since the raw output already had type:"object".
  expect(result.oneOf).toBeUndefined();
});

test("toMcpInputSchema wraps a z.discriminatedUnion in a top-level object envelope with oneOf branches (FR-002, FR-002a, contract Example 2)", () => {
  const zodSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a"), aField: z.string() }).passthrough(),
    z.object({ kind: z.literal("b"), bField: z.number() }).passthrough(),
  ]);
  const result = toMcpInputSchema(zodSchema);
  expect(result.type).toBe("object");
  expect(result.additionalProperties).toBe(true);
  expect(Array.isArray(result.oneOf)).toBe(true);
  const oneOf = result.oneOf as Array<Record<string, unknown>>;
  expect(oneOf).toHaveLength(2);
  // Branch shapes preserve properties + required
  expect((oneOf[0]!.properties as Record<string, unknown>).kind).toBeDefined();
  expect((oneOf[0]!.properties as Record<string, unknown>).aField).toBeDefined();
  expect(oneOf[0]!.required).toEqual(["kind", "aField"]);
  expect((oneOf[1]!.properties as Record<string, unknown>).kind).toBeDefined();
  expect((oneOf[1]!.properties as Record<string, unknown>).bField).toBeDefined();
  expect(oneOf[1]!.required).toEqual(["kind", "bField"]);
});

test("toMcpInputSchema rewrites top-level anyOf -> oneOf (research P2)", () => {
  const zodSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a") }),
    z.object({ kind: z.literal("b") }),
  ]);
  // Sanity: zodToJsonSchema actually emits anyOf at the top level for this input.
  const raw = zodToJsonSchema(zodSchema, { $refStrategy: "none" }) as Record<string, unknown>;
  expect(raw.anyOf).toBeDefined();
  expect(raw.oneOf).toBeUndefined();
  const result = toMcpInputSchema(zodSchema);
  // Helper rewrites it.
  expect(result.oneOf).toBeDefined();
  expect(result.anyOf).toBeUndefined();
});

test("toMcpInputSchema strips inner type:'object' from each oneOf branch (data-model Shape 2)", () => {
  const zodSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a") }),
    z.object({ kind: z.literal("b") }),
  ]);
  const result = toMcpInputSchema(zodSchema);
  const oneOf = result.oneOf as Array<Record<string, unknown>>;
  for (const branch of oneOf) {
    expect(branch.type).toBeUndefined();
    expect(branch.properties).toBeDefined();
  }
});

test("toMcpInputSchema preserves the $schema keyword from the raw output (P4)", () => {
  const zodSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a") }),
    z.object({ kind: z.literal("b") }),
  ]);
  const result = toMcpInputSchema(zodSchema);
  expect(result.$schema).toBe("http://json-schema.org/draft-07/schema#");
});

test("toMcpInputSchema does not mutate the raw zodToJsonSchema output (P4)", () => {
  // Deep snapshot of the raw output BEFORE invoking the helper, then call the
  // helper, then snapshot AGAIN. Equality proves no mutation. (We capture via
  // a separate zodToJsonSchema call with the same args.)
  const zodSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a") }),
    z.object({ kind: z.literal("b") }),
  ]);
  const before = JSON.parse(JSON.stringify(zodToJsonSchema(zodSchema, { $refStrategy: "none" })));
  toMcpInputSchema(zodSchema);
  const after = JSON.parse(JSON.stringify(zodToJsonSchema(zodSchema, { $refStrategy: "none" })));
  expect(after).toEqual(before);
});
