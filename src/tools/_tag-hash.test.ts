// Original — no upstream. Tests for the leading-`#` tag rule (BI-0181): `stripTagHash` removes exactly one leading `#`; `withoutTagHash` applies it to a scalar string or each string in a list; `WITHOUT_TAG_HASH_JS`, run under node:vm, gives the same answers as `withoutTagHash` (compared as JSON, because vm arrays belong to another realm).
import { runInNewContext } from "node:vm";

import { describe, expect, test } from "vitest";

import { stripTagHash, withoutTagHash, WITHOUT_TAG_HASH_JS } from "./_tag-hash.js";

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

describe("withoutTagHash and its eval form WITHOUT_TAG_HASH_JS agree", () => {
  const evalRule = runInNewContext(WITHOUT_TAG_HASH_JS) as (v: unknown) => unknown;

  test.each<[unknown, unknown]>([
    ["#solo", "solo"],
    ["##solo", "#solo"],
    ["solo", "solo"],
    [["#a", "b", "##c"], ["a", "b", "#c"]],
    [["#a", 7, null, true], ["a", 7, null, true]],
    [[["#n"]], [["#n"]]],
    [[], []],
    [7, 7],
    [null, null],
    [{ k: "#v" }, { k: "#v" }],
  ])("%j → %j", (input, expected) => {
    expect(withoutTagHash(input)).toEqual(expected);
    expect(JSON.stringify(evalRule(input))).toBe(JSON.stringify(expected));
  });
});
