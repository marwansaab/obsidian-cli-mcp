// Original — no upstream. outline input/output/upstream-wire schemas — standard file-scoped target-mode refinement (specific-requires-vault + file/path XOR, active forbids vault/file/path); optional total boolean for count-only mode; strict output { count, headings: [{ level, text, line }] } across both modes; passthrough upstream array schema tolerant to future upstream field additions.
import { z } from "zod";

import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const outlineInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    total: z.boolean().optional(),
  }),
);

export const outlineHeadingSchema = z
  .object({
    level: z.number().int().min(1).max(6),
    text: z.string(),
    line: z.number().int().positive(),
  })
  .strict();

export const outlineOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    headings: z.array(outlineHeadingSchema),
  })
  .strict();

const outlineUpstreamHeadingSchema = z
  .object({
    level: z.number().int().min(1).max(6),
    heading: z.string(),
    line: z.number().int().positive(),
  })
  .passthrough();

export const outlineUpstreamArraySchema = z.array(outlineUpstreamHeadingSchema);

export type OutlineInput = z.infer<typeof outlineInputSchema>;
export type OutlineOutput = z.infer<typeof outlineOutputSchema>;
export type OutlineHeading = z.infer<typeof outlineHeadingSchema>;
