// Original — no upstream. read_heading tool registration via registerTool — wraps the { content } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeReadHeading, type ExecuteDeps } from "./handler.js";
import { readHeadingInputSchema, readHeadingOutputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const READ_HEADING_TOOL_NAME = "read_heading";

export const READ_HEADING_DESCRIPTION =
  'Read the body of a single named heading from a vault note. Returns { content: string } — the body bytes between the matched heading and the next heading marker of any depth (or EOF). Replaces the agent\'s "full-file read + client-side Markdown parse" sequence (5–50k tokens for long documents) with a single typed call returning the named section\'s body bytes (typically 100–500 tokens). In active mode it reads the focused note. The heading field is a `::`-separated path that starts at the note\'s level-1 heading and names one heading per level down to the target: each later segment is the heading exactly one level below the previous one, so a level-3 target needs three segments (e.g. "Project::Tasks::Today"). Leaving out the level-1 heading ("Tasks::Today") fails with HEADING_NOT_FOUND even though both headings exist. Unreachable: a level-1 section by itself (one-segment paths are rejected), any section in a note with no level-1 heading, any section below a skipped level (e.g. a `###` directly under a `#`), headings whose text contains `::` literally, and Setext-style headings; use `read` for the whole note instead. On HEADING_NOT_FOUND the path most often leaves out the level-1 heading or skips a level; check that first, then list the note\'s headings with `outline`. ATX-only; child subtrees are excluded; segment matching is case-sensitive byte equality with closing-ATX and surrounding whitespace stripped by Obsidian (inline markdown and anchor markers survive verbatim).';

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createReadHeadingTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: READ_HEADING_TOOL_NAME,
    title: "Read Heading",
    annotations: READ_ONLY_HINTS,
    description: READ_HEADING_DESCRIPTION,
    schema: readHeadingInputSchema,
    outputSchema: readHeadingOutputSchema,
    deps,
    handler: async (input, d) => executeReadHeading(input, d),
  });
}
