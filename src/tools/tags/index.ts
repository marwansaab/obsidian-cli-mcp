// Original — no upstream. tags tool registration via registerTool — vault tag inventory (or one note's tag set) returning { total, tags: [{ name, count? }] }; a mapValidationError hook maps the schema's custom issues to VALIDATION_ERROR + details.code/details.reason (SCOPE_CONFLICT / INVALID_NOTE per ADR-015, reasons reused from ADR-032) and always carries the zod field paths in details.issues (Principle III); every other failure falls through to registerTool's generic envelope. Zero new top-level error codes.
import { type z } from "zod";

import { executeTags, type ExecuteDeps } from "./handler.js";
import { tagsInputSchema } from "./schema.js";
import { registerTool } from "../_register.js";
import { type RegisteredTool, type ToolErrorPayload } from "../_shared.js";

export const TAGS_TOOL_NAME = "tags";

export const TAGS_DESCRIPTION =
  `Tag inventory: every distinct tag in a vault (or in one note) with per-tag occurrence counts. Returns \`{ total, tags: [{ name, count }] }\`, where \`total === tags.length\`. Names are bare: exactly one leading \`#\` is stripped (\`#parent/child\` → \`parent/child\`).

Pick \`tags\` for "which tags exist, and how often?". Pick \`tag\` for the inverse, "which notes carry tag X?".

Optional \`vault\` (string): the vault display name; omitted routes to the focused vault. Unregistered names surface as \`CLI_REPORTED_ERROR\` with message \`Vault not found.\`.

Scope (choose at most one; none = vault-wide):
- \`file\` — bare note name, resolved like a wikilink (NOT the \`[[…]]\` form).
- \`path\` — vault-relative path with extension, e.g. \`Projects/Alpha.md\`.
- \`activeOnly: true\` — the note open in the editor. Forbids \`vault\`. No note open → \`ERR_NO_ACTIVE_FILE\`.
\`vault\` may accompany \`file\` / \`path\`. Conflicts (\`file\`+\`path\`, \`activeOnly\`+\`file\`/\`path\`, \`activeOnly\`+\`vault\`) fail with \`VALIDATION_ERROR\` + \`details.code: "SCOPE_CONFLICT"\` before any CLI call. A \`file\` / \`path\` naming no note fails with \`CLI_REPORTED_ERROR\` (never an empty list).

Order: alphabetical by default (case-insensitive, then UTF-16 code-unit tiebreak). \`sortByCount: true\` orders by count, highest first, ties alphabetical. \`includeCounts: false\` drops \`count\` from every entry (the \`sortByCount\` order still applies). An untagged scope returns \`{ total: 0, tags: [] }\`.

\`count\` is the number of occurrences. Vault-wide listings merge case variants and include an entry for every parent of a nested tag (its count includes its children); single-note listings show the literal tags only.

Typed errors via \`UpstreamError.code\`: \`VALIDATION_ERROR\` (with \`details.code\` \`SCOPE_CONFLICT\` or \`INVALID_NOTE\`/\`path-traversal\`, or generic issues); \`ERR_NO_ACTIVE_FILE\`; \`CLI_REPORTED_ERROR\`; \`CLI_OUTPUT_TOO_LARGE\`; \`CLI_TIMEOUT\`; \`CLI_NON_ZERO_EXIT\`; \`CLI_BINARY_NOT_FOUND\`.

Call \`help({ tool_name: "tags" })\` for worked examples, the full error roster, and the inherited index behaviours.`;

export type RegisterDeps = ExecuteDeps;

// Maps the first custom issue carrying `params.subCode` (SCOPE_CONFLICT or
// INVALID_NOTE) to its ADR-015 sub-discriminated envelope; any other failure
// returns undefined and takes registerTool's generic issues envelope.
function mapZodIssuesToToolError(issues: z.core.$ZodIssue[]): ToolErrorPayload | undefined {
  for (const issue of issues) {
    if (issue.code === "custom" && issue.params?.subCode !== undefined) {
      return {
        code: "VALIDATION_ERROR",
        message: issue.message,
        details: {
          code: issue.params.subCode,
          reason: issue.params.subReason,
          issues: issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
        },
      };
    }
  }
  return undefined;
}

export function createTagsTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: TAGS_TOOL_NAME,
    description: TAGS_DESCRIPTION,
    schema: tagsInputSchema,
    deps,
    handler: executeTags,
    mapValidationError: mapZodIssuesToToolError,
  });
}
