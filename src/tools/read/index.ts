// Original — no upstream. read tool registration via registerTool — responseFormat: "json" wraps the { content } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeReadNote, type ExecuteDeps } from "./handler.js";
import { readInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const READ_TOOL_NAME = "read";

export const READ_DESCRIPTION =
  'Read a note from an Obsidian vault. Returns the note\'s raw UTF-8 text as { content: <stdout> }. Specific mode: vault + exactly one of file (wikilink) or path (vault-relative). Active mode: no locator — reads the focused note. Call help({ tool_name: "read" }) for full parameter docs and the error-code roster.';

export type RegisterDeps = ExecuteDeps;

export function createReadTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: READ_TOOL_NAME,
    description: READ_DESCRIPTION,
    schema: readInputSchema,
    deps,
    handler: async (input, d) => {
      const result = await executeReadNote(input, d);
      return { content: result.content };
    },
  });
}
