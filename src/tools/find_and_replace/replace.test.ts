// Original — no upstream. Co-located tests for compileFindRegex + iterateLineMatches + applyReplacement — literal/regex modes, case-insensitive, zero-width skip, multi-match byte-offset-base.
import { describe, expect, it } from "vitest";

import {
  applyReplacement,
  compileFindRegex,
  escapeRegex,
  iterateLineMatches,
} from "./replace.js";

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

describe("iterateLineMatches", () => {
  it("single match returns expected index/endIndex/matchedSubstring with byteOffsetBase", () => {
    const regex = compileFindRegex("bar", "literal", false);
    const out = Array.from(iterateLineMatches("foo bar baz", regex, 100));
    expect(out.length).toBe(1);
    expect(out[0]).toEqual({
      index: 104,
      endIndex: 107,
      matchedSubstring: "bar",
    });
  });

  it("multi-match on a single line returns each occurrence with the right base offset", () => {
    const regex = compileFindRegex("ab", "literal", false);
    const out = Array.from(iterateLineMatches("abXabXab", regex, 50));
    expect(out.map((m) => m.index)).toEqual([50, 53, 56]);
    expect(out.every((m) => m.matchedSubstring === "ab")).toBe(true);
  });

  it("zero-width regex match is skipped and lastIndex advances", () => {
    const regex = compileFindRegex("a*", "regex", false);
    // Without the skip, this would emit infinite zero-width matches between
    // characters. With the skip, only the actual 'a' substrings (greedy) emit.
    const out = Array.from(iterateLineMatches("xaaax", regex, 0));
    // "a*" greedy with /g matches: '' at 0, 'aaa' at 1, '' at 4, '' at 5 — only
    // 'aaa' is non-zero-width so we expect exactly one entry.
    expect(out.length).toBe(1);
    expect(out[0]!.matchedSubstring).toBe("aaa");
    expect(out[0]!.index).toBe(1);
  });

  it("no match → empty iteration", () => {
    const regex = compileFindRegex("zzz", "literal", false);
    const out = Array.from(iterateLineMatches("abc", regex, 0));
    expect(out).toEqual([]);
  });
});

describe("applyReplacement", () => {
  // Expands the replacement for every match iterateLineMatches finds on `line`
  // (base offset 0, so index/endIndex are line-relative), as scanNotes does.
  const expandAll = (line: string, pattern: string, replacement: string): string[] => {
    const regex = compileFindRegex(pattern, "regex", false);
    return Array.from(iterateLineMatches(line, regex, 0), (m) =>
      applyReplacement(line, m.index, m.endIndex, regex, replacement, "regex"),
    );
  };

  it("literal mode returns the replacement verbatim regardless of $-sequences", () => {
    expect(applyReplacement("foo", 0, 3, null, "$1bar$&", "literal")).toBe("$1bar$&");
  });

  it("regex mode honours $1 capture-group semantics", () => {
    expect(expandAll("foo42", "foo(\\d+)", "X$1Y")).toEqual(["X42Y"]);
  });

  it("regex mode honours $& whole-match semantics", () => {
    expect(expandAll("foo", "foo", "<$&>")).toEqual(["<foo>"]);
  });

  it("regex mode honours $$ literal-dollar semantics", () => {
    expect(expandAll("foo", "foo", "$$bar")).toEqual(["$bar"]);
  });

  it("regex mode with multiple capture groups + literal dollar", () => {
    expect(expandAll("aaa-bbb", "(\\w+)-(\\w+)", "$2_$1_$$")).toEqual(["bbb_aaa_$"]);
  });

  it("regex mode with a null regex throws the defensive guard", () => {
    expect(() => applyReplacement("foo", 0, 3, null, "bar", "regex")).toThrow(
      "applyReplacement: regex mode requires a non-null RegExp",
    );
  });

  // BI-0202: the expansion runs at the match's position in its line, so
  // assertions that look outside the matched text keep their context.
  it("regex mode expands a lookbehind match (BI-0202)", () => {
    expect(expandAll("Paren word here", "(?<=Paren )word", "WORD")).toEqual(["WORD"]);
  });

  it("regex mode expands a lookahead match (BI-0202)", () => {
    expect(expandAll("Paren word here", "word(?= here)", "WORD")).toEqual(["WORD"]);
  });

  it("the capture-and-reinsert workaround still expands (BI-0202)", () => {
    expect(expandAll("Paren word here", "(Paren )word", "$1WORD")).toEqual(["Paren WORD"]);
  });

  it("multiple matches on one line each expand at their own position (BI-0202)", () => {
    expect(expandAll("a1 b2 a3", "(?<=a)(\\d)", "<$1>")).toEqual(["<1>", "<3>"]);
  });
});
