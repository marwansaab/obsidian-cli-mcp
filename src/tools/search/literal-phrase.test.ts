// Original — no upstream. Pure tests for the literal-phrase helpers shared by search and context_search (spec 087): the escaped double-quoted CLI query (L1–L6) and the one-entry-per-line reduction (L7). L8 lives in line-matches.test.ts.
import { expect, test } from "vitest";

import { literalPhraseQuery, oneMatchPerLine } from "./literal-phrase.js";

// =================== literalPhraseQuery ===================

test("L1 a multi-word query is wrapped in double quotes", () => {
  expect(literalPhraseQuery("alpha beta")).toBe('"alpha beta"');
});

test.each([
  [" alpha ", '" alpha "'],
  ["alpha\tbeta", '"alpha\tbeta"'],
  ["alpha  beta", '"alpha  beta"'],
])("L5 whitespace is kept byte-identical inside the quotes: %j", (input, expected) => {
  expect(literalPhraseQuery(input)).toBe(expected);
});

test("L2 a double quote is escaped as \\\"", () => {
  expect(literalPhraseQuery('say "hello" twice')).toBe('"say \\"hello\\" twice"');
});

test("L3 a backslash is escaped as \\\\", () => {
  // The 6 characters "a\\b".
  expect(literalPhraseQuery("a\\b")).toBe('"a\\\\b"');
});

test("L4 a backslash before a quote is doubled, then the quote escaped", () => {
  // Input a\"b; output the 8 characters "a\\\"b".
  expect(literalPhraseQuery('a\\"b')).toBe('"a\\\\\\"b"');
});

test.each([
  "-draft",
  "cats OR dogs",
  "cats AND dogs",
  "tag:urgent",
  "file:Plan",
  "/usr/bin/",
  "[status]",
  "(see note)",
  "a*b",
])("L6 search-syntax characters are wrapped unchanged: %j", (input) => {
  expect(literalPhraseQuery(input)).toBe(`"${input}"`);
});

// =================== oneMatchPerLine ===================

function fileWithLines(file: string, lines: number[]) {
  return { file, matches: lines.map((line) => ({ line, text: `t${line}` })) };
}

test("L7 keeps the first entry per line, in wire order, without mutating the input", () => {
  const wire = [fileWithLines("a.md", [1, 1, 2, 1, 3])];
  const before = structuredClone(wire);
  const r = oneMatchPerLine(wire);
  expect(r).toEqual([fileWithLines("a.md", [1, 2, 3])]);
  expect(r[0]!.matches[0]).toBe(wire[0]!.matches[0]);
  expect(wire).toEqual(before);
});
