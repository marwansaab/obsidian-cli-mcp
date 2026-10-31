// Original — no upstream. delete tool registration via registerTool — responseFormat: "json" wraps the { deleted, path, toTrash } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeDeleteNote, type ExecuteDeps } from "./handler.js";
import { deleteInputSchema, deleteNoteOutputSchema } from "./schema.js";
import { describeSupport, type SupportDeclaration } from "../../file-type/file-type.js";
import { DESTRUCTIVE_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const DELETE_TOOL_NAME = "delete";

/** delete works on every file (spec 070 FR-003). */
export const DELETE_SUPPORTED: SupportDeclaration = "any";

export const DELETE_DESCRIPTION = `Delete a file from an Obsidian vault. Default sends the file to the OS trash (recoverable); permanent: true bypasses trash and is irreversible. ${describeSupport(DELETE_SUPPORTED)}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createDeleteTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: DELETE_TOOL_NAME,
    title: "Delete",
    annotations: DESTRUCTIVE_HINTS,
    description: DELETE_DESCRIPTION,
    schema: deleteInputSchema,
    outputSchema: deleteNoteOutputSchema,
    deps,
    handler: async (input, d, confirmation) => executeDeleteNote(input, d, confirmation),
  });
}
