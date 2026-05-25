// Original — no upstream. patch_block block-scan pure helper per BI-043 / data-model §Block-scan-algorithm — line-by-line scanner with frontmatter scan-skip (FR-014), fenced-code opacity (FR-011 / R3), per-shape classification (paragraph / list-item / separately-placed / on-heading-atx / on-heading-setext per R2), setext-underline lookahead, first-match-wins on duplicate ids (FR-002a). Pure functions: no fs access, no UpstreamError throwing; handler converts null findBlock to BLOCK_NOT_FOUND.

export type BlockShape =
  | "paragraph"
  | "list-item"
  | "separately-placed"
  | "on-heading-atx"
  | "on-heading-setext";

export interface BlockMatch {
  blockId: string;
  shape: BlockShape;
  markerLineIndex: number;
  markerLineText: string;
  /** First line of the block whose body will be edited.
   * For paragraph / list-item / on-heading-atx / on-heading-setext, equals `markerLineIndex`.
   * For separately-placed, the first line of the preceding block. */
  blockStartLineIndex: number;
  /** Last line of the block whose body will be edited.
   * For paragraph / list-item / on-heading-atx / on-heading-setext, equals `markerLineIndex`.
   * For separately-placed, `markerLineIndex - 1`. */
  blockEndLineIndex: number;
}

// Mirrors the validation alphabet in schema.ts (FR-004). A trailing marker token
// looks like " ^<id>"; a marker-only line is "<optional-whitespace>^<id><optional-whitespace>".
const TRAILING_MARKER_RE = / \^([A-Za-z0-9-]+)$/;
const MARKER_ONLY_RE = /^[ \t]*\^([A-Za-z0-9-]+)[ \t]*$/;

// CommonMark-lax fence detector: ≥ 3 backticks or tildes after optional leading
// whitespace (R3). Nested fences not supported — first matching closing fence
// ends the current fence.
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})/;

// Setext underline lookahead: a line composed entirely of `=` (rank 1) or `-`
// (rank 2) characters, optionally surrounded by leading/trailing whitespace.
const SETEXT_UNDERLINE_RE = /^[ \t]*(=+|-+)[ \t]*$/;

// ATX heading: 1–6 leading `#` followed by a space, no leading indentation.
const ATX_HEADING_RE = /^#{1,6} /;

// List-item marker: `-`, `*`, `+`, or `\d+.` followed by at least one space,
// allowing leading indentation per Markdown nesting conventions.
const LIST_ITEM_RE = /^[ \t]*([-*+]|\d+\.) /;

// Separately-placed parent shapes (table row, callout, blockquote, indented code).
const TABLE_ROW_RE = /^[ \t]*\|/;
const BLOCKQUOTE_RE = /^[ \t]*>/;
const INDENTED_CODE_RE = /^(    |\t)/;

function isSeparatelyPlacedParent(line: string): boolean {
  if (line.length === 0) return false;
  return (
    TABLE_ROW_RE.test(line) ||
    BLOCKQUOTE_RE.test(line) ||
    INDENTED_CODE_RE.test(line)
  );
}

/**
 * Splits `content` on `\n` and CRLF-strips so the scanner reasons on logical
 * lines regardless of the file's line-ending convention. The handler is
 * responsible for preserving the original line ending on reassembly.
 */
function splitLinesForScan(content: string): string[] {
  return content.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

/**
 * Scans `content` once line-by-line and emits every bound `^block-id` marker
 * as a `BlockMatch`. Tracks four pieces of state per data-model:
 *  - `inFrontmatter`: enforces FR-014 (no binding inside leading YAML frontmatter).
 *  - `inFence`: enforces FR-011 (markers inside fenced code blocks are content).
 *  - `parentBlockStart`: the index of the first line of an in-progress
 *    table/callout/blockquote/indented-code block — used for separately-placed
 *    classification when a marker-only line immediately follows.
 *  - One-line lookahead for setext-underline promotion.
 *
 * Pure; deterministic; O(lines).
 */
export function scanBlocks(content: string): BlockMatch[] {
  const lines = splitLinesForScan(content);
  const out: BlockMatch[] = [];
  let inFrontmatter = false;
  let inFence = false;
  let parentBlockStart: number | null = null;

  // YAML frontmatter is only recognised when the file's very first line is
  // exactly `---` per data-model.
  if (lines.length > 0 && lines[0] === "---") {
    inFrontmatter = true;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (inFrontmatter) {
      // The opening fence is line 0; skip until we find the closing fence.
      if (i > 0 && line === "---") {
        inFrontmatter = false;
      }
      // No binding while inside frontmatter — `^block-id` tokens in YAML field
      // values must not be bound (FR-014 explicit enforcement).
      parentBlockStart = null;
      continue;
    }

    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      parentBlockStart = null;
      continue;
    }

    if (inFence) {
      // Markers inside fenced code blocks are content, never eligible targets.
      parentBlockStart = null;
      continue;
    }

    // Marker-only line: candidate for separately-placed classification when the
    // immediately-preceding line belongs to a recognised parent block.
    const onlyMatch = MARKER_ONLY_RE.exec(line);
    if (onlyMatch !== null) {
      const blockId = onlyMatch[1]!;
      if (parentBlockStart !== null) {
        out.push({
          blockId,
          shape: "separately-placed",
          markerLineIndex: i,
          markerLineText: line,
          blockStartLineIndex: parentBlockStart,
          blockEndLineIndex: i - 1,
        });
      }
      // A marker-only line that follows a non-block-shape line (or a blank
      // line) is unbound — it is content the scanner does not recognise.
      parentBlockStart = null;
      continue;
    }

    // Trailing-marker line: classify by per-line shape, with setext-underline
    // lookahead to disambiguate paragraph/list-item from on-heading-setext.
    const trailMatch = TRAILING_MARKER_RE.exec(line);
    if (trailMatch !== null) {
      const blockId = trailMatch[1]!;
      const nextLine = i + 1 < lines.length ? lines[i + 1]! : null;
      const isSetextUnderline =
        nextLine !== null && nextLine.length > 0 && SETEXT_UNDERLINE_RE.test(nextLine);
      let shape: BlockShape;
      if (ATX_HEADING_RE.test(line)) {
        shape = "on-heading-atx";
      } else if (isSetextUnderline) {
        shape = "on-heading-setext";
      } else if (LIST_ITEM_RE.test(line)) {
        shape = "list-item";
      } else {
        shape = "paragraph";
      }
      out.push({
        blockId,
        shape,
        markerLineIndex: i,
        markerLineText: line,
        blockStartLineIndex: i,
        blockEndLineIndex: i,
      });
      // A trailing-marker line is itself a content line; the next marker-only
      // line that follows would bind to *this* line's parent block, not to a
      // new one — so reset.
      parentBlockStart = null;
      continue;
    }

    // Non-marker content line. Update the parent-block tracker.
    if (line.length === 0) {
      parentBlockStart = null;
      continue;
    }
    if (isSeparatelyPlacedParent(line)) {
      if (parentBlockStart === null) parentBlockStart = i;
      // Else: continuing an in-progress parent block.
    } else {
      parentBlockStart = null;
    }
  }

  return out;
}

/**
 * Returns the FIRST `BlockMatch` whose `blockId === blockId` in document order
 * per FR-002a (first-match-wins on duplicate ids). Returns `null` when no
 * match exists; the handler converts `null` to a `BLOCK_NOT_FOUND` typed error.
 */
export function findBlock(content: string, blockId: string): BlockMatch | null {
  const matches = scanBlocks(content);
  for (const m of matches) {
    if (m.blockId === blockId) return m;
  }
  return null;
}
