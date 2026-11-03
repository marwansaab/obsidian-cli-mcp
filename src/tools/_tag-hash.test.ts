// Original — no upstream. Tests for stripTagHash (BI-0181): exactly one leading `#` is removed; nothing else changes.
import { expect, test } from "vitest";

import { stripTagHash } from "./_tag-hash.js";

test.each<[string, string]>([
  ["#bi-0166", "bi-0166"],
  ["bi-0166", "bi-0166"],
  ["##x", "#x"],
  ["#", ""],
  ["", ""],
  ["a#b", "a#b"],
  [" #x", " #x"],
])("stripTagHash(%j) → %j", (input, expected) => {
  expect(stripTagHash(input)).toBe(expected);
});
