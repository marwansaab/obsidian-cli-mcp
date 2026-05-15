// Original — no upstream. move input/output schemas — flat target-mode primitive extension; to: z.string().min(1); moved z.literal(true) success-only output shape.
import { z } from "zod";

import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const moveInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    to: z.string().min(1),
  }),
);

export const moveOutputSchema = z
  .object({
    moved: z.literal(true),
    fromPath: z.string(),
    toPath: z.string(),
  })
  .strict();

export type MoveInput = z.infer<typeof moveInputSchema>;
export type MoveOutput = z.infer<typeof moveOutputSchema>;
