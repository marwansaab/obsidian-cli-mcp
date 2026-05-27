// Original — no upstream. write_note tool registration — wraps the direct-fs-write handler via registerTool; responseFormat: "json" emits the { created, path } envelope on the MCP wire.
import { registerTool } from "../_register.js";
import { executeWriteNote, type ExecuteDeps } from "./handler.js";
import { writeNoteInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const WRITE_NOTE_TOOL_NAME = "write_note";

export const WRITE_NOTE_DESCRIPTION =
  `Create a new note in an Obsidian vault, or replace an existing one when overwrite=true. No content-size cap — writes go to the vault filesystem directly, bypassing the upstream Obsidian CLI argv-IPC defect that crashes the host process above ~4 KB on Windows.

Specific mode: vault + exactly one of file (vault-root basename) or path (vault-relative) + content; defaults overwrite=false (collision returns FILE_EXISTS) and open=false. Active mode: just content + overwrite:true (rewrites the focused note).

For larger-than-cap appends, prepends, or heading/block patches that need fs-direct semantics, this tool's siblings (append_note, prepend, patch_heading, patch_block) handle the same pipeline; write_note is for fresh creation and full-file replacement.

The legacy \`template\` parameter is no longer accepted; use obsidian_exec for template-based creation. Call help({ tool_name: "write_note" }) for full parameter docs, the error-code roster, and migration notes.`;

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
