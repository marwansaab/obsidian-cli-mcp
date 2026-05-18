// Original — no upstream. Co-located tests for scanHtmlComments — paired comments, multi-line comments, multiple comments, nested-flat, unclosed-EOF.
import { describe, expect, it } from "vitest";

import { scanHtmlComments } from "./region-scan.js";

describe("scanHtmlComments", () => {
  it("no comments → empty regions", () => {
    expect(scanHtmlComments("plain text\n")).toEqual([]);
  });

  it("single inline comment → one region", () => {
    const text = "before <!-- hidden --> after";
    const regions = scanHtmlComments(text);
    expect(regions.length).toBe(1);
    expect(text.slice(regions[0]!.startOffset, regions[0]!.endOffset)).toBe(
      "<!-- hidden -->",
    );
    expect(regions[0]!.kind).toBe("html-comment");
  });

  it("multi-line comment → one region spanning lines", () => {
    const text = "before\n<!--\nlinetext\n-->\nafter";
    const regions = scanHtmlComments(text);
    expect(regions.length).toBe(1);
    expect(text.slice(regions[0]!.startOffset, regions[0]!.endOffset)).toBe(
      "<!--\nlinetext\n-->",
    );
  });

  it("multiple comments → multiple regions", () => {
    const text = "<!-- a --> middle <!-- b -->";
    const regions = scanHtmlComments(text);
    expect(regions.length).toBe(2);
  });

  it("nested comment is flat — first --> closes", () => {
    const text = "<!-- outer <!-- inner --> tail -->";
    const regions = scanHtmlComments(text);
    // First --> after the first <!-- closes; tail "tail -->" is outside.
    expect(regions.length).toBe(1);
    expect(text.slice(regions[0]!.startOffset, regions[0]!.endOffset)).toBe(
      "<!-- outer <!-- inner -->",
    );
  });

  it("unclosed comment runs to EOF", () => {
    const text = "before <!-- unclosed forever";
    const regions = scanHtmlComments(text);
    expect(regions.length).toBe(1);
    expect(regions[0]!.endOffset).toBe(text.length);
  });
});
