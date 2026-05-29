// Original — no upstream. patch_block schema-validation cohort per BI-043 / Principle II — INVALID_BLOCK_ID four sub-reasons (FR-019), target-mode primitive interaction, single-mode replace with empty-content acceptance (FR-007 cohort parity with patch_heading FR-018a), output strict-shape.
import { describe, expect, it } from "vitest";

import { targetModeWiringCases } from "../_target-mode-test-cases.js";
import { patchBlockInputSchema, patchBlockOutputSchema } from "./schema.js";

import type { z } from "zod";

function customIssueParams(err: z.ZodError): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const issue of err.issues) {
    if (issue.code !== "custom") continue;
    const params = (issue as { params?: unknown }).params;
    if (typeof params === "object" && params !== null) {
      out.push(params as Record<string, unknown>);
    }
  }
  return out;
}

function expectInvalidBlockIdReason(
  value: string,
  reason: string,
  extra?: Record<string, unknown>,
) {
  const parsed = patchBlockInputSchema.safeParse({
    target_mode: "specific",
    vault: "Knowledge",
    path: "n.md",
    block_id: value,
    content: "x",
  });
  expect(parsed.success).toBe(false);
  if (parsed.success) return;
  const params = customIssueParams(parsed.error);
  const match = params.find((p) => p.code === "INVALID_BLOCK_ID" && p.reason === reason);
  expect(match, `expected INVALID_BLOCK_ID/${reason} for ${JSON.stringify(value)}`).toBeDefined();
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      expect(match![k]).toBe(v);
    }
  }
}

describe("patchBlockInputSchema — happy paths", () => {
  it("accepts specific mode with vault + path + block_id + content", () => {
    const parsed = patchBlockInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "Daily Notes/2026-05-25.md",
      block_id: "intro-summary",
      content: "new lead-in",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts specific mode with `file` instead of `path`", () => {
    const parsed = patchBlockInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "Daily Notes/2026-05-25.md",
      block_id: "intro-summary",
      content: "new lead-in",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts active mode without vault/file/path", () => {
    const parsed = patchBlockInputSchema.safeParse({
      target_mode: "active",
      block_id: "intro-summary",
      content: "new lead-in",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts empty content (FR-007 replace-empty cohort parity)", () => {
    const parsed = patchBlockInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      block_id: "intro-summary",
      content: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts 1000-char block_id (boundary)", () => {
    const parsed = patchBlockInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      block_id: "a".repeat(1000),
      content: "x",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("patchBlockInputSchema — INVALID_BLOCK_ID cohort (FR-019)", () => {
  it("empty block_id → reason='empty'", () => {
    expectInvalidBlockIdReason("", "empty");
  });

  it("leading caret '^foo' → reason='leading-caret'", () => {
    expectInvalidBlockIdReason("^foo", "leading-caret");
  });

  it("underscore 'block_one' → reason='contains-invalid-chars' offending_index=5", () => {
    expectInvalidBlockIdReason("block_one", "contains-invalid-chars", { offending_index: 5 });
  });

  it("period 'v1.2' → reason='contains-invalid-chars' offending_index=2", () => {
    expectInvalidBlockIdReason("v1.2", "contains-invalid-chars", { offending_index: 2 });
  });

  it("colon 'block:dev' → reason='contains-invalid-chars' offending_index=5", () => {
    expectInvalidBlockIdReason("block:dev", "contains-invalid-chars", { offending_index: 5 });
  });

  it("space 'Block With Spaces' → reason='contains-invalid-chars'", () => {
    expectInvalidBlockIdReason("Block With Spaces", "contains-invalid-chars");
  });

  it("1001-char block_id → reason='too-long' value_length=1001", () => {
    expectInvalidBlockIdReason("a".repeat(1001), "too-long", { value_length: 1001 });
  });
});

describe("patchBlockInputSchema — target-mode refinement wiring (shared battery)", () => {
  it.each(
    targetModeWiringCases(
      { target_mode: "specific", vault: "V", path: "n.md", block_id: "b", content: "x" },
      { target_mode: "active", block_id: "b", content: "x" },
    ),
  )("$label", ({ input, valid, issuePath }) => {
    const r = patchBlockInputSchema.safeParse(input);
    expect(r.success).toBe(valid);
    if (!valid && issuePath && !r.success) {
      expect(r.error.issues.some((i) => i.path.includes(issuePath))).toBe(true);
    }
  });
});

describe("patchBlockInputSchema — misc validation", () => {
  it("missing required block_id → fails", () => {
    const parsed = patchBlockInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("missing required content → fails", () => {
    const parsed = patchBlockInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      block_id: "foo",
    });
    expect(parsed.success).toBe(false);
  });

  it("non-string block_id → fails", () => {
    const parsed = patchBlockInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      block_id: 42,
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("patchBlockOutputSchema", () => {
  it("accepts a well-formed envelope", () => {
    const parsed = patchBlockOutputSchema.safeParse({
      path: "Daily Notes/2026-05-25.md",
      vault: "Knowledge",
      block_id: "intro-summary",
      block_shape: "paragraph",
      bytes_written: 412,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown top-level keys (strict)", () => {
    const parsed = patchBlockOutputSchema.safeParse({
      path: "n.md",
      vault: "v",
      block_id: "foo",
      block_shape: "paragraph",
      bytes_written: 100,
      extra: 1,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects negative bytes_written", () => {
    const parsed = patchBlockOutputSchema.safeParse({
      path: "n.md",
      vault: "v",
      block_id: "foo",
      block_shape: "paragraph",
      bytes_written: -1,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects non-integer bytes_written", () => {
    const parsed = patchBlockOutputSchema.safeParse({
      path: "n.md",
      vault: "v",
      block_id: "foo",
      block_shape: "paragraph",
      bytes_written: 1.5,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects block_shape outside the success enum (e.g. on-heading-atx)", () => {
    const parsed = patchBlockOutputSchema.safeParse({
      path: "n.md",
      vault: "v",
      block_id: "foo",
      block_shape: "on-heading-atx",
      bytes_written: 100,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects block_shape outside the success enum (e.g. on-heading-setext)", () => {
    const parsed = patchBlockOutputSchema.safeParse({
      path: "n.md",
      vault: "v",
      block_id: "foo",
      block_shape: "on-heading-setext",
      bytes_written: 100,
    });
    expect(parsed.success).toBe(false);
  });
});
