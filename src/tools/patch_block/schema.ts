// Original — no upstream. patch_block input/output schemas per BI-043 / ADR-009 — bare block_id locator with alphanumeric+hyphen alphabet (FR-004), four INVALID_BLOCK_ID sub-reasons (FR-019), 1000-UTF-16 cap (cohort parity with BI-033 / BI-038 / BI-039 / BI-040), single-mode replace with empty-content acceptance (FR-007), target-mode primitive via applyTargetModeRefinement.
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

const BLOCK_ID_MAX = 1000;
const BLOCK_ID_ALPHABET = /^[A-Za-z0-9-]+$/;

const blockIdField = z.string().superRefine((value, ctx) => {
  if (value.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: "block_id must not be empty",
      params: { code: "INVALID_BLOCK_ID", reason: "empty" },
    });
    return;
  }
  if (value.length > BLOCK_ID_MAX) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message: `block_id must be ≤ ${BLOCK_ID_MAX} UTF-16 code units (got ${value.length})`,
      params: {
        code: "INVALID_BLOCK_ID",
        reason: "too-long",
        value_length: value.length,
      },
    });
    return;
  }
  if (value.charCodeAt(0) === 94 /* ^ */) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message:
        "block_id must not begin with '^' — the caret is the wikilink delimiter, not part of the identifier",
      params: { code: "INVALID_BLOCK_ID", reason: "leading-caret" },
    });
    return;
  }
  if (!BLOCK_ID_ALPHABET.test(value)) {
    // Find the 0-indexed position of the first character outside [A-Za-z0-9-].
    let offending = -1;
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      const ok =
        (c >= 48 && c <= 57) || // 0-9
        (c >= 65 && c <= 90) || // A-Z
        (c >= 97 && c <= 122) || // a-z
        c === 45; // -
      if (!ok) {
        offending = i;
        break;
      }
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [],
      message:
        "block_id must match the alphanumeric + hyphen alphabet ([A-Za-z0-9-]+)",
      params: {
        code: "INVALID_BLOCK_ID",
        reason: "contains-invalid-chars",
        offending_index: offending,
      },
    });
  }
});

export const patchBlockInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    file: safePathField.optional(),
    path: safePathField.optional(),
    block_id: blockIdField,
    content: z.string(),
  }),
);

export const patchBlockOutputSchema = z
  .object({
    path: z.string(),
    vault: z.string(),
    block_id: z.string(),
    block_shape: z.enum(["paragraph", "list-item", "separately-placed"]),
    bytes_written: z.number().int().min(0),
  })
  .strict();

export type PatchBlockInput = z.infer<typeof patchBlockInputSchema>;
export type PatchBlockOutput = z.infer<typeof patchBlockOutputSchema>;
