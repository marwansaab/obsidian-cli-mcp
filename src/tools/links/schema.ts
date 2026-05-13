// Original — no upstream. links input/output/eval-envelope schemas — standard target-mode refinement (specific-requires-vault + file/path XOR, active forbids vault/file/path) extended with optional total boolean for count-only mode; strict per-entry shape locks the four-field public contract (target/line/kind/displayText?) and the closed three-value kind enum (Q3); discriminated-union eval-envelope wire format mirrors the in-eval IIFE return shape.
import { z } from "zod";

import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const linksInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    total: z.boolean().optional(),
  }),
);

export const linkKindEnum = z.enum(["wikilink", "embed", "markdown"] as const);
export type LinkKind = z.infer<typeof linkKindEnum>;

export const linkEntrySchema = z
  .object({
    target: z.string(),
    line: z.number().int().positive(),
    kind: linkKindEnum,
    displayText: z.string().optional(),
  })
  .strict();

export const linksOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    links: z.array(linkEntrySchema),
  })
  .strict();

export const LINKS_EVAL_ERROR_CODES = [
  "NO_ACTIVE_FILE",
  "FILE_NOT_FOUND",
  "NOT_MARKDOWN",
] as const;
export type LinksEvalErrorCode = (typeof LINKS_EVAL_ERROR_CODES)[number];

export const linksEvalResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      count: z.number().int().nonnegative(),
      links: z.array(linkEntrySchema),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      code: z.enum(LINKS_EVAL_ERROR_CODES),
      detail: z.string(),
    })
    .strict(),
]);

export type LinksInput = z.infer<typeof linksInputSchema>;
export type LinksOutput = z.infer<typeof linksOutputSchema>;
export type LinkEntry = z.infer<typeof linkEntrySchema>;
export type LinksEvalResponse = z.infer<typeof linksEvalResponseSchema>;
