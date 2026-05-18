// Original — no upstream. Pure HTML-comment region scanner per research.md R2 — forward-pass scan for `<!--` (anywhere on a line) and `-->` (anywhere afterwards); unclosed comment runs to EOF; nested comments are flat per CommonMark (first `-->` closes).
import type { Region } from "./fence-scan.js";

export function scanHtmlComments(text: string): Region[] {
  const regions: Region[] = [];
  const len = text.length;
  let i = 0;
  while (i < len) {
    const open = text.indexOf("<!--", i);
    if (open === -1) break;
    const close = text.indexOf("-->", open + 4);
    if (close === -1) {
      regions.push({ startOffset: open, endOffset: len, kind: "html-comment" });
      break;
    }
    const end = close + 3;
    regions.push({ startOffset: open, endOffset: end, kind: "html-comment" });
    i = end;
  }
  return regions;
}
