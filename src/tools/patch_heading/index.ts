// Original — no upstream. patch_heading tool registration per BI-040 / ADR-009 — wraps the executePatchHeading direct-fs-write handler via registerTool (ADR-006); responseFormat: "json" emits the { path, vault, heading_path, mode, bytes_written } envelope on the MCP wire.
import { registerTool } from "../_register.js";
import { executePatchHeading, type ExecuteDeps } from "./handler.js";
import { patchHeadingInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const PATCH_HEADING_TOOL_NAME = "patch_heading";

export const PATCH_HEADING_DESCRIPTION =
  `Surgically rewrite the body under a named heading inside a markdown note, addressed by its full hierarchical path through the heading hierarchy.

Pick \`patch_heading\` for body-under-named-heading edits. Pick \`patch_block\` for \`^block-id\` marker edits. Pick \`append_note\` / \`prepend\` for additive writes. Pick \`write_note\` to replace the whole file. Pick \`find_and_replace\` for vault-wide pattern replacement.

**Three placement modes**:
- **append** — insert at end of the heading's full reach (before the next equal-or-higher-rank heading).
- **prepend** — insert immediately after the heading marker line.
- **replace** — swap the direct body, preserving the marker and child subtrees.

Targeting: \`target_mode: "specific"\` + \`vault\` + EXACTLY ONE of \`file\` / \`path\` + \`heading_path\` + \`mode\` + \`content\`. Or \`target_mode: "active"\` + \`heading_path\` + \`mode\` + \`content\` (wrapper resolves the focused note).

\`heading_path\` uses \`#\` as the segment separator. **Minimum two segments** — top-level headings are out of scope (the wrapper exposes no top-level patch surface; use \`write_note\` for that). First match wins on duplicate sibling headings. Headings whose literal text contains \`#\` are permanently unreachable through this tool.

\`content\` empty is REJECTED for \`append\` / \`prepend\` (you must supply something to insert). Empty content is ACCEPTED for \`replace\` (legitimate "clear the body" operation). No wrapper-imposed size cap.

Concurrent calls against the same note publish a \`HEADING_RACE\` discriminator when both calls target the same heading and a race is detected — callers can branch on it and retry. (Sibling \`patch_block\` does NOT publish a race discriminator; it just resolves last-write-wins.)

Typed errors via \`UpstreamError.details.code\`: \`HEADING_NOT_FOUND\` (use [\`outline\`](./outline.md) to enumerate the file's actual headings, then retry with a valid path), \`HEADING_RACE\`, \`EXTERNAL_EDITOR_CONFLICT\` (file locked — ask user to save and close, retry), \`INVALID_HEADING_PATH\`, \`EMPTY_CONTENT\`. Plus the standard \`VALIDATION_ERROR\`, \`NOTE_NOT_FOUND\`, \`PATH_ESCAPES_VAULT\`, \`FS_WRITE_FAILED\`, \`VAULT_NOT_FOUND\`, \`ERR_NO_ACTIVE_FILE\`. Call \`help({ tool_name: "patch_heading" })\` for worked examples, per-mode gotchas, and recovery hints.`;

export type RegisterDeps = ExecuteDeps;

export function createPatchHeadingTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: PATCH_HEADING_TOOL_NAME,
    description: PATCH_HEADING_DESCRIPTION,
    schema: patchHeadingInputSchema,
    deps,
    handler: async (input, d) => executePatchHeading(input, d),
  });
}
