// Original — no upstream. Template-execution tests for the find_by_property eval template (BI-0181): renders JS_TEMPLATE through composeEvalCode and runs it in node:vm against a stub `app.metadataCache` (fileCache × metadataCache), checking that a `tags` lookup ignores one leading `#` on the cached value and on the query, whatever mix of cache forms the vault holds, and that every other property keeps strict comparison.
import { describe, expect, it } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";

type Frontmatter = Record<string, unknown>;

interface Payload {
  property: string;
  value: unknown;
  folder?: string;
  arrayMatch?: boolean;
  caseSensitive?: boolean;
}

/** Runs the template over notes keyed by path, each with its cached frontmatter. */
async function find(notes: Record<string, Frontmatter>, payload: Payload): Promise<string[]> {
  const fileCache: Record<string, { hash: string }> = {};
  const metadataCache: Record<string, { frontmatter: Frontmatter }> = {};
  for (const [i, [path, frontmatter]] of Object.entries(notes).entries()) {
    fileCache[path] = { hash: `h${i}` };
    metadataCache[`h${i}`] = { frontmatter };
  }
  const app = { metadataCache: { fileCache, metadataCache } };
  const out = (await runEvalTemplate(
    JS_TEMPLATE,
    { folder: "", arrayMatch: true, caseSensitive: true, ...payload },
    app,
  )) as { count: number; paths: string[] };
  expect(out.count).toBe(out.paths.length);
  return out.paths;
}

// Eleven notes tagged project-x, some cached raw and some re-parsed with `#` (BI-0181 criterion 1).
const MIXED: Record<string, Frontmatter> = Object.fromEntries(
  Array.from({ length: 11 }, (_, i) => [
    `TC/note-${String(i).padStart(2, "0")}.md`,
    { tags: [i % 2 === 0 ? "#project-x" : "project-x", "other"] },
  ]),
);
const ALL_MIXED = Object.keys(MIXED);

describe("find_by_property template: tags ignore one leading # (BI-0181)", () => {
  it("query without # finds every note, whichever form the cache holds, and repeats identically", async () => {
    const notes = { ...MIXED, "Other/untagged.md": { tags: ["project-y"] } };
    const first = await find(notes, { property: "tags", value: "project-x" });
    expect(first).toEqual(ALL_MIXED);
    expect(await find(notes, { property: "tags", value: "project-x" })).toEqual(first);
  });

  it("query with # returns the same notes as the query without it (criterion 2)", async () => {
    expect(await find(MIXED, { property: "tags", value: "#project-x" })).toEqual(ALL_MIXED);
  });

  it("scalar tags values are compared the same way", async () => {
    const notes = { "a.md": { tags: "#solo" }, "b.md": { tags: "solo" } };
    expect(await find(notes, { property: "tags", value: "solo" })).toEqual(["a.md", "b.md"]);
    expect(await find(notes, { property: "tags", value: "#solo" })).toEqual(["a.md", "b.md"]);
  });

  it("array_match false compares each element after the strip, and order still matters", async () => {
    const notes = {
      "raw.md": { tags: ["a", "b"] },
      "one.md": { tags: ["#a", "b"] },
      "both.md": { tags: ["#a", "#b"] },
      "reversed.md": { tags: ["#b", "#a"] },
    };
    expect(await find(notes, { property: "tags", value: ["a", "b"], arrayMatch: false })).toEqual([
      "raw.md",
      "one.md",
      "both.md",
    ]);
    expect(await find(notes, { property: "tags", value: ["#a", "b"], arrayMatch: false })).toEqual([
      "raw.md",
      "one.md",
      "both.md",
    ]);
  });

  it("case_sensitive false composes with the strip", async () => {
    const notes = { "raw.md": { tags: ["project-x"] }, "hash.md": { tags: ["#PROJECT-X"] } };
    expect(await find(notes, { property: "tags", value: "#Project-X", caseSensitive: false })).toEqual([
      "raw.md",
      "hash.md",
    ]);
    expect(await find(notes, { property: "tags", value: "#Project-X" })).toEqual([]);
  });

  it("strips only one #: a cached ##x is matched by ##x, not by x or #x", async () => {
    const notes = { "double.md": { tags: ["##x"] } };
    expect(await find(notes, { property: "tags", value: "x" })).toEqual([]);
    expect(await find(notes, { property: "tags", value: "#x" })).toEqual([]);
    expect(await find(notes, { property: "tags", value: "##x" })).toEqual(["double.md"]);
  });

  it("non-string elements in a tags list compare as before", async () => {
    const notes = { "mixed.md": { tags: ["#a", 7, null] } };
    expect(await find(notes, { property: "tags", value: 7 })).toEqual(["mixed.md"]);
    expect(await find(notes, { property: "tags", value: "7" })).toEqual([]);
    expect(await find(notes, { property: "tags", value: null })).toEqual(["mixed.md"]);
  });

  it("leaves every other property strict: keywords [#a] matches #a only", async () => {
    const notes = { "k.md": { keywords: ["#a"] }, "t.md": { Tags: ["#a"] } };
    expect(await find(notes, { property: "keywords", value: "a" })).toEqual([]);
    expect(await find(notes, { property: "keywords", value: "#a" })).toEqual(["k.md"]);
    expect(await find(notes, { property: "Tags", value: "a" })).toEqual([]);
  });
});
