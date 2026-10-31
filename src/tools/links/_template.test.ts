// Original — no upstream. Template-execution tests for the links eval template (spec 071 research D4): renders JS_TEMPLATE through composeEvalCode and runs it in node:vm against a stub `app` loaded with link-cache shapes recorded live (spec 071 contracts/t0-cache-shapes.json, research F6), checking the display-label rule row by row (data-model.md rows 1–27) plus the FR-005 target/line/kind/order/count invariants.
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { JS_TEMPLATE } from "./_template.js";
import { composeEvalCode } from "../_shared.js";

interface CacheEntry {
  link: string;
  original: string;
  displayText: string;
  position?: { start: { line: number; col: number } };
}

interface FileCache {
  frontmatterLinks?: CacheEntry[];
  links?: CacheEntry[];
  embeds?: CacheEntry[];
}

interface Envelope {
  ok: boolean;
  count: number;
  links: Array<{ target: string; line: number; kind: string; displayText?: string }>;
}

const SRC = "Sandbox/Src.md";

function runTemplate(cache: FileCache, total = false): Envelope {
  const code = composeEvalCode(JS_TEMPLATE, { active: false, path: SRC, file: null, total });
  const app = {
    vault: { getFiles: () => [{ path: SRC, extension: "md" }] },
    metadataCache: { getFileCache: () => cache },
  };
  return JSON.parse(
    runInNewContext(code, { TextDecoder, Uint8Array, atob, app }) as string,
  ) as Envelope;
}

// "fm" is a frontmatter link; the others are body entries of that kind.
type Source = "fm" | "wikilink" | "markdown" | "embed";

interface Row {
  id: string;
  source: Source;
  original: string;
  link: string;
  cacheDisplayText: string;
  // Whether the tool reports cacheDisplayText as displayText; when false the key is absent.
  emitted: boolean;
}

function row(
  id: string,
  source: Source,
  original: string,
  link: string,
  cacheDisplayText: string,
  emitted: boolean,
): Row {
  return { id, source, original, link, cacheDisplayText, emitted };
}

// Cache values copied verbatim from spec 071 contracts/t0-cache-shapes.json and research F6.
const US1_ROWS = [
  row("1", "wikilink", "[[Tgt#Head]]", "Tgt#Head", "Tgt > Head", false),
  row("2", "wikilink", "[[Tgt#^blk]]", "Tgt#^blk", "Tgt > ^blk", false),
  row("3", "wikilink", "[[Tgt#H1#H2]]", "Tgt#H1#H2", "Tgt > H1 > H2", false),
  row("4", "wikilink", "[[#Local]]", "#Local", "Local", false),
  row("5", "wikilink", "[[#^lb]]", "#^lb", "^lb", false),
  row("6", "fm", "[[Tgt#Head]]", "Tgt#Head", "Tgt > Head", false),
  row("18", "wikilink", "[[Tgt#Head|]]", "Tgt#Head", "", false),
  row("19", "wikilink", "[[Tgt#Head| ]]", "Tgt#Head", "", false),
  row("20", "wikilink", "[[Tgt|]]", "Tgt", "", false),
];

const US2_ROWS = [
  row("7", "embed", "![[Tgt#Head]]", "Tgt#Head", "Tgt > Head", false),
  row("8", "embed", "![[Tgt#^blk]]", "Tgt#^blk", "Tgt > ^blk", false),
  row("9", "embed", "![[paper.pdf#page=3]]", "paper.pdf#page=3", "paper.pdf > page=3", false),
];

const US3_ROWS = [
  row("10", "wikilink", "[[Tgt#Head|Custom Display]]", "Tgt#Head", "Custom Display", true),
  row("11", "wikilink", "[[Tgt#^blk|Other Label]]", "Tgt#^blk", "Other Label", true),
  row("12", "wikilink", "[[Tgt|Alias]]", "Tgt", "Alias", true),
  row("13", "embed", "![[Tgt#Head|Emb Alias]]", "Tgt#Head", "Emb Alias", true),
  // FR-003: an author alias shaped like a derived label is kept.
  row("14", "wikilink", "[[Tgt#Head|Tgt > Head]]", "Tgt#Head", "Tgt > Head", true),
  // Table-escaped separator.
  row("15", "wikilink", "[[Tgt#Head\\|Tbl Alias]]", "Tgt#Head", "Tbl Alias", true),
  row("16", "embed", "![[img.png|300]]", "img.png", "300", true),
  row("17", "embed", "![[img.png|300x200]]", "img.png", "300x200", true),
  row("25", "markdown", "[Text](Tgt.md#Head)", "Tgt.md#Head", "Text", true),
  // Markdown link text is reported as written, empty included (analysis I1).
  row("26", "markdown", "[](Tgt.md#Head)", "Tgt.md#Head", "", true),
  row("27", "embed", "![alt](img.png)", "img.png", "alt", true),
  row("fm-alias", "fm", "[[Tgt#Head|Fm Alias]]", "Tgt#Head", "Fm Alias", true),
];

const US4_ROWS = [
  row("21", "wikilink", "[[Tgt#Head|Tgt#Head]]", "Tgt#Head", "Tgt#Head", false),
  row("22", "wikilink", "[[Tgt|Tgt]]", "Tgt", "Tgt", false),
  row("23", "wikilink", "[[Tgt]]", "Tgt", "Tgt", false),
  row("24", "embed", "![[img.png]]", "img.png", "img.png", false),
];

const ROWS = [...US1_ROWS, ...US2_ROWS, ...US3_ROWS, ...US4_ROWS];

const CACHE_KEY = {
  fm: "frontmatterLinks",
  wikilink: "links",
  markdown: "links",
  embed: "embeds",
} as const;

// Builds a cache holding the rows; `position` gives each body row's 0-based line and column.
function cacheOf(rows: Row[], position: (row: Row) => [line: number, col: number]): FileCache {
  const cache: Required<FileCache> = { frontmatterLinks: [], links: [], embeds: [] };
  for (const r of rows) {
    const entry: CacheEntry = {
      link: r.link,
      original: r.original,
      displayText: r.cacheDisplayText,
    };
    if (r.source !== "fm") {
      const [line, col] = position(r);
      entry.position = { start: { line, col } };
    }
    cache[CACHE_KEY[r.source]].push(entry);
  }
  return cache;
}

function kindOf(r: Row): string {
  return r.source === "fm" ? "wikilink" : r.source;
}

// Renders one row alone: a body entry sits on 0-based line 4 (reported line 5).
function expectRow(r: Row): void {
  const result = runTemplate(cacheOf([r], () => [4, 0]));
  expect(result.ok).toBe(true);
  expect(result.count).toBe(1);
  const entry = result.links[0]!;
  expect(entry.target).toBe(r.link);
  expect(entry.line).toBe(r.source === "fm" ? 1 : 5);
  expect(entry.kind).toBe(kindOf(r));
  if (r.emitted) {
    expect(entry.displayText).toBe(r.cacheDisplayText);
  } else {
    expect(Object.hasOwn(entry, "displayText")).toBe(false);
  }
}

describe("links JS_TEMPLATE — harness", () => {
  it("an empty cache gives an empty success envelope", () => {
    expect(runTemplate({})).toEqual({ ok: true, count: 0, links: [] });
  });
});

describe("US1 — unaliased fragment links, frontmatter links and empty or blank aliases carry no displayText", () => {
  it.each(US1_ROWS)("row $id: $source $original", expectRow);
});

describe("US2 — unaliased fragment embeds carry no displayText", () => {
  it.each(US2_ROWS)("row $id: $source $original", expectRow);
});

describe("US3 — author-written aliases are kept; Markdown labels unchanged", () => {
  it.each(US3_ROWS)("row $id: $source $original", expectRow);
});

describe("US4 — plain links and aliases equal to the target stay unlabelled", () => {
  it.each(US4_ROWS)("row $id: $source $original", expectRow);
});

describe("FR-005 — target, line, kind, order and count are unchanged", () => {
  // Body row N sits on 0-based line N, except row 10, which shares row 1's line at a lower column
  // so the column tiebreak decides their order.
  function positionOf(r: Row): [line: number, col: number] {
    if (r.id === "1") return [1, 20];
    if (r.id === "10") return [1, 0];
    return [Number(r.id), 0];
  }

  const ORDER = [
    "6",
    "fm-alias",
    "10",
    "1",
    "2",
    "3",
    "4",
    "5",
    "7",
    "8",
    "9",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
    "21",
    "22",
    "23",
    "24",
    "25",
    "26",
    "27",
  ];
  const ordered = ORDER.map((id) => ROWS.find((r) => r.id === id)!);

  it("default mode emits every entry in source order with unchanged target/line/kind and count", () => {
    const result = runTemplate(cacheOf(ROWS, positionOf));
    const expected = ordered.map((r) => ({
      target: r.link,
      line: r.source === "fm" ? 1 : positionOf(r)[0] + 1,
      kind: kindOf(r),
    }));
    expect(result.ok).toBe(true);
    expect(result.links.map(({ displayText: _d, ...rest }) => rest)).toEqual(expected);
    expect(result.count).toBe(ROWS.length);
    expect(result.links.length).toBe(ROWS.length);
    expect(result.links.map((e) => e.displayText)).toEqual(
      ordered.map((r) => (r.emitted ? r.cacheDisplayText : undefined)),
    );
  });

  it("total: true returns the same count with an empty links array", () => {
    expect(runTemplate(cacheOf(ROWS, positionOf), true)).toEqual({
      ok: true,
      count: ROWS.length,
      links: [],
    });
  });
});
