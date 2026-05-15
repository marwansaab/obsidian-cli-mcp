// Original — no upstream. tree input/output/eval-envelope schemas — STANDARD target_mode discriminator with folder-scoped refinement (forbids file/path in both modes; vault required in specific; vault forbidden in active); optional folder/depth/ext/total per BI-029 data-model.md; strict additionalProperties; discriminated-union eval-envelope wire format with success branch {count, paths} and failure branch {code: "FOLDER_NOT_FOUND" | "NOT_A_FOLDER", folder}.
import { z } from "zod";

import {
  applyTargetModeRefinementForFolderScoped,
  targetModeBaseSchema,
} from "../../target-mode/target-mode.js";

export const treeInputSchema = applyTargetModeRefinementForFolderScoped(
  targetModeBaseSchema.extend({
    folder: z.string().min(1).optional(),
    depth: z.number().int().positive().optional(),
    ext: z.string().min(1).optional(),
    total: z.boolean().optional(),
  }),
);

export const treeOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
  })
  .strict();

const treeEnvelopeOk = z
  .object({
    ok: z.literal(true),
    count: z.number().int().nonnegative(),
    paths: z.array(z.string()),
  })
  .strict();

const treeEnvelopeError = z
  .object({
    ok: z.literal(false),
    code: z.enum(["FOLDER_NOT_FOUND", "NOT_A_FOLDER"]),
    folder: z.string(),
  })
  .strict();

export const treeEvalEnvelopeSchema = z.discriminatedUnion("ok", [
  treeEnvelopeOk,
  treeEnvelopeError,
]);

export type TreeInput = z.infer<typeof treeInputSchema>;
export type TreeOutput = z.infer<typeof treeOutputSchema>;
export type TreeEvalEnvelope = z.infer<typeof treeEvalEnvelopeSchema>;
