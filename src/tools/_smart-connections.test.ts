// Original — no upstream. Tests for SPLIT_BLOCK_KEY_JS (BI-0184), the in-eval split of a Smart Connections block key into {path, headingPath} that both Smart Connections templates interpolate. The fragment runs under node:vm and its answers are compared as JSON, because vm objects and arrays belong to another realm.
import { runInNewContext } from "node:vm";

import { describe, expect, test } from "vitest";

import { SPLIT_BLOCK_KEY_JS } from "./_smart-connections.js";

describe("SPLIT_BLOCK_KEY_JS splits a block key on its first # and drops empty segments", () => {
  const splitKey = runInNewContext(SPLIT_BLOCK_KEY_JS) as (key: string) => unknown;

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
    expect(JSON.stringify(splitKey(key))).toBe(JSON.stringify(expected));
  });
});
