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
      )
      .describe(
        'New file name, in the same folder (e.g. "Renamed Note"); no "/" or "\\". Without an extension the file keeps its own (a canvas stays a canvas); an extension of a different file type is rejected.',
      ),
  }),
);

export const renameNoteOutputSchema = z
  .strictObject({
    renamed: z.literal(true),
    fromPath: z.string(),
    toPath: z.string(),
  });

export type RenameNoteInput = z.infer<typeof renameInputSchema>;
export type RenameNoteOutput = z.infer<typeof renameNoteOutputSchema>;
