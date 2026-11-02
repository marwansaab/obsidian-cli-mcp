// Original — no upstream. context_search read-back (spec 088, research D1/D3/D4): Obsidian's search trims each line, so the selected lines are read back from the notes through invokeEval in batches whose composed code stays at or under READ_BACK_CODE_MAX (the Obsidian.com shim answers nothing above about 4,000 characters, F10), reconciled against the CLI's text by trim equality (F6), and returned as the note's line minus one trailing \r (lineText). Any row that cannot be read back faithfully fails the whole call with CLI_REPORTED_ERROR / details.code MATCH_LINE_UNAVAILABLE (Clarification Q1); there is no fallback.
import { JS_TEMPLATE } from "./_template.js";
import { contextSearchReadBackSchema, type ContextSearchReadBack } from "./schema.js";
import { invokeEval, type InvokeCliDeps } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { parseEvalAnswer, stdoutDetails } from "../_eval-parse.js";
import { lineText } from "../_note-lines.js";
import { composeEvalCode } from "../_shared.js";

import type { SearchLineOutput } from "../search/schema.js";

type Row = SearchLineOutput["matches"][number];
type ReadBackBatch = Array<[string, number[]]>;
type NoteFailure = Exclude<ContextSearchReadBack["notes"][number], { state: "read" }>;

/** The longest composed eval code one read-back batch may send (research D3, F10). */
export const READ_BACK_CODE_MAX = 2900;

const BYTE_ORDER_MARK = "﻿";

function withRow(batch: ReadBackBatch, row: Row): ReadBackBatch {
  const last = batch.at(-1);
  return last !== undefined && last[0] === row.path
    ? [...batch.slice(0, -1), [last[0], [...last[1], row.line]]]
    : [...batch, [row.path, [row.line]]];
}

/**
 * The read-back requests for `rows`, in row order: each row joins its path's tuple at the end of
 * the current batch, and a row that would take the batch's composed code past READ_BACK_CODE_MAX
 * starts the next batch instead. Every batch holds at least one row.
 */
export function planReadBack(rows: readonly Row[]): ReadBackBatch[] {
  const batches: ReadBackBatch[] = [];
  let batch: ReadBackBatch = [];
  for (const row of rows) {
    const next = withRow(batch, row);
    if (batch.length > 0 && composeEvalCode(JS_TEMPLATE, next).length > READ_BACK_CODE_MAX) {
      batches.push(batch);
      batch = withRow([], row);
    } else {
      batch = next;
    }
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

function lineKey(path: string, line: number): string {
  return `${path}\u0000${line}`;
}

function unexpectedShape(stdout: string, cause: unknown): UpstreamError {
  return new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause,
    details: { stage: "envelope-parse", ...stdoutDetails(stdout) },
    message: "context_search: line read-back eval returned unexpected shape",
  });
}

function lineUnavailable(row: Row, reason: string, detail?: string): UpstreamError {
  return new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: {
      code: "MATCH_LINE_UNAVAILABLE",
      reason,
      path: row.path,
      line: row.line,
      ...(detail ? { detail } : {}),
    },
    message: `context_search: line ${row.line} of "${row.path}" could not be read back (${reason}); the note may have changed during the search. Run the search again.`,
  });
}

/** The note's text for each row, aligned with `rows`; throws on the first row that cannot be read back. */
export async function readBackLines(
  rows: readonly Row[],
  vault: string | undefined,
  deps: InvokeCliDeps,
): Promise<string[]> {
  const failures = new Map<string, NoteFailure>();
  const raws = new Map<string, string | null>();
  const stdoutOfRow: string[] = [];
  for (const batch of planReadBack(rows)) {
    const { stdout, answer } = await invokeEval({ code: composeEvalCode(JS_TEMPLATE, batch), vault }, deps);
    let parsed: unknown;
    try {
      parsed = parseEvalAnswer(answer);
    } catch (cause) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause,
        details: { stage: "json-parse", ...stdoutDetails(stdout) },
        message: "context_search: line read-back eval returned unparseable response",
      });
    }
    const validated = contextSearchReadBackSchema.safeParse(parsed);
    if (!validated.success) throw unexpectedShape(stdout, validated.error);
    for (const note of validated.data.notes) {
      if (note.state === "read") {
        for (const { line, raw } of note.lines) raws.set(lineKey(note.path, line), raw);
      } else {
        failures.set(note.path, note);
      }
    }
    for (const [, lines] of batch) stdoutOfRow.push(...lines.map(() => stdout));
  }

  return rows.map((row, i) => {
    const failure = failures.get(row.path);
    if (failure !== undefined) {
      throw lineUnavailable(row, failure.state, failure.state === "read-failed" ? failure.detail : undefined);
    }
    const key = lineKey(row.path, row.line);
    if (!raws.has(key)) throw unexpectedShape(stdoutOfRow[i]!, null);
    const raw = raws.get(key)!;
    if (raw === null || lineText(raw).trim() !== row.text.trim()) throw lineUnavailable(row, "line-changed");
    const text = lineText(raw);
    // Only a note's very first character can be a byte-order mark (spec Assumptions, V8).
    return row.line === 1 && text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
  });
}
