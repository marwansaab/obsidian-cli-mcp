// Original — no upstream. write_note tool registration via registerTool — responseFormat: "json" wraps the { created, path } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeWriteNote, type ExecuteDeps } from "./handler.js";
import { writeNoteInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const WRITE_NOTE_TOOL_NAME = "write_note";

export const WRITE_NOTE_DESCRIPTION =
  'Create a new note in an Obsidian vault, or overwrite an existing one when overwrite=true. Defaults: overwrite=false, open=false. Active mode requires overwrite=true (writes a new file in the active vault context). Call help({ tool_name: "write_note" }) for full parameter docs and the error-code roster.';

export type RegisterDeps = ExecuteDeps;

export function createWriteNoteTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: WRITE_NOTE_TOOL_NAME,
    description: WRITE_NOTE_DESCRIPTION,
    schema: writeNoteInputSchema,
    deps,
    handler: async (input, d) => executeWriteNote(input, d),
  });
}
