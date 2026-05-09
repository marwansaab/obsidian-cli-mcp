// Original — no upstream. read_heading tool registration via registerTool — wraps the { content } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeReadHeading, type ExecuteDeps } from "./handler.js";
import { readHeadingInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const READ_HEADING_TOOL_NAME = "read_heading";

export const READ_HEADING_DESCRIPTION =
  'Read the body of a single named heading from a vault note. Returns { content: string } — the body bytes between the matched heading and the next heading marker of any depth (or EOF). Replaces the agent\'s "full-file read_note + client-side Markdown parse" sequence (5–50k tokens for long documents) with a single typed call returning the named section\'s body bytes (typically 100–500 tokens). Specific mode: vault + exactly one of file (wikilink) or path (vault-relative) + heading. Active mode: just heading (reads the focused note). The heading field is a `::`-separated path with at least two non-empty segments (e.g. "H1::H2" or "H1::H2::H3"); single-segment H1-only reads, headings whose text contains `::` literally, and Setext-style headings are out-of-reach (documented fallback: full-file read_note plus client-side parse). ATX-only; child subtrees are excluded; segment matching is case-sensitive byte equality with closing-ATX and surrounding whitespace stripped by Obsidian (inline markdown and anchor markers survive verbatim). Call help({ tool_name: "read_heading" }) for full parameter docs and the error-code roster.';

export type RegisterDeps = ExecuteDeps;

export function createReadHeadingTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: READ_HEADING_TOOL_NAME,
    description: READ_HEADING_DESCRIPTION,
    schema: readHeadingInputSchema,
    deps,
    handler: async (input, d) => executeReadHeading(input, d),
  });
}
