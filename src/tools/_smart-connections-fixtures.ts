// Original — no upstream. Shared test oracle for the two Smart Connections `_template.test.ts` suites (spec 085 contracts/ordering-contract.md): the returned match and envelope shapes, the key a match came from, the documented order written independently of the template, and the 150-candidate tied fixture both suites lay out against it. Vitest-free on purpose: `_*fixtures.ts` is excluded from dist and coverage.

/** A plugin candidate: `key` is `<path>` or `<path>#<h1>#<h2>…`; `score` may be non-finite or missing. */
export interface ScoredKey {
  key: string;
  score?: unknown;
}

export interface Match {
  path: string;
  headingPath: string[];
  score: number;
}

export interface MatchEnvelope {
  ok: boolean;
  count: number;
  matches: Match[];
}

/** The plugin key a returned match came from. */
export function keyOf(m: Match): string {
  return m.path + (m.headingPath.length ? "#" + m.headingPath.join("#") : "");
}

// The documented order (score desc, path byte-asc, headingPath.join('#') byte-asc), kept here
// independently of the template so fixtures can be laid out against it.
export function documentedOrder(x: ScoredKey, y: ScoredKey): number {
  const xs = x.score as number;
  const ys = y.score as number;
  if (xs !== ys) return ys - xs;
  const [xp, ...xh] = x.key.split("#");
  const [yp, ...yh] = y.key.split("#");
  if (xp !== yp) return xp! < yp! ? -1 : 1;
  const a = xh.join("#");
  const b = yh.join("#");
  return a < b ? -1 : a > b ? 1 : 0;
}

// 150 candidates: 15 scores × 10 keys. Each tied group mixes heading-free notes and blocks
// that share a path, and the plugin returns every group in reverse documented order.
export function tiedFixture(): ScoredKey[] {
  const out: ScoredKey[] = [];
  for (let g = 0; g < 15; g++) {
    const score = 0.95 - g * 0.05;
    const group: ScoredKey[] = [];
    for (let k = 0; k < 10; k++) {
      group.push({ key: k < 2 ? `G${g}-${k}.md` : `N${k % 4}.md#G${g}#S${k}`, score });
    }
    out.push(...group.sort(documentedOrder).reverse());
  }
  return out;
}
