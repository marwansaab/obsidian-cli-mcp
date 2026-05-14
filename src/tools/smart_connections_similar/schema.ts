// Original — no upstream. smart_connections_similar input/output/eval-envelope schemas — standard target-mode refinement (specific-requires-vault + file/path XOR, active forbids vault/file/path) extended with limit (int 1..100 default 20) + total (optional boolean); strict per-entry matchEntrySchema locks the exhaustive three-field public contract {path, headingPath, score} (block-level per the 2026-05-15 live-probe-driven amendment to grilling-Q3); six-code discriminated-union eval-envelope wire format (NO_ACTIVE_FILE / FILE_NOT_FOUND / NOT_MARKDOWN / SMART_CONNECTIONS_NOT_INSTALLED / SMART_CONNECTIONS_NOT_READY / SOURCE_NOT_INDEXED).
import { z } from "zod";

import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const smartConnectionsSimilarInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    limit: z.number().int().min(1).max(100).default(20),
    total: z.boolean().optional(),
  }),
);

export const matchEntrySchema = z
  .object({
    path: z.string().endsWith(".md"),
    headingPath: z.array(z.string()),
    score: z.number().finite(),
  })
  .strict();

export const smartConnectionsSimilarOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    matches: z.array(matchEntrySchema),
  })
  .strict();

export const SMART_CONNECTIONS_SIMILAR_EVAL_ERROR_CODES = [
  "NO_ACTIVE_FILE",
  "FILE_NOT_FOUND",
  "NOT_MARKDOWN",
  "SMART_CONNECTIONS_NOT_INSTALLED",
  "SMART_CONNECTIONS_NOT_READY",
  "SOURCE_NOT_INDEXED",
] as const;
export type SmartConnectionsSimilarEvalErrorCode =
  (typeof SMART_CONNECTIONS_SIMILAR_EVAL_ERROR_CODES)[number];

export const smartConnectionsSimilarEvalResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      count: z.number().int().nonnegative(),
      matches: z.array(matchEntrySchema),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      code: z.enum(SMART_CONNECTIONS_SIMILAR_EVAL_ERROR_CODES),
      detail: z.string(),
    })
    .strict(),
]);

export type SmartConnectionsSimilarInput = z.infer<typeof smartConnectionsSimilarInputSchema>;
export type SmartConnectionsSimilarOutput = z.infer<typeof smartConnectionsSimilarOutputSchema>;
export type MatchEntry = z.infer<typeof matchEntrySchema>;
export type SmartConnectionsSimilarEvalResponse = z.infer<
  typeof smartConnectionsSimilarEvalResponseSchema
>;
