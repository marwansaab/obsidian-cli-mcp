// Original — no upstream. patch_block tool registration per BI-043 / ADR-009 — wraps the executePatchBlock direct-fs-write handler via registerTool (ADR-006); responseFormat: "json" emits the { path, vault, block_id, block_shape, bytes_written } envelope on the MCP wire.
import { registerTool } from "../_register.js";
import { executePatchBlock, type ExecuteDeps } from "./handler.js";
import { patchBlockInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const PATCH_BLOCK_TOOL_NAME = "patch_block";

export const PATCH_BLOCK_DESCRIPTION =
  'Surgically replace the body content tied to a named ^block-id block-reference marker inside a markdown note, leaving the marker itself byte-stable and every byte outside the targeted block unchanged. Single placement mode — replace. Three success block shapes: paragraph (marker trailing on the paragraph\'s final line), list item (marker trailing on the item\'s line; list-marker bytes + indentation preserved), separately-placed (marker on a standalone line immediately following a table / callout / blockquote / indented-code block; marker line preserved verbatim). Specific mode: vault + exactly one of file/path + block_id + content. Active mode: block_id + content (the wrapper resolves the focused note). The block_id locator is the bare identifier (no leading "^"), matches the alphanumeric + hyphen alphabet, is case-sensitive, capped at 1000 UTF-16 code units; first-match-wins on duplicate ids in the same note; markers inside fenced code blocks are content (NOT eligible targets). Empty content is accepted as the legitimate "clear the body" operation. Block-id resolved to a heading-attached marker (ATX or setext) short-circuits to BLOCK_ON_HEADING — route those to patch_heading. Cross-invocation contract is last-write-wins per FR-026 (the wrapper does not publish a BLOCK_RACE discriminator). Typed error states surface via UpstreamError.details.code: BLOCK_NOT_FOUND, BLOCK_ON_HEADING, NOTE_NOT_FOUND, INVALID_BLOCK_ID, EXTERNAL_EDITOR_CONFLICT. Call help({ tool_name: "patch_block" }) for the full input schema, error roster, per-shape gotchas, and worked-example quickstart snippets.';

export type RegisterDeps = ExecuteDeps;

export function createPatchBlockTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: PATCH_BLOCK_TOOL_NAME,
    description: PATCH_BLOCK_DESCRIPTION,
    schema: patchBlockInputSchema,
    deps,
    handler: async (input, d) => executePatchBlock(input, d),
  });
}
