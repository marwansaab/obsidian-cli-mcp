// Original — no upstream. Read-back stub responses for context_search tests (spec 088): the eval answer that gives each wire line's text as the note's line. Vitest-free (`_*fixtures.ts` convention).
import type { StubResponse } from "../_handler-test-fixtures.js";
import type { SearchContextWireFile } from "../search/schema.js";

/** A read-back eval answer carrying arbitrary `notes`, for failure rows. */
export function readBackAnswer(notes: unknown[]): StubResponse {
  return { stdout: "=> " + JSON.stringify({ notes }) + "\n", exitCode: 0 };
}

/**
 * The read-back eval answer for `wire`: every wire line is read, and its note line is `raw(path,
 * line, text)`, or the stubbed CLI text itself when `raw` is omitted.
 */
export function readBackResponse(
  wire: SearchContextWireFile[],
  raw?: (path: string, line: number, text: string) => string | null,
): StubResponse {
  return readBackAnswer(
    wire.map((f) => ({
      path: f.file,
      state: "read",
      lines: f.matches.map((m) => ({ line: m.line, raw: raw ? raw(f.file, m.line, m.text) : m.text })),
    })),
  );
}
