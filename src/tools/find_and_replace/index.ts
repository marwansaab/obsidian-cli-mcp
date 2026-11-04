// Original — no upstream. find_and_replace registration via registerTool (BI-0174: description kept within 4,096 characters, detail on the help page) with a mapValidationError hook that maps Zod issues into VALIDATION_ERROR envelopes carrying details.code (INVALID_PATTERN / INVALID_REPLACEMENT / INVALID_SUBFOLDER) + details.reason (empty / too-long / regex-syntax / path-traversal / not-found) per ADR-015. Zero new top-level error codes — Constitution Principle IV streak preserved.
import { type z } from "zod";

import { type ExecuteDeps, executeFindAndReplace, FIND_AND_REPLACE_SUPPORTED } from "./handler.js";
import { findAndReplaceInputSchema, findAndReplaceOutputSchema } from "./schema.js";
import { describeSupport } from "../../file-type/file-type.js";
import { withDeprecatedParameters } from "../_deprecated-params.js";
import { registerTool } from "../_register.js";
import { DESTRUCTIVE_HINTS, type BootDeps, type RegisteredTool, type ToolErrorPayload } from "../_shared.js";

export const FIND_AND_REPLACE_TOOL_NAME = "find_and_replace";

export const FIND_AND_REPLACE_DESCRIPTION =
  `Find and replace text or a regex in a vault, a folder or one note. Choose it to replace text by pattern; \`write_note\` replaces a whole note, \`append_note\` and \`prepend\` add at the end or top, \`patch_heading\` edits a heading's section and \`patch_block\` edits a block. Its scope is the whole vault by default, and nothing changes until \`commit: true\`. ${describeSupport(FIND_AND_REPLACE_SUPPORTED)}`;

export type RegisterDeps = BootDeps<ExecuteDeps>;

function mapZodIssuesToToolError(issues: z.core.$ZodIssue[]): ToolErrorPayload {
  const mappedIssues = issues.map((i) => ({
    path: i.path,
    message: i.message,
    code: i.code,
  }));
  for (const issue of issues) {
    const path0 = issue.path[0];
    const params = (issue as { params?: { subCode?: string; subReason?: string } }).params;
    // Scope mutual-exclusivity (066-file-scope) — cross-field custom issue with
    // an empty path; matched on subCode regardless of path[0].
    if (issue.code === "custom" && params?.subCode === "SCOPE_CONFLICT") {
      return {
        code: "VALIDATION_ERROR",
        message: issue.message,
        details: {
          code: "SCOPE_CONFLICT",
          reason: params.subReason,
          issues: mappedIssues,
        },
      };
    }
    // Structurally-unsafe single-note locator → INVALID_NOTE/path-traversal
    // (parity with INVALID_SUBFOLDER/path-traversal). The `[[…]]` reject on
    // `file` carries no subReason and falls through to the generic channel.
    if (
      (path0 === "file" || path0 === "path") &&
      issue.code === "custom" &&
      params?.subReason === "path-traversal"
    ) {
      return {
        code: "VALIDATION_ERROR",
        message: `${String(path0)} is not structurally safe`,
        details: {
          code: "INVALID_NOTE",
          reason: "path-traversal",
          issues: mappedIssues,
        },
      };
    }
    if (path0 === "pattern") {
      if (issue.code === "too_small") {
        return {
          code: "VALIDATION_ERROR",
          message: "pattern must not be empty",
          details: {
            code: "INVALID_PATTERN",
            reason: "empty",
            issues: mappedIssues,
          },
        };
      }
      if (issue.code === "too_big") {
        return {
          code: "VALIDATION_ERROR",
          message: "pattern exceeds maximum length of 1000 UTF-16 code units",
          details: {
            code: "INVALID_PATTERN",
            reason: "too-long",
            issues: mappedIssues,
          },
        };
      }
      if (issue.code === "custom" && params?.subReason === "regex-syntax") {
        return {
          code: "VALIDATION_ERROR",
          message: "pattern is not a valid ECMAScript regular expression",
          details: {
            code: "INVALID_PATTERN",
            reason: "regex-syntax",
            issues: mappedIssues,
          },
        };
      }
    }
    if (path0 === "replacement" && issue.code === "too_big") {
      return {
        code: "VALIDATION_ERROR",
        message: "replacement exceeds maximum length of 1000 UTF-16 code units",
        details: {
          code: "INVALID_REPLACEMENT",
          issues: mappedIssues,
        },
      };
    }
    if (path0 === "folder") {
      if (issue.code === "custom" && params?.subReason === "path-traversal") {
        return {
          code: "VALIDATION_ERROR",
          message: "folder is not structurally safe",
          details: {
            code: "INVALID_SUBFOLDER",
            reason: "path-traversal",
            issues: mappedIssues,
          },
        };
      }
    }
  }
  return {
    code: "VALIDATION_ERROR",
    message: `${FIND_AND_REPLACE_TOOL_NAME} input failed schema validation`,
    details: { issues: mappedIssues },
  };
}

export function createFindAndReplaceTool(deps: RegisterDeps): RegisteredTool {
  return registerTool({
    name: FIND_AND_REPLACE_TOOL_NAME,
    title: "Find And Replace",
    annotations: DESTRUCTIVE_HINTS,
    description: FIND_AND_REPLACE_DESCRIPTION,
    schema: findAndReplaceInputSchema,
    outputSchema: findAndReplaceOutputSchema,
    deps,
    handler: async (input, d, call) =>
      withDeprecatedParameters(await executeFindAndReplace(input, d, call), input.deprecated_parameters),
    mapValidationError: mapZodIssuesToToolError,
  });
}
