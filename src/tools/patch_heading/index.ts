// Original — no upstream. patch_heading tool registration per BI-040 / ADR-009 — wraps the executePatchHeading direct-fs-write handler via registerTool (ADR-006); responseFormat: "json" emits the { path, vault, heading_path, mode, bytes_written } envelope on the MCP wire. BI-0174: a mapValidationError hook (shared liftSubCodedIssue) lifts INVALID_HEADING_PATH / EMPTY_CONTENT's ADR-015 params into details.
import { registerTool } from "../_register.js";
import { liftSubCodedIssue } from "../_validation-details.js";
import { executePatchHeading, type ExecuteDeps } from "./handler.js";
import { patchHeadingInputSchema, patchHeadingOutputSchema } from "./schema.js";
import { ADDITIVE_WRITE_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const PATCH_HEADING_TOOL_NAME = "patch_heading";

export const PATCH_HEADING_DESCRIPTION =
  `Append, prepend or replace the content under one heading of a note, addressed by its heading path. Choose it to edit a heading's section; \`patch_block\` edits a \`^block-id\` block, \`append_note\` and \`prepend\` add at the end or top, \`write_note\` replaces the whole note, including sections no path reaches, and \`find_and_replace\` replaces text across notes.`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createPatchHeadingTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: PATCH_HEADING_TOOL_NAME,
    title: "Patch Heading",
    annotations: ADDITIVE_WRITE_HINTS,
    description: PATCH_HEADING_DESCRIPTION,
    schema: patchHeadingInputSchema,
    outputSchema: patchHeadingOutputSchema,
    deps,
    handler: async (input, d) => executePatchHeading(input, d),
    mapValidationError: liftSubCodedIssue,
  });
}
