// Original — no upstream. Line-level result pipeline shared by search's `context_lines` mode and context_search (spec 087). selectLines owns membership, order and truncation: it keeps no lines for a query holding a line break, otherwise keeps the `.md` files and one entry per line (oneMatchPerLine) BEFORE counting, so truncation counts lines (FR-006), detects truncation conservatively via `flat.length >= appliedCap` (FR-005), sorts by (path, line) ascending and slices to appliedCap, returning the raw CLI text. lineOutput caps each text at 500 chars + U+2026 and builds the output. Search's deprecated line mode passes the CLI text through as is (it keeps a trailing \r); context_search replaces it with the note's line read back between the two steps (spec 088).
import { oneMatchPerLine } from "./literal-phrase.js";

import type { SearchContextWireFile, SearchLineOutput } from "./schema.js";

// No single line can contain a line break, so such a query keeps no lines (research D2, F6).
const LINE_BREAK = /[\r\n]/;
const TEXT_CAP = 500;
const ELLIPSIS = "…";

export type LineRow = SearchLineOutput["matches"][number];

export interface LineSelection {
  rows: LineRow[];
  truncated: boolean;
}

function capLine(text: string): string {
  return text.length <= TEXT_CAP ? text : text.slice(0, TEXT_CAP) + ELLIPSIS;
}

/** The selected rows for a parsed `search:context` wire, with the CLI's text uncapped. */
export function selectLines(
  query: string,
  wire: SearchContextWireFile[],
  appliedCap: number,
): LineSelection {
  const files = LINE_BREAK.test(query)
    ? []
    : oneMatchPerLine(wire.filter((f) => f.file.toLowerCase().endsWith(".md")));
  const flat = files.flatMap((f) =>
    f.matches.map((m) => ({ path: f.file, line: m.line, text: m.text })),
  );
  const truncated = flat.length >= appliedCap;
  const sorted = [...flat].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line,
  );
  return { rows: sorted.slice(0, appliedCap), truncated };
}

/** The line-level output for selected rows, before the caller's output-schema parse. */
export function lineOutput({ rows, truncated }: LineSelection): SearchLineOutput {
  const matches = rows.map((row) => ({ ...row, text: capLine(row.text) }));
  return {
    count: matches.length,
    matches,
    ...(truncated ? { truncated: true as const } : {}),
  };
}
