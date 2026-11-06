// Original — no upstream. Co-located tests for escapeRegex + compileFindRegex + compileFinder — literal/regex modes, case-insensitive, zero-width skip, multi-match byte-offset-base, replacement expansion.
import { describe, expect, it } from "vitest";

import { compileFinder, compileFindRegex, escapeRegex } from "./replace.js";

describe("escapeRegex", () => {
  it("escapes regex metacharacters for literal-mode matching", () => {
    expect(escapeRegex("a.b*c+")).toBe("a\\.b\\*c\\+");
    expect(escapeRegex("$1")).toBe("\\$1");
    expect(escapeRegex("(group)")).toBe("\\(group\\)");
  });
});

describe("compileFindRegex", () => {
  it("literal mode escapes metacharacters", () => {
    const r = compileFindRegex("a.b", "literal", false);
    expect(r.test("aXb")).toBe(false);
    expect(r.test("a.b")).toBe(true);
  });

  it("regex mode passes through metacharacters", () => {
    const r = compileFindRegex("a.b", "regex", false);
    expect(r.test("aXb")).toBe(true);
    r.lastIndex = 0;
    expect(r.test("a.b")).toBe(true);
  });

  it("case_insensitive=true compiles with i flag in regex mode", () => {
    const r = compileFindRegex("FOO", "regex", true);
    expect(r.flags).toContain("i");
    r.lastIndex = 0;
    expect(r.test("foo")).toBe(true);
  });

  it("case_insensitive=true also applies in literal mode (i flag still folds ASCII)", () => {
    const r = compileFindRegex("FOO", "literal", true);
    r.lastIndex = 0;
    expect(r.test("foo")).toBe(true);
  });
});

describe("compileFinder — matching", () => {
  it("single match returns expected index/endIndex/matchedSubstring with byteOffsetBase", () => {
    const out = Array.from(compileFinder("bar", "R", "literal", false)("foo bar baz", 100));
    expect(out.length).toBe(1);
    expect(out[0]).toEqual({
      index: 104,
      endIndex: 107,
      matchedSubstring: "bar",
      replacementSubstring: "R",
    });
  });

  it("multi-match on a single line returns each occurrence with the right base offset", () => {
    const out = Array.from(compileFinder("ab", "R", "literal", false)("abXabXab", 50));
    expect(out.map((m) => m.index)).toEqual([50, 53, 56]);
    expect(out.every((m) => m.matchedSubstring === "ab")).toBe(true);
  });

  it("zero-width regex match is skipped and lastIndex advances", () => {
    // Without the skip, this would emit infinite zero-width matches between
    // characters. With the skip, only the actual 'a' substrings (greedy) emit.
    const out = Array.from(compileFinder("a*", "R", "regex", false)("xaaax", 0));
    // "a*" greedy with /g matches: '' at 0, 'aaa' at 1, '' at 4, '' at 5 — only
    // 'aaa' is non-zero-width so we expect exactly one entry.
    expect(out.length).toBe(1);
    expect(out[0]!.matchedSubstring).toBe("aaa");
    expect(out[0]!.index).toBe(1);
  });

  it("no match → empty iteration", () => {
    const out = Array.from(compileFinder("zzz", "R", "literal", false)("abc", 0));
    expect(out).toEqual([]);
  });
});

describe("compileFinder — replacement expansion", () => {
  // Rows marked BI-0202: the expansion runs at the match's position in its line, so
  // assertions that look outside the matched text keep their context.
  it.each([
    ["literal mode returns the replacement verbatim regardless of $-sequences", "foo", "foo", "$1bar$&", "literal", ["$1bar$&"]],
    ["regex mode honours $1 capture-group semantics", "foo42", "foo(\\d+)", "X$1Y", "regex", ["X42Y"]],
    ["regex mode honours $& whole-match semantics", "foo", "foo", "<$&>", "regex", ["<foo>"]],
    ["regex mode honours $$ literal-dollar semantics", "foo", "foo", "$$bar", "regex", ["$bar"]],
    ["regex mode with multiple capture groups + literal dollar", "aaa-bbb", "(\\w+)-(\\w+)", "$2_$1_$$", "regex", ["bbb_aaa_$"]],
    ["regex mode expands a lookbehind match (BI-0202)", "Paren word here", "(?<=Paren )word", "WORD", "regex", ["WORD"]],
    ["regex mode expands a lookahead match (BI-0202)", "Paren word here", "word(?= here)", "WORD", "regex", ["WORD"]],
    ["the capture-and-reinsert workaround still expands (BI-0202)", "Paren word here", "(Paren )word", "$1WORD", "regex", ["Paren WORD"]],
    ["multiple matches on one line each expand at their own position (BI-0202)", "a1 b2 a3", "(?<=a)(\\d)", "<$1>", "regex", ["<1>", "<3>"]],
  ] as const)("%s", (_title, line, pattern, replacement, mode, expected) => {
    const found = Array.from(compileFinder(pattern, replacement, mode, false)(line, 0));
    expect(found.map((m) => m.replacementSubstring)).toEqual(expected);
  });
});
