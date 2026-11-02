// Original — no upstream. Template-execution tests for the smart_connections_similar eval template (spec 085): renders JS_TEMPLATE through composeEvalCode and runs it under node:vm against a stub source note whose find_connections records its request, returns its fixture in plugin order and truncates it to limit, checking the leading-slice, tie-break, fixed-request, count, self-exclusion, non-finite and pass-through rows of contracts/ordering-contract.md.
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { MAX_LIMIT } from "./schema.js";
import { composeEvalCode } from "../_shared.js";

interface Connection {
  item: { key: string };
  score?: unknown;
}

interface Match {
  path: string;
  headingPath: string[];
  score: number;
}

interface Envelope {
  ok: boolean;
  count: number;
  matches: Match[];
}

const SRC = "Src.md";

async function runTemplate(
  fixture: Connection[],
  { limit, total = false }: { limit: number; total?: boolean },
): Promise<{ envelope: Envelope; requests: Array<{ limit: number }> }> {
  const code = composeEvalCode(JS_TEMPLATE, { active: false, path: SRC, file: null, limit, total });
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
  const out = (await runInNewContext(code, { TextDecoder, Uint8Array, atob, app })) as string;
  return { envelope: JSON.parse(out) as Envelope, requests };
}

async function page(fixture: Connection[], limit: number): Promise<Match[]> {
  return (await runTemplate(fixture, { limit })).envelope.matches;
}

function conn(key: string, score?: unknown): Connection {
  return { item: { key }, score };
}

function keyOf(m: Match): string {
  return m.path + (m.headingPath.length ? "#" + m.headingPath.join("#") : "");
}

// The documented order (score desc, path byte-asc, headingPath.join('#') byte-asc), kept here
// independently of the template so fixtures can be laid out against it.
function documentedOrder(x: Connection, y: Connection): number {
  const xs = x.score as number;
  const ys = y.score as number;
  if (xs !== ys) return ys - xs;
  const [xp, ...xh] = x.item.key.split("#");
  const [yp, ...yh] = y.item.key.split("#");
  if (xp !== yp) return xp! < yp! ? -1 : 1;
  const a = xh.join("#");
  const b = yh.join("#");
  return a < b ? -1 : a > b ? 1 : 0;
}

// 150 candidates: 15 scores × 10 keys, each tied group in reverse documented order, plus three
// blocks of the source note scattered among the top 100 (at the score of their neighbours).
function tiedFixture(): Connection[] {
  const out: Connection[] = [];
  for (let g = 0; g < 15; g++) {
    const score = 0.95 - g * 0.05;
    const group: Connection[] = [];
    for (let k = 0; k < 10; k++) {
      group.push(conn(k < 2 ? `G${g}-${k}.md` : `N${k % 4}.md#G${g}#S${k}`, score));
    }
    out.push(...group.sort(documentedOrder).reverse());
  }
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

  it("T11: for every pair N < M in 1..100, page(N) equals page(M)[0..N), and the source note is excluded", async () => {
    const fixture = tiedFixture();
    const pages: Match[][] = [];
    for (let limit = 1; limit <= 100; limit++) pages[limit] = await page(fixture, limit);
    for (let m = 2; m <= 100; m++) {
      for (let n = 1; n < m; n++) {
        expect(pages[n], `page(${n}) vs page(${m})`).toEqual(pages[m]!.slice(0, n));
      }
    }
    for (let limit = 1; limit <= 100; limit++) {
      expect(pages[limit]!.some((m) => m.path === SRC)).toBe(false);
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
