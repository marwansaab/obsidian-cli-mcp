// Original — no upstream. append_note tool registration per BI-044 / ADR-009 — wraps the executeAppendNote direct-fs read-modify-write handler via registerTool (ADR-006); responseFormat: "json" emits the { path, vault, bytes_written, inline } envelope on the MCP wire.
import { registerTool } from "../_register.js";
import { executeAppendNote, type ExecuteDeps } from "./handler.js";
import { appendNoteInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const APPEND_NOTE_TOOL_NAME = "append_note";

export const APPEND_NOTE_DESCRIPTION =
  'Append `content` at the end of an existing markdown note in a single call, eliminating the read-then-rewrite cycle of the full-replace surface. Specific mode: vault + exactly one of file (bare wikilink-form name, no `[[…]]` brackets) or path (vault-relative) + content. Active mode: just content — NO opt-in flag is required (deliberate cohort exception to write_note\'s overwrite:true, justified by the additive-not-destructive safety profile of append). Default-separator behaviour: when the file\'s existing content does NOT end with a line break, the wrapper inserts a separator matching the file\'s existing line-ending convention (LF or CRLF preserved); when the file already ends with `\\n` or `\\r\\n`, that existing line break IS the separator and no additional one is inserted (so repeated appends grow the file cleanly without blank-line bloat); when the file is empty, no leading separator is inserted. Optional inline:true fuses content directly onto the file\'s existing trailing byte with NO wrapper-inserted separator — useful for finishing a partial trailing line. Content is preserved BYTE-FOR-BYTE VERBATIM (no trim, no normalisation, no auto-appended trailing newline); the caller controls whether the file ends with a newline after the call. The wrapper writes directly to the vault filesystem and never crosses the CLI argv pipe; no per-call size cap beyond available memory and the filesystem\'s file-size limit. No auto-create — call write_note for new notes. Typed error states surface via UpstreamError.details.code: CONTENT_EMPTY (validation), NOTE_NOT_FOUND, EXTERNAL_EDITOR_CONFLICT (Windows file-lock detection only), plus PATH_ESCAPES_VAULT, FS_WRITE_FAILED, VAULT_NOT_FOUND, ERR_NO_ACTIVE_FILE. Call help({ tool_name: "append_note" }) for the full input schema, error roster, default-separator worked examples, and cross-invocation last-write-wins contract.';

export type RegisterDeps = ExecuteDeps;

export function createAppendNoteTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: APPEND_NOTE_TOOL_NAME,
    description: APPEND_NOTE_DESCRIPTION,
    schema: appendNoteInputSchema,
    deps,
    handler: async (input, d) => executeAppendNote(input, d),
  });
}
