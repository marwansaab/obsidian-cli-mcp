// Original — no upstream. rename_note tool registration via registerTool — responseFormat: "json" wraps the { renamed, fromPath, toPath } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeRenameNote, type ExecuteDeps } from "./handler.js";
import { renameNoteInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const RENAME_NOTE_TOOL_NAME = "rename_note";

export const RENAME_NOTE_DESCRIPTION =
  'Rename a note in an Obsidian vault in place. Honours the vault\'s "Automatically update internal links" setting; link-rewriting is vault-config-dependent. Scoped to .md notes — non-.md targets use obsidian_exec rename directly. Call help({ tool_name: "rename_note" }) for full parameter docs and the error-code roster.';

export type RegisterDeps = ExecuteDeps;

export function createRenameNoteTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: RENAME_NOTE_TOOL_NAME,
    description: RENAME_NOTE_DESCRIPTION,
    schema: renameNoteInputSchema,
    deps,
    handler: async (input, d) => executeRenameNote(input, d),
  });
}
