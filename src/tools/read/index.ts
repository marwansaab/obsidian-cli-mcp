// Original — no upstream. read tool registration via registerTool — responseFormat: "json" wraps the { content } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeReadNote, type ExecuteDeps } from "./handler.js";
import { readInputSchema } from "./schema.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const READ_TOOL_NAME = "read";

export const READ_DESCRIPTION =
  'Read a note from an Obsidian vault. Returns the note\'s raw UTF-8 text as { content: <stdout> }. In active mode it reads the focused note.';

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createReadTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: READ_TOOL_NAME,
    title: "Read",
    annotations: READ_ONLY_HINTS,
    description: READ_DESCRIPTION,
    schema: readInputSchema,
    deps,
    handler: async (input, d) => {
      const result = await executeReadNote(input, d);
      return { content: result.content };
    },
  });
}
