// Original — no upstream. Template-execution tests for the smart_connections_similar eval template (spec 085): renders JS_TEMPLATE through composeEvalCode and runs it under node:vm against a stub source note whose find_connections records its request, returns its fixture in plugin order and truncates it to limit, checking the leading-slice, tie-break, fixed-request, count, self-exclusion, non-finite and pass-through rows of contracts/ordering-contract.md.
import { describe, expect, it } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { runEvalTemplate } from "../_eval-template-fixtures.js";
import {
  EMPTY_PATH_KEPT,
  EMPTY_PATH_KEYS,
  HEADING_PATH_CASES,
  keyOf,
  MIXED_HEADING_KEYS,
  MIXED_HEADING_MATCHES,
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

// The vault holds the source and every Markdown note a candidate key names, except the `gone` paths
// (notes moved or deleted since the plugin indexed them).
async function runTemplate(
  fixture: Connection[],
  { limit, total = false, gone = [] }: { limit: number; total?: boolean; gone?: string[] },
): Promise<{ envelope: MatchEnvelope; requests: Array<{ limit: number }> }> {
  const requests: Array<{ limit: number }> = [];
  const notes = new Set(
    [SRC, ...fixture.map((c) => c.item.key.split("#")[0]!)].filter((p) => p.endsWith(".md") && !gone.includes(p)),
  );
  const app = {
    vault: {
      getName: () => "Demo",
      getAbstractFileByPath: (p: string) => (notes.has(p) ? { path: p, extension: "md" } : null),
    },
    plugins: {
      plugins: {
        "smart-connections": {
          env: {
            smart_sources: {
              items: {
                [SRC]: {
                  vec: [0.6, 0.8],
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

describe("smart_connections_similar template — BI-0184: a note's opening text has an empty headingPath", () => {
  it.each(HEADING_PATH_CASES)(
    "%s (key %j) has headingPath %j",
    async (_label, key, headingPath) => {
      expect(await page([conn(key, 0.5)], 10)).toEqual([
        { path: "Note.md", headingPath, score: 0.5 },
      ]);
    },
  );

  it("AC 6: no headingPath holds an empty string, order and scores follow the documented rules, and the source's opening text is excluded", async () => {
    const fixture = [...MIXED_HEADING_KEYS.map((c) => conn(c.key, c.score)), conn(`${SRC}#`, 0.8)];
    const matches = await page(fixture, 100);
    for (const m of matches) expect(m.headingPath).not.toContain("");
    expect(matches).toEqual(MIXED_HEADING_MATCHES);
  });
});

describe("smart_connections_similar template — BI-0195: outdated index entries are left out", () => {
  // Stale entries for notes no longer in the vault, scored above everything in the tied fixture.
  const STALE = [conn("", 0.999), conn("Old.md", 0.998), conn("Old.md#H", 0.997), conn("Gone/Deleted.md#A#B", 0.996)];
  const GONE = ["Old.md", "Gone/Deleted.md"];

  it("entries whose key names no path ('', '#', '#H') among valid ones are left out, and every returned path names a Markdown note", async () => {
    const matches = await page(EMPTY_PATH_KEYS.map((c) => conn(c.key, c.score)), 100);
    expect(matches.map(keyOf)).toEqual(EMPTY_PATH_KEPT);
    for (const m of matches) {
      expect(m.path).not.toBe("");
      expect(m.path.endsWith(".md")).toBe(true);
    }
  });

  it("entries for a moved or deleted note (whole-note and block keys) are left out", async () => {
    const fixture = [conn("Old.md", 0.9), conn("A.md", 0.7), conn("Old.md#H", 0.8), conn("B.md", 0.5)];
    const { envelope } = await runTemplate(fixture, { limit: 100, gone: ["Old.md"] });
    expect(envelope.matches.map(keyOf)).toEqual(["A.md", "B.md"]);
    expect(envelope.count).toBe(2);
  });

  it("with stale entries in the fixture, every page(N) is still a leading slice and equals the stale-free page", async () => {
    const clean = tiedFixture();
    const fixture = [...STALE, ...clean];
    const full = (await runTemplate(fixture, { limit: 100, gone: GONE })).envelope.matches;
    // The plugin returns MAX_LIMIT candidates: 4 stale entries and 3 of the source's own blocks
    // among them are left out, so 93 come back, exactly the page for the other 96 candidates the
    // plugin returned; a limit that would have reached a stale entry gets the next valid match instead.
    expect(full).toHaveLength(93);
    expect(full).toEqual(await page(clean.slice(0, 96), 100));
    for (let n = 1; n < 100; n++) {
      const { envelope } = await runTemplate(fixture, { limit: n, gone: GONE });
      expect(envelope.matches, `page(${n}) vs page(100)`).toEqual(full.slice(0, n));
    }
  });

  it.each([3, 100])("at limit %i, total: true counts only the kept matches", async (limit) => {
    const fixture = [...STALE, conn("A.md", 0.7), conn("B.md", 0.6), conn("C.md", 0.5)];
    const full = await runTemplate(fixture, { limit, gone: GONE });
    const counted = await runTemplate(fixture, { limit, total: true, gone: GONE });
    expect(full.envelope.count).toBe(3);
    expect(counted.envelope.count).toBe(3);
    expect(counted.envelope.matches).toEqual([]);
  });
});
