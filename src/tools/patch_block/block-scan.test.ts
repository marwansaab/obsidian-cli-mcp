// Original — no upstream. patch_block block-scan tests per BI-043 / Principle II — per-shape classification, fenced-code opacity (FR-011), frontmatter scan-skip (FR-014), setext lookahead (R2), first-match-wins (FR-002a), alphabet boundary (FR-004).
import { describe, expect, it } from "vitest";

import { findBlock, scanBlocks } from "./block-scan.js";

describe("scanBlocks — paragraph shape", () => {
  it("trailing marker on a plain line classifies as paragraph", () => {
    const matches = scanBlocks("Some text ^foo");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.shape).toBe("paragraph");
    expect(matches[0]!.blockId).toBe("foo");
    expect(matches[0]!.markerLineIndex).toBe(0);
    expect(matches[0]!.blockStartLineIndex).toBe(0);
    expect(matches[0]!.blockEndLineIndex).toBe(0);
  });

  it("paragraph in middle of note classifies correctly", () => {
    const note = "intro\n\nA real paragraph ^abc\n\nclosing\n";
    const matches = scanBlocks(note);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.shape).toBe("paragraph");
    expect(matches[0]!.markerLineIndex).toBe(2);
  });
});

describe("scanBlocks — list-item shape", () => {
  it("dash list item classifies as list-item", () => {
    const matches = scanBlocks("- item content ^foo");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.shape).toBe("list-item");
  });

  it("asterisk list item classifies as list-item", () => {
    const matches = scanBlocks("* item content ^foo");
    expect(matches[0]!.shape).toBe("list-item");
  });

  it("plus list item classifies as list-item", () => {
    const matches = scanBlocks("+ item content ^foo");
    expect(matches[0]!.shape).toBe("list-item");
  });

  it("ordered list (1.) classifies as list-item", () => {
    const matches = scanBlocks("1. item content ^foo");
    expect(matches[0]!.shape).toBe("list-item");
  });

  it("ordered list (42.) classifies as list-item", () => {
    const matches = scanBlocks("42. item content ^foo");
    expect(matches[0]!.shape).toBe("list-item");
  });

  it("nested two-space indent classifies as list-item", () => {
    const matches = scanBlocks("  - nested ^foo");
    expect(matches[0]!.shape).toBe("list-item");
  });

  it("deeply nested four-space indent classifies as list-item", () => {
    const matches = scanBlocks("    - deeply nested ^foo");
    expect(matches[0]!.shape).toBe("list-item");
  });
});

describe("scanBlocks — separately-placed shape", () => {
  it("table immediately followed by marker line classifies as separately-placed", () => {
    const note =
      "| col1 | col2 |\n" +
      "| ---- | ---- |\n" +
      "| a    | b    |\n" +
      "^foo\n";
    const matches = scanBlocks(note);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.shape).toBe("separately-placed");
    expect(matches[0]!.markerLineIndex).toBe(3);
    expect(matches[0]!.blockStartLineIndex).toBe(0);
    expect(matches[0]!.blockEndLineIndex).toBe(2);
  });

  it("callout immediately followed by marker line classifies as separately-placed", () => {
    const note =
      "> [!note]\n" +
      "> body text\n" +
      "^foo\n";
    const matches = scanBlocks(note);
    expect(matches[0]!.shape).toBe("separately-placed");
    expect(matches[0]!.blockStartLineIndex).toBe(0);
    expect(matches[0]!.blockEndLineIndex).toBe(1);
  });

  it("blockquote immediately followed by marker line classifies as separately-placed", () => {
    const note =
      "> quoted text\n" +
      "> continues\n" +
      "^foo\n";
    const matches = scanBlocks(note);
    expect(matches[0]!.shape).toBe("separately-placed");
  });

  it("indented-code immediately followed by marker line classifies as separately-placed", () => {
    const note =
      "    line one of code\n" +
      "    line two of code\n" +
      "^foo\n";
    const matches = scanBlocks(note);
    expect(matches[0]!.shape).toBe("separately-placed");
  });

  it("marker-only line preceded by a blank is NOT separately-placed", () => {
    const note =
      "| a | b |\n" +
      "\n" +
      "^foo\n";
    const matches = scanBlocks(note);
    expect(matches).toHaveLength(0);
  });

  it("marker-only line preceded by plain paragraph is NOT bound", () => {
    const note = "plain paragraph text\n^foo\n";
    const matches = scanBlocks(note);
    expect(matches).toHaveLength(0);
  });
});

describe("scanBlocks — on-heading shapes", () => {
  it("ATX heading rank 1 with trailing marker classifies as on-heading-atx", () => {
    const matches = scanBlocks("# Heading ^foo");
    expect(matches[0]!.shape).toBe("on-heading-atx");
  });

  it("ATX heading rank 2 with trailing marker classifies as on-heading-atx", () => {
    const matches = scanBlocks("## Section ^bar");
    expect(matches[0]!.shape).toBe("on-heading-atx");
  });

  it("ATX heading rank 3-6 with trailing marker classifies as on-heading-atx", () => {
    for (const prefix of ["### ", "#### ", "##### ", "###### "]) {
      const matches = scanBlocks(`${prefix}Heading ^baz`);
      expect(matches[0]!.shape).toBe("on-heading-atx");
    }
  });

  it("setext rank 1 (===) classifies as on-heading-setext", () => {
    const matches = scanBlocks("Heading text ^foo\n===\n");
    expect(matches[0]!.shape).toBe("on-heading-setext");
  });

  it("setext rank 2 (---) classifies as on-heading-setext", () => {
    const matches = scanBlocks("Heading text ^foo\n---\n");
    expect(matches[0]!.shape).toBe("on-heading-setext");
  });

  it("paragraph-followed-by-non-underline does NOT promote to setext", () => {
    const matches = scanBlocks("Heading text ^foo\nNot an underline\n");
    expect(matches[0]!.shape).toBe("paragraph");
  });

  it("empty underline does NOT promote to setext", () => {
    const matches = scanBlocks("Heading text ^foo\n\n");
    expect(matches[0]!.shape).toBe("paragraph");
  });

  it("mixed-character 'underline' (=-=) does NOT promote to setext", () => {
    const matches = scanBlocks("Heading text ^foo\n=-=\n");
    expect(matches[0]!.shape).toBe("paragraph");
  });
});

describe("scanBlocks — fenced-code opacity (FR-011)", () => {
  it("marker inside ``` fence is NOT bound", () => {
    const note =
      "regular text\n" +
      "```\n" +
      "text ^foo\n" +
      "```\n";
    const matches = scanBlocks(note);
    expect(matches).toHaveLength(0);
  });

  it("marker inside ~~~ fence is NOT bound", () => {
    const note =
      "~~~\n" +
      "text ^foo\n" +
      "~~~\n";
    const matches = scanBlocks(note);
    expect(matches).toHaveLength(0);
  });

  it("marker outside the fence IS bound; identical marker inside is NOT", () => {
    const note =
      "outside ^foo\n" +
      "```\n" +
      "inside ^foo\n" +
      "```\n";
    const match = findBlock(note, "foo");
    expect(match).not.toBeNull();
    expect(match!.markerLineIndex).toBe(0);
  });
});

describe("scanBlocks — first-match-wins (FR-002a)", () => {
  it("findBlock returns the FIRST match in document order", () => {
    const note = "line A ^foo\nline B\nline C ^foo\n";
    const match = findBlock(note, "foo");
    expect(match!.markerLineIndex).toBe(0);
  });

  it("scanBlocks returns all matches; findBlock picks the first", () => {
    const note = "first ^foo\nsecond ^foo\n";
    expect(scanBlocks(note)).toHaveLength(2);
    expect(findBlock(note, "foo")!.markerLineIndex).toBe(0);
  });

  it("findBlock returns distinct matches for distinct ids", () => {
    const note = "first ^foo\nsecond\nthird ^bar\n";
    expect(findBlock(note, "foo")!.markerLineIndex).toBe(0);
    expect(findBlock(note, "bar")!.markerLineIndex).toBe(2);
  });
});

describe("scanBlocks — alphabet boundary (FR-004)", () => {
  it("alphanumeric + hyphen id is bound", () => {
    const matches = scanBlocks("text ^abc-XYZ-123");
    expect(matches[0]!.blockId).toBe("abc-XYZ-123");
  });

  it("underscore in id is NOT bound (scanner regex mirrors validation alphabet)", () => {
    // The scanner's trailing-marker regex requires the alphabet-conforming token
    // to extend to end-of-line. `text ^block_one` ends with `_one`, which is
    // outside the alphabet, so the regex never anchors — the token is unbound.
    expect(scanBlocks("text ^block_one")).toEqual([]);
    expect(findBlock("text ^block_one", "block_one")).toBeNull();
    expect(findBlock("text ^block_one", "block")).toBeNull();
  });
});

describe("scanBlocks — empty + edge cases", () => {
  it("note with no markers returns empty array", () => {
    expect(scanBlocks("just some text\nno markers here\n")).toEqual([]);
    expect(findBlock("just some text", "anything")).toBeNull();
  });

  it("empty string returns empty array", () => {
    expect(scanBlocks("")).toEqual([]);
  });
});

describe("scanBlocks — frontmatter scan-skip (FR-014)", () => {
  it("marker inside leading YAML frontmatter is NOT bound", () => {
    const note =
      "---\n" +
      "key: value with ^foo\n" +
      "---\n" +
      "\n" +
      "body\n";
    expect(findBlock(note, "foo")).toBeNull();
  });

  it("body marker is bound when same id also appears in frontmatter (body wins)", () => {
    const note =
      "---\n" +
      "decoy: text ^foo\n" +
      "---\n" +
      "\n" +
      "Real paragraph ^foo\n";
    const match = findBlock(note, "foo");
    expect(match).not.toBeNull();
    expect(match!.markerLineIndex).toBe(4);
    expect(match!.shape).toBe("paragraph");
  });

  it("note without leading '---' has no frontmatter region (body-leading triple-dash is content)", () => {
    // `---` not at line 0 — should NOT trigger frontmatter detection. The line classifies
    // as a setext underline for the line preceding it (if any), or as content.
    const note = "real first line\n---\nbody ^foo\n";
    const match = findBlock(note, "foo");
    expect(match).not.toBeNull();
  });

  it("empty frontmatter has no body markers inside; body markers still bound", () => {
    const note = "---\n---\n\nbody ^foo\n";
    const match = findBlock(note, "foo");
    expect(match!.markerLineIndex).toBe(3);
  });
});

describe("scanBlocks — CRLF + line-ending handling", () => {
  it("CRLF-encoded note scans the same as LF-encoded", () => {
    const lf = scanBlocks("text ^foo\nmore\n");
    const crlf = scanBlocks("text ^foo\r\nmore\r\n");
    expect(crlf.length).toBe(lf.length);
    expect(crlf[0]!.blockId).toBe("foo");
    expect(crlf[0]!.shape).toBe("paragraph");
  });
});
