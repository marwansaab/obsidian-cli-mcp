// Original — no upstream. prepend tool registration via registerTool with a mapValidationError hook that intercepts the schema-layer over-cap rejection and emits a stable top-level discriminator (VALIDATION_ERROR with details.code: CONTENT_TOO_LARGE + contentLength + maxLength) instead of the generic Zod issues envelope; all other validation failures keep the generic envelope shape. responseFormat: "json" emits the { path, vault, bytes_written, inline } envelope on success.
import { type ZodIssue } from "zod";

import { executePrepend, type ExecuteDeps } from "./handler.js";
import { MAX_CONTENT_LENGTH, prependInputSchema } from "./schema.js";
import { registerTool } from "../_register.js";
import { type RegisteredTool, type ToolErrorPayload } from "../_shared.js";

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

function mapZodIssuesToToolError(issues: ZodIssue[], rawArgs: unknown): ToolErrorPayload {
  // Intercept the cap-rejection path (too_big on content) and emit the
  // documented top-level discriminator. The caller doesn't have to dig into
  // details.issues[] to identify what went wrong — details.code +
  // contentLength + maxLength carry everything needed to render a
  // remediation message.
  for (const issue of issues) {
    if (issue.code === "too_big" && issue.path[0] === "content") {
      const argsObj = (typeof rawArgs === "object" && rawArgs !== null
        ? (rawArgs as { content?: unknown })
        : null);
      const contentLength =
        typeof argsObj?.content === "string" ? argsObj.content.length : 0;
      return {
        code: "VALIDATION_ERROR",
        message: `content exceeds maximum length of ${MAX_CONTENT_LENGTH} UTF-16 code units (got ${contentLength})`,
        details: {
          code: "CONTENT_TOO_LARGE",
          contentLength,
          maxLength: MAX_CONTENT_LENGTH,
        },
      };
    }
  }
  // Generic fallback — bracket-rejection, locator-mutex, unknown extra
  // field, structurally unsafe path, type-mismatched inline, etc.
  return {
    code: "VALIDATION_ERROR",
    message: `${PREPEND_TOOL_NAME} input failed schema validation`,
    details: {
      issues: issues.map((i) => ({
        path: i.path,
        message: i.message,
        code: i.code,
      })),
    },
  };
}

export function createPrependTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: PREPEND_TOOL_NAME,
    description: PREPEND_DESCRIPTION,
    schema: prependInputSchema,
    deps,
    handler: executePrepend,
    mapValidationError: mapZodIssuesToToolError,
  });
}
