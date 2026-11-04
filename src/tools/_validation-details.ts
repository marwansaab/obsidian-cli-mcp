// Original — no upstream. BI-0174: shared mapValidationError lifts for tools whose help pages promise a details.code on a schema-layer rejection. liftSubCodedIssue lifts the first custom issue carrying ADR-015 params ({ code, reason?, ...extra keys }) into details, with that issue's own message; liftEmptyContent maps the empty-content too_small on `content` to details.code CONTENT_EMPTY. Both keep registerTool's details.issues list beside the lifted keys, and return undefined for every other failure, which then gets registerTool's generic envelope.
import { type z } from "zod";

import { validationIssues } from "./_register.js";
import { type ToolErrorPayload } from "./_shared.js";

/**
 * The first custom issue, in refinement order, whose `params` carry a `code`: its params become
 * `details` (`code`, `reason` when present, and any extra key such as `segment_index` or
 * `value_length`), next to the unchanged `details.issues`.
 */
export function liftSubCodedIssue(issues: z.core.$ZodIssue[]): ToolErrorPayload | undefined {
  for (const issue of issues) {
    if (issue.code !== "custom" || issue.params?.["code"] === undefined) continue;
    return {
      code: "VALIDATION_ERROR",
      message: issue.message,
      details: { ...issue.params, issues: validationIssues(issues) },
    };
  }
  return undefined;
}

/** The empty-content rejection (`content` below its 1-character minimum) as `details.code: "CONTENT_EMPTY"`. */
export function liftEmptyContent(issues: z.core.$ZodIssue[]): ToolErrorPayload | undefined {
  const issue = issues.find((i) => i.code === "too_small" && i.path[0] === "content");
  if (issue === undefined) return undefined;
  return {
    code: "VALIDATION_ERROR",
    message: issue.message,
    details: { code: "CONTENT_EMPTY", issues: validationIssues(issues) },
  };
}
