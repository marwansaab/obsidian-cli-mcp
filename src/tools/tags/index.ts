// Original — no upstream. tags tool registration via registerTool — tag-inventory primitive returning a typed { total, tags: [{ name, count? }] } envelope for the whole vault or for one note (file / path / activeOnly), under the ADR-038 tool-local target-mode scope matrix; responseFormat: "json" (default) wraps the envelope for the MCP wire. Tool name `tags` mirrors the upstream `obsidian tags` subcommand (ADR-010).
import { registerTool } from "../_register.js";
import { executeTags, type ExecuteDeps } from "./handler.js";
import { tagsInputSchema } from "./schema.js";

import type { RegisteredTool } from "../_shared.js";

export const TAGS_TOOL_NAME = "tags";

export const TAGS_DESCRIPTION =
  `List the tags in a vault, or the tags written in one note. Returns \`{ total, tags: [{ name, count? }] }\`; \`name\` is the bare tag (no leading \`#\`), ready to pass to \`tag\`.

Pick \`tags\` for the tag inventory (which tags exist, and how often). Pick \`tag\` to find the notes carrying one tag.

Required \`target_mode\`: \`"specific"\` requires \`vault\`; \`"active"\` forbids \`vault\` and uses the focused vault.

Scope (ADR-038) — at most one of: \`file\` (note name), \`path\` (vault-relative path; no \`..\`, no absolute or drive-letter paths), \`activeOnly: true\` (the focused note of the targeted vault). All three are allowed in both modes. None set → the whole vault.

\`count\` is the raw number of tag occurrences (inline plus frontmatter, no per-note de-duplication) — unlike \`tag\`'s note count. Vault-wide listings merge case variants under the first-encountered casing and include implied parent tags with rolled-up counts; per-note listings show only the tags written in that note. Tags inside code blocks are excluded.

Ordering: by name, ASCII-case-insensitive, ties and non-ASCII in UTF-8 byte order. \`sortByCount: true\` sorts by count descending, ties by name. \`includeCounts: false\` drops the \`count\` key. No tags → \`{ total: 0, tags: [] }\`.

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` (two or more scopes; vault rule broken; unknown key; unsafe \`path\`; no CLI call is made); \`ERR_NO_ACTIVE_FILE\` (\`activeOnly\` with no focused note — use \`file\` / \`path\`); \`CLI_REPORTED_ERROR\` (\`Vault not found.\`; note not found; unreadable reply); \`CLI_OUTPUT_TOO_LARGE\` (scope with \`file\` / \`path\`); \`CLI_TIMEOUT\`; \`CLI_NON_ZERO_EXIT\`; \`CLI_BINARY_NOT_FOUND\`.

Call \`help({ tool_name: "tags" })\` for worked examples, the scope semantics inherited from Obsidian, and recovery hints.`;

export type RegisterDeps = ExecuteDeps;

export function createTagsTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: TAGS_TOOL_NAME,
    description: TAGS_DESCRIPTION,
    schema: tagsInputSchema,
    deps,
    handler: async (input, d) => executeTags(input, d),
  });
}
