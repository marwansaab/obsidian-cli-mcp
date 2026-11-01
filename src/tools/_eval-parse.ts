// Original — no upstream. Shared eval answer parsing and parse-error excerpt for the eval-composed tool cohort (spec 080 FR-002, FR-013): parseEvalAnswer JSON-parses the answer invokeEval found on this call's tagged line (a missing answer fails like invalid JSON), boundedExcerpt applies the spec 080 head-and-tail bound to any raw upstream text (views_base's malformed-Base report uses it too, spec 081 FR-006), and stdoutDetails gives every eval parse error that bounded stdout excerpt plus the raw length.

/**
 * JSON-parse the call's eval answer (`InvokeEvalSuccess.answer`). Throws a SyntaxError when the
 * answer is `null` (no line carried this call's tag) or is not valid JSON; the caller wraps the
 * failure in its own error, as it did for invalid JSON before. The answer texts `"null"`,
 * `"false"`, `"0"` and `"[]"` are values, not a missing answer.
 */
export function parseEvalAnswer(answer: string | null): unknown {
  if (answer === null) throw new SyntaxError("eval output carries no answer for this call");
  return JSON.parse(answer);
}

/** Output up to this many characters goes into `details.stdout` whole. */
export const EXCERPT_LIMIT = 1000;
/** Longer output keeps this many characters from each end. */
export const EXCERPT_EDGE = 500;
/** Marks where the middle of a long output was cut. */
export const EXCERPT_CUT_MARKER = "\n[… cut …]\n";

/**
 * Raw upstream text bounded by the spec 080 rule: the whole text when it is at most
 * {@link EXCERPT_LIMIT} characters, otherwise its first and last {@link EXCERPT_EDGE} characters
 * around {@link EXCERPT_CUT_MARKER}.
 */
export function boundedExcerpt(text: string): string {
  return text.length <= EXCERPT_LIMIT
    ? text
    : text.slice(0, EXCERPT_EDGE) + EXCERPT_CUT_MARKER + text.slice(-EXCERPT_EDGE);
}

/** The `details.stdout` excerpt and `details.stdoutLength` of an eval parse error (contract §4). */
export function stdoutDetails(stdout: string): { stdout: string; stdoutLength: number } {
  return { stdout: boundedExcerpt(stdout), stdoutLength: stdout.length };
}
