// Original — no upstream. rename tool registration via registerTool — responseFormat: "json" wraps the { renamed, fromPath, toPath } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeRenameNote, type ExecuteDeps } from "./handler.js";
import { renameInputSchema, renameNoteOutputSchema } from "./schema.js";
import { describeSupport, type SupportDeclaration } from "../../file-type/file-type.js";
import { DESTRUCTIVE_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const RENAME_TOOL_NAME = "rename";

/** rename works on every file and keeps its type (spec 070 FR-003). */
export const RENAME_SUPPORTED: SupportDeclaration = "any";

export const RENAME_DESCRIPTION = `Rename a file in an Obsidian vault in place. Honours the vault's "Automatically update internal links" setting; link-rewriting is vault-config-dependent. ${describeSupport(RENAME_SUPPORTED)} The file keeps its type: a name without an extension gets the file's own, and a name with another type's extension is rejected with UNSUPPORTED_FILE_TYPE (change a type deliberately with obsidian_exec).`;

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
