// Original — no upstream. Per-call eval answer tag and stdout line scanning (spec 080, ADR-029 2026-11-01 amendment): invokeEval wraps every typed `eval` so its answer prints as `=> <<TAG>>…`, and the dispatch layer finds that line (or, untagged, any `=> ` line) anywhere in stdout instead of only at its head, so other plugins' output around the answer is ignored.
import { randomUUID } from "node:crypto";

/** The prefix `obsidian eval` prints ahead of the expression's value. */
export const EVAL_ANSWER_PREFIX = "=> ";

/** Every answer tag starts with this. */
export const ANSWER_TAG_PREFIX = "ocm-";

/** A fresh answer tag for one `invokeEval` call. */
export function mintAnswerTag(): string {
  return ANSWER_TAG_PREFIX + randomUUID();
}

/**
 * The code sent for a typed eval (contract A1): the caller's expression, awaited, with the tag
 * prepended to its value. The tag is server-minted, never user input, so nothing user-supplied is
 * interpolated here.
 */
export function wrapEvalCode(code: string, tag: string): string {
  return `(async()=>'<<${tag}>>'+(await (${code})))()`;
}

/**
 * Stdout as lines: split on `\n` only (a U+2028 inside a JSON body must not split it), one trailing
 * `\r` dropped per line, leading whitespace stripped.
 */
export function stdoutLines(stdout: string): string[] {
  return stdout.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line).trimStart());
}

/**
 * The answer body: with `tag`, the rest of the first line that starts with `=> <<tag>>` (contract
 * A2/A3); without `tag` (the untagged `obsidian_exec` rule), the rest of the first line that starts
 * with `=> `. `undefined` when no line matches.
 */
export function findAnswer(stdout: string, tag?: string): string | undefined {
  const marker = tag === undefined ? EVAL_ANSWER_PREFIX : `${EVAL_ANSWER_PREFIX}<<${tag}>>`;
  for (const line of stdoutLines(stdout)) {
    if (line.startsWith(marker)) return line.slice(marker.length);
  }
  return undefined;
}
