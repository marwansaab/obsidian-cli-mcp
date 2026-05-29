// Original — no upstream. Tests for the read_heading input + output + eval-envelope schemas — target_mode discriminator + structural heading-path validator + additionalProperties + envelope discriminator.
import { describe, expect, it, test } from "vitest";

import { targetModeWiringCases } from "../_target-mode-test-cases.js";
import {
  readHeadingEvalResponseSchema,
  readHeadingInputSchema,
  readHeadingOutputSchema,
} from "./schema.js";

describe("readHeadingInputSchema — target-mode refinement wiring (shared battery)", () => {
  it.each(
    targetModeWiringCases(
      { target_mode: "specific", vault: "V", path: "n.md", heading: "H::H" },
      { target_mode: "active", heading: "H::H" },
    ),
  )("$label", ({ input, valid, issuePath }) => {
    const r = readHeadingInputSchema.safeParse(input);
    expect(r.success).toBe(valid);
    if (!valid && issuePath && !r.success) {
      expect(r.error.issues.some((i) => i.path.includes(issuePath))).toBe(true);
    }
  });
});

// (7) Happy specific-path
test("specific + path + heading happy path", () => {
  const result = readHeadingInputSchema.safeParse({
    target_mode: "specific",
    vault: "v",
    path: "x.md",
    heading: "A::B",
  });
  expect(result.success).toBe(true);
});

// (8) Happy active
test("active + heading happy path", () => {
  const result = readHeadingInputSchema.safeParse({
    target_mode: "active",
    heading: "A::B",
  });
  expect(result.success).toBe(true);
});

// (9) US3 AC#6 — empty heading rejected
test("empty heading rejected with too_small on path=['heading']", () => {
  const result = readHeadingInputSchema.safeParse({
    target_mode: "active",
    heading: "",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const headingIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["heading"]),
    );
    expect(headingIssues.length).toBeGreaterThanOrEqual(1);
    expect(headingIssues.some((i) => i.code === "too_small")).toBe(true);
  }
});

// (10) US3 AC#6 — heading omitted rejected
test("missing heading rejected as invalid_type on path=['heading']", () => {
  const result = readHeadingInputSchema.safeParse({
    target_mode: "active",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const headingIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["heading"]),
    );
    expect(headingIssues.length).toBeGreaterThanOrEqual(1);
    expect(headingIssues[0]!.code).toBe("invalid_type");
  }
});

// (11) US3 AC#1 — single-segment heading rejected
test("single-segment heading rejected with 'at least two'", () => {
  const result = readHeadingInputSchema.safeParse({
    target_mode: "active",
    heading: "Foo",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const headingIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["heading"]),
    );
    expect(headingIssues.length).toBeGreaterThanOrEqual(1);
    expect(headingIssues[0]!.message).toContain("at least two");
  }
});

// (12) US3 AC#2 — leading empty segment
test("heading '::Foo' rejected as empty segment", () => {
  const result = readHeadingInputSchema.safeParse({
    target_mode: "active",
    heading: "::Foo",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const headingIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["heading"]),
    );
    expect(headingIssues.length).toBeGreaterThanOrEqual(1);
    expect(headingIssues[0]!.message).toContain("non-empty");
  }
});

// (13) US3 AC#2 — trailing empty segment
test("heading 'Bar::' rejected as empty segment", () => {
  const result = readHeadingInputSchema.safeParse({
    target_mode: "active",
    heading: "Bar::",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const headingIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["heading"]),
    );
    expect(headingIssues.length).toBeGreaterThanOrEqual(1);
    expect(headingIssues[0]!.message).toContain("non-empty");
  }
});

// (14) US3 AC#2 — interior empty segment from consecutive ::
test("heading 'A::::B' rejected as empty segment", () => {
  const result = readHeadingInputSchema.safeParse({
    target_mode: "active",
    heading: "A::::B",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const headingIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["heading"]),
    );
    expect(headingIssues.length).toBeGreaterThanOrEqual(1);
    expect(headingIssues[0]!.message).toContain("non-empty");
  }
});

// (15) Valid 2-segment heading
test("valid 2-segment heading 'A::B' accepted", () => {
  const result = readHeadingInputSchema.safeParse({
    target_mode: "active",
    heading: "A::B",
  });
  expect(result.success).toBe(true);
});

// (16) Valid 6-segment heading
test("valid 6-segment heading accepted", () => {
  const result = readHeadingInputSchema.safeParse({
    target_mode: "active",
    heading: "A::B::C::D::E::F",
  });
  expect(result.success).toBe(true);
});

// (18) Output schema rejects extra keys
test("output schema rejects extra keys", () => {
  const result = readHeadingOutputSchema.safeParse({ content: "x", extra: "y" });
  expect(result.success).toBe(false);
});

// (19) Output schema rejects non-string content
test("output schema rejects non-string content", () => {
  const result = readHeadingOutputSchema.safeParse({ content: 123 });
  expect(result.success).toBe(false);
});

// (20) Eval envelope discriminator parameterised
test.each<[string, unknown, boolean]>([
  ["ok:true without content", { ok: true }, false],
  ["ok:false without code", { ok: false, detail: "x" }, false],
  ["ok:false with unknown code", { ok: false, code: "OTHER", detail: "x" }, false],
  ["ok:true happy", { ok: true, content: "x" }, true],
  ["ok:false FILE_NOT_FOUND", { ok: false, code: "FILE_NOT_FOUND", detail: "x" }, true],
  ["ok:false HEADING_NOT_FOUND", { ok: false, code: "HEADING_NOT_FOUND", detail: "x" }, true],
  ["ok:false NO_ACTIVE_FILE", { ok: false, code: "NO_ACTIVE_FILE", detail: "x" }, true],
])("eval envelope discriminator: %s", (_label, input, expected) => {
  const result = readHeadingEvalResponseSchema.safeParse(input);
  expect(result.success).toBe(expected);
});
