// Original — no upstream. Pure replacement utility per research.md R3 + R6 — compileFindRegex builds a g-flagged RegExp (literal mode auto-escapes); compileFinder returns a per-line match iterator that yields non-zero-width matches with zero-width skip + lastIndex++ idiom (BI-037 R8), each carrying its replacement: verbatim in literal mode, and in regex mode expanded with ECMAScript $-substitution semantics via native String.prototype.replace, run as a sticky regex at the match's position in its whole line so lookbehind / lookahead keep their context (BI-0202).

export type FindMode = "literal" | "regex";

export interface LineMatch {
  /** Absolute offset of the match start within the note text (line offset + base). */
  index: number;
  /** Absolute offset of the match end within the note text. */
  endIndex: number;
  /** The exact substring the regex matched. Never empty (zero-width is skipped). */
  matchedSubstring: string;
  /** The text that replaces the match. */
  replacementSubstring: string;
}

/** Yields the matches in one line; `byteOffsetBase` is the line's offset in the note text. */
export type LineFinder = (line: string, byteOffsetBase: number) => Generator<LineMatch>;

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

export function escapeRegex(pattern: string): string {
  return pattern.replace(REGEX_META, "\\$&");
}

export function compileFindRegex(
  pattern: string,
  mode: FindMode,
  caseInsensitive: boolean,
): RegExp {
  const body = mode === "regex" ? pattern : escapeRegex(pattern);
  const flags = caseInsensitive ? "gi" : "g";
  return new RegExp(body, flags);
}

export function compileFinder(
  pattern: string,
  replacement: string,
  mode: FindMode,
  caseInsensitive: boolean,
): LineFinder {
  const regex = compileFindRegex(pattern, mode, caseInsensitive);
  // The same pattern and flags, sticky instead of global: anchored at the
  // match's line-relative start against the whole line, it matches exactly the
  // text the global regex found, with the context lookbehind / lookahead need
  // (BI-0202). Native replace keeps the ECMAScript $-substitution semantics; the
  // expanded text is the slice between the match start and the unchanged suffix.
  const sticky = new RegExp(regex.source, regex.flags.replace("g", "y"));
  const expand =
    mode === "literal"
      ? () => replacement
      : (line: string, start: number, end: number): string => {
          sticky.lastIndex = start;
          const result = line.replace(sticky, replacement);
          return result.slice(start, result.length - (line.length - end));
        };
  return function* findInLine(line, byteOffsetBase) {
    // Reset lastIndex so the finder is callable repeatedly.
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      const end = m.index + m[0].length;
      yield {
        index: byteOffsetBase + m.index,
        endIndex: byteOffsetBase + end,
        matchedSubstring: m[0],
        replacementSubstring: expand(line, m.index, end),
      };
    }
  };
}
