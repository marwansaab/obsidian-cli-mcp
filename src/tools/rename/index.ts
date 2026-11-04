// Original — no upstream. rename tool registration via registerTool — responseFormat: "json" wraps the { renamed, fromPath, toPath } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeRenameNote, RENAME_SUPPORTED, type ExecuteDeps } from "./handler.js";
import { renameInputSchema, renameNoteOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { DESTRUCTIVE_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const RENAME_TOOL_NAME = "rename";

export const RENAME_DESCRIPTION = `Rename a file in place in an Obsidian vault, keeping its folder. Use \`move\` to change its folder and \`delete\` to remove a file. Links are rewritten per the vault's "Automatically update internal links" setting, and the file keeps its type (change it with \`obsidian_exec\`). ${describeSupport(RENAME_SUPPORTED)}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createRenameTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: RENAME_TOOL_NAME,
    title: "Rename",
    annotations: DESTRUCTIVE_HINTS,
    description: RENAME_DESCRIPTION,
    schema: renameInputSchema,
    outputSchema: renameNoteOutputSchema,
    deps,
    handler: async (input, d) => executeRenameNote(input, d),
  });
}
