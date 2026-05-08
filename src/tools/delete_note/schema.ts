// Original — no upstream. delete_note input/output schemas — flat target-mode primitive extension; permanent default false; deleted z.literal(true) success-only output shape.
import { z } from "zod";

import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const deleteNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    permanent: z.boolean().optional().default(false),
  }),
);

export const deleteNoteOutputSchema = z
  .object({
    deleted: z.literal(true),
    path: z.string(),
    toTrash: z.boolean(),
  })
  .strict();

export type DeleteNoteInput = z.infer<typeof deleteNoteInputSchema>;
export type DeleteNoteOutput = z.infer<typeof deleteNoteOutputSchema>;
