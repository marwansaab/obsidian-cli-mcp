// Original — no upstream. write_note input/output schemas per ADR-009 — direct-fs-write redesign: `template` parameter dropped (strict-mode rejects); `file`/`path` fields gated by structural path-safety refinement; active-mode disallows `vault`/`file`/`path`/`open` (via target-mode primitive) and requires `overwrite: true`.
import { z } from "zod";

import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";
import {
  isStructurallySafePath,
  STRUCTURALLY_UNSAFE_PATH_MESSAGE,
} from "../../path-safety/schema.js";

const safePathField = z
  .string()
  .min(1)
  .refine(isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE);

export const writeNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    file: safePathField.optional(),
    path: safePathField.optional(),
    content: z.string(),
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
