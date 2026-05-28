// Original — no upstream.
import { expect, test } from "vitest";

import { viewsBaseInputSchema, viewsBaseOutputSchema } from "./schema.js";
import { toMcpInputSchema } from "../_shared.js";

test("happy: empty input parses OK", () => {
  const r = viewsBaseInputSchema.safeParse({});
  expect(r.success).toBe(true);
});

test("happy: with optional vault", () => {
  const r = viewsBaseInputSchema.safeParse({ vault: "Work" });
  expect(r.success).toBe(true);
});

test("strict mode: unknown top-level key rejected", () => {
  const r = viewsBaseInputSchema.safeParse({ surprise: "x" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(
      r.error.issues.some(
        (i) => i.code === "unrecognized_keys" || i.path.includes("surprise"),
      ),
    ).toBe(true);
  }
});

test("strict mode: path field rejected (active-mode-only, no path accepted)", () => {
  const r = viewsBaseInputSchema.safeParse({ path: "foo.base" });
  expect(r.success).toBe(false);
});

test("vault min-length: empty vault string rejected", () => {
  const r = viewsBaseInputSchema.safeParse({ vault: "" });
  expect(r.success).toBe(false);
});

test("output: valid envelope accepted", () => {
  const r = viewsBaseOutputSchema.safeParse({
    views: ["All", "Active"],
    count: 2,
  });
  expect(r.success).toBe(true);
});

test("output: empty list accepted", () => {
  const r = viewsBaseOutputSchema.safeParse({ views: [], count: 0 });
  expect(r.success).toBe(true);
});

test("output: count mismatch rejected (refine fires)", () => {
  const r = viewsBaseOutputSchema.safeParse({
    views: ["All"],
    count: 5,
  });
  expect(r.success).toBe(false);
});

test("toMcpInputSchema emits expected shape", () => {
  const json = toMcpInputSchema(viewsBaseInputSchema) as Record<string, unknown>;
  expect(json.type).toBe("object");
  expect(json.additionalProperties).toBe(false);
  const props = json.properties as Record<string, unknown>;
  expect(Object.keys(props)).toEqual(["vault"]);
});
