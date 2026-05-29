// Original — no upstream. patch_heading input/output schemas per BI-040 / ADR-009 — heading_path locator with `#` separator and 2-segment minimum (FR-002 / FR-004); five INVALID_HEADING_PATH sub-reasons via Zod refinement (FR-018); EMPTY_CONTENT superRefine asymmetric across modes per FR-018a (append/prepend reject empty, replace accepts); target_mode primitive via applyTargetModeRefinement.
import { z } from "zod";

import {
  isStructurallySafePath,
  STRUCTURALLY_UNSAFE_PATH_MESSAGE,
} from "../../path-safety/schema.js";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

const safePathField = z
  .string()
  .min(1)
  .refine(isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE);

const HEADING_PATH_MAX = 1000;

const headingPathField = z.string().superRefine((value, ctx) => {
  if (value.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: "heading_path must not be empty",
      params: { code: "INVALID_HEADING_PATH", reason: "empty" },
    });
    return;
  }
  if (value.length > HEADING_PATH_MAX) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: `heading_path must be ≤ ${HEADING_PATH_MAX} UTF-16 code units (got ${value.length})`,
      params: {
        code: "INVALID_HEADING_PATH",
        reason: "too-long",
        value_length: value.length,
      },
    });
    return;
  }
  const segments = value.split("#");
  if (segments.length < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message:
        "heading_path must contain at least two segments separated by '#'; top-level headings are out of scope",
      params: { code: "INVALID_HEADING_PATH", reason: "single-segment" },
    });
    return;
  }
  for (let i = 0; i < segments.length; i++) {
    if (segments[i]!.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message:
          "heading_path segments must be non-empty (no '##', no leading or trailing '#')",
        params: {
          code: "INVALID_HEADING_PATH",
          reason: "empty-segment",
          segment_index: i,
        },
      });
      return;
    }
    // DEFENSIVE sentinel — unreachable: `segments` derives from value.split("#"), so no
    // element can contain "#"; this guard can never fire through any constructible input.
    /* v8 ignore start */
    if (segments[i]!.includes("#")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: "heading_path segment must not contain '#' (defensive sentinel)",
        params: {
          code: "INVALID_HEADING_PATH",
          reason: "contains-hash",
          segment_index: i,
        },
      });
      return;
    }
    /* v8 ignore stop */
  }
});

export const patchHeadingInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    file: safePathField.optional(),
    path: safePathField.optional(),
    heading_path: headingPathField,
    mode: z.enum(["append", "prepend", "replace"]),
    content: z.string(),
  }),
).superRefine((input, ctx) => {
  if (input.content === "" && (input.mode === "append" || input.mode === "prepend")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content"],
      message: `content must be non-empty for mode='${input.mode}'; use mode='replace' to clear a heading's direct body`,
      params: {
        code: "EMPTY_CONTENT",
        reason: input.mode,
        mode: input.mode,
      },
    });
  }
});

export const patchHeadingOutputSchema = z
  .object({
    path: z.string(),
    vault: z.string(),
    heading_path: z.string(),
    mode: z.enum(["append", "prepend", "replace"]),
    bytes_written: z.number().int().min(0),
  })
  .strict();

export type PatchHeadingInput = z.infer<typeof patchHeadingInputSchema>;
export type PatchHeadingOutput = z.infer<typeof patchHeadingOutputSchema>;
