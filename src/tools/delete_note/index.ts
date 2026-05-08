// Original — no upstream. delete_note tool registration via registerTool — responseFormat: "json" wraps the { deleted, path, toTrash } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeDeleteNote, type ExecuteDeps } from "./handler.js";
import { deleteNoteInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const DELETE_NOTE_TOOL_NAME = "delete_note";

export const DELETE_NOTE_DESCRIPTION =
  'Delete a note from an Obsidian vault. Default sends the file to the OS trash (recoverable); permanent: true bypasses trash and is irreversible. Call help({ tool_name: "delete_note" }) for full parameter docs and the error-code roster.';

export type RegisterDeps = ExecuteDeps;

export function createDeleteNoteTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: DELETE_NOTE_TOOL_NAME,
    description: DELETE_NOTE_DESCRIPTION,
    schema: deleteNoteInputSchema,
    deps,
    handler: async (input, d) => executeDeleteNote(input, d),
  });
}
