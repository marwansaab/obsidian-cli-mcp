// Original — no upstream. append_note tool registration per BI-044 / ADR-009 — wraps the executeAppendNote direct-fs read-modify-write handler via registerTool (ADR-006); responseFormat: "json" emits the { path, vault, bytes_written, inline } envelope on the MCP wire. BI-0174: a mapValidationError hook (shared liftEmptyContent) maps empty content to details.code CONTENT_EMPTY.
import { registerTool } from "../_register.js";
import { liftEmptyContent } from "../_validation-details.js";
import { APPEND_NOTE_SUPPORTED, executeAppendNote, type ExecuteDeps } from "./handler.js";
import { appendNoteInputSchema, appendNoteOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { ADDITIVE_WRITE_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const APPEND_NOTE_TOOL_NAME = "append_note";

export const APPEND_NOTE_DESCRIPTION =
  `Add content to the end of an existing note. Choose it to add at the end; \`prepend\` adds at the top, \`write_note\` creates or replaces a whole note, \`patch_heading\` edits a heading's section, \`patch_block\` edits a block and \`find_and_replace\` replaces text across notes. ${describeSupport(APPEND_NOTE_SUPPORTED)}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createAppendNoteTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: APPEND_NOTE_TOOL_NAME,
    title: "Append Note",
    annotations: ADDITIVE_WRITE_HINTS,
    description: APPEND_NOTE_DESCRIPTION,
    schema: appendNoteInputSchema,
    outputSchema: appendNoteOutputSchema,
    deps,
    handler: async (input, d) => executeAppendNote(input, d),
    mapValidationError: liftEmptyContent,
  });
}
