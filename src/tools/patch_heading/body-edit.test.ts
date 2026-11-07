// Original — no upstream. patch_heading body-edit pure-function tests per BI-040 / Principle II — each placement mode against multiple body shapes; line-ending + trailing-newline detection (FR-014 / FR-015); no-modify guarantee for content outside the reach.
import { describe, expect, it } from "vitest";

import {
  applyAppend,
  applyPrepend,
  applyReplace,
  detectTrailingNewline,
} from "./body-edit.js";
import { REACH_END_EOF, walkHeadings } from "./heading-walk.js";
import { lineText, splitNoteLines } from "../_note-lines.js";

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
    // The handler's edit array (splitNoteLines) has no phantom empty last element; the reach
    // clamps to 3 and the content lands after "a1".
    const out = applyAppend(splitNoteLines(content), resolved, "appended");
    expect(out).toEqual(["# Top\n", "## A\n", "a1\n", "appended"]);
  });
});

// BI-0206: append joins the section's last content line; the blank lines that close the
// section stay between the new content and the next heading. Fixtures use the handler's edit
// array (splitNoteLines); results are compared as the finders' line text.
describe("applyAppend keeps the section's trailing blank lines after the content (BI-0206)", () => {
  function appendText(note: string, segments: string[], content: string): string[] {
    return applyAppend(splitNoteLines(note), resolve(note, segments), content).map(lineText);
  }

  it("extends a list that ends the section, blank line kept before the next heading", () => {
    const note = "# Top\n## Before\n- one\n- two\n\n## After\n";
    expect(appendText(note, ["Top", "Before"], "- three")).toEqual([
      "# Top", "## Before", "- one", "- two", "- three", "", "## After",
    ]);
  });

  it("makes an appended table row the table's last row", () => {
    const note = "# Top\n## T\n| a | b |\n| - | - |\n| 1 | 2 |\n\n## After\n";
    expect(appendText(note, ["Top", "T"], "| 3 | 4 |")).toEqual([
      "# Top", "## T", "| a | b |", "| - | - |", "| 1 | 2 |", "| 3 | 4 |", "", "## After",
    ]);
  });

  it("keeps one blank line before the next heading after a paragraph", () => {
    const note = "# Top\n## P\nA paragraph.\n\n## After\n";
    expect(appendText(note, ["Top", "P"], "More text.")).toEqual([
      "# Top", "## P", "A paragraph.", "More text.", "", "## After",
    ]);
  });

  it("starts a separate block when the content begins with a blank line", () => {
    const note = "# Top\n## P\nA paragraph.\n\n## After\n";
    expect(appendText(note, ["Top", "P"], "\nNew paragraph.")).toEqual([
      "# Top", "## P", "A paragraph.", "", "New paragraph.", "", "## After",
    ]);
  });

  it("at end of note with a trailing blank line, keeps the blank line after the content", () => {
    const note = "# Top\n## A\na1\n\n";
    expect(appendText(note, ["Top", "A"], "appended")).toEqual([
      "# Top", "## A", "a1", "appended", "",
    ]);
  });

  it("keeps several blank lines, all after the content", () => {
    const note = "# Top\n## A\n- one\n\n\n\n## B\n";
    expect(appendText(note, ["Top", "A"], "- two")).toEqual([
      "# Top", "## A", "- one", "- two", "", "", "", "## B",
    ]);
  });

  it("treats a whitespace-only line as blank", () => {
    const note = "# Top\n## A\n- one\n \t\n## B\n";
    expect(appendText(note, ["Top", "A"], "- two")).toEqual([
      "# Top", "## A", "- one", "- two", " \t", "## B",
    ]);
  });

  it("on a body of only blank lines, lands right after the heading and keeps the blanks after it", () => {
    const note = "# Top\n## A\n\n\n## B\n";
    expect(appendText(note, ["Top", "A"], "new")).toEqual([
      "# Top", "## A", "new", "", "", "## B",
    ]);
  });

  it("with a child subtree, lands after the last child's content, its blank line kept after", () => {
    const note = "# Top\n## A\na-direct\n\n### Child\n- c1\n\n## B\n";
    expect(appendText(note, ["Top", "A"], "- c2")).toEqual([
      "# Top", "## A", "a-direct", "", "### Child", "- c1", "- c2", "", "## B",
    ]);
  });

  it("lands multi-line content as a whole before the blank line", () => {
    const note = "# Top\n## A\n- one\n\n## B\n";
    expect(appendText(note, ["Top", "A"], "- two\n- three")).toEqual([
      "# Top", "## A", "- one", "- two", "- three", "", "## B",
    ]);
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
