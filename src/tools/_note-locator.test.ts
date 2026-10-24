// Original — no upstream. Tests for the shared ADR-032 single-note locator refinements: the
// field-level issues (INVALID_NOTE/path-traversal on file and path, the params-free `[[…]]` reject
// on file), the SCOPE_CONFLICT matrix row order with and without a sub-folder scope, and the
// cross-field issue shape. Pins the contract both find_and_replace and tags delegate to.
import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
  appendNoteLocatorIssues,
  appendScopeConflictIssue,
  hasWikilinkBrackets,
  scopeConflictReason,
  WIKILINK_BRACKET_REJECTION_MESSAGE,
  type ScopeConflict,
} from "./_note-locator.js";
import { STRUCTURALLY_UNSAFE_PATH_MESSAGE } from "../path-safety/schema.js";

const locatorSchema = z
  .object({ file: z.string().optional(), path: z.string().optional() })
  .superRefine((v, ctx) => appendNoteLocatorIssues(ctx, v));

function issuesOf(input: unknown): z.core.$ZodIssue[] {
  const r = locatorSchema.safeParse(input);
  return r.success ? [] : r.error.issues;
}

describe("appendNoteLocatorIssues", () => {
  test("safe file and path add no issue", () => {
    expect(issuesOf({ file: "My Note", path: "Projects/Alpha.md" })).toEqual([]);
    expect(issuesOf({})).toEqual([]);
  });

  test.each(["file", "path"])("unsafe %s → INVALID_NOTE/path-traversal custom issue", (field) => {
    const issues = issuesOf({ [field]: "../x.md" });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "custom",
      path: [field],
      message: STRUCTURALLY_UNSAFE_PATH_MESSAGE,
      params: { subCode: "INVALID_NOTE", subReason: "path-traversal" },
    });
  });

  test("file with `[[`/`]]` → custom issue with the bare-name message and no params", () => {
    const issues = issuesOf({ file: "[[Note]]" });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "custom", path: ["file"], message: WIKILINK_BRACKET_REJECTION_MESSAGE });
    expect((issues[0] as { params?: unknown }).params).toBeUndefined();
  });

  test("an unsafe file reports path-traversal only (bracket check is skipped)", () => {
    const issues = issuesOf({ file: "../[[x]]" });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe(STRUCTURALLY_UNSAFE_PATH_MESSAGE);
  });

  test("path is not bracket-checked and single brackets are legal", () => {
    expect(issuesOf({ path: "[[x]].md", file: "[draft]" })).toEqual([]);
  });
});

test("hasWikilinkBrackets matches only bracket pairs", () => {
  expect(hasWikilinkBrackets("a [[b")).toBe(true);
  expect(hasWikilinkBrackets("b]] a")).toBe(true);
  expect(hasWikilinkBrackets("[draft] ]")).toBe(false);
});

describe("scopeConflictReason", () => {
  const none = { hasFile: false, hasPath: false, hasActive: false, hasVault: false };

  test.each([
    [{}, null],
    [{ hasVault: true }, null],
    [{ hasFile: true, hasVault: true }, null],
    [{ hasActive: true }, null],
    [{ hasFile: true, hasPath: true }, "file+path"],
    [{ hasActive: true, hasPath: true }, "active+note"],
    [{ hasActive: true, hasVault: true }, "active+vault"],
    [{ hasFile: true, hasPath: true, hasActive: true, hasVault: true }, "file+path"],
    [{ hasActive: true, hasFile: true, hasVault: true }, "active+note"],
  ])("note-only scope %j → %s", (flags, expected) => {
    expect(scopeConflictReason({ ...none, ...flags })).toBe(expected);
  });

  test.each([
    [{ hasSubfolder: true }, null],
    [{ hasSubfolder: true, hasVault: true }, null],
    [{ hasSubfolder: true, hasActive: true }, "active+folder"],
    [{ hasSubfolder: true, hasFile: true }, "note+folder"],
    // active+folder precedes active+vault; active+note precedes active+folder.
    [{ hasSubfolder: true, hasActive: true, hasVault: true }, "active+folder"],
    [{ hasSubfolder: true, hasActive: true, hasPath: true }, "active+note"],
  ])("with sub-folder scope %j → %s", (flags, expected) => {
    expect(scopeConflictReason({ ...none, ...flags })).toBe(expected);
  });
});

describe("appendScopeConflictIssue", () => {
  const messages: Record<ScopeConflict, string> = {
    "file+path": "m-file+path",
    "active+note": "m-active+note",
    "active+vault": "m-active+vault",
    "active+folder": "m-active+folder",
    "note+folder": "m-note+folder",
  };

  function run(reason: ScopeConflict | null): z.core.$ZodIssue[] {
    const r = z
      .object({})
      .superRefine((_v, ctx) => appendScopeConflictIssue(ctx, reason, messages))
      .safeParse({});
    return r.success ? [] : r.error.issues;
  }

  test("null reason adds no issue", () => {
    expect(run(null)).toEqual([]);
  });

  test("a reason adds one root-path custom issue with the tool message and SCOPE_CONFLICT params", () => {
    const issues = run("active+vault");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "custom",
      path: [],
      message: "m-active+vault",
      params: { subCode: "SCOPE_CONFLICT", subReason: "active+vault" },
    });
  });
});
