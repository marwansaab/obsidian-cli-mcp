// Original — no upstream. read tool registration via registerTool — responseFormat: "json" wraps the { content } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeReadNote, READ_SUPPORTED, type ExecuteDeps } from "./handler.js";
import { readInputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const READ_TOOL_NAME = "read";

export const READ_DESCRIPTION = `Read a note, canvas or base from an Obsidian vault. Returns the file's exact text as { content }: nothing added or removed; line breaks and any byte-order mark are kept. In active mode it reads the focused file. ${describeSupport(READ_SUPPORTED)} Attachments (images, audio, video, PDF) and other files are rejected with UNSUPPORTED_FILE_TYPE; show an attachment with open_file.`;

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
