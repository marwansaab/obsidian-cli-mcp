// Original — no upstream. Co-located tests for the tool aggregator's shared utilities (asToolError, toMcpInputSchema). Post-010: wrap-branch cases deleted alongside the helper itself (FR-005); the no-op path is now the only path.
import { test, expect } from "vitest";
import { z } from "zod";

import { asToolError, toMcpInputSchema } from "./_shared.js";

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
