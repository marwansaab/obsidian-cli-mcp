// Original — no upstream. backlinks tool registration via registerTool — link-graph primitive returning a typed { count, backlinks: [{ source, count? }], truncated? } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { BACKLINKS_SUPPORTED, executeBacklinks, type ExecuteDeps } from "./handler.js";
import { backlinksInputSchema, backlinksOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const BACKLINKS_TOOL_NAME = "backlinks";

export const BACKLINKS_DESCRIPTION =
  "List the notes that link to a note, one entry per source note, with optional per-source reference counts. Use `backlinks` for what links to a note; use `links` for the links a note makes, and `outline` for its headings. " +
  describeSupport(BACKLINKS_SUPPORTED);

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createBacklinksTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: BACKLINKS_TOOL_NAME,
    title: "Backlinks",
    annotations: READ_ONLY_HINTS,
    description: BACKLINKS_DESCRIPTION,
    schema: backlinksInputSchema,
    outputSchema: backlinksOutputSchema,
    deps,
    handler: async (input, d) => executeBacklinks(input, d),
  });
}
