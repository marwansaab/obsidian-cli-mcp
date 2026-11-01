// Original — no upstream. Shared eval answer parsing and parse-error excerpt for the eval-composed tool cohort (spec 080 FR-002, FR-013): parseEvalAnswer JSON-parses the answer invokeCli found on this call's tagged line (a missing answer fails like invalid JSON), and stdoutDetails gives every eval parse error the same bounded head-and-tail stdout excerpt plus the raw length.

/**
 * JSON-parse the call's eval answer (`InvokeCliSuccess.answer`). Throws a SyntaxError when the
 * answer is absent (no line carried this call's tag) or is not valid JSON; the caller wraps the
 * failure in its own error, as it did for invalid JSON before. `null`, `false`, `0` and `[]` are
 * values, not a missing answer.
 */
export function parseEvalAnswer(answer: string | undefined): unknown {
  if (answer === undefined) throw new SyntaxError("eval output carries no answer for this call");
  return JSON.parse(answer);
}

/** Output up to this many characters goes into `details.stdout` whole. */
export const EXCERPT_LIMIT = 1000;
/** Longer output keeps this many characters from each end. */
export const EXCERPT_EDGE = 500;
/** Marks where the middle of a long output was cut. */
export const EXCERPT_CUT_MARKER = "\n[… cut …]\n";

/**
 * The `details.stdout` excerpt and `details.stdoutLength` of an eval parse error (contract §4):
 * the whole output when it is at most {@link EXCERPT_LIMIT} characters, otherwise its first and
 * last {@link EXCERPT_EDGE} characters around {@link EXCERPT_CUT_MARKER}.
 */
export function stdoutDetails(stdout: string): { stdout: string; stdoutLength: number } {
  const excerpt =
    stdout.length <= EXCERPT_LIMIT
      ? stdout
      : stdout.slice(0, EXCERPT_EDGE) + EXCERPT_CUT_MARKER + stdout.slice(-EXCERPT_EDGE);
  return { stdout: excerpt, stdoutLength: stdout.length };
}
