// Original — no upstream. Tests for the shared eval answer parse and parse-error excerpt (spec 080 FR-002, FR-013; contract §4 E1–E4).
import { describe, expect, it } from "vitest";

import { EXCERPT_CUT_MARKER, boundedExcerpt, parseEvalAnswer, stdoutDetails } from "./_eval-parse.js";

describe("parseEvalAnswer", () => {
  it("throws a SyntaxError when there is no answer", () => {
    expect(() => parseEvalAnswer(null)).toThrow(SyntaxError);
    expect(() => parseEvalAnswer(null)).toThrow("eval output carries no answer for this call");
  });

  it("throws a SyntaxError on invalid JSON, including an empty answer", () => {
    expect(() => parseEvalAnswer("not json")).toThrow(SyntaxError);
    expect(() => parseEvalAnswer("")).toThrow(SyntaxError);
  });

  it("returns objects, strings and numbers", () => {
    expect(parseEvalAnswer('{"ok":true,"count":1}')).toEqual({ ok: true, count: 1 });
    expect(parseEvalAnswer('"text"')).toBe("text");
    expect(parseEvalAnswer("42")).toBe(42);
  });

  it("returns empty and falsy values rather than treating them as no answer", () => {
    expect(parseEvalAnswer("null")).toBeNull();
    expect(parseEvalAnswer("false")).toBe(false);
    expect(parseEvalAnswer("[]")).toEqual([]);
    expect(parseEvalAnswer("0")).toBe(0);
  });
});

describe("boundedExcerpt", () => {
  it("keeps text of at most 1,000 characters whole and cuts longer text to its two ends", () => {
    expect(boundedExcerpt("x".repeat(1000))).toBe("x".repeat(1000));
    expect(boundedExcerpt("h".repeat(500) + "m" + "t".repeat(500))).toBe(
      "h".repeat(500) + EXCERPT_CUT_MARKER + "t".repeat(500),
    );
  });
});

describe("stdoutDetails", () => {
  it("E1: empty output", () => {
    expect(stdoutDetails("")).toEqual({ stdout: "", stdoutLength: 0 });
  });

  it("E2: exactly 1,000 characters is kept whole", () => {
    const raw = "x".repeat(1000);
    expect(stdoutDetails(raw)).toEqual({ stdout: raw, stdoutLength: 1000 });
  });

  it("E3: 1,001 characters keeps the first and last 500 around the cut marker", () => {
    const raw = "h".repeat(500) + "m" + "t".repeat(500);
    const out = stdoutDetails(raw);
    expect(out.stdoutLength).toBe(1001);
    expect(out.stdout).toBe("h".repeat(500) + EXCERPT_CUT_MARKER + "t".repeat(500));
    expect(out.stdout).not.toContain("m");
  });

  it("E4: 2,000,000 characters keeps the tail where the answer was expected", () => {
    const raw = "n".repeat(2_000_000 - 20) + "=> <<ocm-x>>not json";
    const out = stdoutDetails(raw);
    expect(out.stdoutLength).toBe(2_000_000);
    expect(out.stdout.length).toBe(1000 + EXCERPT_CUT_MARKER.length);
    expect(out.stdout.endsWith("=> <<ocm-x>>not json")).toBe(true);
    expect(out.stdout.slice(500, 500 + EXCERPT_CUT_MARKER.length)).toBe(EXCERPT_CUT_MARKER);
  });
});
