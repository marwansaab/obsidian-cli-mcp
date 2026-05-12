// Original — no upstream. rename tool registration via registerTool — responseFormat: "json" wraps the { renamed, fromPath, toPath } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeRenameNote, type ExecuteDeps } from "./handler.js";
import { renameInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const RENAME_TOOL_NAME = "rename";

export const RENAME_DESCRIPTION =
  'Rename a note in an Obsidian vault in place. Honours the vault\'s "Automatically update internal links" setting; link-rewriting is vault-config-dependent. Scoped to .md notes — non-.md targets use obsidian_exec rename directly. Call help({ tool_name: "rename" }) for full parameter docs and the error-code roster.';

export type RegisterDeps = ExecuteDeps;

export function createRenameTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: RENAME_TOOL_NAME,
    description: RENAME_DESCRIPTION,
    schema: renameInputSchema,
    deps,
    handler: async (input, d) => executeRenameNote(input, d),
  });
}
