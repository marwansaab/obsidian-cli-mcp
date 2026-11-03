// Original — no upstream. Pure tests for the literal-phrase helpers shared by search and context_search (spec 087, BI-0175): the escaped regular-expression CLI query (L1–L6, L9–L12) and the one-entry-per-line reduction (L7). L8 lives in line-matches.test.ts.
import { expect, test } from "vitest";

import { literalPhraseQuery, oneMatchPerLine } from "./literal-phrase.js";

// =================== literalPhraseQuery ===================

test("L1 a multi-word query is wrapped in regex delimiters", () => {
  expect(literalPhraseQuery("alpha beta")).toBe("/alpha beta/");
});

test.each([
  [" alpha ", "/ alpha /"],
  ["alpha\tbeta", "/alpha\tbeta/"],
  ["alpha  beta", "/alpha  beta/"],
])("L5 whitespace is kept byte-identical inside the delimiters: %j", (input, expected) => {
  expect(literalPhraseQuery(input)).toBe(expected);
});

test("L2 a double quote passes through unescaped", () => {
  expect(literalPhraseQuery('say "hello" twice')).toBe('/say "hello" twice/');
});

test("L3 a backslash is escaped as \\\\", () => {
  // The 6 characters /a\\b/.
  expect(literalPhraseQuery("a\\b")).toBe("/a\\\\b/");
});

test("L4 a backslash before a quote is doubled and the quote kept", () => {
  // Input a\"b; output the 7 characters /a\\"b/.
  expect(literalPhraseQuery('a\\"b')).toBe('/a\\\\"b/');
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
])(
  "L6 search-syntax characters come out as a regex matching only their literal text: %j",
  (input) => {
    expect(new RegExp(`^${literalPhraseQuery(input).slice(1, -1)}$`).test(input)).toBe(true);
  },
);

// BI-0175: every regex syntax character and the `/` delimiter is escaped; nothing else is.
test.each(["\\", "^", "$", ".", "*", "+", "?", "(", ")", "[", "]", "{", "}", "|", "/"])(
  "L9 %j is escaped with a backslash",
  (c) => {
    expect(literalPhraseQuery(`a${c}b`)).toBe(`/a\\${c}b/`);
  },
);

test.each(['"', "-", ":", "#", "abcXYZ", "0123456789", " lead", "trail ", "in ner", "a\tb", "é"])(
  "L10 %j passes through unchanged",
  (input) => {
    expect(literalPhraseQuery(input)).toBe(`/${input}/`);
  },
);

// BI-0175: a query that starts or ends part-way through a word, and the synthetic `|` rows (Q2).
test.each([
  ["ead170", "/ead170/"],
  ["TC-0078", "/TC-0078/"],
  ["pha bet", "/pha bet/"],
  ["ol a | co", "/ol a \\| co/"],
  ["|co", "/\\|co/"],
  ["l b |", "/l b \\|/"],
])("L12 %j is sent as %j", (input, expected) => {
  expect(literalPhraseQuery(input)).toBe(expected);
});

const SYNTAX = "\\^$.*+?()[]{}|/";
const POOL = `${SYNTAX}"-:# \tabcAZ09é`;

/** Deterministic pseudo-random strings over POOL (a fixed linear congruential sequence). */
function sampleQueries(count: number): string[] {
  let seed = 175;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  return Array.from({ length: count }, () => {
    const length = 1 + (next() % 12);
    return Array.from({ length }, () => POOL[next() % POOL.length]).join("");
  });
}

test.each([SYNTAX, `x${SYNTAX}x`, "o.bar(baz)", "a.b", ...sampleQueries(200)])(
  "L11 the regex body matches %j literally and only that, with and without the u flag",
  (input) => {
    const out = literalPhraseQuery(input);
    expect(out.startsWith("/") && out.endsWith("/")).toBe(true);
    const body = out.slice(1, -1);
    for (const flags of ["", "u"]) {
      const anchored = new RegExp(`^${body}$`, flags);
      expect(anchored.test(input)).toBe(true);
      // One character changed (or dropped) no longer matches: the body is not a pattern.
      expect(anchored.test(`${input.slice(0, -1)}${input.endsWith("~") ? "!" : "~"}`)).toBe(false);
      expect(anchored.test(input.slice(1))).toBe(false);
      const found = new RegExp(body, flags).exec(`pre${input}post`);
      expect(found?.index).toBe(3);
      expect(found?.[0]).toBe(input);
    }
  },
);

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
