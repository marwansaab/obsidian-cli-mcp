// Original — no upstream. patch_block block-edit pure helpers per BI-043 / data-model §Block-edit-algorithm — applyDetachReattach for paragraph + list-item shapes (FR-008 / FR-009 marker-position invariant with body swap; single ASCII-space separator preserved); applyVerbatimMarkerPreserve for separately-placed shapes (FR-010 marker-line byte-stability; block-body swap). Line-ending detection (FR-013) and trailing-newline detection (FR-012) helpers so the handler can preserve the file's existing conventions. Pure functions: no fs access, no UpstreamError throwing.
import type { BlockMatch } from "./block-scan.js";

const LIST_ITEM_PREFIX_RE = /^([ \t]*([-*+]|\d+\.) )/;

/**
 * Splits the user-supplied `content` into logical lines, preserving an empty
 * line when `content === ""` so the marker line still exists in the output for
 * paragraph + list-item shapes. A trailing line-terminator in `content` is
 * stripped so the line count matches the user's intent (mirrors patch_heading
 * convention).
 */
function splitContentLinesForDetach(content: string): string[] {
  if (content === "") return [""];
  const parts = content.split(/\r?\n/);
  if (parts.length > 1 && parts[parts.length - 1] === "" && /\r?\n$/.test(content)) {
    parts.pop();
  }
  return parts;
}

/**
 * Splits content for separately-placed surgery where an empty content legitimately
 * collapses the block to zero lines (the marker line abuts directly against the
 * line that preceded the block — FR-007 replace-empty cohort parity).
 */
function splitContentLinesForBlock(content: string): string[] {
  if (content === "") return [];
  const parts = content.split(/\r?\n/);
  if (parts.length > 0 && parts[parts.length - 1] === "" && /\r?\n$/.test(content)) {
    parts.pop();
  }
  return parts;
}

/**
 * Surgery for paragraph + list-item shapes (FR-008 / FR-009). Preserves the
 * leading list-marker bytes + indentation byte-stably (for list-item shape)
 * and re-attaches the ` ^<blockId>` marker token at the conventional position
 * (trailing on the last line of the new content).
 *
 * Empty `content` produces a one-line replacement carrying the bare marker:
 *  - paragraph: ` ^<blockId>` (single ASCII space + marker token)
 *  - list-item: `<list-marker-and-indent> ^<blockId>` (the list-marker prefix's
 *    trailing space is preserved byte-stably, so the result has two spaces
 *    between the list marker and the `^` — cohort whitespace convention).
 *
 * Multi-line content lands as multiple lines with the marker token appended
 * to the last line. For list-item shape, the prefix is applied to the FIRST
 * content line only; subsequent lines are emitted as-is (caller responsibility
 * per data-model.md Assumptions — the wrapper does not invent shape-specific
 * structural validation).
 */
export function applyDetachReattach(
  lines: string[],
  match: BlockMatch,
  content: string,
): string[] {
  if (match.shape !== "paragraph" && match.shape !== "list-item") {
    throw new Error(
      `applyDetachReattach: unsupported shape "${match.shape}" (expected paragraph or list-item)`,
    );
  }
  const markerToken = ` ^${match.blockId}`;
  let prefix = "";
  if (match.shape === "list-item") {
    const m = LIST_ITEM_PREFIX_RE.exec(match.markerLineText);
    if (m !== null) prefix = m[0]!;
  }
  const contentLines = splitContentLinesForDetach(content);
  const newSegments: string[] = [];
  for (let i = 0; i < contentLines.length; i++) {
    let segment = contentLines[i]!;
    if (i === 0) segment = prefix + segment;
    if (i === contentLines.length - 1) segment = segment + markerToken;
    newSegments.push(segment);
  }
  return [
    ...lines.slice(0, match.markerLineIndex),
    ...newSegments,
    ...lines.slice(match.markerLineIndex + 1),
  ];
}

/**
 * Surgery for separately-placed shapes (FR-010 — table / callout / blockquote
 * / indented-code preceding a standalone marker line). The marker line at
 * `match.markerLineIndex` is preserved verbatim — its bytes are unchanged
 * and its position relative to the (possibly resized) block is unchanged.
 *
 * The slice `lines[blockStartLineIndex .. blockEndLineIndex + 1]` is replaced
 * with the new content split on `\n`. Empty content collapses the block to
 * zero lines; multi-line content expands or contracts the block. The marker
 * line ends up at `blockStartLineIndex + contentLines.length`, immediately
 * following the new block.
 */
export function applyVerbatimMarkerPreserve(
  lines: string[],
  match: BlockMatch,
  content: string,
): string[] {
  if (match.shape !== "separately-placed") {
    throw new Error(
      `applyVerbatimMarkerPreserve: unsupported shape "${match.shape}" (expected separately-placed)`,
    );
  }
  const contentLines = splitContentLinesForBlock(content);
  return [
    ...lines.slice(0, match.blockStartLineIndex),
    ...contentLines,
    ...lines.slice(match.blockEndLineIndex + 1),
  ];
}

/**
 * Detects the file's line-ending convention by scanning raw bytes for any `\r\n`.
 * A single CRLF anywhere in the file classifies the whole file as CRLF; otherwise
 * LF. The handler uses this to preserve FR-013 (line-ending preservation across
 * the modified region's boundaries).
 */
export function detectLineEnding(rawContent: string): "lf" | "crlf" {
  return rawContent.includes("\r\n") ? "crlf" : "lf";
}

/**
 * Detects whether the file's raw bytes end with a terminating newline. The
 * handler uses this to preserve FR-012 — a file that ended with `\n` (or
 * `\r\n`) still does after edit; a file that did not still does not.
 */
export function detectTrailingNewline(rawContent: string): boolean {
  return rawContent.endsWith("\n");
}
