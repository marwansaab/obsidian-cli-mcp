// Original — no upstream. files input/output schemas — folder-scoped target-mode refinement (forbids file AND path in BOTH modes); optional folder/ext/total fields with R15 empty-string rejection; strict output { count, paths }.
import { z } from "zod";

import {
  applyTargetModeRefinementForFolderScoped,
  folderScopedTargetModeBaseSchema,
} from "../../target-mode/target-mode.js";

export const filesInputSchema = applyTargetModeRefinementForFolderScoped(
  folderScopedTargetModeBaseSchema.extend({
    folder: z
      .string()
      .min(1)
      .optional()
      .describe('Vault-relative folder to list, non-recursively (e.g. "Projects"). Default: the vault root.'),
    ext: z
      .string()
      .min(1)
      .optional()
      .describe('File extension filter without the dot (e.g. "md"). Default: all extensions.'),
    total: z
      .boolean()
      .optional()
      .describe("When true, return only the count with an empty paths list. Default false."),
  }),
);

export const listFilesOutputSchema = z
  .strictObject({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
  });

export type ListFilesInput = z.infer<typeof filesInputSchema>;
export type ListFilesOutput = z.infer<typeof listFilesOutputSchema>;
