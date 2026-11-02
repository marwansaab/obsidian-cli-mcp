// Original — no upstream. Line-level result pipeline shared by search's `context_lines` mode and context_search (spec 087): keeps no lines for a query holding a line break, otherwise keeps the `.md` files and one entry per line (oneMatchPerLine) BEFORE counting, so truncation counts lines (FR-006), caps each text at 500 chars + U+2026, detects truncation conservatively via `flat.length >= appliedCap` (FR-005), sorts by (path, line) ascending and slices to appliedCap. The caller's `normaliseText` runs before the cap: context_search strips a trailing \r (FR-012), search's deprecated line mode does not.
import { oneMatchPerLine } from "./literal-phrase.js";

import type { SearchContextWireFile, SearchLineOutput } from "./schema.js";

// No single line can contain a line break, so such a query keeps no lines (research D2, F6).
const LINE_BREAK = /[\r\n]/;
const TEXT_CAP = 500;
const ELLIPSIS = "…";

function capLine(text: string): string {
  return text.length <= TEXT_CAP ? text : text.slice(0, TEXT_CAP) + ELLIPSIS;
}

/** The line-level output for a parsed `search:context` wire, before the caller's output-schema parse. */
export function lineMatches(
  query: string,
  wire: SearchContextWireFile[],
  appliedCap: number,
  normaliseText: (text: string) => string,
): SearchLineOutput {
  const files = LINE_BREAK.test(query)
    ? []
    : oneMatchPerLine(wire.filter((f) => f.file.toLowerCase().endsWith(".md")));
  const flat = files.flatMap((f) =>
    f.matches.map((m) => ({
      path: f.file,
      line: m.line,
      text: capLine(normaliseText(m.text)),
    })),
  );
  const truncated = flat.length >= appliedCap;
  const sorted = [...flat].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line,
  );
  const trimmed = sorted.slice(0, appliedCap);
  return {
    count: trimmed.length,
    matches: trimmed,
    ...(truncated ? { truncated: true as const } : {}),
  };
}
