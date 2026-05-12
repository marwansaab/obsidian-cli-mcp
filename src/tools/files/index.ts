// Original — no upstream. files tool registration via registerTool — folder-scoped typed enumeration; responseFormat: "json" (default) wraps the { count, paths } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeListFiles, type ExecuteDeps } from "./handler.js";
import { filesInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const FILES_TOOL_NAME = "files";

export const FILES_DESCRIPTION =
  "List files directly inside a vault folder (non-recursive). Folder-scoped typed enumeration — agents that want \"what files are in this folder?\" no longer pay the cost of obsidian_exec returning plain text plus client-side line parsing. Returns { count, paths } with vault-relative paths sorted lexically by UTF-8 byte order; sub-folder entries and dotfile entries are dropped wrapper-side. Discriminated by target_mode. Specific mode: target_mode + vault + optional folder + optional ext. Active mode: target_mode + optional folder + optional ext (operates on the focused vault). When folder is omitted, lists the vault root. Missing folder, empty folder, and folder-names-a-file all return { count: 0, paths: [] } (conflated per FR-010). Setting total:true discards the paths array and returns { count: N, paths: [] } for token-economical count-only queries. Call help({ tool_name: \"files\" }) for full parameter docs, the filter pipeline explanation, and the error-code roster.";

export type RegisterDeps = ExecuteDeps;

export function createFilesTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: FILES_TOOL_NAME,
    description: FILES_DESCRIPTION,
    schema: filesInputSchema,
    deps,
    handler: async (input, d) => executeListFiles(input, d),
  });
}
