// Original — no upstream. Tests for the shared schema-test utility (BI-058 F-C).
// Exercises every branch of undescribedProperties (properties, items, union branches,
// additionalProperties, primitives) and messageForPath (BI-067 / PR #78 review) so the
// counted (non-test) module stays covered.
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { messageForPath, undescribedProperties } from "./_schema-test-utils.js";

describe("undescribedProperties", () => {
  it("reports undescribed properties in nested objects, array items and union branches", () => {
    const schema = {
      type: "object",
      properties: {
        ok: { type: "string", description: "described" },
        bare: { type: "string" },
        nested: { type: "object", description: "d", properties: { inner: { type: "string" } } },
        list: {
          type: "array",
          description: "d",
          items: { type: "object", properties: { item: { type: "number", description: "  " } } },
        },
        either: { description: "d", anyOf: [{ type: "object", properties: { branch: { type: "boolean" } } }] },
      },
    };
    expect(undescribedProperties(schema, "t")).toEqual([
      "t.bare",
      "t.nested.inner",
      "t.list[].item",
      "t.either/anyOf/0.branch",
    ]);
  });

  it("walks tuple items and additionalProperties, and treats a field named like a keyword as a field", () => {
    const schema = {
      type: "object",
      properties: {
        description: { type: "string" },
        tuple: { description: "d", items: [{ type: "object", properties: { first: { type: "string" } } }] },
        map: { description: "d", additionalProperties: { type: "object", properties: { value: { type: "number" } } } },
      },
    };
    expect(undescribedProperties(schema, "t")).toEqual(["t.description", "t.tuple[].first", "t.map{}.value"]);
  });

  it("returns nothing for primitives, null and a fully described schema", () => {
    expect(undescribedProperties(null, "t")).toEqual([]);
    expect(undescribedProperties(42, "t")).toEqual([]);
    expect(undescribedProperties({ type: "object", properties: { a: { type: "string", description: "a" } } }, "t")).toEqual([]);
  });
});

describe("messageForPath", () => {
  const schema = z.strictObject({ a: z.string(), b: z.number() });

  it("returns undefined on a successful parse", () => {
    expect(messageForPath(schema.safeParse({ a: "x", b: 1 }), "a")).toBeUndefined();
  });

  it("returns the first issue message anchored at the named top-level field", () => {
    const r = schema.safeParse({ a: 42, b: 1 });
    expect(messageForPath(r, "a")).toMatch(/expected string/i);
  });

  it("returns undefined when no issue sits at the named field", () => {
    const r = schema.safeParse({ a: 42, b: 1 });
    expect(messageForPath(r, "b")).toBeUndefined();
  });
});
