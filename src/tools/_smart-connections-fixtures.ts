// Original — no upstream. Shared test oracle for the two Smart Connections `_template.test.ts` suites (spec 085 contracts/ordering-contract.md): the returned match and envelope shapes, the key a match came from, the documented order written independently of the template, the 150-candidate tied fixture both suites lay out against it, and the BI-0184 headingPath cases and the BI-0195 empty-path rows both suites run. Vitest-free on purpose: `_*fixtures.ts` is excluded from dist and coverage.

/** A plugin candidate: `key` is `<path>`, `<path>#` (a note's opening text) or `<path>#<h1>#<h2>…`; `score` may be non-finite or missing. */
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

/** The plugin key a returned match came from (a `<path>#` key comes back as `<path>`). */
export function keyOf(m: Match): string {
  return m.path + (m.headingPath.length ? "#" + m.headingPath.join("#") : "");
}

// The documented order (score desc, path byte-asc, headingPath.join('#') byte-asc), kept here
// independently of the template so fixtures can be laid out against it. Empty key segments are not
// heading segments (BI-0184), so they are dropped before the join, as in the returned headingPath.
export function documentedOrder(x: ScoredKey, y: ScoredKey): number {
  const xs = x.score as number;
  const ys = y.score as number;
  if (xs !== ys) return ys - xs;
  const [xp, ...xh] = x.key.split("#");
  const [yp, ...yh] = y.key.split("#");
  if (xp !== yp) return xp! < yp! ? -1 : 1;
  const a = xh.filter((s) => s !== "").join("#");
  const b = yh.filter((s) => s !== "").join("#");
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

// BI-0184 rows both template suites run: a plugin key and the headingPath its match must carry. The
// opening-text row is AC 1 for smart_connections_query and AC 2 for smart_connections_similar.
export const HEADING_PATH_CASES: Array<[label: string, key: string, headingPath: string[]]> = [
  ["AC 1 / AC 2: a block before the note's first heading", "Note.md#", []],
  ["AC 3: a note with no headings", "Note.md", []],
  ["AC 4: a block in a nested section", "Note.md#H1#H2", ["H1", "H2"]],
  ["AC 5: a frontmatter block", "Note.md#---frontmatter---", ["---frontmatter---"]],
];

// BI-0184 AC 6: a mixed candidate set (opening text, whole note, nested section, frontmatter and the edge
// keys `<path>#H1#` / `<path>##H2`), and the matches it must come back as: no empty heading segment, in
// the documented order, scores unchanged.
export const MIXED_HEADING_KEYS: ScoredKey[] = [
  { key: "N.md#H1#H2", score: 0.8 },
  { key: "N.md#", score: 0.8 },
  { key: "N.md", score: 0.8 },
  { key: "N.md#---frontmatter---", score: 0.8 },
  { key: "N.md#H1#", score: 0.6 },
  { key: "N.md##H2", score: 0.6 },
  { key: "A.md#", score: 0.5 },
];

export const MIXED_HEADING_MATCHES: Match[] = [
  { path: "N.md", headingPath: [], score: 0.8 },
  { path: "N.md", headingPath: [], score: 0.8 },
  { path: "N.md", headingPath: ["---frontmatter---"], score: 0.8 },
  { path: "N.md", headingPath: ["H1", "H2"], score: 0.8 },
  { path: "N.md", headingPath: ["H1"], score: 0.6 },
  { path: "N.md", headingPath: ["H2"], score: 0.6 },
  { path: "A.md", headingPath: [], score: 0.5 },
];

// BI-0195 rows both template suites run: outdated index entries whose key names no path (`''`, `'#'`,
// `'#H'` all map to `path: ''`) among valid candidates. Both tools leave them out, so only the kept keys
// come back, in the documented order.
export const EMPTY_PATH_KEYS: ScoredKey[] = [
  { key: "A.md", score: 0.7 },
  { key: "", score: 0.9 },
  { key: "#", score: 0.85 },
  { key: "#H", score: 0.8 },
  { key: "B.md#h", score: 0.6 },
];

export const EMPTY_PATH_KEPT = ["A.md", "B.md#h"];
