// Original — no upstream. query_base schema tests for grouped views (BI-0207): the optional `group_by` on the output envelope, the group-value eval answer schema, and the description's grouped-view claims.
import { expect, test } from "vitest";

import { queryBaseGroupValuesSchema, queryBaseInputSchema, queryBaseOutputSchema } from "./schema.js";

const ENVELOPE = { columns: ["path", "group"], rows: [{ path: "a.md", group: "one" }], truncated: false };

test("group_by is optional and takes a property and ASC or DESC", () => {
  expect(queryBaseOutputSchema.safeParse({ columns: ["path"], rows: [], truncated: false }).success).toBe(true);
  expect(queryBaseOutputSchema.safeParse({ ...ENVELOPE, group_by: { property: "note.status", direction: "ASC" } }).success).toBe(true);
  expect(queryBaseOutputSchema.safeParse({ ...ENVELOPE, group_by: { property: "note.status", direction: "DESC" } }).success).toBe(true);
});

test.each([
  ["an unknown direction", { property: "note.status", direction: "asc" }],
  ["an empty property", { property: "", direction: "ASC" }],
  ["an extra key", { property: "s", direction: "ASC", order: [] }],
])("group_by rejects %s", (_label, groupBy) => {
  expect(queryBaseOutputSchema.safeParse({ ...ENVELOPE, group_by: groupBy }).success).toBe(false);
});

test("the group-value answer schema accepts every value form, nested lists included", () => {
  const values = [
    null,
    { s: "x" },
    { n: 2.5 },
    { b: false },
    { d: 1, t: true, s: "2026-01-05T10:00:00", o: 0 },
    { l: "Proj", y: null, r: "Proj.md" },
    { a: [{ v: { s: "a" }, w: "a" }, { v: null, w: null }, { v: { a: [] } }] },
    { u: "object" },
  ];
  expect(queryBaseGroupValuesSchema.parse({ locale: "en-US", values })).toEqual({ locale: "en-US", values });
});

test.each([
  ["a missing locale", { values: [] }],
  ["an unknown value form", { locale: "en", values: [{ x: 1 }] }],
  ["a date missing its date-only time", { locale: "en", values: [{ d: 1, t: true, s: "x" }] }],
  ["a list element without v", { locale: "en", values: [{ a: [{ w: "a" }] }] }],
])("the group-value answer schema rejects %s", (_label, body) => {
  expect(queryBaseGroupValuesSchema.safeParse(body).success).toBe(false);
});

test("the description documents grouped views", () => {
  const desc = queryBaseInputSchema.description ?? "";
  expect(desc).toContain("group_by?: { property, direction }");
  expect(desc).toContain("reserved `group` key");
  expect(desc).toContain("`group_view`");
  expect(desc).toContain("GROUPING_UNSUPPORTED");
  expect(desc).toContain("An ungrouped view's response has no `group_by` and no `group`.");
});
