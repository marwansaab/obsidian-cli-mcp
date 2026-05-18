// Original — no upstream. Pure replacement utility per research.md R3 + R6 — compileFindRegex builds a g-flagged RegExp (literal mode auto-escapes); iterateLineMatches yields per-line non-zero-width matches with zero-width skip + lastIndex++ idiom (BI-037 R8); applyReplacement returns the substitution string in regex mode (ECMAScript $1/$&/$$ semantics via native String.prototype.replace) or verbatim in literal mode.

export type FindMode = "literal" | "regex";

export interface LineMatch {
  /** Absolute offset of the match start within the note text (line offset + base). */
  index: number;
  /** Absolute offset of the match end within the note text. */
  endIndex: number;
  /** The exact substring the regex matched. Never empty (zero-width is skipped). */
  matchedSubstring: string;
}

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

export function* iterateLineMatches(
  line: string,
  regex: RegExp,
  byteOffsetBase: number,
): Generator<LineMatch> {
  // Caller is responsible for passing a /g/-flagged regex. We reset lastIndex
  // defensively so the iterator is callable repeatedly with the same regex.
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(line)) !== null) {
    if (m[0].length === 0) {
      regex.lastIndex++;
      continue;
    }
    yield {
      index: byteOffsetBase + m.index,
      endIndex: byteOffsetBase + m.index + m[0].length,
      matchedSubstring: m[0],
    };
  }
}

export function applyReplacement(
  matched: string,
  regex: RegExp | null,
  replacement: string,
  mode: FindMode,
): string {
  if (mode === "literal") return replacement;
  if (regex === null) {
    throw new Error("applyReplacement: regex mode requires a non-null RegExp");
  }
  // Build a non-global single-use anchor regex to apply replacement to the
  // matched substring while honouring ECMAScript $1/$&/$$ semantics.
  const flags = regex.flags.replace("g", "");
  const singleUse = new RegExp(regex.source, flags);
  return matched.replace(singleUse, replacement);
}
