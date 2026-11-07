// Original — no upstream. context_search read-back (spec 088, research D1/D3/D4): Obsidian's search trims each line, so the selected lines are read back from the notes through invokeEval in batches whose composed code stays at or under READ_BACK_CODE_MAX (the Obsidian.com shim answers nothing above about 4,000 characters, F10), decoded through decodeEvalEnvelope, reconciled against the CLI's text by trim equality (F6), and returned as the rows with `text` replaced by the note's line minus one trailing \r (lineText). Any row that cannot be read back faithfully fails the whole call with CLI_REPORTED_ERROR / details.code MATCH_LINE_UNAVAILABLE (Clarification Q1); there is no fallback.
import { JS_TEMPLATE } from "./_template.js";
import { contextSearchReadBackSchema, type ContextSearchReadBack } from "./schema.js";
import { invokeEval, type InvokeCliDeps } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { decodeEvalEnvelope } from "../_active-file.js";
import { EVAL_BATCH_CODE_MAX, planEvalBatches, type EvalBatch } from "../_eval-batches.js";
import { stdoutDetails } from "../_eval-parse.js";
import { lineText } from "../_note-lines.js";
import { composeEvalCode } from "../_shared.js";

import type { LineRow } from "../search/line-matches.js";

type NoteFailure = Exclude<ContextSearchReadBack["notes"][number], { state: "read" }>;
type RowFailure = NoteFailure | { state: "line-changed" };

/** The longest composed eval code one read-back batch may send (research D3, F10): the shared eval batch limit. */
export const READ_BACK_CODE_MAX = EVAL_BATCH_CODE_MAX;

const BYTE_ORDER_MARK = "﻿";

/**
 * The read-back requests for `rows`, in row order: each row joins its path's tuple at the end of
 * the current batch, and a row that would take the batch's composed code past READ_BACK_CODE_MAX
 * starts the next batch instead. Every batch holds at least one row.
 */
export function planReadBack(rows: readonly LineRow[]): Array<EvalBatch<number>> {
  return planEvalBatches(rows, (row) => [row.path, row.line], (batch) => composeEvalCode(JS_TEMPLATE, batch));
}

function lineKey(path: string, line: number): string {
  return `${path}\u0000${line}`;
}

function lineUnavailable(row: LineRow, failure: RowFailure): UpstreamError {
  return new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: {
      code: "MATCH_LINE_UNAVAILABLE",
      reason: failure.state,
      path: row.path,
      line: row.line,
      ...("detail" in failure ? { detail: failure.detail } : {}),
    },
    message: `context_search: line ${row.line} of "${row.path}" could not be read back (${failure.state}); the note may have changed during the search. Run the search again.`,
  });
}

/** `rows` with each text replaced by the note's line; throws on the first row that cannot be read back. */
export async function readBackLines(
  rows: readonly LineRow[],
  vault: string | undefined,
  deps: InvokeCliDeps,
): Promise<LineRow[]> {
  const failures = new Map<string, NoteFailure>();
  const raws = new Map<string, string | null>();
  // The stdout of the batch that asked for each line, for an answer that leaves the line out.
  const stdoutOf = new Map<string, string>();
  for (const batch of planReadBack(rows)) {
    const result = await invokeEval({ code: composeEvalCode(JS_TEMPLATE, batch), vault }, deps);
    const { notes } = decodeEvalEnvelope(result, contextSearchReadBackSchema, {
      toolName: "context_search",
      malformedCode: "CLI_REPORTED_ERROR",
    });
    for (const note of notes) {
      if (note.state === "read") {
        for (const { line, raw } of note.lines) raws.set(lineKey(note.path, line), raw);
      } else {
        failures.set(note.path, note);
      }
    }
    for (const [path, lines] of batch) {
      for (const line of lines) stdoutOf.set(lineKey(path, line), result.stdout);
    }
  }

  return rows.map((row) => {
    const failure = failures.get(row.path);
    if (failure !== undefined) throw lineUnavailable(row, failure);
    const key = lineKey(row.path, row.line);
    const raw = raws.get(key);
    if (raw === undefined) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-parse", ...stdoutDetails(stdoutOf.get(key)!) },
        message: "context_search: eval response shape unexpected",
      });
    }
    if (raw === null || lineText(raw).trim() !== row.text.trim()) {
      throw lineUnavailable(row, { state: "line-changed" });
    }
    const text = lineText(raw);
    // Only a note's very first character can be a byte-order mark (spec Assumptions, V8).
    return { ...row, text: row.line === 1 && text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text };
  });
}
