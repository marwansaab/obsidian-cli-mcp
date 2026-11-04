// Original — no upstream. prepend tool registration via registerTool with a mapValidationError hook that intercepts the schema-layer over-cap rejection and emits a stable top-level discriminator (VALIDATION_ERROR with details.code: CONTENT_TOO_LARGE + contentLength + maxLength) instead of the generic Zod issues envelope; spec 078: the hook also maps the byte-cap issue to CONTENT_TOO_LARGE with details.reason "bytes" + contentBytes + maxBytes, taking the message and size from the schema's issue (the schema reports only the character limit when both are broken); BI-0174: empty content maps to details.code CONTENT_EMPTY through the shared liftEmptyContent; all other validation failures keep the generic envelope shape. responseFormat: "json" emits the { path, vault, bytes_written, inline } envelope on success.
import { type z } from "zod";

import { executePrepend, PREPEND_SUPPORTED, type ExecuteDeps } from "./handler.js";
import { MAX_CONTENT_BYTES, MAX_CONTENT_LENGTH, prependInputSchema, prependOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { registerTool } from "../_register.js";
import { ADDITIVE_WRITE_HINTS, type BootDeps, type RegisteredTool, type ToolErrorPayload } from "../_shared.js";
import { liftEmptyContent } from "../_validation-details.js";

export const PREPEND_TOOL_NAME = "prepend";

export const PREPEND_DESCRIPTION =
  `Add content to the top of an existing note, after any frontmatter. Choose it to add at the top; \`append_note\` adds at the end, \`write_note\` creates or replaces a whole note with no size limit, \`patch_heading\` edits a heading's section, \`patch_block\` edits a block and \`find_and_replace\` replaces text across notes. ${describeSupport(PREPEND_SUPPORTED)}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

function mapZodIssuesToToolError(issues: z.core.$ZodIssue[], rawArgs: unknown): ToolErrorPayload | undefined {
  // Intercept the cap-rejection paths and emit the documented top-level
  // discriminator. The caller doesn't have to dig into details.issues[] to
  // identify what went wrong — details.code (+ details.reason for the size
  // limit) and the measured/maximum pair carry everything needed to render a
  // remediation message. The schema reports at most one of the two limits
  // (`abort` on `.max()`; spec 078 FR-005), so their order here does not matter.
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
    // Spec 078 — the size limit: CONTENT_TOO_LARGE's `reason: "bytes"` sub-state
    // (ADR-015); the character limit above is the origin sub-state, with no reason.
    // The schema's issue already carries the message and the measured size.
    if (issue.code === "custom" && issue.path[0] === "content" && issue.params?.subReason === "bytes") {
      return {
        code: "VALIDATION_ERROR",
        message: issue.message,
        details: {
          code: "CONTENT_TOO_LARGE",
          reason: "bytes",
          contentBytes: issue.params.contentBytes,
          maxBytes: MAX_CONTENT_BYTES,
        },
      };
    }
  }
  // BI-0174: empty content lifts to CONTENT_EMPTY; every other failure (bracket-rejection,
  // locator-mutex, unknown extra field, structurally unsafe path, type-mismatched inline,
  // etc.) returns undefined and gets registerTool's generic envelope.
  return liftEmptyContent(issues);
}

export function createPrependTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: PREPEND_TOOL_NAME,
    title: "Prepend",
    annotations: ADDITIVE_WRITE_HINTS,
    description: PREPEND_DESCRIPTION,
    schema: prependInputSchema,
    outputSchema: prependOutputSchema,
    deps,
    handler: executePrepend,
    mapValidationError: mapZodIssuesToToolError,
  });
}
