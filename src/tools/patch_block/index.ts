// Original — no upstream. patch_block tool registration per BI-043 / ADR-009 — wraps the executePatchBlock direct-fs-write handler via registerTool (ADR-006); responseFormat: "json" emits the { path, vault, block_id, block_shape, bytes_written } envelope on the MCP wire.
import { registerTool } from "../_register.js";
import { executePatchBlock, type ExecuteDeps } from "./handler.js";
import { patchBlockInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const PATCH_BLOCK_TOOL_NAME = "patch_block";

export const PATCH_BLOCK_DESCRIPTION =
  `Surgically replace the body content tied to a named \`^block-id\` block-reference marker inside a markdown note. The marker itself stays byte-stable, and every byte outside the targeted block is unchanged.

Pick \`patch_block\` for block-id-targeted edits. Pick \`patch_heading\` for body-under-named-heading edits. Pick \`append_note\` / \`prepend\` for additive writes. Pick \`write_note\` to replace the whole file. Pick \`find_and_replace\` for vault-wide pattern replacement.

Three success block shapes the targeting recognises:
- **paragraph** — marker trailing on the paragraph's final line.
- **list item** — marker trailing on the item's line; list-marker bytes + indentation preserved.
- **separately-placed** — marker on a standalone line immediately following a table / callout / blockquote / indented-code block; marker line preserved verbatim.

Targeting: \`target_mode: "specific"\` + \`vault\` + EXACTLY ONE of \`file\` / \`path\` + \`block_id\` + \`content\`. Or \`target_mode: "active"\` + \`block_id\` + \`content\` (wrapper resolves the focused note).

\`block_id\` is the bare identifier (no leading \`^\`), alphanumeric + hyphen, case-sensitive, capped at 1000 UTF-16 code units. First-match-wins on duplicate ids in the same note. Markers inside fenced code blocks are content, NOT eligible targets.

\`content\` empty is accepted as a legitimate "clear the body" operation. No wrapper-imposed size cap.

Block-id that resolves to a heading-attached marker (ATX or setext) short-circuits to \`BLOCK_ON_HEADING\` — route those to \`patch_heading\` instead.

Concurrent calls against the same note resolve **last-write-wins**.

Typed errors via \`UpstreamError.details.code\`: \`BLOCK_NOT_FOUND\`, \`BLOCK_ON_HEADING\` (use \`patch_heading\`), \`NOTE_NOT_FOUND\`, \`INVALID_BLOCK_ID\`, \`EXTERNAL_EDITOR_CONFLICT\` (file locked — ask user to save and close, retry). Plus the standard \`VALIDATION_ERROR\`, \`PATH_ESCAPES_VAULT\`, \`FS_WRITE_FAILED\`, \`VAULT_NOT_FOUND\`, \`ERR_NO_ACTIVE_FILE\`. Call \`help({ tool_name: "patch_block" })\` for worked examples, per-shape gotchas, and recovery hints.`;

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
