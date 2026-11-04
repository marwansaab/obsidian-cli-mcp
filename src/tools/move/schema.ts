// Original — no upstream. move input/output schemas — flat target-mode primitive extension; to: z.string().min(1); moved z.literal(true) success-only output shape; BI-0177: the `{ ok: true, blocker }` envelope of the blocked-destination lookup eval.
import { z } from "zod";

import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const moveInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    to: z
      .string()
      .min(1)
      .describe(
        'Vault-relative destination: a folder ending in "/" (e.g. "Archive/") keeps the file name, otherwise a full new path (e.g. "Archive/Old.md"). A new name without an extension keeps the file\'s own; an extension of a different file type is rejected.',
      ),
  }),
);

export const moveOutputSchema = z
  .strictObject({
    moved: z.literal(true),
    fromPath: z.string(),
    toPath: z.string(),
  });

/** BI-0177: the blocked-destination lookup's answer — the first folder prefix that is a file, or null. */
export const moveBlockerEnvelopeSchema = z.strictObject({
  ok: z.literal(true),
  blocker: z.string().nullable(),
});

export type MoveInput = z.infer<typeof moveInputSchema>;
export type MoveOutput = z.infer<typeof moveOutputSchema>;
