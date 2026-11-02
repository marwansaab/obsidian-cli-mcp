// Original — no upstream. Literal-phrase helpers shared by the search and context_search handlers (spec 087): the CLI reads its query as Obsidian search syntax, so the query is sent as one double-quoted phrase with \ and " escaped (research D1); search:context lists a line once per occurrence, so line-level results keep one entry per line (research D2).
import type { SearchContextWireFile } from "./schema.js";

/** The query as one double-quoted phrase, `\` → `\\` and `"` → `\"`, which the CLI matches literally (research F6). */
export function literalPhraseQuery(query: string): string {
  return `"${query.replace(/[\\"]/g, "\\$&")}"`;
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
