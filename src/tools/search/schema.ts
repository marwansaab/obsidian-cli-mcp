// Original — no upstream. search input/output/wire schemas — vault-scoped query primitive
// (NO target_mode discriminator, vault?-only per FR-016 restated). Strict input with
// post-trim emptiness superRefine on `query` (FR-010). Two output shapes — default
// {count, paths, truncated?} and line {count, matches, truncated?} — picked at the
// response boundary based on input.context_lines. Two wire shapes — flat array of
// paths (default subcommand) and file-grouped {file, matches} entries (search:context
// subcommand). `truncated` is z.literal(true).optional() so the field is only ever
// present when truncation fires (FR-023 / I-11).
import { z } from "zod";

export const searchInputSchema = z
  .object({
    query: z
      .string()
      .min(1, "query is required")
      .max(1000, "query exceeds 1000 chars (FR-010)"),
    folder: z.string().min(1).optional(),
    limit: z
      .number()
      .int()
      .min(1, "limit must be >= 1 (FR-008)")
      .max(10000, "limit must be <= 10000 (FR-008 / Q3)")
      .optional(),
    case_sensitive: z.boolean().optional(),
    context_lines: z.boolean().optional(),
    vault: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.query.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["query"],
        message: "query is empty or whitespace-only (FR-010)",
      });
    }
  });

export const searchDefaultOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    paths: z.array(z.string().min(1)),
    truncated: z.literal(true).optional(),
  })
  .strict()
  .refine((o) => o.count === o.paths.length, "count must equal paths.length");

export const searchLineMatchSchema = z
  .object({
    path: z.string().min(1),
    line: z.number().int().min(1, "line is 1-based (FR-003)"),
    text: z.string(),
  })
  .strict();

export const searchLineOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    matches: z.array(searchLineMatchSchema),
    truncated: z.literal(true).optional(),
  })
  .strict()
  .refine((o) => o.count === o.matches.length, "count must equal matches.length");

export const searchDefaultWireSchema = z.array(z.string().min(1));

export const searchContextWireMatchSchema = z
  .object({
    line: z.number().int().min(1),
    text: z.string(),
  })
  .strict();

export const searchContextWireFileSchema = z
  .object({
    file: z.string().min(1),
    matches: z.array(searchContextWireMatchSchema),
  })
  .strict();

export const searchContextWireSchema = z.array(searchContextWireFileSchema);

export type SearchInput = z.infer<typeof searchInputSchema>;
export type SearchDefaultOutput = z.infer<typeof searchDefaultOutputSchema>;
export type SearchLineMatch = z.infer<typeof searchLineMatchSchema>;
export type SearchLineOutput = z.infer<typeof searchLineOutputSchema>;
export type SearchContextWireFile = z.infer<typeof searchContextWireFileSchema>;
