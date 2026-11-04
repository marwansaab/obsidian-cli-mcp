// Original — no upstream. BI-0174 unit tests for the shared mapValidationError lifts (liftSubCodedIssue, liftSubCodedIssueKeys, liftEmptyContent), on issues from a small zod schema. Each tool's wiring of a lift is pinned in that tool's own index.test.ts.
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { liftEmptyContent, liftSubCodedIssue, liftSubCodedIssueKeys } from "./_validation-details.js";

/** `name` fails with an ADR-015 sub-coded issue when empty; `content` has a 1-character minimum; `n` is a plain number. */
const schema = z
  .strictObject({ name: z.string(), content: z.string().min(1).optional(), n: z.number().optional() })
  .superRefine((v, ctx) => {
    if (v.name === "") {
      ctx.addIssue({ code: "custom", path: ["name"], message: "first", params: { code: "INVALID_NAME", reason: "empty", field: "name", value_length: 0 } });
      ctx.addIssue({ code: "custom", path: ["name"], message: "second", params: { code: "OTHER", reason: "x" } });
    }
    if (v.name === "nocode") ctx.addIssue({ code: "custom", path: ["name"], message: "no params code" });
  });

function issuesOf(args: unknown): z.core.$ZodIssue[] {
  const parsed = schema.safeParse(args);
  if (parsed.success) throw new Error("expected a validation failure");
  return parsed.error.issues;
}

const issueList = (issues: z.core.$ZodIssue[]) => issues.map((i) => ({ path: i.path, message: i.message, code: i.code }));

describe("liftSubCodedIssue", () => {
  it("lifts every param of the first sub-coded issue, with its message, next to the full issue list", () => {
    const issues = issuesOf({ name: "" });
    expect(liftSubCodedIssue(issues)).toEqual({
      code: "VALIDATION_ERROR",
      message: "first",
      details: { code: "INVALID_NAME", reason: "empty", field: "name", value_length: 0, issues: issueList(issues) },
    });
  });

  it("returns undefined when no custom issue carries params.code", () => {
    expect(liftSubCodedIssue(issuesOf({ name: "nocode" }))).toBeUndefined();
    expect(liftSubCodedIssue(issuesOf({ name: "a", n: "x" }))).toBeUndefined();
  });
});

describe("liftSubCodedIssueKeys", () => {
  it("keeps only the named params, in the issue's own order", () => {
    const issues = issuesOf({ name: "" });
    const lifted = liftSubCodedIssueKeys(["field", "code", "reason"])(issues);
    expect(lifted).toEqual({
      code: "VALIDATION_ERROR",
      message: "first",
      details: { code: "INVALID_NAME", reason: "empty", field: "name", issues: issueList(issues) },
    });
    expect(Object.keys(lifted!.details)).toEqual(["code", "reason", "field", "issues"]);
  });

  it("leaves out a named key the issue does not carry, and returns undefined without a sub-coded issue", () => {
    const lift = liftSubCodedIssueKeys(["code", "missing"]);
    expect(Object.keys(lift(issuesOf({ name: "" }))!.details)).toEqual(["code", "issues"]);
    expect(lift(issuesOf({ name: "nocode" }))).toBeUndefined();
  });
});

describe("liftEmptyContent", () => {
  it("maps the empty-content too_small to CONTENT_EMPTY with the schema's message", () => {
    const issues = issuesOf({ name: "a", content: "" });
    expect(liftEmptyContent(issues)).toEqual({
      code: "VALIDATION_ERROR",
      message: "Too small: expected string to have >=1 characters",
      details: { code: "CONTENT_EMPTY", issues: issueList(issues) },
    });
  });

  it("returns undefined for any other failure", () => {
    expect(liftEmptyContent(issuesOf({ name: "a", n: "x" }))).toBeUndefined();
    expect(liftEmptyContent(issuesOf({ name: "" }))).toBeUndefined();
  });
});
