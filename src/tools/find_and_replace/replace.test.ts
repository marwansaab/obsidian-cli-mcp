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
  it("literal mode returns the replacement verbatim regardless of $-sequences", () => {
    expect(applyReplacement("foo", null, "$1bar$&", "literal")).toBe("$1bar$&");
  });

  it("regex mode honours $1 capture-group semantics", () => {
    const regex = compileFindRegex("foo(\\d+)", "regex", false);
    const matched = "foo42";
    expect(applyReplacement(matched, regex, "X$1Y", "regex")).toBe("X42Y");
  });

  it("regex mode honours $& whole-match semantics", () => {
    const regex = compileFindRegex("foo", "regex", false);
    expect(applyReplacement("foo", regex, "<$&>", "regex")).toBe("<foo>");
  });

  it("regex mode honours $$ literal-dollar semantics", () => {
    const regex = compileFindRegex("foo", "regex", false);
    expect(applyReplacement("foo", regex, "$$bar", "regex")).toBe("$bar");
  });

  it("regex mode with multiple capture groups + literal dollar", () => {
    const regex = compileFindRegex("(\\w+)-(\\w+)", "regex", false);
    expect(applyReplacement("aaa-bbb", regex, "$2_$1_$$", "regex")).toBe(
      "bbb_aaa_$",
    );
  });
});
