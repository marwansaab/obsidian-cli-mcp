// Original — no upstream. links tool registration via registerTool — link-graph primitive returning a typed { count, links: [{ target, line, kind, displayText? }] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { type ExecuteDeps, executeLinks, LINKS_SUPPORTED } from "./handler.js";
import { linksInputSchema, linksOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const LINKS_TOOL_NAME = "links";

export const LINKS_DESCRIPTION =
  "List every outgoing link in a note (wikilink, embed or markdown link) in source order, with its target, line and kind. Use `links` for what a note links to; use `backlinks` for the notes that link to it, and `outline` for its headings. " +
  describeSupport(LINKS_SUPPORTED);

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createLinksTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: LINKS_TOOL_NAME,
    title: "Links",
    annotations: READ_ONLY_HINTS,
    description: LINKS_DESCRIPTION,
    schema: linksInputSchema,
    outputSchema: linksOutputSchema,
    deps,
    handler: async (input, d) => executeLinks(input, d),
  });
}
