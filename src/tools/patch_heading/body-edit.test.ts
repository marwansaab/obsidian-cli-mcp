// Original — no upstream. patch_heading body-edit pure-function tests per BI-040 / Principle II — each placement mode against multiple body shapes; line-ending + trailing-newline detection (FR-014 / FR-015); no-modify guarantee for content outside the reach.
import { describe, expect, it } from "vitest";

import {
  applyAppend,
  applyPrepend,
  applyReplace,
  detectLineEnding,
  detectTrailingNewline,
} from "./body-edit.js";
import { REACH_END_EOF, walkHeadings } from "./heading-walk.js";

function resolve(content: string, segments: string[]) {
  const r = walkHeadings(content, segments);
  if (r === null) throw new Error(`fixture failure: ${segments.join("#")} did not resolve`);
  return r;
}

function splitLines(content: string): string[] {
  return content.split("\n");
}

describe("applyAppend", () => {
  it("lands content at end-of-reach (immediately before the next equal-rank heading)", () => {
    const content =
      "# Top\n" +
      "## A\n" +
      "a1\n" +
      "## B\n" +
      "b1\n";
    const resolved = resolve(content, ["Top", "A"]);
    const out = applyAppend(splitLines(content), resolved, "appended");
    // After: "# Top", "## A", "a1", "appended", "## B", "b1", ""
    expect(out).toEqual(["# Top", "## A", "a1", "appended", "## B", "b1", ""]);
  });

  it("lands content after child-subtree (full reach) when a child heading exists", () => {
    const content =
      "# Top\n" +
      "## A\n" +
      "a-direct\n" +
      "### Child\n" +
      "c1\n" +
      "## B\n";
    const resolved = resolve(content, ["Top", "A"]);
    const out = applyAppend(splitLines(content), resolved, "appended");
    expect(out).toEqual(["# Top", "## A", "a-direct", "### Child", "c1", "appended", "## B", ""]);
  });

  it("lands content immediately after marker on empty-body heading", () => {
    const content =
      "# Top\n" +
      "## A\n" +
      "## B\n";
    const resolved = resolve(content, ["Top", "A"]);
    const out = applyAppend(splitLines(content), resolved, "appended");
    expect(out).toEqual(["# Top", "## A", "appended", "## B", ""]);
  });

  it("lands content at end-of-file when the heading is the last in the note (EOF reach)", () => {
    const content =
      "# Top\n" +
      "## A\n" +
      "a1\n";
    const resolved = resolve(content, ["Top", "A"]);
    expect(resolved.reachEndLineIndex).toBe(REACH_END_EOF);
    const out = applyAppend(splitLines(content), resolved, "appended");
    // splitLines produces ["# Top", "## A", "a1", ""]; reach clamps to 4; content lands at index 4.
    expect(out).toEqual(["# Top", "## A", "a1", "", "appended"]);
  });
});

describe("applyPrepend", () => {
  it("lands content immediately after marker line", () => {
    const content =
      "# Top\n" +
      "## A\n" +
      "a1\n" +
      "## B\n";
    const resolved = resolve(content, ["Top", "A"]);
    const out = applyPrepend(splitLines(content), resolved, "lead-in");
    expect(out).toEqual(["# Top", "## A", "lead-in", "a1", "## B", ""]);
  });

  it("lands between marker and adjacent child heading (FR-011 adjacency case)", () => {
    const content =
      "# Top\n" +
      "## A\n" +
      "### Child\n" +
      "c1\n" +
      "## B\n";
    const resolved = resolve(content, ["Top", "A"]);
    const out = applyPrepend(splitLines(content), resolved, "lead-in");
    expect(out).toEqual(["# Top", "## A", "lead-in", "### Child", "c1", "## B", ""]);
  });
});

describe("applyReplace", () => {
  it("swaps direct body when no child subtree exists", () => {
    const content =
      "# Top\n" +
      "## A\n" +
      "old-a1\n" +
      "old-a2\n" +
      "## B\n" +
      "b1\n";
    const resolved = resolve(content, ["Top", "A"]);
    const out = applyReplace(splitLines(content), resolved, "new-direct");
    expect(out).toEqual(["# Top", "## A", "new-direct", "## B", "b1", ""]);
  });

  it("swaps direct body but preserves child-subtree", () => {
    const content =
      "# Top\n" +
      "## A\n" +
      "old-direct\n" +
      "### Child\n" +
      "c1\n" +
      "## B\n";
    const resolved = resolve(content, ["Top", "A"]);
    const out = applyReplace(splitLines(content), resolved, "new-direct");
    expect(out).toEqual(["# Top", "## A", "new-direct", "### Child", "c1", "## B", ""]);
  });

  it("collapses direct body to zero lines when content is empty (FR-018a)", () => {
    const content =
      "# Top\n" +
      "## A\n" +
      "old-a1\n" +
      "old-a2\n" +
      "## B\n";
    const resolved = resolve(content, ["Top", "A"]);
    const out = applyReplace(splitLines(content), resolved, "");
    expect(out).toEqual(["# Top", "## A", "## B", ""]);
  });

  it("lands content as direct body when the heading had empty body", () => {
    const content =
      "# Top\n" +
      "## A\n" +
      "## B\n";
    const resolved = resolve(content, ["Top", "A"]);
    const out = applyReplace(splitLines(content), resolved, "new-direct");
    expect(out).toEqual(["# Top", "## A", "new-direct", "## B", ""]);
  });
});

describe("multi-line content", () => {
  it("applyAppend splits multi-line content on '\\n' and lands as multiple lines", () => {
    const content = "# Top\n## A\na1\n## B\n";
    const resolved = resolve(content, ["Top", "A"]);
    const out = applyAppend(splitLines(content), resolved, "line1\nline2");
    expect(out).toEqual(["# Top", "## A", "a1", "line1", "line2", "## B", ""]);
  });

  it("applyReplace splits multi-line content", () => {
    const content = "# Top\n## A\nold\n## B\n";
    const resolved = resolve(content, ["Top", "A"]);
    const out = applyReplace(splitLines(content), resolved, "new1\nnew2");
    expect(out).toEqual(["# Top", "## A", "new1", "new2", "## B", ""]);
  });
});

describe("no-modify guarantee", () => {
  it("for append, every line outside the reach is byte-identical", () => {
    const content =
      "frontmatter-line\n" +
      "# Top\n" +
      "## A\n" +
      "a1\n" +
      "## B\n" +
      "b-text\n";
    const resolved = resolve(content, ["Top", "A"]);
    const inputLines = splitLines(content);
    const out = applyAppend(inputLines, resolved, "appended");
    // Lines before marker
    expect(out[0]).toBe("frontmatter-line");
    expect(out[1]).toBe("# Top");
    // Marker preserved
    expect(out[2]).toBe("## A");
    // Lines after reach
    expect(out.slice(-3)).toEqual(["## B", "b-text", ""]);
  });

  it("for replace, marker line and post-reach lines are byte-identical", () => {
    const content =
      "# Top\n" +
      "## A\n" +
      "old-direct\n" +
      "### Child\n" +
      "c1\n" +
      "## B\n";
    const resolved = resolve(content, ["Top", "A"]);
    const out = applyReplace(splitLines(content), resolved, "new-direct");
    expect(out[1]).toBe("## A");        // marker
    expect(out[3]).toBe("### Child");   // child subtree preserved
    expect(out[5]).toBe("## B");        // next sibling preserved
  });
});

describe("detectLineEnding", () => {
  it("returns 'lf' for LF-only content", () => {
    expect(detectLineEnding("# Top\n## A\n")).toBe("lf");
  });

  it("returns 'crlf' when any CRLF is present", () => {
    expect(detectLineEnding("# Top\r\n## A\n")).toBe("crlf");
  });

  it("returns 'lf' for content with no newlines", () => {
    expect(detectLineEnding("no-newlines")).toBe("lf");
  });
});

describe("detectTrailingNewline", () => {
  it("returns true when content ends with '\\n'", () => {
    expect(detectTrailingNewline("body\n")).toBe(true);
  });

  it("returns true when content ends with '\\r\\n'", () => {
    expect(detectTrailingNewline("body\r\n")).toBe(true);
  });

  it("returns false when content does not end with a newline", () => {
    expect(detectTrailingNewline("body")).toBe(false);
  });

  it("returns false for the empty string", () => {
    expect(detectTrailingNewline("")).toBe(false);
  });
});
