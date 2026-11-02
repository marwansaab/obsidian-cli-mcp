// Original — no upstream. Pure tests for the shared line-level pipeline (spec 087): a query containing a line break keeps no lines (L8). selectLines returns the raw, uncapped CLI text with the same membership, order and truncation as lineMatches (L9–L10, spec 088). The handler suites cover the rest of the pipeline through executeSearch and executeContextSearch.
import { expect, test } from "vitest";

import { lineMatches, selectLines } from "./line-matches.js";

function fileWithLines(file: string, lines: number[]) {
  return { file, matches: lines.map((line) => ({ line, text: `t${line}` })) };
}

const WIRE = [fileWithLines("a.md", [1, 1, 2]), fileWithLines("b.md", [4])];

test("L8 baseline: the same wire with a single-line query keeps one entry per line", () => {
  expect(lineMatches("a b", WIRE, 10, (text) => text).count).toBe(3);
});

test.each(["a\nb", "a\rb"])("L8 a query containing a line break keeps no lines: %j", (query) => {
  expect(lineMatches(query, WIRE, 10, (text) => text)).toEqual({ count: 0, matches: [] });
});

test("L9 selectLines returns the raw CLI text, uncapped", () => {
  const wire = [{ file: "a.md", matches: [{ line: 1, text: "x".repeat(600) }] }];
  expect(selectLines("q", wire, 10).rows[0]!.text).toHaveLength(600);
});

test.each([10, 2])("L10 selectLines keeps lineMatches's rows, order and truncation (cap %i)", (cap) => {
  const selected = selectLines("q", WIRE, cap);
  const matched = lineMatches("q", WIRE, cap, (t) => t);
  expect(selected.rows.map(({ path, line }) => ({ path, line }))).toEqual(
    matched.matches.map(({ path, line }) => ({ path, line })),
  );
  expect(selected.truncated).toBe(matched.truncated === true);
});
