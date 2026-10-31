// Original — no upstream. Tests for the find_by_property input schema — required field rules + polymorphic value union + cross-field superRefine + folder-traversal regex + defaults.
import { describe, expect, it, test } from "vitest";

import { FIND_BY_PROPERTY_RENAMES, findByPropertyInputSchema } from "./schema.js";
import { deprecatedAliasCases } from "../_deprecated-params-test-cases.js";

// (1) Story 5 AC#1 — `name: ""` rejected (min(1) fires)
test("empty name rejected on path=['name'] with too_small", () => {
  const result = findByPropertyInputSchema.safeParse({ name: "", value: "x" });
  expect(result.success).toBe(false);
  if (!result.success) {
    const propIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["name"]));
    expect(propIssues.length).toBeGreaterThanOrEqual(1);
    expect(propIssues[0]!.code).toBe("too_small");
  }
});

// (2) Story 5 AC#2 / spec 073 O5 — name (and the deprecated property) omitted rejected
test("missing name rejected on path=['name'] with 'name is required'", () => {
  const result = findByPropertyInputSchema.safeParse({ value: "x" });
  expect(result.success).toBe(false);
  expect(result.error?.issues).toEqual([
    expect.objectContaining({ path: ["name"], message: "name is required" }),
  ]);
});

// (3) Story 5 AC#3 — value omitted rejected
test("missing value rejected on path=['value'] with invalid_union", () => {
  const result = findByPropertyInputSchema.safeParse({ name: "id" });
  expect(result.success).toBe(false);
  if (!result.success) {
    const valIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["value"]));
    expect(valIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (4) Story 5 AC#4 — value: undefined rejected (equivalent to omitted)
test("value: undefined rejected (handled by required check)", () => {
  const result = findByPropertyInputSchema.safeParse({ name: "id", value: undefined });
  expect(result.success).toBe(false);
});

// (5) Story 5 AC#4 — value: object rejected (object not in union)
test("value: object rejected (not in scalar+array union)", () => {
  const result = findByPropertyInputSchema.safeParse({ name: "id", value: { foo: "bar" } });
  expect(result.success).toBe(false);
  if (!result.success) {
    const valIssues = result.error.issues.filter((i) => JSON.stringify(i.path).startsWith('["value"'));
    expect(valIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (6) Story 5 AC#4 — value: array rejected when array_match defaults to true (superRefine)
test("array value rejected when array_match is true (default) via superRefine", () => {
  const result = findByPropertyInputSchema.safeParse({ name: "tags", value: ["x"] });
  expect(result.success).toBe(false);
  if (!result.success) {
    const customIssues = result.error.issues.filter(
      (i) => i.code === "custom" && JSON.stringify(i.path) === JSON.stringify(["value"]),
    );
    expect(customIssues.length).toBeGreaterThanOrEqual(1);
    expect(customIssues[0]!.message).toBe(
      "value cannot be an array when array_match is true (default); pass a scalar for contains semantics, or set array_match: false for exact-equality.",
    );
  }
});

// (7) Story 3 AC#3 — value: array accepted when array_match: false
test("array value accepted when array_match: false", () => {
  const result = findByPropertyInputSchema.safeParse({
    name: "tags",
    value: ["x"],
    array_match: false,
  });
  expect(result.success).toBe(true);
});

// (8) Each scalar value type accepted (string, number, boolean, null)
test.each<[string, unknown]>([
  ["string", "x"],
  ["number-zero", 0],
  ["number-positive", 7],
  ["boolean-true", true],
  ["boolean-false", false],
  ["null", null],
])("scalar value type accepted: %s", (_label, value) => {
  const result = findByPropertyInputSchema.safeParse({ name: "p", value });
  expect(result.success).toBe(true);
});

// (9) Story 5 AC#5 — unknown top-level key rejected (.strict())
test("unknown top-level key rejected by .strict()", () => {
  const result = findByPropertyInputSchema.safeParse({
    name: "id",
    value: "x",
    foo: "bar",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const unrecognized = result.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as { keys: string[] }).keys).toContain("foo");
  }
});

// (10) Story 6 AC#1 / Q2 — folder: ".." rejected (path-traversal escape)
test("folder: '..' rejected on path=['folder']", () => {
  const result = findByPropertyInputSchema.safeParse({ name: "id", value: "x", folder: ".." });
  expect(result.success).toBe(false);
  if (!result.success) {
    const folderIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["folder"]));
    expect(folderIssues.length).toBeGreaterThanOrEqual(1);
    expect(folderIssues[0]!.message).toContain("..");
  }
});

// (11) Q2 — leading `..`
test("folder: '../foo' rejected (leading .. segment)", () => {
  const result = findByPropertyInputSchema.safeParse({ name: "id", value: "x", folder: "../foo" });
  expect(result.success).toBe(false);
});

// (12) Q2 — trailing `..`
test("folder: 'foo/..' rejected (trailing .. segment)", () => {
  const result = findByPropertyInputSchema.safeParse({ name: "id", value: "x", folder: "foo/.." });
  expect(result.success).toBe(false);
});

// (13) Q2 — middle `..`
test("folder: 'foo/../bar' rejected (middle .. segment)", () => {
  const result = findByPropertyInputSchema.safeParse({ name: "id", value: "x", folder: "foo/../bar" });
  expect(result.success).toBe(false);
});

// (14) Q2 — leading `/` (Unix-absolute)
test("folder: '/abs' rejected (leading Unix slash)", () => {
  const result = findByPropertyInputSchema.safeParse({ name: "id", value: "x", folder: "/abs" });
  expect(result.success).toBe(false);
});

// (15) Q2 — leading `\` (Windows-absolute)
test("folder: '\\abs' rejected (leading Windows backslash)", () => {
  const result = findByPropertyInputSchema.safeParse({ name: "id", value: "x", folder: "\\abs" });
  expect(result.success).toBe(false);
});

// (16) Regex word-boundary — '..foo' is part of a filename, not a path segment, accepted
test("folder: '..foo' accepted (not a .. path segment)", () => {
  const result = findByPropertyInputSchema.safeParse({ name: "id", value: "x", folder: "..foo" });
  expect(result.success).toBe(true);
});

// (17) Empty folder accepted (whole-vault search per FR-006)
test("folder: '' accepted (whole-vault search)", () => {
  const result = findByPropertyInputSchema.safeParse({ name: "id", value: "x", folder: "" });
  expect(result.success).toBe(true);
});

// (18) Defaults applied — array_match and case_sensitive default to true
test("array_match and case_sensitive default to true when omitted (spec 073 O1: no notice)", () => {
  const result = findByPropertyInputSchema.parse({ name: "id", value: "x" });
  expect(result).toEqual({ name: "id", value: "x", array_match: true, case_sensitive: true });
  expect("deprecated_parameters" in result).toBe(false);
});

describe("spec 073 — deprecated names", () => {
  // O2 — each old name parses to the same normalised input as its new-name twin, plus the notice
  const cases = deprecatedAliasCases(
    FIND_BY_PROPERTY_RENAMES,
    { vault: "V", name: "id", value: "x", folder: "F" },
    { name: "id", array_match: false, case_sensitive: false },
  );
  it.each(cases.equivalence)("O2: $old parses like its replacement, plus the notice", ({ viaOld, viaNew, notice }) => {
    expect(findByPropertyInputSchema.parse(viaOld)).toEqual({
      ...findByPropertyInputSchema.parse(viaNew),
      deprecated_parameters: [notice],
    });
  });

  it("O2: every old name at once lists them all in rename-table order", () => {
    const result = findByPropertyInputSchema.parse({ caseSensitive: true, arrayMatch: true, property: "id", value: "x" });
    expect(result.deprecated_parameters).toEqual([
      { parameter: "property", replacement: "name" },
      { parameter: "arrayMatch", replacement: "array_match" },
      { parameter: "caseSensitive", replacement: "case_sensitive" },
    ]);
  });

  // O4 — old + new for one concept rejected, even with equal values
  it.each(cases.conflict)("O4: $old alongside its replacement → one conflict issue at [old]", ({ input, issue }) => {
    const result = findByPropertyInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([expect.objectContaining(issue)]);
  });

  // O6 — the array check runs on the resolved value and names array_match
  it("O6: array value with the deprecated arrayMatch defaulted still names array_match", () => {
    const result = findByPropertyInputSchema.safeParse({ property: "tags", value: ["x"], arrayMatch: true });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ["value"], message: expect.stringContaining("array_match is true") }),
    ]);
    expect(findByPropertyInputSchema.safeParse({ property: "tags", value: ["x"], arrayMatch: false }).success).toBe(true);
  });

  it("published JSON Schema: both names, old keys deprecated, required = [value], no defaults on the new booleans", () => {
    const json = findByPropertyInputSchema["~standard"].jsonSchema.input({ target: "draft-2020-12" });
    const props = json["properties"] as Record<string, Record<string, unknown>>;
    expect(Object.keys(props)).toEqual([
      "vault", "name", "property", "value", "folder", "array_match", "arrayMatch", "case_sensitive", "caseSensitive",
    ]);
    expect(json["required"]).toEqual(["value"]);
    expect(props["name"]!["description"]).toBe(
      'Frontmatter property name to match, matched exactly (e.g. "status"). Required (or the deprecated property).',
    );
    expect(props["case_sensitive"]!["description"]).toBe("Match case exactly when true. Default true.");
    for (const { old, replacement } of FIND_BY_PROPERTY_RENAMES) {
      expect(props[old]).toMatchObject({
        deprecated: true,
        description: `Deprecated: use ${replacement} (accepted until the next major release).`,
      });
    }
    expect(props["array_match"]).not.toHaveProperty("default");
    expect(props["case_sensitive"]).not.toHaveProperty("default");
  });
});
