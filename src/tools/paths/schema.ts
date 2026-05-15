// Original — no upstream. paths input/output/eval-envelope schemas — STANDARD target_mode discriminator with .omit({file:true, path:true}) so the published JSON Schema lacks the file/path locator fields (folder-scoped surface); optional folder/depth/ext/total; strict additionalProperties; discriminated-union eval-envelope wire format with success branch {count, paths} and failure branch {code: "FOLDER_NOT_FOUND" | "NOT_A_FOLDER", folder}.
import { z } from "zod";

import {
  applyTargetModeRefinementForFolderScoped,
  targetModeBaseSchema,
} from "../../target-mode/target-mode.js";

export const pathsInputSchema = applyTargetModeRefinementForFolderScoped(
  targetModeBaseSchema.omit({ file: true, path: true }).extend({
    folder: z.string().min(1).optional(),
    depth: z.number().int().positive().optional(),
    ext: z.string().min(1).optional(),
    total: z.boolean().optional(),
  }),
);

export const pathsOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
  })
  .strict();

const pathsEnvelopeOk = z
  .object({
    ok: z.literal(true),
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
  })
  .strict();

const pathsEnvelopeError = z
  .object({
    ok: z.literal(false),
    code: z.enum(["FOLDER_NOT_FOUND", "NOT_A_FOLDER"]),
    folder: z.string(),
  })
  .strict();

export const pathsEvalEnvelopeSchema = z.discriminatedUnion("ok", [
  pathsEnvelopeOk,
  pathsEnvelopeError,
]);

export type PathsInput = z.infer<typeof pathsInputSchema>;
export type PathsOutput = z.infer<typeof pathsOutputSchema>;
export type PathsEvalEnvelope = z.infer<typeof pathsEvalEnvelopeSchema>;
