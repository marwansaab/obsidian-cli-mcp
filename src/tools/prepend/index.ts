// Original — no upstream. prepend tool registration per BI-045 / ADR-010 — wraps the upstream `obsidian prepend` subcommand via the executePrepend CLI-wrap handler through registerTool (ADR-006); responseFormat: "json" emits the { path, vault, bytes_written, inline } envelope on the MCP wire.
import { registerTool } from "../_register.js";
import { executePrepend, type ExecuteDeps } from "./handler.js";
import { MAX_CONTENT_LENGTH, prependInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const PREPEND_TOOL_NAME = "prepend";

// Single source of truth: pull the numeric cap from the same constant the
// schema enforces, so the description's documented ceiling and the schema's
// enforced ceiling cannot drift (SC-008 contract-and-implementation match).
export const PREPEND_DESCRIPTION =
  `Add content to the TOP of an existing markdown note. Frontmatter-aware: when the note starts with a YAML block (\`---\` ... \`---\`), new content lands after the closing \`---\` so the frontmatter is preserved. Otherwise lands at byte zero.

Pick \`append_note\` for end-of-file. Pick \`write_note\` to replace the whole file — write_note has no size cap, use it for content > ${MAX_CONTENT_LENGTH} chars or to create new notes; this tool only updates existing notes.

Targeting: \`target_mode: "specific"\` + \`vault\` + ONE of \`path\` (vault-relative) or \`file\` (bare wikilink name, no \`[[...]]\` brackets). Or \`target_mode: "active"\` + \`content\` to write to whatever note is open in Obsidian.

Separator: a newline is auto-inserted between your content and the existing body, matching the file's LF/CRLF convention. Pass \`inline: true\` to skip the separator and fuse onto the existing first line.

Content: preserved byte-for-byte, non-empty, max ${MAX_CONTENT_LENGTH} characters. Over-cap fails fast with \`VALIDATION_ERROR\`. The cap is bounded by an upstream Obsidian CLI defect that hangs the host process around 4 KB on Windows; chunking does not help.

Typed errors via \`UpstreamError.code\`: \`NOTE_NOT_FOUND\`, \`EXTERNAL_EDITOR_CONFLICT\`, \`FS_WRITE_FAILED\`, \`ERR_NO_ACTIVE_FILE\`, \`PATH_ESCAPES_VAULT\`, \`VALIDATION_ERROR\`. Call \`help({ tool_name: "prepend" })\` for recovery hints, worked examples, and the full schema.`;

export type RegisterDeps = ExecuteDeps;

export function createPrependTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: PREPEND_TOOL_NAME,
    description: PREPEND_DESCRIPTION,
    schema: prependInputSchema,
    deps,
    handler: async (input, d) => executePrepend(input, d),
  });
}
