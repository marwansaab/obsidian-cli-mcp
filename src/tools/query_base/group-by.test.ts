// Original — no upstream. findViewGrouping tests (BI-0207): the block-style groupBy of the named view only, Obsidian's grouped / ungrouped rule (non-empty string property, exactly ASC or DESC), custom group order detection, and unreadable shapes reported as unreadable, never as ungrouped.
import { describe, expect, it } from "vitest";

import { findViewGrouping } from "./group-by.js";

const BASE = [
  "filters:",
  "  and:",
  '    - file.inFolder("Sandbox/bi0207")',
  "views:",
  "  - type: table",
  "    name: Flat",
  "    order:",
  "      - file.name",
  "  - type: table",
  "    name: Grouped",
  "    groupBy:",
  "      property: note.status",
  "      direction: ASC",
  "    order:",
  "      - file.name",
  "  - type: table",
  "    name: GroupedDesc",
  "    groupBy:",
  "      property: note.status",
  "      direction: DESC",
  "",
].join("\n");

describe("findViewGrouping", () => {
  it("reads the named view's block-style groupBy", () => {
    expect(findViewGrouping(BASE, "Grouped")).toEqual({ kind: "grouped", property: "note.status", direction: "ASC" });
    expect(findViewGrouping(BASE, "GroupedDesc")).toEqual({ kind: "grouped", property: "note.status", direction: "DESC" });
  });

  it("does not take another view's groupBy", () => {
    expect(findViewGrouping(BASE, "Flat")).toEqual({ kind: "none" });
  });

  it("answers none without scanning when the file never says groupBy", () => {
    expect(findViewGrouping("views: [{type: table, name: X}]", "X")).toEqual({ kind: "none" });
  });

  it("reads CRLF text, a BOM, comments, quoted names and items written flush with views:", () => {
    const text = [
      "﻿views: # the views",
      "- type: table",
      "  name: 'It''s grouped'",
      "  # a comment",
      "  groupBy:",
      '    property: "file.folder"',
      "    direction: 'DESC' # newest first",
      "- type: table",
      '  name: "Other"',
    ].join("\r\n");
    expect(findViewGrouping(text, "It's grouped")).toEqual({ kind: "grouped", property: "file.folder", direction: "DESC" });
    expect(findViewGrouping(text, "Other")).toEqual({ kind: "none" });
  });

  it("takes the first of two views with the same name, as Obsidian does", () => {
    const text = BASE + ["  - type: table", "    name: Flat", "    groupBy:", "      property: x", "      direction: ASC", ""].join("\n");
    expect(findViewGrouping(text, "Flat")).toEqual({ kind: "none" });
  });

  it.each([
    ["a lower-case direction", "asc"],
    ["an unknown direction", "UP"],
  ])("treats %s as ungrouped, as Obsidian's view parser does", (_label, direction) => {
    const text = BASE.replace("direction: ASC", `direction: ${direction}`);
    expect(findViewGrouping(text, "Grouped")).toEqual({ kind: "none" });
  });

  it("treats an empty property as ungrouped", () => {
    expect(findViewGrouping(BASE.replace("property: note.status\n      direction: ASC", "property: ''\n      direction: ASC"), "Grouped")).toEqual({ kind: "none" });
  });

  it.each([
    ["a block list", "    groupOrder:\n      - one\n      - two\n"],
    ["a list flush with its key", "    groupOrder:\n    - one\n"],
    ["a flow list", "    groupOrder: [one, two]\n"],
  ])("flags a custom group order written as %s", (_label, order) => {
    const text = BASE.replace("    order:\n      - file.name\n  - type: table\n    name: GroupedDesc", `${order}    order:\n      - file.name\n  - type: table\n    name: GroupedDesc`);
    expect(findViewGrouping(text, "Grouped")).toEqual({ kind: "custom-order" });
  });

  it("ignores a groupOrder that is not a list, as Obsidian does", () => {
    const text = BASE.replace("      direction: ASC\n", "      direction: ASC\n    groupOrder: none\n");
    expect(findViewGrouping(text, "Grouped")).toMatchObject({ kind: "grouped" });
  });

  it.each([
    ["a flow-style groupBy", BASE.replace("    groupBy:\n      property: note.status\n      direction: ASC\n", "    groupBy: {property: note.status, direction: ASC}\n")],
    ["a groupBy without direction", BASE.replace("      property: note.status\n      direction: ASC\n", "      property: note.status\n")],
    ["a non-string property", BASE.replace("property: note.status\n      direction: ASC", "property: 42\n      direction: ASC")],
    ["a block-scalar property", BASE.replace("property: note.status\n      direction: ASC", "property: |\n        note.status\n      direction: ASC")],
    ["flow-style views", "views: [{type: table, name: Grouped, groupBy: {property: s, direction: ASC}}]\n"],
    ["a view the scan cannot find", BASE.replace("name: Grouped\n", "name: Renamed\n")],
  ])("reports %s as unreadable, not as ungrouped", (_label, text) => {
    expect(findViewGrouping(text, "Grouped")).toMatchObject({ kind: "unreadable" });
  });
});
