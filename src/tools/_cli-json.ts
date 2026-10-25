// Original — no upstream. Shared `format=json` stdout decode for the native-subcommand handlers
// (068 / PR #85 review). outline, properties and tags each inlined the same JSON.parse block with
// a structured CLI_REPORTED_ERROR json-parse stage; this is now its single source. The per-tool
// suites pin the label-prefixed message, the `{ stage: "json-parse", stdout }` details and the cause.
import { UpstreamError } from "../errors.js";

/**
 * Parses a trimmed native-subcommand `format=json` reply. A reply that is not JSON throws
 * `CLI_REPORTED_ERROR` whose message is `"<label> JSON parse failed: <parser message>"`, whose
 * cause is the parser error and whose details are `{ stage: "json-parse", stdout: trimmed }`.
 */
export function parseCliJson(trimmed: string, label: string): unknown {
  try {
    return JSON.parse(trimmed);
  } catch (cause) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause,
      message: `${label} JSON parse failed: ${(cause as Error).message}`,
      details: { stage: "json-parse", stdout: trimmed },
    });
  }
}
