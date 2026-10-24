// Original — no upstream. Tests for the shared name collation used by the properties and tags
// wrapper-side sorts: case-insensitive primary order, UTF-16 code-unit tiebreak, never locale-aware.
import { expect, test } from "vitest";

import { compareNames } from "./_collation.js";

test("case-insensitive primary order", () => {
  expect(compareNames("alpha", "Beta")).toBeLessThan(0);
  expect(compareNames("Zeta", "beta")).toBeGreaterThan(0);
});

test("case variants tiebreak by code unit (uppercase first) and equal names compare 0", () => {
  expect(compareNames("Alpha", "alpha")).toBeLessThan(0);
  expect(compareNames("alpha", "Alpha")).toBeGreaterThan(0);
  expect(compareNames("alpha", "alpha")).toBe(0);
});

test("not locale-aware: non-ASCII sorts by code unit", () => {
  // "é" (U+00E9) sorts after "z" by code unit, unlike locale collation.
  expect(compareNames("café", "cafz")).toBeGreaterThan(0);
  expect(compareNames("日本語", "zzz")).toBeGreaterThan(0);
});
