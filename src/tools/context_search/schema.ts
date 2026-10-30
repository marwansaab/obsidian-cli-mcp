// Original — no upstream. context_search input/output schemas — vault-scoped
// per-line context primitive. NO context_lines flag (the tool always returns
// line-level matches). Re-uses search/schema.ts's wire shape (searchContextWireSchema)
// for the upstream parse step (R8).
import { z } from "zod";

import { focusedVaultField } from "../_vault-field.js";

export const contextSearchInputSchema = z
  .strictObject({
    query: z
      .string()
      .min(1, "query is required")
      .max(1000, "query exceeds 1000 chars (FR-008)")
      .describe("Literal substring to find in note text, 1–1000 characters, not whitespace-only; internal whitespace is kept."),
    folder: z
      .string()
      .min(1)
      .optional()
      .describe("Vault-relative folder to search under, recursively (e.g. \"Projects\"). Default: the whole vault."),
    limit: z
      .number()
      .int()
      .min(1, "limit must be >= 1 (FR-006)")
      .max(10000, "limit must be <= 10000 (FR-006)")
      .optional()
      .describe("Maximum number of matches, integer 1–10000. Default 1000."),
    case_sensitive: z.boolean().optional().describe("Match case exactly when true. Default false (ASCII case fold)."),
    vault: focusedVaultField,
  })
  .superRefine((v, ctx) => {
    if (v.query.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["query"],
        message: "query is empty or whitespace-only (FR-008)",
      });
    }
  });

export const contextSearchMatchSchema = z
  .strictObject({
    path: z.string().min(1),
    line: z.number().int().min(1, "line is 1-based (FR-002)"),
    text: z.string(),
  });

export const contextSearchOutputSchema = z
  .strictObject({
    count: z.number().int().nonnegative(),
    matches: z.array(contextSearchMatchSchema),
    truncated: z.literal(true).optional(),
  })
  .refine((o) => o.count === o.matches.length, "count must equal matches.length");

export type ContextSearchInput = z.infer<typeof contextSearchInputSchema>;
export type ContextSearchMatch = z.infer<typeof contextSearchMatchSchema>;
export type ContextSearchOutput = z.infer<typeof contextSearchOutputSchema>;
