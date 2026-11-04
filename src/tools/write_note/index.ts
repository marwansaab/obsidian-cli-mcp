// Original — no upstream. write_note tool registration — wraps the direct-fs-write handler via registerTool; responseFormat: "json" emits the { created, path } envelope on the MCP wire.
import { registerTool } from "../_register.js";
import { executeWriteNote, WRITE_NOTE_SUPPORTED, type ExecuteDeps } from "./handler.js";
import { writeNoteInputSchema, writeNoteOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { DESTRUCTIVE_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const WRITE_NOTE_TOOL_NAME = "write_note";

export const WRITE_NOTE_DESCRIPTION =
  `Create a note, or replace an existing one. Choose it for whole-note writes; \`append_note\` adds at the end, \`prepend\` at the top, \`patch_heading\` edits a heading's section, \`patch_block\` edits a block and \`find_and_replace\` replaces text across notes. With \`overwrite: true\` it replaces the whole existing note. ${describeSupport(WRITE_NOTE_SUPPORTED)}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createWriteNoteTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: WRITE_NOTE_TOOL_NAME,
    title: "Write Note",
    annotations: DESTRUCTIVE_HINTS,
    description: WRITE_NOTE_DESCRIPTION,
    schema: writeNoteInputSchema,
    outputSchema: writeNoteOutputSchema,
    deps,
    handler: async (input, d) => executeWriteNote(input, d),
  });
}
