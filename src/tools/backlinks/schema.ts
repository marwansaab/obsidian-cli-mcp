// Original — no upstream. backlinks input/output/eval-envelope schemas — standard target-mode refinement extended with optional with_counts/total/limit; strict per-entry shape carries source + optional count; discriminated-union eval-envelope wire format mirrors the in-eval IIFE return shape including optional truncated field.
import { z } from "zod";

import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const backlinksInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    with_counts: z.boolean().optional(),
    total: z.boolean().optional(),
    limit: z.number().int().min(1).max(10000).optional(),
  }),
);

export const backlinkEntrySchema = z
  .object({
    source: z.string(),
    count: z.number().int().positive().optional(),
  })
  .strict();

export const backlinksOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    backlinks: z.array(backlinkEntrySchema),
    truncated: z.boolean().optional(),
  })
  .strict();

export const BACKLINKS_EVAL_ERROR_CODES = [
  "NO_ACTIVE_FILE",
  "FILE_NOT_FOUND",
  "NOT_MARKDOWN",
] as const;
export type BacklinksEvalErrorCode = (typeof BACKLINKS_EVAL_ERROR_CODES)[number];

export const backlinksEvalResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      count: z.number().int().nonnegative(),
      backlinks: z.array(backlinkEntrySchema),
      truncated: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      code: z.enum(BACKLINKS_EVAL_ERROR_CODES),
      detail: z.string(),
    })
    .strict(),
]);

export type BacklinksInput = z.infer<typeof backlinksInputSchema>;
export type BacklinksOutput = z.infer<typeof backlinksOutputSchema>;
export type BacklinkEntry = z.infer<typeof backlinkEntrySchema>;
export type BacklinksEvalResponse = z.infer<typeof backlinksEvalResponseSchema>;
