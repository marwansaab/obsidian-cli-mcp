// Original — no upstream. BI-0174: shared mapValidationError lifts for tools whose help pages promise a details.code on a schema-layer rejection. liftSubCodedIssue lifts the first custom issue carrying ADR-015 params ({ code, reason?, ...extra keys }) into details, with that issue's own message; liftSubCodedIssueKeys(keys) builds the same lift keeping only the named params (create_base: code, reason, field); liftEmptyContent maps the empty-content too_small on `content` to details.code CONTENT_EMPTY. All keep registerTool's details.issues list beside the lifted keys, and return undefined for every other failure, which then gets registerTool's generic envelope.
import { type z } from "zod";

import { validationIssues } from "./_register.js";
import { type ToolErrorPayload } from "./_shared.js";

type Issues = z.core.$ZodIssue[];

/** The first custom issue, in refinement order, whose ADR-015 `params` carry a `code`, as a VALIDATION_ERROR. */
function liftFirstSubCoded(
  issues: Issues,
  pick: (params: Record<string, unknown>) => Record<string, unknown>,
): ToolErrorPayload | undefined {
  for (const issue of issues) {
    if (issue.code !== "custom" || issue.params?.["code"] === undefined) continue;
    return {
      code: "VALIDATION_ERROR",
      message: issue.message,
      details: { ...pick(issue.params), issues: validationIssues(issues) },
    };
  }
  return undefined;
}

/**
 * The first sub-coded custom issue: all its params become `details` (`code`, `reason` when
 * present, and any extra key such as `segment_index` or `value_length`), next to the unchanged
 * `details.issues`.
 */
export function liftSubCodedIssue(issues: Issues): ToolErrorPayload | undefined {
  return liftFirstSubCoded(issues, (params) => params);
}

/** The same lift, keeping only the named params, in the order the issue carries them. */
export function liftSubCodedIssueKeys(keys: readonly string[]): (issues: Issues) => ToolErrorPayload | undefined {
  return (issues) =>
    liftFirstSubCoded(issues, (params) => Object.fromEntries(Object.entries(params).filter(([key]) => keys.includes(key))));
}

/** The empty-content rejection (`content` below its 1-character minimum) as `details.code: "CONTENT_EMPTY"`. */
export function liftEmptyContent(issues: Issues): ToolErrorPayload | undefined {
  const issue = issues.find((i) => i.code === "too_small" && i.path[0] === "content");
  if (issue === undefined) return undefined;
  return {
    code: "VALIDATION_ERROR",
    message: issue.message,
    details: { code: "CONTENT_EMPTY", issues: validationIssues(issues) },
  };
}
