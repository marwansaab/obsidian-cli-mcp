// Original — no upstream. Tests for the shared schema-test utility (BI-058 F-C).
// Exercises every branch of walkSchema (object, array, primitive, null) and the
// countDescriptionKeys aggregate so the counted (non-test) module stays covered.
import { describe, expect, it } from "vitest";

import { countDescriptionKeys, walkSchema } from "./_schema-test-utils.js";

describe("walkSchema", () => {
  it("invokes fn on the root and every nested object, descending arrays", () => {
    const schema = {
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "object", properties: { c: { type: "number" } } },
      },
      anyOf: [{ const: 1 }, { const: 2 }],
    };
    const seen: string[] = [];
    walkSchema(schema, (n) => {
      if (typeof n.type === "string") seen.push(n.type);
    });
    expect(seen).toEqual(["object", "string", "object", "number"]);
  });

  it("ignores primitives and null without throwing", () => {
    const visited: unknown[] = [];
    walkSchema(null, (n) => visited.push(n));
    walkSchema(42, (n) => visited.push(n));
    walkSchema("str", (n) => visited.push(n));
    expect(visited).toEqual([]);
  });

  it("descends array elements that are themselves objects", () => {
    let count = 0;
    walkSchema([{ x: 1 }, [{ y: 2 }], 3, "s"], () => {
      count += 1;
    });
    expect(count).toBe(2);
  });
});

describe("countDescriptionKeys", () => {
  it("returns 0 when no node carries a description", () => {
    expect(countDescriptionKeys({ type: "object", properties: { a: { type: "string" } } })).toBe(0);
  });

  it("counts every nested description key", () => {
    const schema = {
      type: "object",
      description: "root",
      properties: {
        a: { type: "string", description: "a desc" },
        b: { type: "object", description: "b desc", properties: { c: { type: "number" } } },
      },
    };
    expect(countDescriptionKeys(schema)).toBe(3);
  });
});
