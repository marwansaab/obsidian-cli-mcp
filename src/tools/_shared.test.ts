// Original — no upstream. Co-located tests for the tool aggregator's shared utilities (asToolError, toMcpInputSchema). Post-010: wrap-branch cases deleted alongside the helper itself (FR-005); the no-op path is now the only path. BI-034: adds tests for B64_PAYLOAD_DECODE_EXPR and composeEvalCode — the shared UTF-8-safe decoder snippet and Node-side base64 compose helper that fix the seven-tool atob+base64 silent-non-ASCII-lookup defect.
import { runInNewContext } from "node:vm";

import { test, expect } from "vitest";
import { z } from "zod";

import { asToolError, B64_PAYLOAD_DECODE_EXPR, composeEvalCode, toMcpInputSchema } from "./_shared.js";

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
  const result = runInNewContext(code, { TextDecoder, Uint8Array, atob }) as { hello: string; n: number };
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

test("toMcpInputSchema delegates to zodToJsonSchema and returns a flat object descriptor for a flat z.object input", () => {
  const zodSchema = z
    .object({
      command: z.string().min(1),
      vault: z.string().min(1).optional(),
    })
    .strict();
  const result = toMcpInputSchema(zodSchema);
  expect(result.type).toBe("object");
  expect(result.additionalProperties).toBe(false);
  const props = result.properties as Record<string, unknown>;
  expect(Object.keys(props).sort()).toEqual(["command", "vault"]);
  expect(result.required).toEqual(["command"]);
  expect(result.oneOf).toBeUndefined();
  expect(result.allOf).toBeUndefined();
  expect(result.anyOf).toBeUndefined();
});
