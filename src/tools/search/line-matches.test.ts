// Original — no upstream. Pure tests for the shared line-level pipeline (spec 087): a query containing a line break keeps no lines (L8). The handler suites cover the rest of the pipeline through executeSearch and executeContextSearch.
import { expect, test } from "vitest";

import { lineMatches } from "./line-matches.js";

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
