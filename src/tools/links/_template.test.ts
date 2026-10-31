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

// Body entry: `line` is the cache's 0-based line, as Obsidian reports it.
function cacheEntry(
  original: string,
  link: string,
  displayText: string,
  line: number,
  col: number,
): CacheEntry {
  return { link, original, displayText, position: { start: { line, col } } };
}

// Frontmatter entry: no position.
function fmEntry(original: string, link: string, displayText: string): CacheEntry {
  return { link, original, displayText };
}

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

type Source = "fm" | "links" | "embeds";

interface Row {
  id: string;
  source: Source;
  original: string;
  link: string;
  cacheDisplayText: string;
  // The displayText the tool must emit; undefined means the key is absent.
  expected: string | undefined;
}

// Cache values copied verbatim from spec 071 contracts/t0-cache-shapes.json and research F6.
const ROWS: Row[] = [
  {
    id: "1",
    source: "links",
    original: "[[Tgt#Head]]",
    link: "Tgt#Head",
    cacheDisplayText: "Tgt > Head",
    expected: undefined,
  },
  {
    id: "2",
    source: "links",
    original: "[[Tgt#^blk]]",
    link: "Tgt#^blk",
    cacheDisplayText: "Tgt > ^blk",
    expected: undefined,
  },
  {
    id: "3",
    source: "links",
    original: "[[Tgt#H1#H2]]",
    link: "Tgt#H1#H2",
    cacheDisplayText: "Tgt > H1 > H2",
    expected: undefined,
  },
  {
    id: "4",
    source: "links",
    original: "[[#Local]]",
    link: "#Local",
    cacheDisplayText: "Local",
    expected: undefined,
  },
  {
    id: "5",
    source: "links",
    original: "[[#^lb]]",
    link: "#^lb",
    cacheDisplayText: "^lb",
    expected: undefined,
  },
  {
    id: "6",
    source: "fm",
    original: "[[Tgt#Head]]",
    link: "Tgt#Head",
    cacheDisplayText: "Tgt > Head",
    expected: undefined,
  },
  {
    id: "7",
    source: "embeds",
    original: "![[Tgt#Head]]",
    link: "Tgt#Head",
    cacheDisplayText: "Tgt > Head",
    expected: undefined,
  },
  {
    id: "8",
    source: "embeds",
    original: "![[Tgt#^blk]]",
    link: "Tgt#^blk",
    cacheDisplayText: "Tgt > ^blk",
    expected: undefined,
  },
  {
    id: "9",
    source: "embeds",
    original: "![[paper.pdf#page=3]]",
    link: "paper.pdf#page=3",
    cacheDisplayText: "paper.pdf > page=3",
    expected: undefined,
  },
  {
    id: "10",
    source: "links",
    original: "[[Tgt#Head|Custom Display]]",
    link: "Tgt#Head",
    cacheDisplayText: "Custom Display",
    expected: "Custom Display",
  },
  {
    id: "11",
    source: "links",
    original: "[[Tgt#^blk|Other Label]]",
    link: "Tgt#^blk",
    cacheDisplayText: "Other Label",
    expected: "Other Label",
  },
  {
    id: "12",
    source: "links",
    original: "[[Tgt|Alias]]",
    link: "Tgt",
    cacheDisplayText: "Alias",
    expected: "Alias",
  },
  {
    id: "13",
    source: "embeds",
    original: "![[Tgt#Head|Emb Alias]]",
    link: "Tgt#Head",
    cacheDisplayText: "Emb Alias",
    expected: "Emb Alias",
  },
  {
    id: "14",
    source: "links",
    original: "[[Tgt#Head|Tgt > Head]]",
    link: "Tgt#Head",
    cacheDisplayText: "Tgt > Head",
    expected: "Tgt > Head",
  },
  {
    id: "15",
    source: "links",
    original: "[[Tgt#Head\\|Tbl Alias]]",
    link: "Tgt#Head",
    cacheDisplayText: "Tbl Alias",
    expected: "Tbl Alias",
  },
  {
    id: "16",
    source: "embeds",
    original: "![[img.png|300]]",
    link: "img.png",
    cacheDisplayText: "300",
    expected: "300",
  },
  {
    id: "17",
    source: "embeds",
    original: "![[img.png|300x200]]",
    link: "img.png",
    cacheDisplayText: "300x200",
    expected: "300x200",
  },
  {
    id: "18",
    source: "links",
    original: "[[Tgt#Head|]]",
    link: "Tgt#Head",
    cacheDisplayText: "",
    expected: undefined,
  },
  {
    id: "19",
    source: "links",
    original: "[[Tgt#Head| ]]",
    link: "Tgt#Head",
    cacheDisplayText: "",
    expected: undefined,
  },
  {
    id: "20",
    source: "links",
    original: "[[Tgt|]]",
    link: "Tgt",
    cacheDisplayText: "",
    expected: undefined,
  },
  {
    id: "21",
    source: "links",
    original: "[[Tgt#Head|Tgt#Head]]",
    link: "Tgt#Head",
    cacheDisplayText: "Tgt#Head",
    expected: undefined,
  },
  {
    id: "22",
    source: "links",
    original: "[[Tgt|Tgt]]",
    link: "Tgt",
    cacheDisplayText: "Tgt",
    expected: undefined,
  },
  {
    id: "23",
    source: "links",
    original: "[[Tgt]]",
    link: "Tgt",
    cacheDisplayText: "Tgt",
    expected: undefined,
  },
  {
    id: "24",
    source: "embeds",
    original: "![[img.png]]",
    link: "img.png",
    cacheDisplayText: "img.png",
    expected: undefined,
  },
  {
    id: "25",
    source: "links",
    original: "[Text](Tgt.md#Head)",
    link: "Tgt.md#Head",
    cacheDisplayText: "Text",
    expected: "Text",
  },
  {
    id: "26",
    source: "links",
    original: "[](Tgt.md#Head)",
    link: "Tgt.md#Head",
    cacheDisplayText: "",
    expected: "",
  },
  {
    id: "27",
    source: "embeds",
    original: "![alt](img.png)",
    link: "img.png",
    cacheDisplayText: "alt",
    expected: "alt",
  },
  {
    id: "fm-alias",
    source: "fm",
    original: "[[Tgt#Head|Fm Alias]]",
    link: "Tgt#Head",
    cacheDisplayText: "Fm Alias",
    expected: "Fm Alias",
  },
];

function kindOf(row: Row): string {
  if (row.source === "embeds") return "embed";
  if (row.source === "fm") return "wikilink";
  return row.original.startsWith("[[") ? "wikilink" : "markdown";
}

function rowById(id: string): Row {
  const row = ROWS.find((r) => r.id === id);
  if (row === undefined) throw new Error(`no row ${id}`);
  return row;
}

// Renders one row alone: body entries sit on 0-based line 4 (reported line 5).
function runRow(row: Row): Envelope {
  const entry =
    row.source === "fm"
      ? fmEntry(row.original, row.link, row.cacheDisplayText)
      : cacheEntry(row.original, row.link, row.cacheDisplayText, 4, 0);
  return runTemplate({ [row.source === "fm" ? "frontmatterLinks" : row.source]: [entry] });
}

function expectRow(id: string): void {
  const row = rowById(id);
  const result = runRow(row);
  expect(result.ok).toBe(true);
  expect(result.count).toBe(1);
  const entry = result.links[0]!;
  expect(entry.target).toBe(row.link);
  expect(entry.line).toBe(row.source === "fm" ? 1 : 5);
  expect(entry.kind).toBe(kindOf(row));
  if (row.expected === undefined) {
    expect(Object.hasOwn(entry, "displayText")).toBe(false);
  } else {
    expect(entry.displayText).toBe(row.expected);
  }
}

describe("links JS_TEMPLATE — harness", () => {
  it("an empty cache gives an empty success envelope", () => {
    expect(runTemplate({})).toEqual({ ok: true, count: 0, links: [] });
  });
});

describe("US1 — unaliased fragment links, frontmatter links and empty or blank aliases carry no displayText", () => {
  it.each([
    ["1", "[[Tgt#Head]]"],
    ["2", "[[Tgt#^blk]]"],
    ["3", "[[Tgt#H1#H2]] (nested heading)"],
    ["4", "[[#Local]] (same note)"],
    ["5", "[[#^lb]] (same-note block)"],
    ["6", 'frontmatter "[[Tgt#Head]]"'],
    ["18", "[[Tgt#Head|]] (empty alias)"],
    ["19", '[[Tgt#Head| ]] (blank alias, cache "")'],
    ["20", "[[Tgt|]] (empty alias, plain link)"],
  ])("row %s: %s", (id) => expectRow(id));
});

describe("US2 — unaliased fragment embeds carry no displayText", () => {
  it.each([
    ["7", "![[Tgt#Head]]"],
    ["8", "![[Tgt#^blk]]"],
    ["9", "![[paper.pdf#page=3]] (non-heading fragment)"],
  ])("row %s: %s", (id) => expectRow(id));
});

describe("US3 — author-written aliases are kept; Markdown labels unchanged", () => {
  it.each([
    ["10", "[[Tgt#Head|Custom Display]]"],
    ["11", "[[Tgt#^blk|Other Label]]"],
    ["12", "[[Tgt|Alias]]"],
    ["13", "![[Tgt#Head|Emb Alias]] (embed)"],
    ["14", "[[Tgt#Head|Tgt > Head]] (alias that looks derived, FR-003)"],
    ["15", "[[Tgt#Head\\|Tbl Alias]] (table-escaped separator)"],
    ["16", "![[img.png|300]] (size text)"],
    ["17", "![[img.png|300x200]] (size text)"],
    ["25", "[Text](Tgt.md#Head) (Markdown link)"],
    ["26", "[](Tgt.md#Head) (Markdown link, empty text kept)"],
    ["27", "![alt](img.png) (Markdown image)"],
    ["fm-alias", 'frontmatter list item "[[Tgt#Head|Fm Alias]]" (research F6)'],
  ])("row %s: %s", (id) => expectRow(id));
});

describe("US4 — plain links and aliases equal to the target stay unlabelled", () => {
  it.each([
    ["21", "[[Tgt#Head|Tgt#Head]] (alias equal to target)"],
    ["22", "[[Tgt|Tgt]]"],
    ["23", "[[Tgt]]"],
    ["24", "![[img.png]]"],
  ])("row %s: %s", (id) => expectRow(id));
});

describe("FR-005 — target, line, kind, order and count are unchanged", () => {
  // Every row in one cache. Body row N sits on 0-based line N (reported N + 1), except row 10,
  // which shares row 1's line at a lower column so the column tiebreak decides their order.
  function mixedCache(): FileCache {
    const cache: Required<FileCache> = { frontmatterLinks: [], links: [], embeds: [] };
    for (const row of ROWS) {
      if (row.source === "fm") {
        cache.frontmatterLinks.push(fmEntry(row.original, row.link, row.cacheDisplayText));
        continue;
      }
      const [line, col] = row.id === "10" ? [1, 0] : row.id === "1" ? [1, 20] : [Number(row.id), 0];
      cache[row.source].push(cacheEntry(row.original, row.link, row.cacheDisplayText, line, col));
    }
    return cache;
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

  it("default mode emits every entry in source order with unchanged target/line/kind and count", () => {
    const result = runTemplate(mixedCache());
    const expected = ORDER.map((id) => {
      const row = rowById(id);
      const line = row.source === "fm" ? 1 : id === "10" || id === "1" ? 2 : Number(id) + 1;
      return { target: row.link, line, kind: kindOf(row) };
    });
    expect(result.ok).toBe(true);
    expect(result.links.map(({ displayText: _d, ...rest }) => rest)).toEqual(expected);
    expect(result.count).toBe(ROWS.length);
    expect(result.links.length).toBe(ROWS.length);
    expect(result.links.map((e) => e.displayText)).toEqual(ORDER.map((id) => rowById(id).expected));
  });

  it("total: true returns the same count with an empty links array", () => {
    expect(runTemplate(mixedCache(), true)).toEqual({ ok: true, count: ROWS.length, links: [] });
  });
});
