// Original — no upstream. smart_connections_query input/output/eval-envelope schemas — flat schema (NO target_mode per FR-001/R4); strict per-entry matchEntrySchema locks the exhaustive three-field public contract {path, headingPath, score} (block-level per BI-026 R7 inheritance); discriminated-union eval-envelope wire format with 3 error codes (vs BI-026's 6) — the two NOT_READY sub-discriminators (`api-missing` / `embed-failed`) ride on separate envelope codes for parse-time discrimination; handler unflattens to `details.code='SMART_CONNECTIONS_NOT_READY'` + `details.reason='<sub>'` per ADR-015.
import { z } from "zod";

export const smartConnectionsQueryInputSchema = z
  .object({
    query: z.string().trim().min(1).max(4000),
    vault: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).default(20),
    total: z.boolean().optional(),
  })
  .strict();

export const matchEntrySchema = z
  .object({
    path: z.string().endsWith(".md"),
    headingPath: z.array(z.string()),
    score: z.number().finite(),
  })
  .strict();

export const smartConnectionsQueryOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    matches: z.array(matchEntrySchema),
  })
  .strict();

export const SMART_CONNECTIONS_QUERY_EVAL_ERROR_CODES = [
  "SMART_CONNECTIONS_NOT_INSTALLED",
  "SMART_CONNECTIONS_NOT_READY_API_MISSING",
  "SMART_CONNECTIONS_NOT_READY_EMBED_FAILED",
] as const;
export type SmartConnectionsQueryEvalErrorCode =
  (typeof SMART_CONNECTIONS_QUERY_EVAL_ERROR_CODES)[number];

export const smartConnectionsQueryEvalResponseSchema = z.discriminatedUnion("ok", [
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
      code: z.enum(SMART_CONNECTIONS_QUERY_EVAL_ERROR_CODES),
      detail: z.string(),
    })
    .strict(),
]);

export type SmartConnectionsQueryInput = z.infer<typeof smartConnectionsQueryInputSchema>;
export type SmartConnectionsQueryOutput = z.infer<typeof smartConnectionsQueryOutputSchema>;
export type MatchEntry = z.infer<typeof matchEntrySchema>;
export type SmartConnectionsQueryEvalResponse = z.infer<
  typeof smartConnectionsQueryEvalResponseSchema
>;
