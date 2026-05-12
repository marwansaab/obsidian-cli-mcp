// Original — no upstream. delete tool registration via registerTool — responseFormat: "json" wraps the { deleted, path, toTrash } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeDeleteNote, type ExecuteDeps } from "./handler.js";
import { deleteInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const DELETE_TOOL_NAME = "delete";

export const DELETE_DESCRIPTION =
  'Delete a note from an Obsidian vault. Default sends the file to the OS trash (recoverable); permanent: true bypasses trash and is irreversible. Call help({ tool_name: "delete" }) for full parameter docs and the error-code roster.';

export type RegisterDeps = ExecuteDeps;

export function createDeleteTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: DELETE_TOOL_NAME,
    description: DELETE_DESCRIPTION,
    schema: deleteInputSchema,
    deps,
    handler: async (input, d) => executeDeleteNote(input, d),
  });
}
