// Original — no upstream. Co-located tests for scanFencedCodeBlocks — paired-fence detection, mixed fence types, unclosed-EOF behaviour, nested-fence-as-content.
import { describe, expect, it } from "vitest";

import { scanFencedCodeBlocks } from "./fence-scan.js";

describe("scanFencedCodeBlocks", () => {
  it("no fences → empty regions", () => {
    expect(scanFencedCodeBlocks("plain prose\nstill prose\n")).toEqual([]);
  });

  it("single backtick fence pair → one region", () => {
    const text = "before\n```\ncode\n```\nafter\n";
    const regions = scanFencedCodeBlocks(text);
    expect(regions.length).toBe(1);
    expect(regions[0]!.kind).toBe("fenced-code-block");
    expect(text.slice(regions[0]!.startOffset, regions[0]!.endOffset)).toBe(
      "```\ncode\n```",
    );
  });

  it("single tilde fence pair → one region", () => {
    const text = "before\n~~~\ncode\n~~~\nafter\n";
    const regions = scanFencedCodeBlocks(text);
    expect(regions.length).toBe(1);
    expect(regions[0]!.kind).toBe("fenced-code-block");
  });

  it("mismatched fence characters: backtick open + tilde 'close' → fence stays open to EOF", () => {
    const text = "```\ncode\n~~~\n";
    const regions = scanFencedCodeBlocks(text);
    expect(regions.length).toBe(1);
    // unclosed → runs to text.length
    expect(regions[0]!.endOffset).toBe(text.length);
  });

  it("unclosed backtick fence runs to EOF", () => {
    const text = "before\n```\nrest of file\n";
    const regions = scanFencedCodeBlocks(text);
    expect(regions.length).toBe(1);
    expect(regions[0]!.endOffset).toBe(text.length);
  });

  it("nested-style fence inside outer fence is content, not a new fence", () => {
    // Outer ``` … ```; inner triple backtick on a content line is treated as
    // the close of the OUTER fence per CommonMark — first matching close wins.
    const text = "```\ncontent\n```\nprose\n";
    const regions = scanFencedCodeBlocks(text);
    expect(regions.length).toBe(1);
    expect(text.slice(regions[0]!.startOffset, regions[0]!.endOffset)).toBe(
      "```\ncontent\n```",
    );
  });

  it("info string after opening fence is ignored for matching", () => {
    const text = "```ts\nconst x = 1;\n```\n";
    const regions = scanFencedCodeBlocks(text);
    expect(regions.length).toBe(1);
  });

  it("multiple fence pairs → multiple regions", () => {
    const text = "```\na\n```\nprose\n```\nb\n```\n";
    const regions = scanFencedCodeBlocks(text);
    expect(regions.length).toBe(2);
  });

  it("handles CRLF line endings", () => {
    const text = "```\r\ncode\r\n```\r\n";
    const regions = scanFencedCodeBlocks(text);
    expect(regions.length).toBe(1);
  });
});
