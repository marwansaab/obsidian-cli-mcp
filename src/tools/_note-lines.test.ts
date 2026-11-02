// Original — no upstream. Unit tests for the shared note-line model (spec 086, contracts/placement-contract.md N1–N9).
import { describe, expect, it } from "vitest";

import { HEADING_TEMPLATE, mixFmCrlfBodyLf, mixFmLfBodyCrlf } from "./_line-ending-fixtures.js";
import {
  insertEnding,
  joinNoteLines,
  keepsOriginalAround,
  lineStart,
  lineText,
  splitNoteLines,
} from "./_note-lines.js";
import { walkHeadings } from "./patch_heading/heading-walk.js";

describe("splitNoteLines", () => {
  it("N1: keeps each line's own terminator and loses no byte", () => {
    const raw = "a\r\nb\nc";
    const lines = splitNoteLines(raw);
    expect(lines).toEqual(["a\r\n", "b\n", "c"]);
    expect(lines.join("")).toBe(raw);
  });

  it("N2: no phantom empty last element; the empty note is one empty line", () => {
    expect(splitNoteLines("a\n")).toEqual(["a\n"]);
    expect(splitNoteLines("")).toEqual([""]);
  });

  describe.each([
    ["mixFmLfBodyCrlf", mixFmLfBodyCrlf(HEADING_TEMPLATE)],
    ["mixFmCrlfBodyLf", mixFmCrlfBodyLf(HEADING_TEMPLATE)],
  ])("N3: index agreement with the scanners on %s", (_name, raw) => {
    it("lineText at every index equals the scanners' split rule", () => {
      const lines = splitNoteLines(raw);
      const scan = raw.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
      for (let i = 0; i < lines.length; i++) {
        expect(lineText(lines[i]!)).toBe(scan[i]);
      }
    });

    it.each(["Top#First", "Top#Middle", "Top#Middle#Child", "Top#Last"])(
      "the real walker's marker line for %s is the same line",
      (path) => {
        const r = walkHeadings(raw, path.split("#"));
        expect(r).not.toBeNull();
        expect(lineText(splitNoteLines(raw)[r!.markerLineIndex]!)).toBe(r!.markerLineText);
      },
    );
  });
});

describe("lineText", () => {
  it("N4: drops one line feed then one carriage return", () => {
    expect(lineText("x\r\r\n")).toBe("x\r");
    expect(lineText("## H\r")).toBe("## H");
  });
});

describe("insertEnding", () => {
  it("N5: the anchor's terminator, else the nearest earlier line's", () => {
    const lines = ["a\r\n", "b\n", "c"];
    expect(insertEnding(lines, 0)).toBe("\r\n");
    expect(insertEnding(lines, 1)).toBe("\n");
    expect(insertEnding(lines, 2)).toBe("\n");
  });

  it("N6: LF when no line has a terminator", () => {
    expect(insertEnding(["c"], 0)).toBe("\n");
  });
});

describe("joinNoteLines", () => {
  it("N7: kept lines keep their terminators; added lines take the insert ending", () => {
    expect(joinNoteLines(["a\r\n", "new", "b\n"], "\r\n", true)).toBe("a\r\nnew\r\nb\n");
  });

  it("N8: strips the final terminator when the note had no final line break", () => {
    expect(joinNoteLines(["a\n", "x\r\n"], "\n", false)).toBe("a\nx");
  });
});

describe("lineStart", () => {
  it("sums the lengths of the earlier lines; past the end gives the total", () => {
    const lines = ["a\r\n", "b\n", "c"];
    expect(lineStart(lines, 0)).toBe(0);
    expect(lineStart(lines, 2)).toBe(5);
    expect(lineStart(lines, 3)).toBe(6);
    expect(lineStart(lines, 99)).toBe(6);
  });
});

describe("keepsOriginalAround", () => {
  const original = "head\nbody\ntail\n";
  // prefix "head\n" (0..5), suffix "tail\n" (10..)
  it("N9: prefix and suffix kept", () => {
    expect(keepsOriginalAround(original, "head\nnew\ntail\n", 5, 10)).toBe(true);
  });

  it("N9: prefix broken", () => {
    expect(keepsOriginalAround(original, "HEAD\nnew\ntail\n", 5, 10)).toBe(false);
  });

  it("N9: suffix broken", () => {
    expect(keepsOriginalAround(original, "head\nnew\nTAIL\n", 5, 10)).toBe(false);
  });

  it("N9: prefix and suffix overlap in the edited text", () => {
    // "head\n" starts with the prefix and ends with the suffix only by sharing its bytes.
    expect(keepsOriginalAround("head\nhead\n", "head\n", 5, 5)).toBe(false);
  });
});
