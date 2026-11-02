// Original — no upstream. Template-execution tests for the smart_connections_similar eval template (spec 085): renders JS_TEMPLATE through composeEvalCode and runs it under node:vm against a stub source note whose find_connections records its request, returns its fixture in plugin order and truncates it to limit, checking the leading-slice, tie-break, fixed-request, count, self-exclusion, non-finite and pass-through rows of contracts/ordering-contract.md.
import { describe, expect, it } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";
import {
  keyOf,
  tiedFixture as tiedCandidates,
  type Match,
  type MatchEnvelope,
} from "../_smart-connections-fixtures.js";
import { MAX_LIMIT } from "../_smart-connections.js";

interface Connection {
  item: { key: string };
  score?: unknown;
}

const SRC = "Src.md";

async function runTemplate(
  fixture: Connection[],
  { limit, total = false }: { limit: number; total?: boolean },
): Promise<{ envelope: MatchEnvelope; requests: Array<{ limit: number }> }> {
  const requests: Array<{ limit: number }> = [];
  const app = {
    vault: {
      getName: () => "Demo",
      getAbstractFileByPath: (p: string) => (p === SRC ? { path: p, extension: "md" } : null),
    },
    plugins: {
      plugins: {
        "smart-connections": {
          env: {
            smart_sources: {
              items: {
                [SRC]: {
                  find_connections: async (opts: { limit: number }) => {
                    requests.push(opts);
                    return fixture.slice(0, opts.limit);
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  const payload = { active: false, path: SRC, file: null, limit, total };
  const envelope = (await runEvalTemplate(JS_TEMPLATE, payload, app)) as MatchEnvelope;
  return { envelope, requests };
}

async function page(fixture: Connection[], limit: number): Promise<Match[]> {
  return (await runTemplate(fixture, { limit })).envelope.matches;
}

function conn(key: string, score?: unknown): Connection {
  return { item: { key }, score };
}

// The shared 150-candidate tied fixture, plus three blocks of the source note scattered among the
// top 100 (at the score of their neighbours).
function tiedFixture(): Connection[] {
  const out = tiedCandidates().map((c) => conn(c.key, c.score));
  out.splice(5, 0, conn(SRC, out[5]!.score));
  out.splice(40, 0, conn(`${SRC}#A`, out[40]!.score));
  out.splice(80, 0, conn(`${SRC}#B#C`, out[80]!.score));
  return out;
}

describe("smart_connections_similar template — US1: a smaller limit is a leading slice of a larger one", () => {
  it("T10: the equal-score pair follows path order at limit 1 and limit 2", async () => {
    const fixture = [conn("Z.md", 0.9), conn("A.md", 0.9), conn("M.md", 0.5)];
    const one = await page(fixture, 1);
    const two = await page(fixture, 2);
    expect(one).toEqual([{ path: "A.md", headingPath: [], score: 0.9 }]);
    expect(two.map((m) => m.path)).toEqual(["A.md", "Z.md"]);
    expect(one).toEqual(two.slice(0, 1));
  });

  // Every page(N) being the first N entries of page(100) implies page(N) = page(M)[0..N) for every
  // pair N < M in 1..100: both sides are the first N entries of page(100).
  it("T11: for every pair N < M in 1..100, page(N) equals page(M)[0..N), and the source note is excluded", async () => {
    const fixture = tiedFixture();
    const full = await page(fixture, 100);
    expect(full.some((m) => m.path === SRC)).toBe(false);
    for (let n = 1; n < 100; n++) {
      expect(await page(fixture, n), `page(${n}) vs page(100)`).toEqual(full.slice(0, n));
    }
  });

  it.each([1, 20, 100])(
    "T13: limit %i asks find_connections for MAX_LIMIT candidates",
    async (limit) => {
      const { requests } = await runTemplate(tiedFixture(), { limit });
      expect(requests.length).toBeGreaterThan(0);
      for (const req of requests) expect(req.limit).toBe(MAX_LIMIT);
    },
  );

  it.each([7, 100])("T14: at limit %i, count is the same with and without total", async (limit) => {
    const fixture = tiedFixture();
    const full = await runTemplate(fixture, { limit });
    const counted = await runTemplate(fixture, { limit, total: true });
    expect(counted.envelope.count).toBe(full.envelope.count);
    expect(counted.envelope.matches).toEqual([]);
  });

  it("T15: non-finite scores are dropped and every returned score is the plugin's", async () => {
    const fixture = [
      conn("A.md", 0.7),
      conn("NaN.md", Number.NaN),
      conn("B.md#h", 0.6),
      conn("Null.md", null),
      conn("Missing.md"),
      conn("Inf.md", Number.POSITIVE_INFINITY),
      conn("C.md", 0.5),
    ];
    const scoreByKey = new Map(fixture.map((c) => [c.item.key, c.score]));
    const matches = await page(fixture, 100);
    expect(matches.map(keyOf)).toEqual(["A.md", "B.md#h", "C.md"]);
    for (const m of matches) expect(m.score).toBe(scoreByKey.get(keyOf(m)));
  });
});

describe("smart_connections_similar template — US2: equal-relevance results follow the documented tie-break", () => {
  it("T12: a limit that cuts through a tied group keeps its path-first members", async () => {
    const fixture = [
      conn("Lead1.md", 0.99),
      conn("Lead2.md", 0.98),
      conn("E.md", 0.7),
      conn("D.md", 0.7),
      conn("C.md", 0.7),
      conn("B.md", 0.7),
      conn("A.md", 0.7),
      conn("T1.md", 0.6),
      conn("T2.md", 0.5),
    ];
    const matches = await page(fixture, 4);
    expect(matches.map((m) => m.path)).toEqual(["Lead1.md", "Lead2.md", "A.md", "B.md"]);
  });
});
