// Original — no upstream. write_note tool registration per ADR-009 — wraps the direct-fs-write handler via registerTool (ADR-006); responseFormat: "json" emits the { created, path } envelope on the MCP wire.
import { registerTool } from "../_register.js";
import { executeWriteNote, type ExecuteDeps } from "./handler.js";
import { writeNoteInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const WRITE_NOTE_TOOL_NAME = "write_note";

export const WRITE_NOTE_DESCRIPTION =
  'Create a new note in an Obsidian vault, or replace an existing one when overwrite=true. Specific mode: vault + exactly one of file (vault-root basename) or path (vault-relative) + content; defaults overwrite=false (collision returns FILE_EXISTS) and open=false. Active mode: just content + overwrite:true (rewrites the focused note). Content is written directly to the vault filesystem and never crosses the CLI argv pipe at any size — the upstream argv-IPC defect that crashes Obsidian above ~4 KB on Windows is bypassed (see ADR-009). The legacy `template` parameter is no longer accepted; use obsidian_exec for template-based creation. Call help({ tool_name: "write_note" }) for full parameter docs, the error-code roster, and migration notes.';

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
