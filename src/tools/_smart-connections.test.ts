// Original — no upstream. Tests for TO_MATCH_JS (BI-0184), the in-eval rule that turns a Smart Connections block key and score into a match {path, headingPath, score}, which both Smart Connections templates interpolate. The fragment runs under node:vm and its answers are compared as JSON, because vm objects and arrays belong to another realm.
import { runInNewContext } from "node:vm";

import { describe, expect, test } from "vitest";

import { TO_MATCH_JS } from "./_smart-connections.js";

describe("TO_MATCH_JS splits a block key on its first # and drops empty segments", () => {
  const toMatch = runInNewContext(TO_MATCH_JS) as (key: string, score: unknown) => unknown;

  test.each<[string, { path: string; headingPath: string[] }]>([
    ["Note.md", { path: "Note.md", headingPath: [] }],
    ["Note.md#", { path: "Note.md", headingPath: [] }],
    ["Dir/Note.md#", { path: "Dir/Note.md", headingPath: [] }],
    ["Note.md#H1", { path: "Note.md", headingPath: ["H1"] }],
    ["Note.md#H1#H2", { path: "Note.md", headingPath: ["H1", "H2"] }],
    ["Note.md#---frontmatter---", { path: "Note.md", headingPath: ["---frontmatter---"] }],
    ["Note.md#H1#{1}", { path: "Note.md", headingPath: ["H1", "{1}"] }],
    ["Note.md#H1#", { path: "Note.md", headingPath: ["H1"] }],
    ["Note.md##H2", { path: "Note.md", headingPath: ["H2"] }],
    ["Note.md##", { path: "Note.md", headingPath: [] }],
    ["", { path: "", headingPath: [] }],
  ])("%j → %j", (key, expected) => {
    expect(JSON.stringify(toMatch(key, 0.5))).toBe(JSON.stringify({ ...expected, score: 0.5 }));
  });
});
