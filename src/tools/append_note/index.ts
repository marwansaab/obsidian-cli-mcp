// Original — no upstream. append_note tool registration per BI-044 / ADR-009 — wraps the executeAppendNote direct-fs read-modify-write handler via registerTool (ADR-006); responseFormat: "json" emits the { path, vault, bytes_written, inline } envelope on the MCP wire.
import { registerTool } from "../_register.js";
import { executeAppendNote, type ExecuteDeps } from "./handler.js";
import { appendNoteInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const APPEND_NOTE_TOOL_NAME = "append_note";

export const APPEND_NOTE_DESCRIPTION =
  `Add content to the END of an existing markdown note. Eliminates the read-then-rewrite cycle of the full-replace surface.

Pick \`prepend\` to add at the TOP of a note instead. Pick \`write_note\` to replace the WHOLE file or create a new note (this tool does NOT auto-create).

Targeting: \`target_mode: "specific"\` + \`vault\` + EXACTLY ONE of \`path\` (vault-relative) or \`file\` (bare wikilink name, no \`[[...]]\` brackets). Or \`target_mode: "active"\` + \`content\` to write to whatever note is open in Obsidian. No opt-in flag is required in active mode — append is additive and cannot destroy content.

Separator: a newline is auto-inserted between the existing file content and your appended content, matching the file's LF/CRLF convention. If the file already ends with \`\\n\` or \`\\r\\n\`, no extra newline is added (so repeated appends grow the file cleanly without blank-line bloat). If the file is empty, no leading separator is inserted. Pass \`inline: true\` to skip the separator and fuse onto the existing trailing byte — useful for finishing a partial trailing line.

Content: preserved byte-for-byte (no trim, no normalisation, no auto-appended trailing newline — caller controls whether the file ends with a newline after the call). Must be non-empty. No wrapper-imposed size cap.

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` (with \`details.code: CONTENT_EMPTY\`), \`NOTE_NOT_FOUND\`, \`EXTERNAL_EDITOR_CONFLICT\` (Windows file-lock detection only), \`FS_WRITE_FAILED\`, \`PATH_ESCAPES_VAULT\`, \`VAULT_NOT_FOUND\`, \`ERR_NO_ACTIVE_FILE\`. Call \`help({ tool_name: "append_note" })\` for recovery hints, worked examples, and the cross-invocation last-write-wins contract.`;

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
