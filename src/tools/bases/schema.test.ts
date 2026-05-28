// Original — no upstream.
import { expect, test } from "vitest";

import { basesInputSchema, basesOutputSchema } from "./schema.js";
import { toMcpInputSchema } from "../_shared.js";

test("happy: empty input parses OK", () => {
  const r = basesInputSchema.safeParse({});
  expect(r.success).toBe(true);
});

test("happy: with optional vault", () => {
  const r = basesInputSchema.safeParse({ vault: "Work" });
  expect(r.success).toBe(true);
});

test("strict mode: unknown top-level key rejected", () => {
  const r = basesInputSchema.safeParse({ surprise: "x" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(
      r.error.issues.some(
        (i) => i.code === "unrecognized_keys" || i.path.includes("surprise"),
      ),
    ).toBe(true);
  }
});

test("vault min-length: empty vault string rejected", () => {
  const r = basesInputSchema.safeParse({ vault: "" });
  expect(r.success).toBe(false);
});

test("output: valid envelope accepted", () => {
  const r = basesOutputSchema.safeParse({
    bases: ["a.base", "b.base"],
    count: 2,
  });
  expect(r.success).toBe(true);
});

test("output: empty list accepted", () => {
  const r = basesOutputSchema.safeParse({ bases: [], count: 0 });
  expect(r.success).toBe(true);
});

test("output: count mismatch rejected (refine fires)", () => {
  const r = basesOutputSchema.safeParse({
    bases: ["a.base"],
    count: 5,
  });
  expect(r.success).toBe(false);
});

test("toMcpInputSchema emits expected shape", () => {
  const json = toMcpInputSchema(basesInputSchema) as Record<string, unknown>;
  expect(json.type).toBe("object");
  expect(json.additionalProperties).toBe(false);
  const props = json.properties as Record<string, unknown>;
  expect(Object.keys(props)).toEqual(["vault"]);
});
