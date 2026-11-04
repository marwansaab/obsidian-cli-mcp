// Original — no upstream. read tool registration via registerTool — responseFormat: "json" wraps the { content } envelope for the MCP wire.
import { registerTool } from "../_register.js";
import { executeReadNote, READ_SUPPORTED, type ExecuteDeps } from "./handler.js";
import { readInputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { READ_ONLY_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const READ_TOOL_NAME = "read";

export const READ_DESCRIPTION = `Read the exact text of a note, canvas or base in an Obsidian vault, with nothing added or removed. Choose it for a whole file; use \`read_heading\` for one heading's section, \`read_property\` for one frontmatter property, and \`open_file\` to show an attachment. ${describeSupport(READ_SUPPORTED)}`;

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
