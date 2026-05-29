// Original — no upstream. Co-located vitest cases for the schema-stripping utility (FR-017: 4 minimum + 2 recommended + 1 C2 remediation).
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { stripSchemaDescriptions, type JsonSchemaObject } from "./strip-schema.js";

describe("stripSchemaDescriptions", () => {
  it("strips description from every property of a flat schema (Story 1 AC#1)", () => {
    const schema = z.object({
      name: z.string().describe("a person's name"),
      age: z.number().int().describe("their age in years"),
    });
    const raw = zodToJsonSchema(schema, { $refStrategy: "none" }) as JsonSchemaObject;
    expect((raw.properties?.name as JsonSchemaObject).description).toBe("a person's name");

    const result = stripSchemaDescriptions(raw);

    expect((result.properties?.name as JsonSchemaObject).description).toBeUndefined();
    expect((result.properties?.age as JsonSchemaObject).description).toBeUndefined();
    expect((result.properties?.name as JsonSchemaObject).type).toBe("string");
    expect((result.properties?.age as JsonSchemaObject).type).toBe("integer");
    expect(result.required).toEqual(["name", "age"]);
  });

  it("strips description recursively from nested schemas (Story 1 AC#2)", () => {
    const schema = z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("a"),
        items: z.array(z.object({ id: z.string().describe("inner id") })),
      }),
      z.object({
        kind: z.literal("b"),
        other: z.string().describe("other field"),
      }),
    ]);
    const raw = zodToJsonSchema(schema, { $refStrategy: "none" }) as JsonSchemaObject;
    expect(JSON.stringify(raw).includes("description")).toBe(true);

    const result = stripSchemaDescriptions(raw);

    expect(JSON.stringify(result).includes('"description"')).toBe(false);
  });

  it("returns a structurally-equivalent schema when input has no descriptions (Story 1 AC#3)", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().int(),
    });
    const raw = zodToJsonSchema(schema, { $refStrategy: "none" }) as JsonSchemaObject;

    const result = stripSchemaDescriptions(raw);

    expect(JSON.stringify(result)).toBe(JSON.stringify(raw));
  });

  it("does not mutate its input — input deep-equals snapshot post-call (Story 1 AC#4, FR-005)", () => {
    const schema = z.object({
      field: z.string().describe("a field"),
    });
    const raw = zodToJsonSchema(schema, { $refStrategy: "none" }) as JsonSchemaObject;
    const snapshot = structuredClone(raw);

    stripSchemaDescriptions(raw);

    expect(raw).toEqual(snapshot);
    expect((raw.properties?.field as JsonSchemaObject).description).toBe("a field");
  });

  it("preserves all structural keys (type, enum, anyOf, items, additionalProperties, pattern, default, minLength) (Story 1 AC#6, FR-004)", () => {
    const raw: JsonSchemaObject = {
      type: "object",
      additionalProperties: false,
      required: ["status", "tags"],
      properties: {
        status: {
          type: "string",
          enum: ["active", "inactive"],
          description: "to be stripped",
          default: "active",
        },
        tags: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            pattern: "^[a-z]+$",
            description: "to be stripped",
          },
        },
        flexible: {
          anyOf: [
            { type: "string", description: "to be stripped" },
            { type: "number", description: "to be stripped" },
          ],
        },
      },
    };

    const result = stripSchemaDescriptions(raw);

    expect(result.type).toBe("object");
    expect(result.additionalProperties).toBe(false);
    expect(result.required).toEqual(["status", "tags"]);
    const status = result.properties?.status as JsonSchemaObject;
    expect(status.enum).toEqual(["active", "inactive"]);
    expect(status.default).toBe("active");
    expect(status.description).toBeUndefined();
    const tags = result.properties?.tags as JsonSchemaObject;
    const tagsItems = tags.items as JsonSchemaObject;
    expect(tagsItems.minLength).toBe(1);
    expect(tagsItems.pattern).toBe("^[a-z]+$");
    expect(tagsItems.description).toBeUndefined();
    const flexibleBranches = (result.properties?.flexible as JsonSchemaObject).anyOf as JsonSchemaObject[];
    expect(flexibleBranches[0]?.type).toBe("string");
    expect(flexibleBranches[0]?.description).toBeUndefined();
    expect(flexibleBranches[1]?.type).toBe("number");
    expect(flexibleBranches[1]?.description).toBeUndefined();
  });

  it("strips description from every element of tuple-form (array) items (FR-002 + FR-004, L44-48 branch)", () => {
    const raw: JsonSchemaObject = {
      type: "array",
      items: [
        { type: "string", description: "a" },
        { type: "number", description: "b" },
        {
          type: "object",
          properties: {
            nested: { type: "string", description: "deep within a tuple element" },
          },
        },
      ],
    };

    const result = stripSchemaDescriptions(raw);

    const items = result.items as JsonSchemaObject[];
    expect(Array.isArray(items)).toBe(true);
    expect(items[0]?.type).toBe("string");
    expect(items[0]?.description).toBeUndefined();
    expect(items[1]?.type).toBe("number");
    expect(items[1]?.description).toBeUndefined();
    const tupleObject = items[2] as JsonSchemaObject;
    expect((tupleObject.properties?.nested as JsonSchemaObject).type).toBe("string");
    expect((tupleObject.properties?.nested as JsonSchemaObject).description).toBeUndefined();
    expect(JSON.stringify(result).includes('"description"')).toBe(false);
  });

  it("strips description regardless of value type (non-string description Edge Case)", () => {
    const raw: JsonSchemaObject = {
      type: "object",
      properties: {
        foo: { type: "string", description: { malformed: "object" } as unknown as string },
      },
    };

    const result = stripSchemaDescriptions(raw);

    expect((result.properties?.foo as JsonSchemaObject).description).toBeUndefined();
  });

  it("preserves the root-level description while stripping nested ones (FR-003 + Edge Case 'root description preservation', remediation C2)", () => {
    const schema = z
      .object({
        inner: z.string().describe("inner field"),
      })
      .describe("root description goes here");
    const raw = zodToJsonSchema(schema, { $refStrategy: "none" }) as JsonSchemaObject;
    expect(raw.description).toBe("root description goes here");

    const result = stripSchemaDescriptions(raw);

    expect(result.description).toBe("root description goes here");
    expect((result.properties?.inner as JsonSchemaObject).description).toBeUndefined();
  });
});
