// Original — no upstream. Tests for the find_by_property input schema — required field rules + polymorphic value union + cross-field superRefine + folder-traversal regex + defaults.
import { expect, test } from "vitest";

import { findByPropertyInputSchema } from "./schema.js";

// (1) Story 5 AC#1 — `property: ""` rejected (min(1) fires)
test("empty property rejected on path=['property'] with too_small", () => {
  const result = findByPropertyInputSchema.safeParse({ property: "", value: "x" });
  expect(result.success).toBe(false);
  if (!result.success) {
    const propIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["property"]));
    expect(propIssues.length).toBeGreaterThanOrEqual(1);
    expect(propIssues[0]!.code).toBe("too_small");
  }
});

// (2) Story 5 AC#2 — property omitted rejected
test("missing property rejected on path=['property'] with invalid_type", () => {
  const result = findByPropertyInputSchema.safeParse({ value: "x" });
  expect(result.success).toBe(false);
  if (!result.success) {
    const propIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["property"]));
    expect(propIssues.length).toBeGreaterThanOrEqual(1);
    expect(propIssues[0]!.code).toBe("invalid_type");
  }
});

// (3) Story 5 AC#3 — value omitted rejected
test("missing value rejected on path=['value'] with invalid_union", () => {
  const result = findByPropertyInputSchema.safeParse({ property: "id" });
  expect(result.success).toBe(false);
  if (!result.success) {
    const valIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["value"]));
    expect(valIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (4) Story 5 AC#4 — value: undefined rejected (equivalent to omitted)
test("value: undefined rejected (handled by required check)", () => {
  const result = findByPropertyInputSchema.safeParse({ property: "id", value: undefined });
  expect(result.success).toBe(false);
});

// (5) Story 5 AC#4 — value: object rejected (object not in union)
test("value: object rejected (not in scalar+array union)", () => {
  const result = findByPropertyInputSchema.safeParse({ property: "id", value: { foo: "bar" } });
  expect(result.success).toBe(false);
  if (!result.success) {
    const valIssues = result.error.issues.filter((i) => JSON.stringify(i.path).startsWith('["value"'));
    expect(valIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (6) Story 5 AC#4 — value: array rejected when arrayMatch defaults to true (superRefine)
test("array value rejected when arrayMatch is true (default) via superRefine", () => {
  const result = findByPropertyInputSchema.safeParse({ property: "tags", value: ["x"] });
  expect(result.success).toBe(false);
  if (!result.success) {
    const customIssues = result.error.issues.filter(
      (i) => i.code === "custom" && JSON.stringify(i.path) === JSON.stringify(["value"]),
    );
    expect(customIssues.length).toBeGreaterThanOrEqual(1);
    expect(customIssues[0]!.message).toContain("arrayMatch is true (default)");
  }
});

// (7) Story 3 AC#3 — value: array accepted when arrayMatch: false
test("array value accepted when arrayMatch: false", () => {
  const result = findByPropertyInputSchema.safeParse({
    property: "tags",
    value: ["x"],
    arrayMatch: false,
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
  const result = findByPropertyInputSchema.safeParse({ property: "p", value });
  expect(result.success).toBe(true);
});

// (9) Story 5 AC#5 — unknown top-level key rejected (.strict())
test("unknown top-level key rejected by .strict()", () => {
  const result = findByPropertyInputSchema.safeParse({
    property: "id",
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
  const result = findByPropertyInputSchema.safeParse({ property: "id", value: "x", folder: ".." });
  expect(result.success).toBe(false);
  if (!result.success) {
    const folderIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["folder"]));
    expect(folderIssues.length).toBeGreaterThanOrEqual(1);
    expect(folderIssues[0]!.message).toContain("..");
  }
});

// (11) Q2 — leading `..`
test("folder: '../foo' rejected (leading .. segment)", () => {
  const result = findByPropertyInputSchema.safeParse({ property: "id", value: "x", folder: "../foo" });
  expect(result.success).toBe(false);
});

// (12) Q2 — trailing `..`
test("folder: 'foo/..' rejected (trailing .. segment)", () => {
  const result = findByPropertyInputSchema.safeParse({ property: "id", value: "x", folder: "foo/.." });
  expect(result.success).toBe(false);
});

// (13) Q2 — middle `..`
test("folder: 'foo/../bar' rejected (middle .. segment)", () => {
  const result = findByPropertyInputSchema.safeParse({ property: "id", value: "x", folder: "foo/../bar" });
  expect(result.success).toBe(false);
});

// (14) Q2 — leading `/` (Unix-absolute)
test("folder: '/abs' rejected (leading Unix slash)", () => {
  const result = findByPropertyInputSchema.safeParse({ property: "id", value: "x", folder: "/abs" });
  expect(result.success).toBe(false);
});

// (15) Q2 — leading `\` (Windows-absolute)
test("folder: '\\abs' rejected (leading Windows backslash)", () => {
  const result = findByPropertyInputSchema.safeParse({ property: "id", value: "x", folder: "\\abs" });
  expect(result.success).toBe(false);
});

// (16) Regex word-boundary — '..foo' is part of a filename, not a path segment, accepted
test("folder: '..foo' accepted (not a .. path segment)", () => {
  const result = findByPropertyInputSchema.safeParse({ property: "id", value: "x", folder: "..foo" });
  expect(result.success).toBe(true);
});

// (17) Empty folder accepted (whole-vault search per FR-006)
test("folder: '' accepted (whole-vault search)", () => {
  const result = findByPropertyInputSchema.safeParse({ property: "id", value: "x", folder: "" });
  expect(result.success).toBe(true);
});

// (18) Defaults applied — arrayMatch and caseSensitive default to true
test("arrayMatch and caseSensitive default to true when omitted", () => {
  const result = findByPropertyInputSchema.parse({ property: "id", value: "x" });
  expect(result.arrayMatch).toBe(true);
  expect(result.caseSensitive).toBe(true);
});
