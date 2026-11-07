// Original — no upstream. patch_heading body-edit pure helpers per BI-040 / data-model §Body-edit-algorithm — three placement modes (append after the reach's last non-blank line FR-010 / BI-0206, prepend after marker FR-011, replace direct body FR-012); and trailing-newline detection (FR-014) so the handler can preserve the file's existing conventions. Pure functions: no fs access, no `UpstreamError` throwing; the handler reassembles and writes.
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
 * user's intent. The handler glues the segments with the heading line's line ending
 * on reassembly (spec 086).
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
 * Append: content lands right after the last non-blank line of the heading's full reach
 * (BI-0206). The reach ends at `reachEndLineIndex` — the next equal-or-higher-rank heading's
 * marker, or EOF; the blank (empty or whitespace-only) lines that close it stay after the new
 * content, so a list or table ending the section is extended rather than split, and the
 * separation before the next heading is kept. Never steps back past the marker line, so an
 * empty or blank-only body takes the content directly after the heading. Preserves the
 * existing direct body, child subtrees, and the following sibling/ancestor headings.
 *
 * `lines` is the handler's edit array (`splitNoteLines`: no phantom empty last element).
 * The `content` is inserted as-is, split on `\n` if multi-line. The helper does NOT add or
 * strip newlines from the supplied content; a leading blank line in `content` starts a
 * separate block.
 */
export function applyAppend(
  lines: string[],
  resolved: ResolvedHeading,
  content: string,
): string[] {
  let insertAt = clampReachEnd(resolved.reachEndLineIndex, lines.length);
  while (insertAt > resolved.reachStartLineIndex && lines[insertAt - 1]!.trim() === "") {
    insertAt--;
  }
  const contentLines = splitContentLines(content);
  return [...lines.slice(0, insertAt), ...contentLines, ...lines.slice(insertAt)];
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
 * Detects whether the file's raw bytes end with a terminating newline. The handler uses
 * this to preserve FR-014 — a file that ended with `\n` (or `\r\n`) still does after edit;
 * a file that did not still does not.
 */
export function detectTrailingNewline(rawContent: string): boolean {
  return rawContent.endsWith("\n");
}
