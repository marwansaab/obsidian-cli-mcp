// Original — no upstream. files input/output schemas — folder-scoped target-mode refinement (forbids file AND path in BOTH modes); optional folder/ext/total fields with R15 empty-string rejection; strict output { count, paths }.
import { z } from "zod";

import {
  applyTargetModeRefinementForFolderScoped,
  targetModeBaseSchema,
} from "../../target-mode/target-mode.js";

export const filesInputSchema = applyTargetModeRefinementForFolderScoped(
  targetModeBaseSchema.extend({
    folder: z.string().min(1).optional(),
    ext: z.string().min(1).optional(),
    total: z.boolean().optional(),
  }),
);

export const listFilesOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
  })
  .strict();

export type ListFilesInput = z.infer<typeof filesInputSchema>;
export type ListFilesOutput = z.infer<typeof listFilesOutputSchema>;
