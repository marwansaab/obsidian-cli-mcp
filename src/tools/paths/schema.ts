// Original — no upstream. paths input/output/eval-envelope schemas — STANDARD target_mode discriminator with .omit({file:true, path:true}) so the published JSON Schema lacks the file/path locator fields (folder-scoped surface); optional folder/depth/ext/total; strict additionalProperties; discriminated-union eval-envelope wire format with success branch {count, paths} and failure branch {code: "FOLDER_NOT_FOUND" | "NOT_A_FOLDER", folder}.
import { z } from "zod";

import {
  applyTargetModeRefinementForFolderScoped,
  folderScopedTargetModeBaseSchema,
} from "../../target-mode/target-mode.js";

export const pathsInputSchema = applyTargetModeRefinementForFolderScoped(
  folderScopedTargetModeBaseSchema.omit({ file: true, path: true }).extend({
    folder: z
      .string()
      .min(1)
      .optional()
      .describe('Vault-relative folder to list recursively (e.g. "Projects"). Default: the vault root.'),
    depth: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Maximum folder depth below folder to descend, positive integer. Default: unlimited."),
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

export const pathsOutputSchema = z
  .strictObject({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
  });

const pathsEnvelopeOk = z
  .strictObject({
    ok: z.literal(true),
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
  });

const pathsEnvelopeError = z
  .strictObject({
    ok: z.literal(false),
    code: z.enum(["FOLDER_NOT_FOUND", "NOT_A_FOLDER"]),
    folder: z.string(),
  });

export const pathsEvalEnvelopeSchema = z.discriminatedUnion("ok", [
  pathsEnvelopeOk,
  pathsEnvelopeError,
]);

export type PathsInput = z.infer<typeof pathsInputSchema>;
export type PathsOutput = z.infer<typeof pathsOutputSchema>;
export type PathsEvalEnvelope = z.infer<typeof pathsEvalEnvelopeSchema>;
