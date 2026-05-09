// Original — no upstream. read_heading input/output/eval-envelope schemas — standard target_mode discriminator extension; structural-only heading-path validator (FR-006 / FR-007 — split on ::, require >=2 non-empty segments); paths-only output; discriminated-union eval-envelope wire format.
import { z } from "zod";

import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const HEADING_PATH_SEPARATOR = "::";

export function validateHeadingPath(value: string): true | string {
  const segments = value.split(HEADING_PATH_SEPARATOR);
  if (segments.length < 2) {
    return 'heading must contain at least two `::`-separated segments (e.g. "H1::H2")';
  }
  if (segments.some((s) => s.length === 0)) {
    return "heading segments must be non-empty (no leading/trailing `::`, no consecutive `::`)";
  }
  return true;
}

export const readHeadingInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    heading: z
      .string()
      .min(1)
      .refine(
        (v) => validateHeadingPath(v) === true,
        (v) => ({ message: validateHeadingPath(v) as string }),
      ),
  }),
);

export const readHeadingOutputSchema = z
  .object({
    content: z.string(),
  })
  .strict();

export const READ_HEADING_EVAL_ERROR_CODES = [
  "FILE_NOT_FOUND",
  "HEADING_NOT_FOUND",
  "NO_ACTIVE_FILE",
] as const;
export type ReadHeadingEvalErrorCode = (typeof READ_HEADING_EVAL_ERROR_CODES)[number];

export const readHeadingEvalResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), content: z.string() }).strict(),
  z
    .object({
      ok: z.literal(false),
      code: z.enum(READ_HEADING_EVAL_ERROR_CODES),
      detail: z.string(),
    })
    .strict(),
]);

export type ReadHeadingInput = z.infer<typeof readHeadingInputSchema>;
export type ReadHeadingOutput = z.infer<typeof readHeadingOutputSchema>;
export type ReadHeadingEvalResponse = z.infer<typeof readHeadingEvalResponseSchema>;
