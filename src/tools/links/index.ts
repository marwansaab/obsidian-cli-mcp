// Original — no upstream. links tool registration via registerTool — link-graph primitive returning a typed { count, links: [{ target, line, kind, displayText? }] } envelope; responseFormat: "json" (default) wraps the envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeLinks, type ExecuteDeps } from "./handler.js";
import { linksInputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type RegisteredTool } from "../_shared.js";

export const LINKS_TOOL_NAME = "links";

export const LINKS_DESCRIPTION =
  "Return the flat ordered list of every outgoing link in a Markdown note (returns { count, links: [{ target, line, kind, displayText? }] }) — link-graph primitive that replaces \"full read plus client-side Markdown parse\" for the link-inventory case at one to two orders of magnitude less token cost. Discriminated by target_mode; in active mode it operates on the focused note in the focused vault. Setting total:true populates count and returns links:[] for a token-economical pre-flight read; the envelope shape is uniform across both modes. Frontmatter-declared wikilinks (e.g. related: \"[[Project]]\") appear in the listing intermingled in source order with synthetic line:1, classified kind:\"wikilink\" identical to body wikilinks (no source: frontmatter|body discriminator). The kind field is from the closed three-value enum {wikilink, embed, markdown}; bare URLs in body prose are NOT surfaced (body content, not links). Heading and block fragments are embedded byte-faithful in the target string (e.g. \"Target#Heading\" / \"Target#^block-id\"); no separate fragment field. displayText is present only when the source carries an alias distinct from the link target. Non-Markdown filetypes (.canvas, .pdf, attachments) are rejected as CLI_REPORTED_ERROR. Unknown vault names emit a structured CLI_REPORTED_ERROR (multi-vault callers must supply a registered name; no silent routing to focused vault).";

export type RegisterDeps = ExecuteDeps;

export function createLinksTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: LINKS_TOOL_NAME,
    title: "Links",
    annotations: READ_ONLY_HINTS,
    description: LINKS_DESCRIPTION,
    schema: linksInputSchema,
    deps,
    handler: async (input, d) => executeLinks(input, d),
  });
}
