// Original — no upstream. Literal-phrase helpers shared by the search and context_search handlers (spec 087, BI-0175): the CLI reads its query as Obsidian search syntax, so the query is sent as one Obsidian regular expression with every regex syntax character and the `/` delimiter escaped, which the CLI matches as the literal character sequence anywhere, including part-way through a word (a quoted phrase matched whole words only, BI-0175); search:context lists a line once per occurrence, so line-level results keep one entry per line (research D2).
import type { SearchContextWireFile } from "./schema.js";

/** The query as one `/…/` regular expression, each of `\ ^ $ . * + ? ( ) [ ] { } | /` prefixed with `\`, which the CLI matches as a literal substring (BI-0175). */
export function literalPhraseQuery(query: string): string {
  return `/${query.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&")}/`;
}

/** The first wire entry per line, in wire order (the CLI repeats a line per occurrence, F8). */
export function oneMatchPerLine(wire: SearchContextWireFile[]): SearchContextWireFile[] {
  return wire.map((f) => {
    const seen = new Set<number>();
    return {
      ...f,
      matches: f.matches.filter((m) => {
        if (seen.has(m.line)) return false;
        seen.add(m.line);
        return true;
      }),
    };
  });
}
