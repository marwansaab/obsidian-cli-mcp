// Original — no upstream. Pure paired-fence scanner per research.md R2 — forward-pass over the text emitting Region[]; open at `^```` or `^~~~`; close must match same fence character; unclosed-at-EOF emits a region from open-line-start through text.length.

export interface Region {
  startOffset: number;
  endOffset: number;
  kind: "fenced-code-block" | "html-comment";
}

export function scanFencedCodeBlocks(text: string): Region[] {
  const regions: Region[] = [];
  const len = text.length;
  let i = 0;
  while (i < len) {
    // identify line bounds
    const lineStart = i;
    let nl = text.indexOf("\n", i);
    if (nl === -1) nl = len;
    const line = text.slice(lineStart, nl);
    const fence = detectFenceOpen(line);
    if (fence !== null) {
      // find a matching close fence on a subsequent line
      const openChar = fence;
      let j = nl + 1;
      let closed = false;
      while (j <= len) {
        const innerLineStart = j;
        let innerNl = text.indexOf("\n", j);
        if (innerNl === -1) innerNl = len;
        const innerLine = text.slice(innerLineStart, innerNl);
        if (detectFenceClose(innerLine, openChar)) {
          regions.push({
            startOffset: lineStart,
            endOffset: innerNl,
            kind: "fenced-code-block",
          });
          closed = true;
          i = innerNl + 1;
          break;
        }
        if (innerNl === len) break;
        j = innerNl + 1;
      }
      if (!closed) {
        regions.push({
          startOffset: lineStart,
          endOffset: len,
          kind: "fenced-code-block",
        });
        return regions;
      }
      continue;
    }
    if (nl === len) break;
    i = nl + 1;
  }
  return regions;
}

function detectFenceOpen(line: string): "`" | "~" | null {
  const stripped = stripTrailingCr(line);
  if (stripped.startsWith("```")) return "`";
  if (stripped.startsWith("~~~")) return "~";
  return null;
}

function detectFenceClose(line: string, openChar: "`" | "~"): boolean {
  const stripped = stripTrailingCr(line);
  if (openChar === "`") return /^```\s*$/.test(stripped);
  return /^~~~\s*$/.test(stripped);
}

function stripTrailingCr(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
