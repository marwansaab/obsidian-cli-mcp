// Original — no upstream. rename input/output schemas — flat target-mode primitive extension; name with min(1) + folder-separator-rejection regex per /speckit-clarify Q2; renamed z.literal(true) success-only output shape.
import { z } from "zod";

import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const renameInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    name: z
      .string()
      .min(1)
      .regex(
        /^[^/\\]+$/,
        "name must not contain folder separators; use move_note to relocate the file to a different folder",
      ),
  }),
);

export const renameNoteOutputSchema = z
  .object({
    renamed: z.literal(true),
    fromPath: z.string(),
    toPath: z.string(),
  })
  .strict();

export type RenameNoteInput = z.infer<typeof renameInputSchema>;
export type RenameNoteOutput = z.infer<typeof renameNoteOutputSchema>;
