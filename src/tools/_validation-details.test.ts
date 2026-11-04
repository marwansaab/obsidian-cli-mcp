// Original — no upstream. BI-0174 tests for the shared mapValidationError lifts (liftSubCodedIssue, liftEmptyContent), driven through each registered tool that uses them; views_base keeps registerTool's generic envelope.
import { describe, expect, it } from "vitest";

import { createAppendNoteTool } from "./append_note/index.js";
import { createPatchBlockTool } from "./patch_block/index.js";
import { createPatchHeadingTool } from "./patch_heading/index.js";
import { createPrependTool } from "./prepend/index.js";
import { createQueryBaseTool } from "./query_base/index.js";
import { createViewsBaseTool } from "./views_base/index.js";

import type { RegisteredTool } from "./_shared.js";

/** Schema validation fails before any dependency is used, so these calls need none. */
const NO_DEPS = {} as never;

const EMPTY_CONTENT_MESSAGE = "Too small: expected string to have >=1 characters";

async function errorPayload(tool: RegisteredTool, args: unknown): Promise<{ code: string; message: string; details: Record<string, unknown> }> {
  const result = await tool.handler(args);
  expect("isError" in result && result.isError).toBe(true);
  return JSON.parse((result.content[0] as { text: string }).text);
}

describe("liftSubCodedIssue through the registered tools (BI-0174 item 7)", () => {
  it("patch_heading: empty append content → EMPTY_CONTENT with reason and mode, issues kept", async () => {
    const payload = await errorPayload(createPatchHeadingTool(NO_DEPS), {
      target_mode: "specific",
      vault: "V",
      path: "n.md",
      heading_path: "Top#Sub",
      mode: "append",
      content: "",
    });
    const message = "content must be non-empty for mode='append'; use mode='replace' to clear a heading's direct body";
    expect(payload).toEqual({
      code: "VALIDATION_ERROR",
      message,
      details: {
        code: "EMPTY_CONTENT",
        reason: "append",
        mode: "append",
        issues: [{ path: ["content"], message, code: "custom" }],
      },
    });
  });

  it("patch_heading: one-segment heading_path → INVALID_HEADING_PATH / single-segment", async () => {
    const payload = await errorPayload(createPatchHeadingTool(NO_DEPS), {
      target_mode: "specific",
      vault: "V",
      path: "n.md",
      heading_path: "Top",
      mode: "replace",
      content: "x",
    });
    expect(payload.message).toBe(
      "heading_path must contain at least two segments separated by '#'; top-level headings are out of scope",
    );
    expect(payload.details).toMatchObject({ code: "INVALID_HEADING_PATH", reason: "single-segment" });
    expect(payload.details["issues"]).toEqual([{ path: ["heading_path"], message: payload.message, code: "custom" }]);
  });

  it("patch_heading: an empty segment carries details.segment_index", async () => {
    const payload = await errorPayload(createPatchHeadingTool(NO_DEPS), {
      target_mode: "specific",
      vault: "V",
      path: "n.md",
      heading_path: "Top##Sub",
      mode: "replace",
      content: "x",
    });
    expect(payload.details).toMatchObject({ code: "INVALID_HEADING_PATH", reason: "empty-segment", segment_index: 1 });
  });

  it("patch_block: empty block_id → INVALID_BLOCK_ID / empty", async () => {
    const payload = await errorPayload(createPatchBlockTool(NO_DEPS), {
      target_mode: "specific",
      vault: "V",
      path: "n.md",
      block_id: "",
      content: "x",
    });
    expect(payload.message).toBe("block_id must not be empty");
    expect(payload.details).toEqual({
      code: "INVALID_BLOCK_ID",
      reason: "empty",
      issues: [{ path: ["block_id"], message: "block_id must not be empty", code: "custom" }],
    });
  });

  it("patch_block: a character outside the alphabet carries details.offending_index", async () => {
    const payload = await errorPayload(createPatchBlockTool(NO_DEPS), {
      target_mode: "specific",
      vault: "V",
      path: "n.md",
      block_id: "ab_c",
      content: "x",
    });
    expect(payload.details).toMatchObject({ code: "INVALID_BLOCK_ID", reason: "contains-invalid-chars", offending_index: 2 });
  });

  it("query_base: a non-.base path → INVALID_BASE_PATH / wrong-extension with field and value", async () => {
    const payload = await errorPayload(createQueryBaseTool(NO_DEPS), { base_path: "x.md", view_name: "All" });
    const message = "INVALID_BASE_PATH/wrong-extension: base_path must end with .base";
    expect(payload).toEqual({
      code: "VALIDATION_ERROR",
      message,
      details: {
        code: "INVALID_BASE_PATH",
        reason: "wrong-extension",
        field: "base_path",
        value: "x.md",
        issues: [{ path: ["base_path"], message, code: "custom" }],
      },
    });
  });

  it("query_base: an over-long view_name → INVALID_VIEW_NAME / too-long with value_length", async () => {
    const payload = await errorPayload(createQueryBaseTool(NO_DEPS), { base_path: "x.base", view_name: "v".repeat(1001) });
    expect(payload.message).toBe("INVALID_VIEW_NAME/too-long: view_name exceeds 1000 UTF-16 code units");
    expect(payload.details).toMatchObject({
      code: "INVALID_VIEW_NAME",
      reason: "too-long",
      field: "view_name",
      value_length: 1001,
    });
  });

  it("query_base: a failure without a sub-code keeps the generic envelope", async () => {
    const payload = await errorPayload(createQueryBaseTool(NO_DEPS), { base_path: "x.base", view_name: "All", extra: 1 });
    expect(payload.message).toBe("query_base input failed schema validation");
    expect(payload.details["code"]).toBeUndefined();
    expect(payload.details["issues"]).toBeDefined();
  });

  it("views_base: a non-.base path keeps the generic envelope, with no details.code (not lifted)", async () => {
    const payload = await errorPayload(createViewsBaseTool(NO_DEPS), { base_path: "x.md" });
    expect(payload.message).toBe("views_base input failed schema validation");
    expect(payload.details).toEqual({
      issues: [
        { path: ["base_path"], message: "INVALID_BASE_PATH/wrong-extension: base_path must end with .base", code: "custom" },
      ],
    });
  });
});

describe("liftEmptyContent through the registered tools (BI-0174 item 7)", () => {
  const cases: Array<[string, (deps: never) => RegisteredTool]> = [
    ["append_note", createAppendNoteTool],
    ["prepend", createPrependTool],
  ];

  it.each(cases)("%s: empty content → CONTENT_EMPTY with the schema's message, issues kept", async (_name, create) => {
    const payload = await errorPayload(create(NO_DEPS), {
      target_mode: "specific",
      vault: "V",
      path: "n.md",
      content: "",
    });
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(payload.message).toBe(EMPTY_CONTENT_MESSAGE);
    expect(payload.details["code"]).toBe("CONTENT_EMPTY");
    const issues = payload.details["issues"] as Array<{ path: string[]; code: string; message: string }>;
    expect(issues).toContainEqual({ path: ["content"], message: EMPTY_CONTENT_MESSAGE, code: "too_small" });
  });

  it.each(cases)("%s: any other failure keeps the generic envelope", async (name, create) => {
    const payload = await errorPayload(create(NO_DEPS), {
      target_mode: "specific",
      vault: "V",
      path: "n.md",
      file: "n",
      content: "x",
    });
    expect(payload.message).toBe(`${name} input failed schema validation`);
    expect(payload.details["code"]).toBeUndefined();
  });
});
