// Original — no upstream. write_note tool registration — wraps the direct-fs-write handler via registerTool; responseFormat: "json" emits the { created, path } envelope on the MCP wire.
import { registerTool } from "../_register.js";
import { executeWriteNote, type ExecuteDeps } from "./handler.js";
import { writeNoteInputSchema, writeNoteOutputSchema } from "./schema.js";
import { DESTRUCTIVE_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const WRITE_NOTE_TOOL_NAME = "write_note";

export const WRITE_NOTE_DESCRIPTION =
  `Create a new note in an Obsidian vault, or replace an existing one when overwrite=true. No content-size cap — writes go to the vault filesystem directly, bypassing the upstream Obsidian CLI argv-IPC defect that crashes the host process above ~4 KB on Windows.

Defaults overwrite=false (collision returns FILE_EXISTS) and open=false. With target_mode "active" it rewrites the focused note and requires overwrite:true; open is not allowed there.

For larger-than-cap appends, prepends, or heading/block patches that need fs-direct semantics, this tool's siblings (append_note, prepend, patch_heading, patch_block) handle the same pipeline; write_note is for fresh creation and full-file replacement.

The legacy \`template\` parameter is no longer accepted; use obsidian_exec for template-based creation.`;

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
