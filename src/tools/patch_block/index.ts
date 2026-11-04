// Original — no upstream. patch_block tool registration per BI-043 / ADR-009 — wraps the executePatchBlock direct-fs-write handler via registerTool (ADR-006); responseFormat: "json" emits the { path, vault, block_id, block_shape, bytes_written } envelope on the MCP wire. BI-0174: a mapValidationError hook (shared liftSubCodedIssue) lifts INVALID_BLOCK_ID's ADR-015 params into details.
import { registerTool } from "../_register.js";
import { liftSubCodedIssue } from "../_validation-details.js";
import { executePatchBlock, type ExecuteDeps } from "./handler.js";
import { patchBlockInputSchema, patchBlockOutputSchema } from "./schema.js";
import { ADDITIVE_WRITE_HINTS, type BootDeps, type RegisteredTool } from "../_shared.js";

export const PATCH_BLOCK_TOOL_NAME = "patch_block";

export const PATCH_BLOCK_DESCRIPTION =
  `Replace the content tied to one \`^block-id\` marker in a note, keeping the marker. Choose it to edit a block; \`patch_heading\` edits a heading's section, including blocks on heading lines, \`append_note\` and \`prepend\` add at the end or top, \`write_note\` replaces the whole note and \`find_and_replace\` replaces text across notes.`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

export function createPatchBlockTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: PATCH_BLOCK_TOOL_NAME,
    title: "Patch Block",
    annotations: ADDITIVE_WRITE_HINTS,
    description: PATCH_BLOCK_DESCRIPTION,
    schema: patchBlockInputSchema,
    outputSchema: patchBlockOutputSchema,
    deps,
    handler: async (input, d) => executePatchBlock(input, d),
    mapValidationError: liftSubCodedIssue,
  });
}
