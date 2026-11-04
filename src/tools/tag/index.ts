// Original — no upstream. tag tool registration via registerTool — vault-wide tag-index retrieval primitive returning a typed { count, paths } envelope (default mode) or a bare integer (count-only mode); responseFormat: "json" (default) wraps the result for the MCP wire. Fourteenth typed-tool wrap and the project's first tag-index primitive. Tool name `tag` follows ADR-010 single-word-verbatim-from-upstream (matches the upstream `obsidian tag` subcommand, even though the implementation routes through `eval` for case-insensitivity + child-subsumption + JSON output that the native subcommand does not provide).
import { registerTool } from "../_register.js";
import { executeTag, type ExecuteDeps } from "./handler.js";
import { tagInputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const TAG_TOOL_NAME = "tag";

export const TAG_DESCRIPTION =
  "Find every Markdown note in a vault that carries a given tag, including its child tags. Choose `tag` for tag lookups and `find_by_property` to match a frontmatter property value.";

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createTagTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: TAG_TOOL_NAME,
    title: "Tag",
    annotations: READ_ONLY_HINTS,
    description: TAG_DESCRIPTION,
    schema: tagInputSchema,
    deps,
    handler: async (input, d) => executeTag(input, d),
  });
}
