// Original — no upstream. pattern_search input/output/eval-envelope schemas — ECMAScript-regex search predicate with optional folder scope, optional case_sensitive toggle (default true per FR-007), optional limit (1..10000, implicit 1000); strict per-entry match shape carries path/line/offset/match/text; discriminated-union eval-envelope wire format mirrors the in-eval IIFE return shape including FOLDER_NOT_FOUND failure branch.
import { z } from "zod";

export const patternSearchInputSchema = z
  .strictObject({
    pattern: z
      .string()
      .min(1, "pattern is required")
      .max(1000, "pattern exceeds 1000 chars")
      .describe("ECMAScript regular expression without slashes or flags, 1–1000 characters (e.g. TODO\\b)."),
    folder: z
      .string()
      .min(1)
      .optional()
      .describe("Vault-relative folder to search under, recursively (e.g. \"Projects\"). Default: the whole vault."),
    limit: z
      .number()
      .int()
      .min(1, "limit must be >= 1")
      .max(10000, "limit must be <= 10000")
      .optional()
      .describe("Maximum number of matches, integer 1–10000. Default 1000."),
    case_sensitive: z
      .boolean()
      .optional()
      .describe("Match case exactly when true; false adds the regex i flag. Default true."),
    vault: z.string().min(1).optional().describe("Obsidian vault display name. Omit to use the vault focused in Obsidian."),
  })
  .superRefine((v, ctx) => {
    if (v.pattern.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["pattern"],
        message: "pattern is empty or whitespace-only",
      });
      return;
    }
    const flags = v.case_sensitive === false ? "i" : "";
    try {
      new RegExp(v.pattern, flags);
    } catch (cause) {
      ctx.addIssue({
        code: "custom",
        path: ["pattern"],
        message: (cause as Error).message,
      });
    }
  });

export const patternSearchMatchSchema = z
  .strictObject({
    path: z.string().min(1),
    line: z.number().int().min(1, "line is 1-based"),
    offset: z.number().int().min(0, "offset is 0-based"),
    match: z.string().min(1, "match must be non-empty (FR-016 zero-length skip)"),
    text: z.string(),
  });

export const patternSearchOutputSchema = z
  .strictObject({
    count: z.number().int().nonnegative(),
    matches: z.array(patternSearchMatchSchema),
    truncated: z.literal(true).optional(),
  })
  .refine((o) => o.count === o.matches.length, "count must equal matches.length");

export const patternSearchEvalEnvelopeSchema = z.discriminatedUnion("ok", [
  z
    .strictObject({
      ok: z.literal(true),
      count: z.number().int().nonnegative(),
      matches: z.array(patternSearchMatchSchema),
      truncated: z.literal(true).optional(),
    }),
  z
    .strictObject({
      ok: z.literal(false),
      code: z.literal("FOLDER_NOT_FOUND"),
      folder: z.string().min(1),
    }),
]);

export type PatternSearchInput = z.infer<typeof patternSearchInputSchema>;
export type PatternSearchMatch = z.infer<typeof patternSearchMatchSchema>;
export type PatternSearchOutput = z.infer<typeof patternSearchOutputSchema>;
export type PatternSearchEvalEnvelope = z.infer<typeof patternSearchEvalEnvelopeSchema>;
