// Original — no upstream. Shared note-line model for the direct-fs editors patch_heading and patch_block (spec 086): splits a note at every line feed — the same points both finders split at — keeping each line's own terminator, so the finders' line indices address the same lines in the edit array on uniform and mixed-ending notes alike; picks the ending for added lines from the target's marker line; reassembles without touching kept lines' terminators; and checks that an edit kept the original bytes around it.

export type LineEnding = "\n" | "\r\n";

/**
 * Splits `raw` after each `"\n"`, so every element carries its own terminator (`"\r\n"`,
 * `"\n"`, or `""` on an unterminated last line) and `splitNoteLines(raw).join("") === raw`.
 * A note ending in a line break gives no phantom empty last element; `""` gives `[""]`.
 * Element `i` is the line both finders call line `i`.
 */
export function splitNoteLines(raw: string): string[] {
  const lines: string[] = [];
  let start = 0;
  for (let nl = raw.indexOf("\n"); nl !== -1; nl = raw.indexOf("\n", start)) {
    lines.push(raw.slice(start, nl + 1));
    start = nl + 1;
  }
  if (start < raw.length || lines.length === 0) lines.push(raw.slice(start));
  return lines;
}

/**
 * The scanners' view of a line: drops one trailing `"\n"`, then one trailing `"\r"` — the
 * same rule as the finders' `splitLinesForScan`, so a lone trailing CR is not text either.
 */
export function lineText(line: string): string {
  const noLf = line.endsWith("\n") ? line.slice(0, -1) : line;
  return noLf.endsWith("\r") ? noLf.slice(0, -1) : noLf;
}

function terminatorOf(line: string): LineEnding | null {
  if (!line.endsWith("\n")) return null;
  return line.endsWith("\r\n") ? "\r\n" : "\n";
}

/**
 * The ending for lines an edit adds: the anchor line's terminator if it has one; else the
 * terminator of the nearest earlier line that has one; else `"\n"`. On a uniform note this
 * is the note's single line-break form.
 */
export function insertEnding(lines: readonly string[], anchor: number): LineEnding {
  for (let i = Math.min(anchor, lines.length - 1); i >= 0; i--) {
    const ending = terminatorOf(lines[i]!);
    if (ending !== null) return ending;
  }
  return "\n";
}

/**
 * Reassembles edited lines: an element that already ends in `"\n"` (a kept line) is written
 * as it is; any other element is followed by `ending` unless it is the last. Then the final
 * line break is restored to the original state: appended (as `ending`) when the note had one
 * and the result lacks it, or the result's last terminator stripped when the note had none.
 */
export function joinNoteLines(
  edited: readonly string[],
  ending: LineEnding,
  trailingNewline: boolean,
): string {
  let out = "";
  for (let i = 0; i < edited.length; i++) {
    const line = edited[i]!;
    out += line;
    if (!line.endsWith("\n") && i < edited.length - 1) out += ending;
  }
  if (trailingNewline && !out.endsWith("\n")) {
    out += ending;
  } else if (!trailingNewline && out.endsWith("\n")) {
    out = out.slice(0, out.endsWith("\r\n") ? -2 : -1);
  }
  return out;
}

/**
 * The character offset at which line `index` starts: the summed length of the lines before
 * it. An index at or past `lines.length` gives the note's total length.
 */
export function lineStart(lines: readonly string[], index: number): number {
  let offset = 0;
  const end = Math.min(index, lines.length);
  for (let i = 0; i < end; i++) offset += lines[i]!.length;
  return offset;
}

/**
 * The placement check: true iff `edited` begins with `original`'s bytes before `prefixEnd`,
 * ends with `original`'s bytes from `suffixStart`, and is long enough that those two runs do
 * not overlap in it.
 */
export function keepsOriginalAround(
  original: string,
  edited: string,
  prefixEnd: number,
  suffixStart: number,
): boolean {
  return (
    edited.startsWith(original.slice(0, prefixEnd)) &&
    edited.endsWith(original.slice(suffixStart)) &&
    edited.length >= prefixEnd + (original.length - suffixStart)
  );
}
