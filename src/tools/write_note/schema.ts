// Original — no upstream. write_note input/output schemas — flat target-mode primitive extension + active-mode superRefine clauses (Clarifications 2026-05-08).
import { z } from "zod";

import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const writeNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    content: z.string(),
    template: z.string().optional(),
    overwrite: z.boolean().optional().default(false),
    open: z.boolean().optional(),
  }),
).superRefine((input, ctx) => {
  if (input.target_mode !== "active") return;
  if (input.overwrite !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["overwrite"],
      message:
        "overwrite must be true in active mode (active mode is destructive by definition; explicit-opt-in posture binds uniformly)",
    });
  }
  if (input.template !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["template"],
      message: "template is not allowed in active mode",
    });
  }
  if (input.open !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["open"],
      message: "open is not allowed in active mode",
    });
  }
});

export const writeNoteOutputSchema = z
  .object({
    created: z.boolean(),
    path: z.string(),
  })
  .strict();

export type WriteNoteInput = z.infer<typeof writeNoteInputSchema>;
export type WriteNoteOutput = z.infer<typeof writeNoteOutputSchema>;
