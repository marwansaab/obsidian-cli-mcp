// Original — no upstream. Shared note-line model for the direct-fs editors patch_heading and patch_block (spec 086): owns the finders' line split (`splitLinesForScan`) and the editors' split of the same note at the same line feeds, keeping each line's own terminator, so the finders' line indices address the same lines in the edit array on uniform and mixed-ending notes alike; picks the ending for added lines from the target's marker line; reassembles without touching kept lines' terminators; and checks that an edit kept the original bytes around it (`placeEdit`).

export type LineEnding = "\n" | "\r\n";

function dropCr(s: string): string {
  return s.endsWith("\r") ? s.slice(0, -1) : s;
}

/**
 * The finders' split: `content.split("\n")`, then one trailing `"\r"` stripped from each
 * line, so heading and block detection reason on logical lines whatever the line endings.
 * A note ending in a line break gives an empty last element.
 */
export function splitLinesForScan(content: string): string[] {
  return content.split("\n").map(dropCr);
}

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
 * The finders' view of a line: drops one trailing `"\n"`, then one trailing `"\r"` — so
 * `lineText(splitNoteLines(raw)[i]) === splitLinesForScan(raw)[i]`, and a lone trailing CR
 * is not text either.
 */
export function lineText(line: string): string {
  return dropCr(line.endsWith("\n") ? line.slice(0, -1) : line);
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

/** Where an edit sits, in the finder's terms. */
export interface Placement {
  /** The line the finder named (heading or block marker); added lines take its ending. */
  anchorLine: number;
  /** The finder's text for that line; the edit array must hold the same text there. */
  anchorText: string;
  /** Original characters before this offset must survive the edit. */
  keepBefore: number;
  /** Original characters from the start of this line on must survive the edit. */
  keepFromLine: number;
}

/**
 * Reassembles `edited` (split from `original` by `splitNoteLines` as `lines`) with the
 * anchor line's ending, then runs the placement check: the anchor line must read the
 * finder's text, and the original bytes before `keepBefore` and from `keepFromLine` on must
 * be kept. Returns the new note text, or `null` when the edit cannot be placed safely.
 */
export function placeEdit(
  original: string,
  lines: readonly string[],
  edited: readonly string[],
  trailingNewline: boolean,
  placement: Placement,
): string | null {
  const editedContent = joinNoteLines(
    edited,
    insertEnding(lines, placement.anchorLine),
    trailingNewline,
  );
  const placed =
    lineText(lines[placement.anchorLine] ?? "") === placement.anchorText &&
    keepsOriginalAround(
      original,
      editedContent,
      placement.keepBefore,
      lineStart(lines, placement.keepFromLine),
    );
  return placed ? editedContent : null;
}
