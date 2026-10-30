// Original — no upstream. Tests for the vaults input and output schemas (068 FR-036).
import { expect, test } from "vitest";
import { z } from "zod";

import { vaultsInputSchema, vaultsOutputSchema } from "./schema.js";

test("input: empty object accepted", () => {
  expect(vaultsInputSchema.safeParse({}).success).toBe(true);
});

test("input: any key rejected (strict)", () => {
  const r = vaultsInputSchema.safeParse({ vault: "Work" });
  expect(r.success).toBe(false);
  if (!r.success) expect(r.error.issues[0]!.code).toBe("unrecognized_keys");
});

test("input: published JSON Schema is an empty strict object", () => {
  const json = z.toJSONSchema(vaultsInputSchema, { io: "input", target: "draft-2020-12" }) as Record<string, unknown>;
  expect(json.type).toBe("object");
  expect(json.additionalProperties).toBe(false);
  expect(json.properties).toEqual({});
});

test("output: entries with open null and open boolean accepted", () => {
  const r = vaultsOutputSchema.safeParse({
    count: 2,
    vaults: [
      { name: "A", path: "/abs/a", open: null },
      { name: "B", path: "/abs/b", open: true },
    ],
  });
  expect(r.success).toBe(true);
});

test("output: empty list accepted", () => {
  expect(vaultsOutputSchema.safeParse({ count: 0, vaults: [] }).success).toBe(true);
});

test("output: count mismatch rejected (refine fires)", () => {
  expect(vaultsOutputSchema.safeParse({ count: 3, vaults: [] }).success).toBe(false);
});

test("output: an entry without open, or with an extra key, rejected", () => {
  expect(vaultsOutputSchema.safeParse({ count: 1, vaults: [{ name: "A", path: "/abs/a" }] }).success).toBe(false);
  expect(
    vaultsOutputSchema.safeParse({ count: 1, vaults: [{ name: "A", path: "/abs/a", open: null, extra: 1 }] }).success,
  ).toBe(false);
});

test("output: published JSON Schema has an object root with count and vaults", () => {
  const json = z.toJSONSchema(vaultsOutputSchema, { io: "output", target: "draft-2020-12" }) as Record<string, unknown>;
  expect(json.type).toBe("object");
  expect(json.required).toEqual(["count", "vaults"]);
});
