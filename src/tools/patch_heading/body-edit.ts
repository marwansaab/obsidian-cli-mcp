// Original — no upstream. patch_heading body-edit pure helpers per BI-040 / data-model §Body-edit-algorithm — three placement modes (append at end-of-reach FR-010, prepend after marker FR-011, replace direct body FR-012); line-ending detection (FR-015) and trailing-newline detection (FR-014) so the handler can preserve the file's existing conventions. Pure functions: no fs access, no `UpstreamError` throwing; the handler reassembles and writes.
import { REACH_END_EOF, type ResolvedHeading } from "./heading-walk.js";

function clampReachEnd(value: number, linesLength: number): number {
  return value === REACH_END_EOF || value > linesLength ? linesLength : value;
}

function clampDirectBodyEnd(value: number, reachEndClamped: number): number {
  return value === REACH_END_EOF || value > reachEndClamped ? reachEndClamped : value;
}

/**
 * Splits user-supplied `content` into logical lines. Empty content collapses to zero
 * lines (the FR-018a "clear the body" case for replace). Otherwise, the content is
 * split on either `\n` or `\r\n`; a trailing line-terminator in the content produces
 * a phantom empty trailing segment which is stripped so the line count matches the
 * user's intent. The handler glues the segments with the file's detected line ending
 * on reassembly.
 */
function splitContentLines(content: string): string[] {
  if (content === "") return [];
  const parts = content.split(/\r?\n/);
  if (parts.length > 0 && parts[parts.length - 1] === "" && /\r?\n$/.test(content)) {
    parts.pop();
  }
  return parts;
}

/**
 * Append: content lands at end of the heading's full reach (immediately before
 * `reachEndLineIndex` — the next equal-or-higher-rank heading's marker, or EOF). Preserves
 * the existing direct body, child subtrees, and the following sibling/ancestor headings.
 *
 * The `content` is inserted as-is, split on `\n` if multi-line. The helper does NOT add or
 * strip newlines from the supplied content; the handler chooses how to glue the segments.
 */
export function applyAppend(
  lines: string[],
  resolved: ResolvedHeading,
  content: string,
): string[] {
  const reachEnd = clampReachEnd(resolved.reachEndLineIndex, lines.length);
  const contentLines = splitContentLines(content);
  return [...lines.slice(0, reachEnd), ...contentLines, ...lines.slice(reachEnd)];
}

/**
 * Prepend: content lands immediately after the heading marker line. Preserves the existing
 * direct body and child subtrees. When the marker line is immediately followed by a child
 * heading marker, the new content lands between the two markers — equivalent to "the new
 * content becomes the lead-in before the child subtree starts".
 */
export function applyPrepend(
  lines: string[],
  resolved: ResolvedHeading,
  content: string,
): string[] {
  const insertAt = resolved.markerLineIndex + 1;
  const contentLines = splitContentLines(content);
  return [...lines.slice(0, insertAt), ...contentLines, ...lines.slice(insertAt)];
}

/**
 * Replace: swap the direct body (lines from `reachStartLineIndex` through
 * `directBodyEndLineIndex`, exclusive) with `content`. Preserves the marker line at
 * `markerLineIndex` and every line from `directBodyEndLineIndex` onwards (the child
 * subtrees and the following sibling/ancestor headings).
 *
 * Empty `content` is supported per FR-018a — it produces a zero-line direct body (the
 * marker line abuts directly against the next heading).
 */
export function applyReplace(
  lines: string[],
  resolved: ResolvedHeading,
  content: string,
): string[] {
  const reachEnd = clampReachEnd(resolved.reachEndLineIndex, lines.length);
  const directBodyEnd = clampDirectBodyEnd(resolved.directBodyEndLineIndex, reachEnd);
  const start = resolved.reachStartLineIndex;
  const contentLines = splitContentLines(content);
  return [...lines.slice(0, start), ...contentLines, ...lines.slice(directBodyEnd)];
}

/**
 * Detects the file's line-ending convention by scanning raw bytes for any `\r\n`. A single
 * CRLF anywhere in the file classifies the whole file as CRLF; otherwise LF. The reassembly
 * uses the detected ending so that FR-015 (line-ending preservation across the modified
 * region's boundaries) is satisfied.
 */
export function detectLineEnding(rawContent: string): "lf" | "crlf" {
  return rawContent.includes("\r\n") ? "crlf" : "lf";
}

/**
 * Detects whether the file's raw bytes end with a terminating newline. The handler uses
 * this to preserve FR-014 — a file that ended with `\n` (or `\r\n`) still does after edit;
 * a file that did not still does not.
 */
export function detectTrailingNewline(rawContent: string): boolean {
  return rawContent.endsWith("\n");
}
