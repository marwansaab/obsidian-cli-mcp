// Original — no upstream. Co-located tests for the shared UTF-8 byte-order comparator (068 / PR #85
// review).
import { expect, test } from "vitest";

import { compareUtf8Bytes } from "./_utf8-compare.js";

test("returns 0 for identical strings and orders ASCII by byte value", () => {
  expect(compareUtf8Bytes("abc", "abc")).toBe(0);
  expect(compareUtf8Bytes("B", "a")).toBeLessThan(0);
  expect(compareUtf8Bytes("a", "B")).toBeGreaterThan(0);
});

test("orders by UTF-8 bytes, not UTF-16 code units (supplementary plane after the U+FF00 block)", () => {
  // UTF-16 puts U+1F600 (surrogate 0xD83D) before U+FF21; UTF-8 puts it after (0xF0 > 0xEF).
  expect("\u{1F600}" < "Ａ").toBe(true);
  expect(compareUtf8Bytes("\u{1F600}", "Ａ")).toBeGreaterThan(0);
});
