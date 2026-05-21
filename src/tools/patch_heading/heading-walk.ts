// Original — no upstream. patch_heading heading-walk pure helper per BI-040 / data-model §Heading-walk-algorithm — ATX-only line scanner (R2) with fenced-code opacity (R3, FR-013), `#`-segment walk by parent-chain bookkeeping, first-match-wins on duplicate siblings (FR-006), 3-tuple race-identity primitive (R4 / FR-019). Pure functions: no fs access, no UpstreamError throwing; handler converts `null` resolves to typed errors.

export interface ResolvedHeading {
  /** 0-indexed line number of the heading's marker line in the file. */
  markerLineIndex: number;
  /** Literal marker line bytes (e.g. `"## My Heading"`). Race-identity component. */
  markerLineText: string;
  /** Count of leading `#` characters on the marker line (1..6). Race-identity component. */
  rank: number;
  /** Segments-joined-with-`#` of the resolved heading's ancestors, excluding the leaf. Empty when rank===1. Race-identity component. */
  parentChainText: string;
  /** First line index inside the reach (== markerLineIndex + 1). */
  reachStartLineIndex: number;
  /** One past the last line of the heading's reach — index of the next equal-or-higher-rank heading's marker, or lines.length sentinel. */
  reachEndLineIndex: number;
  /** One past the last line of the direct body — index of the first child heading's marker, or === reachEndLineIndex if no child exists. */
  directBodyEndLineIndex: number;
}

export interface HeadingIdentity {
  markerLineText: string;
  rank: number;
  parentChainText: string;
}

/**
 * Sentinel used by `walkHeadings` for `reachEndLineIndex` when the resolved heading's reach
 * extends through end-of-file. The body-edit helpers clamp this to `lines.length` when consuming.
 */
export const REACH_END_EOF = Number.MAX_SAFE_INTEGER;

/**
 * Splits the locator on the literal `#` character per FR-004. Pure, deterministic.
 * Schema-layer validation ensures no segment is empty and length >= 2 before reaching here.
 */
export function parseHeadingPath(headingPath: string): string[] {
  return headingPath.split("#");
}

interface ParsedHeading {
  lineIndex: number;
  markerLineText: string;
  rank: number;
  text: string;
}

const FENCE_RE = /^[ \t]*(`{3,}|~{3,})/;

function parseAtxHeading(line: string, lineIndex: number): ParsedHeading | null {
  // ATX heading: 1..6 leading `#` characters, then a single space, then the heading text.
  // CommonMark lax: trailing `#` characters that close the heading are preserved as part of the text per R2.
  // No leading whitespace allowed (Obsidian's editor produces zero-indent ATX headings).
  if (line.length === 0 || line.charCodeAt(0) !== 35 /* # */) return null;
  let rank = 0;
  while (rank < line.length && line.charCodeAt(rank) === 35) rank++;
  if (rank < 1 || rank > 6) return null;
  if (rank === line.length) return null; // `###` with no text is not a heading per CommonMark
  if (line.charCodeAt(rank) !== 32 /* space */) return null;
  const text = line.slice(rank + 1);
  return { lineIndex, markerLineText: line, rank, text };
}

/**
 * Splits `content` on `\n`. CRLF-aware: a trailing `\r` on each line is stripped before
 * the ATX scanner inspects the line so heading detection works on both LF and CRLF files.
 * The handler is responsible for preserving the original line ending in the post-edit reassembly.
 */
function splitLinesForScan(content: string): string[] {
  const raw = content.split("\n");
  return raw.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

/**
 * Scans `content` line-by-line with fenced-code opacity per R3 / FR-013, then walks the
 * supplied heading segments via committed-ancestor matching per data-model.md §Heading-walk.
 *
 * For each non-fence line that parses as an ATX heading, the walker maintains a `parentChain`
 * indexed by rank: a rank-r heading writes to `parentChain[r-1]` and clears `parentChain[r..]`.
 * A heading H matches the next expected segment iff:
 *   - H.rank === lockedAncestors.length + 1, and
 *   - H.text === segments[lockedAncestors.length], and
 *   - parentChain[0..lockedAncestors.length-1] are all the same ParsedHeading objects as lockedAncestors[0..-1]
 *     (this enforces parent-chain agreement — see FR-001's exact-match contract).
 *
 * On full match the walker returns the resolved heading. Returns `null` on resolution failure;
 * the handler converts to HEADING_NOT_FOUND.
 *
 * First-match-wins per FR-006: once segments[0] is locked, subsequent re-occurrences of the
 * same text at the same rank are NOT reconsidered. The match commits forward through document
 * order.
 */
export function walkHeadings(
  content: string,
  segments: string[],
): ResolvedHeading | null {
  if (segments.length === 0) return null;

  const lines = splitLinesForScan(content);
  const headings: ParsedHeading[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const parsed = parseAtxHeading(line, i);
    if (parsed !== null) headings.push(parsed);
  }

  // parentChain[r-1] = the most-recently-seen heading at rank r along the current spine.
  const parentChain: Array<ParsedHeading | null> = [null, null, null, null, null, null];
  const lockedAncestors: ParsedHeading[] = [];

  for (let hi = 0; hi < headings.length; hi++) {
    const h = headings[hi]!;

    // Update parent chain: H at rank r overwrites parentChain[r-1] and invalidates deeper entries.
    parentChain[h.rank - 1] = h;
    for (let r = h.rank; r < parentChain.length; r++) {
      parentChain[r] = null;
    }

    // Match check.
    const depth = lockedAncestors.length;
    if (h.rank !== depth + 1) continue;
    if (h.text !== segments[depth]) continue;

    // Verify parent chain identity matches the locked ancestors exactly.
    let ancestorsMatch = true;
    for (let i = 0; i < depth; i++) {
      if (parentChain[i] !== lockedAncestors[i]) {
        ancestorsMatch = false;
        break;
      }
    }
    if (!ancestorsMatch) continue;

    lockedAncestors.push(h);

    if (lockedAncestors.length === segments.length) {
      return materialiseResolved(headings, hi, segments);
    }
  }

  return null;
}

function materialiseResolved(
  headings: ParsedHeading[],
  matchedIndex: number,
  segments: string[],
): ResolvedHeading {
  const leaf = headings[matchedIndex]!;
  // Parent chain text: segments joined with `#`, excluding the leaf itself.
  const parentChainText = segments.slice(0, segments.length - 1).join("#");

  // reachEndLineIndex: line index of the next heading with rank <= leaf.rank.
  let reachEndLineIndex: number = REACH_END_EOF;
  for (let i = matchedIndex + 1; i < headings.length; i++) {
    if (headings[i]!.rank <= leaf.rank) {
      reachEndLineIndex = headings[i]!.lineIndex;
      break;
    }
  }

  // directBodyEndLineIndex: line index of the first child heading within the reach,
  // or reachEndLineIndex when no child heading exists between leaf and the reach end.
  let directBodyEndLineIndex = reachEndLineIndex;
  for (let i = matchedIndex + 1; i < headings.length; i++) {
    const h = headings[i]!;
    if (h.rank <= leaf.rank) break; // out of reach
    // First heading deeper than the leaf inside the reach is the first child by definition.
    directBodyEndLineIndex = h.lineIndex;
    break;
  }

  return {
    markerLineIndex: leaf.lineIndex,
    markerLineText: leaf.markerLineText,
    rank: leaf.rank,
    parentChainText,
    reachStartLineIndex: leaf.lineIndex + 1,
    reachEndLineIndex,
    directBodyEndLineIndex,
  };
}

/**
 * Computes the race-detection 3-tuple per R4 / FR-019. Two identities compare equal iff
 * all three fields are byte-identical. Used by the handler to compare initial-walk
 * identity vs. pre-write re-walk identity; mismatch fires HEADING_RACE.
 */
export function resolveHeadingIdentity(resolved: ResolvedHeading): HeadingIdentity {
  return {
    markerLineText: resolved.markerLineText,
    rank: resolved.rank,
    parentChainText: resolved.parentChainText,
  };
}
