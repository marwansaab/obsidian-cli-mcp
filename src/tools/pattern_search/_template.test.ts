// Original — no upstream. Template-execution tests for the pattern_search eval template (BI-0183): renders JS_TEMPLATE through composeEvalCode and runs it in node:vm against a stub `app` whose getMarkdownFiles() lists notes out of path order, checking that the in-template `limit` cap keeps the leading matches of the full (path, line, offset) order, that every smaller cap is a prefix of every larger one, and that `truncated` appears exactly when matches were left out.
import { describe, expect, it } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";

interface Envelope {
  ok: boolean;
  count: number;
  matches: Array<{ path: string; line: number; offset: number; match: string; text: string }>;
  truncated?: true;
}

// Listed in an order that is neither path order nor its reverse, the way Obsidian's file map
// lists recently touched notes last. "Other/z.md" sits outside the searched folder.
const NOTES: Array<[path: string, content: string]> = [
  ["Notes/b.md", "x1 x2\nnone\nx3"],
  ["Other/z.md", "x9"],
  ["Notes/a/c.md", "x8"],
  ["Notes/a.md", "pre x5 x6 x7"],
  ["Notes/B.md", "x4"],
];

// The full match set in (path, line, offset) order, by UTF-16 code unit: "B" (66) sorts before
// "a" (97), which locale collation would reverse, and "Notes/a.md" sorts before "Notes/a/c.md"
// because "." (46) is lower than "/" (47).
const FULL_ORDER: Array<[path: string, line: number, offset: number, match: string]> = [
  ["Notes/B.md", 1, 0, "x4"],
  ["Notes/a.md", 1, 4, "x5"],
  ["Notes/a.md", 1, 7, "x6"],
  ["Notes/a.md", 1, 10, "x7"],
  ["Notes/a/c.md", 1, 0, "x8"],
  ["Notes/b.md", 1, 0, "x1"],
  ["Notes/b.md", 1, 3, "x2"],
  ["Notes/b.md", 3, 0, "x3"],
];
const TOTAL = FULL_ORDER.length;

async function runTemplate(limit: number): Promise<Envelope> {
  const contents = new Map(NOTES);
  const app = {
    vault: {
      getMarkdownFiles: () => NOTES.map(([path]) => ({ path })),
      cachedRead: async (f: { path: string }) => contents.get(f.path),
      adapter: { stat: async () => ({ type: "folder" }) },
    },
  };
  const payload = { pattern: "x\\d", folder: "Notes", case_sensitive: true, limit };
  return (await runEvalTemplate(JS_TEMPLATE, payload, app)) as Envelope;
}

function keys(env: Envelope): Array<[string, number, number, string]> {
  return env.matches.map((m) => [m.path, m.line, m.offset, m.match]);
}

describe("pattern_search template: limit keeps the leading matches of the sorted set (BI-0183)", () => {
  it("returns the full set in (path, line, offset) order when the limit covers it", async () => {
    const env = await runTemplate(TOTAL);
    expect(env.ok).toBe(true);
    expect(keys(env)).toEqual(FULL_ORDER);
    expect(env.count).toBe(TOTAL);
  });

  it("returns exactly the first N of the full order for every N below the total", async () => {
    for (let n = 1; n < TOTAL; n++) {
      const env = await runTemplate(n);
      expect(keys(env), `limit ${n}`).toEqual(FULL_ORDER.slice(0, n));
      expect(env.count, `limit ${n}`).toBe(n);
    }
  });

  it("makes every smaller cap a prefix of every larger cap", async () => {
    const pages = new Map<number, Array<[string, number, number, string]>>();
    for (let n = 1; n <= TOTAL; n++) pages.set(n, keys(await runTemplate(n)));
    for (let n = 1; n <= TOTAL; n++) {
      for (let m = n + 1; m <= TOTAL; m++) {
        expect(pages.get(n), `limit ${n} vs ${m}`).toEqual(pages.get(m)!.slice(0, n));
      }
    }
  });

  it("cuts between offsets of one line and keeps the lower offsets", async () => {
    const env = await runTemplate(3);
    expect(keys(env)).toEqual([
      ["Notes/B.md", 1, 0, "x4"],
      ["Notes/a.md", 1, 4, "x5"],
      ["Notes/a.md", 1, 7, "x6"],
    ]);
  });

  it("sets truncated when the total exceeds the limit", async () => {
    expect((await runTemplate(TOTAL - 1)).truncated).toBe(true);
    expect((await runTemplate(1)).truncated).toBe(true);
  });

  it("omits truncated when the limit equals or exceeds the total", async () => {
    expect(await runTemplate(TOTAL)).not.toHaveProperty("truncated");
    expect(await runTemplate(TOTAL + 1)).not.toHaveProperty("truncated");
  });
});
