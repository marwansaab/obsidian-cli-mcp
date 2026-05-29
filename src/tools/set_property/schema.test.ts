// Original — no upstream. Tests for the set_property input schema — 17 cases per data-model.md test inventory covering target-mode happy paths, locator XOR, name min(1), value union (incl. negative cases for null/object/heterogeneous-array), six-label type enum, active-mode forbidden keys, and strict-mode unknown-key rejection.
import { describe, expect, it, test } from "vitest";

import { targetModeWiringCases } from "../_target-mode-test-cases.js";
import { setPropertyInputSchema } from "./schema.js";

// (1) specific + path happy path
test("specific+path happy (US1#1)", () => {
  const result = setPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "notes/x.md",
    name: "status",
    value: "shipped",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data).toMatchObject({
      target_mode: "specific",
      vault: "Demo",
      path: "notes/x.md",
      name: "status",
      value: "shipped",
    });
  }
});

// (2) specific + file happy path
test("specific+file happy (US1#1 file variant)", () => {
  const result = setPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    file: "QuickNote",
    name: "tags",
    value: ["alpha", "beta"],
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.file).toBe("QuickNote");
    expect(result.data.value).toEqual(["alpha", "beta"]);
  }
});

// (3) active happy path
test("active mode happy (US2#1)", () => {
  const result = setPropertyInputSchema.safeParse({
    target_mode: "active",
    name: "status",
    value: "review",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.target_mode).toBe("active");
    expect(result.data.vault).toBeUndefined();
    expect(result.data.file).toBeUndefined();
    expect(result.data.path).toBeUndefined();
  }
});

// (4) specific + path + explicit type
test("specific+path with explicit type (US1#5)", () => {
  const result = setPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "notes/x.md",
    name: "due",
    value: "2026-12-31",
    type: "date",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.type).toBe("date");
  }
});

// (8) empty name → VALIDATION_ERROR
test("empty name → too_small on ['name'] (US3#4)", () => {
  const result = setPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    name: "",
    value: "v",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const nameIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["name"]));
    expect(nameIssues.length).toBeGreaterThanOrEqual(1);
    expect(nameIssues[0]!.code).toBe("too_small");
  }
});

// (9) missing name → VALIDATION_ERROR
test("missing name → invalid_type on ['name'] (US3#5)", () => {
  const result = setPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    value: "v",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const nameIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["name"]));
    expect(nameIssues.length).toBeGreaterThanOrEqual(1);
    expect(nameIssues[0]!.code).toBe("invalid_type");
  }
});

// (10) missing value → VALIDATION_ERROR
test("missing value → issue on ['value'] (US3#6)", () => {
  const result = setPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    name: "status",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const valueIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["value"]));
    expect(valueIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (11) value=null → VALIDATION_ERROR
test("value=null rejected by union (US3#7 null)", () => {
  const result = setPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    name: "status",
    value: null,
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const valueIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["value"]));
    expect(valueIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (12) value=object → VALIDATION_ERROR
test("value=object rejected by union (US3#7 object)", () => {
  const result = setPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    name: "metadata",
    value: { author: "x" },
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const valueIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["value"]));
    expect(valueIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (13) value=heterogeneous array → VALIDATION_ERROR (array elements must all be string)
test("value=heterogeneous array (number + string) rejected (US3#7 heterogeneous)", () => {
  const result = setPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    name: "tags",
    value: ["alpha", 2, "gamma"],
  });
  expect(result.success).toBe(false);
});

// (14) type=invalid → VALIDATION_ERROR
test("type='bogus' rejected by six-label enum (US3#8)", () => {
  const result = setPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    name: "status",
    value: "v",
    type: "bogus",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const typeIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["type"]));
    expect(typeIssues.length).toBeGreaterThanOrEqual(1);
  }
});

describe("setPropertyInputSchema — target-mode refinement wiring (shared battery)", () => {
  it.each(
    targetModeWiringCases(
      { target_mode: "specific", vault: "V", path: "n.md", name: "prop", value: "v" },
      { target_mode: "active", name: "prop", value: "v" },
    ),
  )("$label", ({ input, valid, issuePath }) => {
    const r = setPropertyInputSchema.safeParse(input);
    expect(r.success).toBe(valid);
    if (!valid && issuePath && !r.success) {
      expect(r.error.issues.some((i) => i.path.includes(issuePath))).toBe(true);
    }
  });
});
