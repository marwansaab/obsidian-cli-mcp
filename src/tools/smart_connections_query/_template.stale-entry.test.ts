// Original — no upstream. BI-0195 template-execution tests for the smart_connections_query eval template: renders JS_TEMPLATE through composeEvalCode and runs it under node:vm against a stub plugin whose lookup returns its fixture in plugin order truncated to filter.limit, checking that an empty-keyed (outdated) index entry is left out before the sort and the cut to limit, while every non-empty path still passes through verbatim with no vault lookup (owner ruling 2026-11-07, "Filter old paths in similar only"; the BI-0074 Q2 pass-through). Kept apart from `_template.test.ts`, which this BI does not edit.
import { describe, expect, it } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";
import { keyOf, tiedFixture, type Match, type MatchEnvelope, type ScoredKey } from "../_smart-connections-fixtures.js";

// The stub `app` has no `getAbstractFileByPath`: the query template must not look paths up in the vault.
async function runTemplate(
  fixture: ScoredKey[],
  { limit, total = false }: { limit: number; total?: boolean },
): Promise<MatchEnvelope> {
  const app = {
    vault: { getName: () => "Demo" },
    plugins: {
      plugins: {
        "smart-connections": {
          env: {
            smart_sources: {
              lookup: async (req: { filter: { limit: number } }) => fixture.slice(0, req.filter.limit),
            },
          },
        },
      },
    },
  };
  return (await runEvalTemplate(JS_TEMPLATE, { query: "q", limit, total }, app)) as MatchEnvelope;
}

async function page(fixture: ScoredKey[], limit: number): Promise<Match[]> {
  return (await runTemplate(fixture, { limit })).matches;
}

describe("smart_connections_query template — BI-0195: an empty-keyed index entry is left out", () => {
  it("an empty-keyed entry among valid ones is left out, and no returned path is empty", async () => {
    const fixture: ScoredKey[] = [
      { key: "A.md", score: 0.7 },
      { key: "", score: 0.9 },
      { key: "B.md#h", score: 0.6 },
    ];
    const matches = await page(fixture, 100);
    expect(matches.map(keyOf)).toEqual(["A.md", "B.md#h"]);
    for (const m of matches) expect(m.path).not.toBe("");
  });

  it("a non-empty path that names no vault note still comes back verbatim (BI-0074 Q2 pass-through)", async () => {
    const fixture: ScoredKey[] = [
      { key: "Old/Moved.md#H", score: 0.8 },
      { key: "A.md", score: 0.7 },
    ];
    expect(await page(fixture, 100)).toEqual([
      { path: "Old/Moved.md", headingPath: ["H"], score: 0.8 },
      { path: "A.md", headingPath: [], score: 0.7 },
    ]);
  });

  it("with an empty-keyed entry in the fixture, every page(N) is still a leading slice and equals the clean page", async () => {
    const clean = tiedFixture();
    const fixture = [{ key: "", score: 0.999 }, ...clean];
    const full = await page(fixture, 100);
    // The plugin returns MAX_LIMIT candidates and one of them is the empty-keyed entry, so the page is
    // exactly the one for the other 99 candidates the plugin returned.
    expect(full).toHaveLength(99);
    expect(full).toEqual(await page(clean.slice(0, 99), 100));
    for (let n = 1; n < 100; n++) {
      expect(await page(fixture, n), `page(${n}) vs page(100)`).toEqual(full.slice(0, n));
    }
  });

  it.each([2, 100])("at limit %i, total: true counts only the kept matches", async (limit) => {
    const fixture: ScoredKey[] = [
      { key: "", score: 0.9 },
      { key: "A.md", score: 0.7 },
      { key: "B.md", score: 0.6 },
    ];
    const full = await runTemplate(fixture, { limit });
    const counted = await runTemplate(fixture, { limit, total: true });
    expect(full.count).toBe(2);
    expect(counted.count).toBe(2);
    expect(counted.matches).toEqual([]);
  });
});
