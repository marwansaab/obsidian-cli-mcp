// Original — no upstream. Co-located tests for the tool aggregator's shared utilities (asToolError, toMcpInputSchema). Post-010: wrap-branch cases deleted alongside the helper itself (FR-005); the no-op path is now the only path. BI-034: adds tests for B64_PAYLOAD_DECODE_EXPR and composeEvalCode — the shared UTF-8-safe decoder snippet and Node-side base64 compose helper that fix the seven-tool atob+base64 silent-non-ASCII-lookup defect. BI-067: adds per-rule fire + boundary no-fire tests for the normalizeToDraft7Parity pass inside toMcpInputSchema (contracts/descriptor-parity.contract.md § Test obligations); the FR-018 fingerprint baseline test remains the integration gate across all 34 real descriptors.
import { runInNewContext } from "node:vm";

import { test, expect } from "vitest";
import { z } from "zod";

import {
  asToolError,
  B64_PAYLOAD_DECODE_EXPR,
  composeEvalCode,
  toMcpInputSchema,
} from "./_shared.js";

test("asToolError returns the SDK error envelope with JSON-stringified payload", () => {
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

test("B64_PAYLOAD_DECODE_EXPR is a non-empty string carrying the __PAYLOAD_B64__ placeholder", () => {
  expect(typeof B64_PAYLOAD_DECODE_EXPR).toBe("string");
  expect(B64_PAYLOAD_DECODE_EXPR.length).toBeGreaterThan(0);
  expect(B64_PAYLOAD_DECODE_EXPR.includes("__PAYLOAD_B64__")).toBe(true);
});

test("B64_PAYLOAD_DECODE_EXPR does NOT contain the broken JSON.parse(atob( pattern (regression lock)", () => {
  // The legacy expression was `JSON.parse(atob('__PAYLOAD_B64__'))` which
  // Latin-1-interprets the UTF-8 byte stream post-base64. If anybody reintroduces
  // that substring inside the shared expression, every cohort consumer regresses.
  expect(B64_PAYLOAD_DECODE_EXPR.includes("JSON.parse(atob(")).toBe(false);
});

test("composeEvalCode round-trips ASCII payload through base64 substitution", () => {
  const template = `(()=>JSON.parse(${B64_PAYLOAD_DECODE_EXPR}))()`;
  const code = composeEvalCode(template, { hello: "world", n: 7 });
  expect(code.includes("__PAYLOAD_B64__")).toBe(false);
  const result = runInNewContext(code, { TextDecoder, Uint8Array, atob }) as {
    hello: string;
    n: number;
  };
  expect(result).toEqual({ hello: "world", n: 7 });
});

test("composeEvalCode round-trips non-ASCII payload (em-dash + accented + CJK + emoji) through base64 substitution", () => {
  const payload = {
    emDash: "café — naïve",
    cjk: "你好世界",
    emoji: "👋🌍",
    mixed: "TC-108 Round Trip Fixture — 5 KB",
  };
  const template = `(()=>JSON.parse(${B64_PAYLOAD_DECODE_EXPR}))()`;
  const code = composeEvalCode(template, payload);
  const result = runInNewContext(code, { TextDecoder, Uint8Array, atob }) as typeof payload;
  expect(result).toEqual(payload);
});

test("composeEvalCode preserves anti-injection — base64-only payload contains no JS metachars (R6 lock)", () => {
  const hostile = `'; doSomething(); //`;
  const template = `(()=>JSON.parse(${B64_PAYLOAD_DECODE_EXPR}))()`;
  const code = composeEvalCode(template, { value: hostile });
  const match = /atob\('([A-Za-z0-9+/=]+)'\)/.exec(code);
  expect(match).not.toBeNull();
  expect(/^[A-Za-z0-9+/=]+$/.test(match![1]!)).toBe(true);
  const result = runInNewContext(code, { TextDecoder, Uint8Array, atob }) as { value: string };
  expect(result.value).toBe(hostile);
});

test("composeEvalCode throws when the template lacks the __PAYLOAD_B64__ placeholder", () => {
  expect(() => composeEvalCode("(()=>'no placeholder')()", { x: 1 })).toThrow(
    /composeEvalCode: template is missing the __PAYLOAD_B64__ placeholder/,
  );
});

test("toMcpInputSchema returns a flat object descriptor for a flat strict-object input (untouched-shape control)", () => {
  const zodSchema = z.strictObject({
    command: z.string().min(1),
    vault: z.string().min(1).optional(),
  });
  const result = toMcpInputSchema(zodSchema);
  expect(result.type).toBe("object");
  expect(result.$schema).toBe("http://json-schema.org/draft-07/schema#");
  expect(result.additionalProperties).toBe(false);
  const props = result.properties as Record<string, unknown>;
  expect(Object.keys(props).sort()).toEqual(["command", "vault"]);
  expect(props.command).toEqual({ type: "string", minLength: 1 });
  expect(result.required).toEqual(["command"]);
  expect(result.oneOf).toBeUndefined();
  expect(result.allOf).toBeUndefined();
  expect(result.anyOf).toBeUndefined();
  expect(result.propertyNames).toBeUndefined();
});

// =====================================================================
// BI-067 — descriptor-parity normalizer, per-rule fire + boundary tests
// (contracts/descriptor-parity.contract.md § Test obligations). Every
// fixture goes through the public toMcpInputSchema pipeline; the
// normalizer itself stays private to _shared.ts.
// =====================================================================

function propOf(
  result: ReturnType<typeof toMcpInputSchema>,
  name: string,
): Record<string, unknown> {
  const props = result.properties as Record<string, Record<string, unknown>>;
  return props[name]!;
}

test("BI-067 N1 fires: plain-string-key record loses the zod-4 propertyNames stamp", () => {
  const result = toMcpInputSchema(z.strictObject({ parameters: z.record(z.string(), z.string()) }));
  const parameters = propOf(result, "parameters");
  expect(parameters.type).toBe("object");
  expect(parameters.propertyNames).toBeUndefined();
  expect(parameters.additionalProperties).toEqual({ type: "string" });
});

test("BI-067 N1 boundary: checked-key record keeps its propertyNames sub-schema", () => {
  const result = toMcpInputSchema(
    z.strictObject({ parameters: z.record(z.string().min(1), z.string()) }),
  );
  const parameters = propOf(result, "parameters");
  expect(parameters.propertyNames).toEqual({ type: "string", minLength: 1 });
});

test("BI-067 N1b fires: looseObject additionalProperties {} becomes true", () => {
  const result = toMcpInputSchema(
    z.strictObject({ frontmatter: z.looseObject({ title: z.string() }) }),
  );
  const frontmatter = propOf(result, "frontmatter");
  expect(frontmatter.additionalProperties).toBe(true);
});

test("BI-067 N1b boundary: record-of-unknown keeps additionalProperties {} (propertyNames marker disambiguates)", () => {
  const result = toMcpInputSchema(z.strictObject({ value: z.record(z.string(), z.unknown()) }));
  const value = propOf(result, "value");
  expect(value.propertyNames).toBeUndefined(); // N1 fired…
  expect(value.additionalProperties).toEqual({}); // …so N1b must NOT
});

test("BI-067 N1b boundary: checked-key record-of-unknown keeps additionalProperties {} (surviving propertyNames blocks N1b)", () => {
  const result = toMcpInputSchema(
    z.strictObject({ value: z.record(z.string().min(1), z.unknown()) }),
  );
  const value = propOf(result, "value");
  expect(value.propertyNames).toEqual({ type: "string", minLength: 1 }); // N1 must not fire…
  expect(value.additionalProperties).toEqual({}); // …and the propertyNames guard blocks N1b
});

test("BI-067 N2 fires: all-primitive bare union collapses to a type array, order preserved", () => {
  const result = toMcpInputSchema(
    z.strictObject({ value: z.union([z.string(), z.number(), z.boolean()]) }),
  );
  const value = propOf(result, "value");
  expect(value.anyOf).toBeUndefined();
  expect(value.type).toEqual(["string", "number", "boolean"]);
});

test("BI-067 N2 boundary: mixed union stays anyOf", () => {
  const result = toMcpInputSchema(
    z.strictObject({ value: z.union([z.string(), z.strictObject({ a: z.string() })]) }),
  );
  const value = propOf(result, "value");
  expect(value.type).toBeUndefined();
  expect(Array.isArray(value.anyOf)).toBe(true);
  expect((value.anyOf as unknown[]).length).toBe(2);
});

test("BI-067 N3 fires: unbounded int loses the ±MAX_SAFE_INTEGER sentinel bounds", () => {
  const result = toMcpInputSchema(z.strictObject({ depth: z.number().int() }));
  const depth = propOf(result, "depth");
  expect(depth.type).toBe("integer");
  expect(depth.maximum).toBeUndefined();
  expect(depth.minimum).toBeUndefined();
});

test("BI-067 N3 boundary: hand-authored explicit int bounds survive", () => {
  const result = toMcpInputSchema(z.strictObject({ depth: z.number().int().min(0).max(10) }));
  const depth = propOf(result, "depth");
  expect(depth.type).toBe("integer");
  expect(depth.minimum).toBe(0);
  expect(depth.maximum).toBe(10);
});

test("BI-067 N4 fires: discriminated-union oneOf is renamed anyOf (values untouched)", () => {
  const result = toMcpInputSchema(
    z.strictObject({
      target: z.discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("a"), x: z.string() }),
        z.strictObject({ kind: z.literal("b"), y: z.number() }),
      ]),
    }),
  );
  const target = propOf(result, "target");
  expect(target.oneOf).toBeUndefined();
  expect(Array.isArray(target.anyOf)).toBe(true);
  expect((target.anyOf as unknown[]).length).toBe(2);
});

test("BI-067 walk boundary: fields literally named like JSON Schema keywords survive (properties is a field-name→schema map, not a schema node)", () => {
  // PR #78 review, probe-proven: the pre-fix walk applied normalizeNode to the
  // properties map itself, so a field named `propertyNames` was deleted by N1
  // (while staying in `required`) and one named `oneOf` was renamed by N4.
  const result = toMcpInputSchema(
    z.strictObject({ propertyNames: z.string(), oneOf: z.string().optional() }),
  );
  const props = result.properties as Record<string, unknown>;
  expect(Object.keys(props).sort()).toEqual(["oneOf", "propertyNames"]);
  expect(props.propertyNames).toEqual({ type: "string" });
  expect(props.oneOf).toEqual({ type: "string" });
  expect(result.required).toEqual(["propertyNames"]);
});

test("BI-067 io:'input' semantics: a defaulted optional field is NOT marked required", () => {
  const result = toMcpInputSchema(
    z.strictObject({ path: z.string(), format: z.string().optional().default("json") }),
  );
  expect(result.required).toEqual(["path"]);
  expect(propOf(result, "format").default).toBe("json");
});
