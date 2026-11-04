// Original — no upstream. Template-execution tests for the smart_connections_query eval template (spec 085): renders JS_TEMPLATE through composeEvalCode and runs it under node:vm against a stub Smart Connections plugin whose lookup records its request, returns its fixture in plugin order and truncates it to filter.limit, checking the leading-slice, tie-break, fixed-request, count, non-finite and pass-through rows of contracts/ordering-contract.md.
import { describe, expect, it } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";
import {
  documentedOrder,
  HEADING_PATH_CASES,
  keyOf,
  MIXED_HEADING_KEYS,
  MIXED_HEADING_MATCHES,
  tiedFixture,
  type Match,
  type MatchEnvelope,
  type ScoredKey,
} from "../_smart-connections-fixtures.js";
import { MAX_LIMIT } from "../_smart-connections.js";

interface LookupRequest {
  hypotheticals: unknown;
  filter: { limit: number };
  collection: string;
}

async function runTemplate(
  fixture: ScoredKey[],
  { limit, total = false }: { limit: number; total?: boolean },
): Promise<{ envelope: MatchEnvelope; requests: LookupRequest[] }> {
  const requests: LookupRequest[] = [];
  const app = {
    vault: { getName: () => "Demo" },
    plugins: {
      plugins: {
        "smart-connections": {
          env: {
            smart_sources: {
              lookup: async (req: LookupRequest) => {
                requests.push(req);
                return fixture.slice(0, req.filter.limit);
              },
            },
          },
        },
      },
    },
  };
  const payload = { query: "q", limit, total };
  const envelope = (await runEvalTemplate(JS_TEMPLATE, payload, app)) as MatchEnvelope;
  return { envelope, requests };
}

async function page(fixture: ScoredKey[], limit: number): Promise<Match[]> {
  return (await runTemplate(fixture, { limit })).envelope.matches;
}

describe("smart_connections_query template — US1: a smaller limit is a leading slice of a larger one", () => {
  it("T1: the equal-score pair follows path order at limit 1 and limit 2", async () => {
    const fixture = [
      { key: "Z.md", score: 0.9 },
      { key: "A.md", score: 0.9 },
      { key: "M.md", score: 0.5 },
    ];
    const one = await page(fixture, 1);
    const two = await page(fixture, 2);
    expect(one).toEqual([{ path: "A.md", headingPath: [], score: 0.9 }]);
    expect(two.map((m) => m.path)).toEqual(["A.md", "Z.md"]);
    expect(one).toEqual(two.slice(0, 1));
  });

  // Every page(N) being the first N entries of page(100) implies page(N) = page(M)[0..N) for every
  // pair N < M in 1..100: both sides are the first N entries of page(100).
  it("T2: for every pair N < M in 1..100, page(N) equals page(M)[0..N)", async () => {
    const fixture = tiedFixture();
    const full = await page(fixture, 100);
    for (let n = 1; n < 100; n++) {
      expect(await page(fixture, n), `page(${n}) vs page(100)`).toEqual(full.slice(0, n));
    }
  });

  it.each([1, 20, 100])("T5: limit %i asks the plugin for MAX_LIMIT candidates", async (limit) => {
    const { requests } = await runTemplate(tiedFixture(), { limit });
    expect(requests.length).toBeGreaterThan(0);
    for (const req of requests) {
      expect(req.filter.limit).toBe(MAX_LIMIT);
      expect(req.hypotheticals).toEqual(["q"]);
      expect(req.collection).toBe("smart_blocks");
    }
  });

  it.each([7, 100])("T6: at limit %i, count is the same with and without total", async (limit) => {
    const fixture = tiedFixture();
    const full = await runTemplate(fixture, { limit });
    const counted = await runTemplate(fixture, { limit, total: true });
    expect(counted.envelope.count).toBe(full.envelope.count);
    expect(counted.envelope.matches).toEqual([]);
  });

  it("T8: fewer finite candidates than limit all come back, in documented order", async () => {
    const fixture = [
      { key: "B.md", score: 0.4 },
      { key: "C.md#h", score: 0.8 },
      { key: "A.md", score: 0.8 },
      { key: "C.md", score: 0.8 },
      { key: "D.md", score: 0.1 },
    ];
    const { envelope } = await runTemplate(fixture, { limit: 100 });
    expect(envelope.count).toBe(5);
    expect(envelope.matches.map(keyOf)).toEqual(["A.md", "C.md", "C.md#h", "B.md", "D.md"]);
  });

  it("T9: every returned score is the plugin's score for that key", async () => {
    const fixture = tiedFixture();
    const scoreByKey = new Map(fixture.map((c) => [c.key, c.score]));
    const matches = await page(fixture, 100);
    expect(matches).toHaveLength(100);
    for (const m of matches) expect(m.score).toBe(scoreByKey.get(keyOf(m)));
  });
});

describe("smart_connections_query template — US2: equal-relevance results follow the documented tie-break", () => {
  it("T3: equal-score blocks of one note come back in heading order", async () => {
    const fixture = [
      { key: "N.md#c", score: 0.8 },
      { key: "N.md#a", score: 0.8 },
      { key: "N.md#b", score: 0.8 },
    ];
    const matches = await page(fixture, 20);
    expect(matches.map((m) => m.headingPath)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("T4: a limit that cuts through a tied group keeps its path-first members, and a repeat call agrees", async () => {
    const fixture = [
      { key: "Lead1.md", score: 0.99 },
      { key: "Lead2.md", score: 0.98 },
      { key: "E.md", score: 0.7 },
      { key: "D.md", score: 0.7 },
      { key: "C.md", score: 0.7 },
      { key: "B.md", score: 0.7 },
      { key: "A.md", score: 0.7 },
      { key: "T1.md", score: 0.6 },
      { key: "T2.md", score: 0.5 },
      { key: "T3.md", score: 0.4 },
    ];
    const first = await page(fixture, 4);
    expect(first.map((m) => m.path)).toEqual(["Lead1.md", "Lead2.md", "A.md", "B.md"]);
    const second = await page(fixture, 4);
    expect(second).toEqual(first);
  });

  it("T7: non-finite scores are dropped and the finite ones keep the slice and tie rules", async () => {
    const fixture: ScoredKey[] = [
      { key: "Z.md", score: 0.9 },
      { key: "NaN.md", score: Number.NaN },
      { key: "A.md", score: 0.9 },
      { key: "Null.md", score: null },
      { key: "M.md#b", score: 0.5 },
      { key: "Missing.md" },
      { key: "M.md#a", score: 0.5 },
      { key: "Inf.md", score: Number.POSITIVE_INFINITY },
      { key: "B.md", score: 0.3 },
    ];
    const ten = await page(fixture, 10);
    const two = await page(fixture, 2);
    expect(ten.map(keyOf)).toEqual(["A.md", "Z.md", "M.md#a", "M.md#b", "B.md"]);
    expect(two).toEqual(ten.slice(0, 2));
  });
});

describe("smart_connections_query template — BI-0184: a note's opening text has an empty headingPath", () => {
  it.each(HEADING_PATH_CASES)(
    "%s (key %j) has headingPath %j",
    async (_label, key, headingPath) => {
      expect(await page([{ key, score: 0.5 }], 10)).toEqual([
        { path: "Note.md", headingPath, score: 0.5 },
      ]);
    },
  );

  it("AC 6: no headingPath holds an empty string, and order and scores follow the documented rules", async () => {
    const matches = await page(MIXED_HEADING_KEYS, 100);
    for (const m of matches) expect(m.headingPath).not.toContain("");
    expect(matches).toEqual(MIXED_HEADING_MATCHES);
  });

  it("the shared oracle's documentedOrder lays the mixed set out in the order the template returns", () => {
    const laidOut = [...MIXED_HEADING_KEYS].sort(documentedOrder).map((c) => c.key);
    expect(laidOut).toEqual([
      "N.md#",
      "N.md",
      "N.md#---frontmatter---",
      "N.md#H1#H2",
      "N.md#H1#",
      "N.md##H2",
      "A.md#",
    ]);
  });
});
