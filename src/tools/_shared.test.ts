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

// ---------------------------------------------------------------------------
// Feature 009 widening — four new cases per research R12. The wrap branch now
// emits a top-level `properties` map (union of branch property names, leaf-`{}`
// widened, with cross-branch string discriminators surfaced as { type: "string" })
// and a top-level `required` array (intersection across branches, UNION'd with
// extras-arm required keys for Pattern (a) inputs). Strict-naive MCP clients
// (e.g. Cowork) read top-level `properties` and let property names through;
// strict-rich clients additionally read `oneOf`. The runtime zod stays the
// single source of truth for cross-field rules.
// ---------------------------------------------------------------------------

test("toMcpInputSchema widens a discriminated union to expose union-of-properties at top level (R12 case 1 — simple union)", () => {
  const zodSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a"), aField: z.string() }).passthrough(),
    z.object({ kind: z.literal("b"), bField: z.number() }).passthrough(),
  ]);
  const result = toMcpInputSchema(zodSchema);
  expect(result.type).toBe("object");
  expect(result.additionalProperties).toBe(true);
  const props = result.properties as Record<string, Record<string, unknown>>;
  // top-level properties = union of branch properties
  expect(Object.keys(props).sort()).toEqual(["aField", "bField", "kind"]);
  // discriminator: present in every branch with type === "string" → widened to { type: "string" }
  expect(props.kind).toEqual({ type: "string" });
  // non-discriminator keys: leaf-`{}` widening (per-branch shape lives in oneOf)
  expect(props.aField).toEqual({});
  expect(props.bField).toEqual({});
  // required = intersection: aField/bField each only required in their own branch, kind in both
  expect(result.required).toEqual(["kind"]);
  // oneOf preserved with inner type:"object" stripped
  const oneOf = result.oneOf as Array<Record<string, unknown>>;
  expect(oneOf).toHaveLength(2);
  expect(oneOf[0]!.type).toBeUndefined();
  expect(oneOf[1]!.type).toBeUndefined();
});

test("toMcpInputSchema widens a ZodEffects<ZodDiscriminatedUnion> (targetModeSchema-shape) (R12 case 2)", () => {
  // Empirically the same shape as Kind B / Kind C (R5) — superRefine doesn't
  // change the JSON Schema output. This is the read_note tool's actual
  // registered schema; the Cowork bug fix turns on this case widening correctly.
  const baseUnion = z.discriminatedUnion("target_mode", [
    z
      .object({
        target_mode: z.literal("specific"),
        vault: z.string().min(1),
        file: z.string().optional(),
        path: z.string().optional(),
      })
      .passthrough(),
    z.object({ target_mode: z.literal("active") }).passthrough(),
  ]);
  const zodSchema = baseUnion.superRefine(() => {});
  const result = toMcpInputSchema(zodSchema);
  expect(result.type).toBe("object");
  expect(result.additionalProperties).toBe(true);
  const props = result.properties as Record<string, Record<string, unknown>>;
  // The four target-mode property names MUST appear at top level — this is
  // exactly what strict-naive clients (Cowork) need to keep through their
  // outgoing-argument stripping pass.
  expect(Object.keys(props).sort()).toEqual(["file", "path", "target_mode", "vault"]);
  expect(props.target_mode).toEqual({ type: "string" });
  expect(props.vault).toEqual({});
  expect(props.file).toEqual({});
  expect(props.path).toEqual({});
  // Only target_mode is required across both branches → intersection is ["target_mode"].
  expect(result.required).toEqual(["target_mode"]);
  const oneOf = result.oneOf as Array<Record<string, unknown>>;
  expect(oneOf).toHaveLength(2);
  // Discriminator literals stay inside the oneOf arms for strict-rich clients.
  const discriminators = oneOf
    .map((b) => ((b.properties as Record<string, Record<string, unknown>>).target_mode?.const as string) ?? "")
    .sort();
  expect(discriminators).toEqual(["active", "specific"]);
});

test("toMcpInputSchema walks both arms of allOf for Pattern (a) intersection (R12 case 3 — targetModeSchema.and(extras))", () => {
  const baseUnion = z.discriminatedUnion("target_mode", [
    z
      .object({
        target_mode: z.literal("specific"),
        vault: z.string().min(1),
        file: z.string().optional(),
        path: z.string().optional(),
      })
      .passthrough(),
    z.object({ target_mode: z.literal("active") }).passthrough(),
  ]);
  const targetMode = baseUnion.superRefine(() => {});
  const zodSchema = targetMode.and(z.object({ note_text: z.string() }));
  const result = toMcpInputSchema(zodSchema);
  expect(result.type).toBe("object");
  expect(result.additionalProperties).toBe(true);
  const props = result.properties as Record<string, Record<string, unknown>>;
  // Union of branch properties (target_mode, vault, file, path) merged with
  // extras-arm properties (note_text).
  expect(Object.keys(props).sort()).toEqual(["file", "note_text", "path", "target_mode", "vault"]);
  expect(props.target_mode).toEqual({ type: "string" });
  // Extras-arm contributions get leaf-`{}` widening (no discriminator special case).
  expect(props.note_text).toEqual({});
  // required = intersection-of-branches (["target_mode"]) UNION extras-required (["note_text"]).
  expect(result.required).toEqual(expect.arrayContaining(["target_mode", "note_text"]));
  expect((result.required as string[]).length).toBe(2);
  // oneOf has the two discriminated-union branches.
  const oneOf = result.oneOf as Array<Record<string, unknown>>;
  expect(oneOf).toHaveLength(2);
  // allOf preserves the extras arm verbatim (so strict-rich clients can still
  // apply the note_text constraint conjunctively with the discriminator).
  const allOf = result.allOf as Array<Record<string, unknown>>;
  expect(Array.isArray(allOf)).toBe(true);
  expect(allOf).toHaveLength(1);
  expect((allOf[0]!.properties as Record<string, unknown>).note_text).toBeDefined();
  expect(allOf[0]!.required).toEqual(["note_text"]);
});

test("toMcpInputSchema does not widen flat z.object schemas (R12 case 4 — obsidian_exec-shape regression guard)", () => {
  // The flat-z.object case hits the no-op branch — the widening MUST NOT fire.
  // obsidian_exec's published shape is byte-stable from 0.2.0 across this fix.
  const zodSchema = z
    .object({
      command: z.string().min(1),
      parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      vault: z.string().min(1).optional(),
      flags: z.array(z.string().min(1)).optional(),
      copy: z.boolean().optional(),
      timeoutMs: z.number().int().positive().max(120000).optional(),
    })
    .strict();
  const before = JSON.parse(JSON.stringify(zodToJsonSchema(zodSchema, { $refStrategy: "none" })));
  const result = toMcpInputSchema(zodSchema);
  expect(result.type).toBe("object");
  // .strict() → additionalProperties: false; the widening's true MUST NOT leak in.
  expect(result.additionalProperties).toBe(false);
  expect(Object.keys(result.properties as Record<string, unknown>).sort()).toEqual(
    ["command", "copy", "flags", "parameters", "timeoutMs", "vault"],
  );
  expect(result.required).toEqual(["command"]);
  expect(result.oneOf).toBeUndefined();
  expect(result.allOf).toBeUndefined();
  // Byte-stable: the helper's output equals the raw zodToJsonSchema output
  // (modulo shallow-copy reference identity).
  expect(JSON.parse(JSON.stringify(result))).toEqual(before);
});
