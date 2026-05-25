// Original — no upstream. patch_block block-edit tests per BI-043 / Principle II — per-shape byte-stable surgery (FR-008 / FR-009 / FR-010), line-ending preservation (FR-013), trailing-newline preservation (FR-012), marker re-attachment byte-position invariant, empty replacement acceptance.
import { describe, expect, it } from "vitest";

import {
  applyDetachReattach,
  applyVerbatimMarkerPreserve,
  detectLineEnding,
  detectTrailingNewline,
} from "./block-edit.js";

import type { BlockMatch } from "./block-scan.js";

function paragraphMatch(blockId: string, markerText: string, lineIndex: number): BlockMatch {
  return {
    blockId,
    shape: "paragraph",
    markerLineIndex: lineIndex,
    markerLineText: markerText,
    blockStartLineIndex: lineIndex,
    blockEndLineIndex: lineIndex,
  };
}

function listItemMatch(blockId: string, markerText: string, lineIndex: number): BlockMatch {
  return {
    blockId,
    shape: "list-item",
    markerLineIndex: lineIndex,
    markerLineText: markerText,
    blockStartLineIndex: lineIndex,
    blockEndLineIndex: lineIndex,
  };
}

function separatelyPlacedMatch(
  blockId: string,
  markerText: string,
  markerLineIndex: number,
  blockStart: number,
  blockEnd: number,
): BlockMatch {
  return {
    blockId,
    shape: "separately-placed",
    markerLineIndex,
    markerLineText: markerText,
    blockStartLineIndex: blockStart,
    blockEndLineIndex: blockEnd,
  };
}

describe("applyDetachReattach — paragraph shape (FR-008)", () => {
  it("replaces a single-line paragraph body byte-stably", () => {
    const lines = ["A simple paragraph. ^foo"];
    const match = paragraphMatch("foo", lines[0]!, 0);
    const out = applyDetachReattach(lines, match, "Replaced text.");
    expect(out).toEqual(["Replaced text. ^foo"]);
  });

  it("multi-line content appends marker to the last line", () => {
    const lines = ["Original. ^foo"];
    const match = paragraphMatch("foo", lines[0]!, 0);
    const out = applyDetachReattach(lines, match, "Line 1.\nLine 2.");
    expect(out).toEqual(["Line 1.", "Line 2. ^foo"]);
  });

  it("empty content produces ' ^<id>' (single space + marker)", () => {
    const lines = ["Body. ^foo"];
    const match = paragraphMatch("foo", lines[0]!, 0);
    const out = applyDetachReattach(lines, match, "");
    expect(out).toEqual([" ^foo"]);
  });

  it("surrounding lines outside the targeted block are byte-identical", () => {
    const lines = ["intro line", "", "Body. ^foo", "", "closing line"];
    const match = paragraphMatch("foo", "Body. ^foo", 2);
    const out = applyDetachReattach(lines, match, "Replaced.");
    expect(out[0]).toBe("intro line");
    expect(out[1]).toBe("");
    expect(out[2]).toBe("Replaced. ^foo");
    expect(out[3]).toBe("");
    expect(out[4]).toBe("closing line");
  });
});

describe("applyDetachReattach — list-item shape (FR-009)", () => {
  it("dash list item preserves '- ' prefix byte-stably", () => {
    const lines = ["- item content ^foo"];
    const match = listItemMatch("foo", lines[0]!, 0);
    const out = applyDetachReattach(lines, match, "replaced");
    expect(out).toEqual(["- replaced ^foo"]);
  });

  it("nested two-space indent preserves indentation byte-stably", () => {
    const lines = ["  - nested ^foo"];
    const match = listItemMatch("foo", lines[0]!, 0);
    const out = applyDetachReattach(lines, match, "replaced");
    expect(out).toEqual(["  - replaced ^foo"]);
  });

  it("ordered list (42.) preserves '42. ' prefix byte-stably", () => {
    const lines = ["42. item ^foo"];
    const match = listItemMatch("foo", lines[0]!, 0);
    const out = applyDetachReattach(lines, match, "replaced");
    expect(out).toEqual(["42. replaced ^foo"]);
  });

  it("empty content on list-item preserves prefix + double-space + marker (cohort whitespace convention)", () => {
    const lines = ["- item ^foo"];
    const match = listItemMatch("foo", lines[0]!, 0);
    const out = applyDetachReattach(lines, match, "");
    expect(out).toEqual(["-  ^foo"]);
  });

  it("sibling list items outside the targeted item are byte-identical", () => {
    const lines = ["- sibling A", "- target ^foo", "- sibling B"];
    const match = listItemMatch("foo", "- target ^foo", 1);
    const out = applyDetachReattach(lines, match, "replaced");
    expect(out[0]).toBe("- sibling A");
    expect(out[1]).toBe("- replaced ^foo");
    expect(out[2]).toBe("- sibling B");
  });
});

describe("applyVerbatimMarkerPreserve — separately-placed shape (FR-010)", () => {
  it("table block replaced; marker line byte-stable verbatim", () => {
    const lines = [
      "| col1 | col2 |",
      "| ---- | ---- |",
      "| a    | b    |",
      "^foo",
      "trailing",
    ];
    const match = separatelyPlacedMatch("foo", "^foo", 3, 0, 2);
    const newContent =
      "| col1 | col2 |\n" +
      "| ---- | ---- |\n" +
      "| new1 | new2 |\n" +
      "| new3 | new4 |";
    const out = applyVerbatimMarkerPreserve(lines, match, newContent);
    expect(out).toEqual([
      "| col1 | col2 |",
      "| ---- | ---- |",
      "| new1 | new2 |",
      "| new3 | new4 |",
      "^foo",
      "trailing",
    ]);
  });

  it("callout shape — marker line preserved byte-stably; only the callout body replaced", () => {
    const lines = ["> [!note]", "> old", "^foo", "after"];
    const match = separatelyPlacedMatch("foo", "^foo", 2, 0, 1);
    const out = applyVerbatimMarkerPreserve(lines, match, "> [!note]\n> new");
    expect(out).toEqual(["> [!note]", "> new", "^foo", "after"]);
  });

  it("empty content collapses the block to zero lines; marker line preserved", () => {
    const lines = ["| a | b |", "| - | - |", "^foo", "after"];
    const match = separatelyPlacedMatch("foo", "^foo", 2, 0, 1);
    const out = applyVerbatimMarkerPreserve(lines, match, "");
    expect(out).toEqual(["^foo", "after"]);
  });

  it("post-marker lines are byte-identical to input", () => {
    const lines = ["| a |", "^foo", "post-1", "post-2"];
    const match = separatelyPlacedMatch("foo", "^foo", 1, 0, 0);
    const out = applyVerbatimMarkerPreserve(lines, match, "| z |");
    expect(out[1]).toBe("^foo");
    expect(out[2]).toBe("post-1");
    expect(out[3]).toBe("post-2");
  });
});

describe("detectLineEnding (FR-013)", () => {
  it("LF input → 'lf'", () => {
    expect(detectLineEnding("a\nb\n")).toBe("lf");
  });

  it("CRLF input → 'crlf'", () => {
    expect(detectLineEnding("a\r\nb\r\n")).toBe("crlf");
  });

  it("empty string → 'lf' (default)", () => {
    expect(detectLineEnding("")).toBe("lf");
  });

  it("any CRLF in the file → 'crlf' (mixed input picks CRLF)", () => {
    expect(detectLineEnding("a\nb\r\nc\n")).toBe("crlf");
  });
});

describe("detectTrailingNewline (FR-012)", () => {
  it("content ending with \\n → true", () => {
    expect(detectTrailingNewline("text\n")).toBe(true);
  });

  it("content ending with \\r\\n → true (endsWith('\\n') matches)", () => {
    expect(detectTrailingNewline("text\r\n")).toBe(true);
  });

  it("content without trailing newline → false", () => {
    expect(detectTrailingNewline("text")).toBe(false);
  });

  it("empty string → false", () => {
    expect(detectTrailingNewline("")).toBe(false);
  });
});
