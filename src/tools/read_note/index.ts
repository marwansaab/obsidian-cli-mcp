// Original — no upstream. read_note tool registration via registerTool — responseFormat: "json" wraps the { content } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeReadNote, type ExecuteDeps } from "./handler.js";
import { readNoteInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const READ_NOTE_TOOL_NAME = "read_note";

export const READ_NOTE_DESCRIPTION =
  'Read a note from an Obsidian vault. Returns the note\'s raw UTF-8 text as { content: <stdout> }. Specific mode: vault + exactly one of file (wikilink) or path (vault-relative). Active mode: no locator — reads the focused note. Call help({ tool_name: "read_note" }) for full parameter docs and the error-code roster.';

export type RegisterDeps = ExecuteDeps;

export function createReadNoteTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: READ_NOTE_TOOL_NAME,
    description: READ_NOTE_DESCRIPTION,
    schema: readNoteInputSchema,
    deps,
    handler: async (input, d) => {
      const result = await executeReadNote(input, d);
      return { content: result.content };
    },
  });
}
