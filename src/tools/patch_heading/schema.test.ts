// Original — no upstream. patch_heading schema-validation cohort per BI-040 / Principle II — INVALID_HEADING_PATH five sub-reasons (FR-018), EMPTY_CONTENT asymmetric per FR-018a, target-mode primitive interaction, output strict-shape.
import { describe, expect, it } from "vitest";

import { targetModeWiringCases } from "../_target-mode-test-cases.js";
import { patchHeadingInputSchema, patchHeadingOutputSchema } from "./schema.js";

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

function expectInvalidHeadingPathReason(value: string, reason: string, extra?: Record<string, unknown>) {
  const parsed = patchHeadingInputSchema.safeParse({
    target_mode: "specific",
    vault: "Knowledge",
    path: "n.md",
    heading_path: value,
    mode: "append",
    content: "x",
  });
  expect(parsed.success).toBe(false);
  if (parsed.success) return;
  const params = customIssueParams(parsed.error);
  const match = params.find((p) => p.code === "INVALID_HEADING_PATH" && p.reason === reason);
  expect(match, `expected INVALID_HEADING_PATH/${reason} for ${JSON.stringify(value)}`).toBeDefined();
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      expect(match![k]).toBe(v);
    }
  }
}

describe("patchHeadingInputSchema — happy paths", () => {
  it("accepts specific mode with vault + path + 2-segment heading_path + append + content", () => {
    const parsed = patchHeadingInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "Daily Notes/2026-05-21.md",
      heading_path: "Daily#Tasks#TODO",
      mode: "append",
      content: "- new item\n",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts specific mode with `file` instead of `path`", () => {
    const parsed = patchHeadingInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "Daily Notes/2026-05-21.md",
      heading_path: "Daily#Tasks",
      mode: "prepend",
      content: "lead-in\n",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts active mode without vault/file/path", () => {
    const parsed = patchHeadingInputSchema.safeParse({
      target_mode: "active",
      heading_path: "Daily#Tasks",
      mode: "replace",
      content: "",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("patchHeadingInputSchema — INVALID_HEADING_PATH cohort (FR-018)", () => {
  it("empty heading_path → reason='empty'", () => {
    expectInvalidHeadingPathReason("", "empty");
  });

  it("single-segment 'Tasks' → reason='single-segment'", () => {
    expectInvalidHeadingPathReason("Tasks", "single-segment");
  });

  it("middle empty segment 'Top##Sub' → reason='empty-segment'", () => {
    expectInvalidHeadingPathReason("Top##Sub", "empty-segment", { segment_index: 1 });
  });

  it("leading '#' '#Top#Sub' → reason='empty-segment' segment_index=0", () => {
    expectInvalidHeadingPathReason("#Top#Sub", "empty-segment", { segment_index: 0 });
  });

  it("trailing '#' 'Top#Sub#' → reason='empty-segment' segment_index=2", () => {
    expectInvalidHeadingPathReason("Top#Sub#", "empty-segment", { segment_index: 2 });
  });

  it("1001-char heading_path → reason='too-long' value_length=1001", () => {
    const huge = "A".repeat(1001);
    expectInvalidHeadingPathReason(huge, "too-long", { value_length: 1001 });
  });
});

describe("patchHeadingInputSchema — EMPTY_CONTENT cohort (FR-018a)", () => {
  it("mode='append' + empty content → EMPTY_CONTENT reason='append'", () => {
    const parsed = patchHeadingInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      heading_path: "Top#Sub",
      mode: "append",
      content: "",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const params = customIssueParams(parsed.error);
    const match = params.find((p) => p.code === "EMPTY_CONTENT");
    expect(match).toBeDefined();
    expect(match!.reason).toBe("append");
    expect(match!.mode).toBe("append");
  });

  it("mode='prepend' + empty content → EMPTY_CONTENT reason='prepend'", () => {
    const parsed = patchHeadingInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      heading_path: "Top#Sub",
      mode: "prepend",
      content: "",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const params = customIssueParams(parsed.error);
    const match = params.find((p) => p.code === "EMPTY_CONTENT");
    expect(match).toBeDefined();
    expect(match!.reason).toBe("prepend");
  });

  it("mode='replace' + empty content → ACCEPTED (no EMPTY_CONTENT fires)", () => {
    const parsed = patchHeadingInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      heading_path: "Top#Sub",
      mode: "replace",
      content: "",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("patchHeadingInputSchema — target-mode refinement wiring (shared battery)", () => {
  it.each(
    targetModeWiringCases(
      { target_mode: "specific", vault: "V", path: "n.md", heading_path: "H#K", mode: "replace", content: "x" },
      { target_mode: "active", heading_path: "H#K", mode: "replace", content: "x" },
    ),
  )("$label", ({ input, valid, issuePath }) => {
    const r = patchHeadingInputSchema.safeParse(input);
    expect(r.success).toBe(valid);
    if (!valid && issuePath && !r.success) {
      expect(r.error.issues.some((i) => i.path.includes(issuePath))).toBe(true);
    }
  });
});

describe("patchHeadingInputSchema — misc validation", () => {
  it("missing required heading_path → fails", () => {
    const parsed = patchHeadingInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      mode: "append",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("missing required mode → fails", () => {
    const parsed = patchHeadingInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      heading_path: "A#B",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("missing required content → fails", () => {
    const parsed = patchHeadingInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      heading_path: "A#B",
      mode: "append",
    });
    expect(parsed.success).toBe(false);
  });

  it("non-string heading_path → fails", () => {
    const parsed = patchHeadingInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      heading_path: 42,
      mode: "append",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("mode outside enum → fails", () => {
    const parsed = patchHeadingInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      heading_path: "A#B",
      mode: "splice",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("patchHeadingOutputSchema", () => {
  it("accepts a well-formed envelope", () => {
    const parsed = patchHeadingOutputSchema.safeParse({
      path: "Daily Notes/2026-05-21.md",
      vault: "Knowledge",
      heading_path: "Daily#Tasks#TODO",
      mode: "append",
      bytes_written: 412,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown top-level keys (strict)", () => {
    const parsed = patchHeadingOutputSchema.safeParse({
      path: "n.md",
      vault: "v",
      heading_path: "A#B",
      mode: "append",
      bytes_written: 100,
      extra: 1,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects negative bytes_written", () => {
    const parsed = patchHeadingOutputSchema.safeParse({
      path: "n.md",
      vault: "v",
      heading_path: "A#B",
      mode: "append",
      bytes_written: -1,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects non-integer bytes_written", () => {
    const parsed = patchHeadingOutputSchema.safeParse({
      path: "n.md",
      vault: "v",
      heading_path: "A#B",
      mode: "append",
      bytes_written: 1.5,
    });
    expect(parsed.success).toBe(false);
  });
});
