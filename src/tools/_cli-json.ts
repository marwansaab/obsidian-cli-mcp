// Original — no upstream. Shared JSON decode for native-subcommand handlers that ask the CLI for
// `format=json` (outline, properties, tags). Unparseable stdout surfaces as CLI_REPORTED_ERROR with
// `details.stage: "json-parse"` and the full stdout (Principle IV — never an empty result). This
// module is the single source of truth for that failure shape; it imports only `errors.ts`
// downward, so it is a leaf util with no tool→tool edge (Principle I).
import { UpstreamError } from "../errors.js";

/**
 * Parse `stdout` (already trimmed by the caller) as JSON. On failure, throw a CLI_REPORTED_ERROR
 * whose message is `"<label> JSON parse failed: <parser message>"`, whose cause is the parser
 * error, and whose details are `{ stage: "json-parse", stdout }`.
 */
export function parseCliJson(stdout: string, label: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch (cause) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause,
      message: `${label} JSON parse failed: ${(cause as Error).message}`,
      details: { stage: "json-parse", stdout },
    });
  }
}
