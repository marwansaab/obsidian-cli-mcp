// Original — no upstream. Pure tests for the shared line-level pipeline (spec 087): a query containing a line break keeps no lines (L8). selectLines returns the raw, uncapped CLI text, and lineOutput keeps its rows, order and truncation while capping each text (L9–L10, spec 088). The handler suites cover the rest of the pipeline through executeSearch and executeContextSearch.
import { expect, test } from "vitest";

import { lineOutput, selectLines } from "./line-matches.js";

function fileWithLines(file: string, lines: number[]) {
  return { file, matches: lines.map((line) => ({ line, text: `t${line}` })) };
}

const WIRE = [fileWithLines("a.md", [1, 1, 2]), fileWithLines("b.md", [4])];

test("L8 baseline: the same wire with a single-line query keeps one entry per line", () => {
  expect(lineOutput(selectLines("a b", WIRE, 10)).count).toBe(3);
});

test.each(["a\nb", "a\rb"])("L8 a query containing a line break keeps no lines: %j", (query) => {
  expect(lineOutput(selectLines(query, WIRE, 10))).toEqual({ count: 0, matches: [] });
});

test("L9 selectLines returns the raw CLI text, uncapped; lineOutput caps it at 500 chars + U+2026", () => {
  const wire = [{ file: "a.md", matches: [{ line: 1, text: "x".repeat(600) }] }];
  const selected = selectLines("q", wire, 10);
  expect(selected.rows[0]!.text).toHaveLength(600);
  expect(lineOutput(selected).matches[0]!.text).toBe("x".repeat(500) + "…");
});

test.each([10, 2])("L10 lineOutput keeps selectLines's rows, order and truncation (cap %i)", (cap) => {
  const selected = selectLines("q", WIRE, cap);
  const output = lineOutput(selected);
  expect(output.matches).toEqual(selected.rows);
  expect(output.count).toBe(selected.rows.length);
  expect(output.truncated === true).toBe(selected.truncated);
});
