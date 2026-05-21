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
  })
  .describe(
    // BI-041 FR-009 — error roster reconciled to the Cowork pathway with explicit
    // BI-0086 carve-outs for codes Cowork's client-side transforms render unreachable.
    // See specs/041-reconcile-cohort-doc-drift/contracts/search-roster.md.
    [
      "Search vault Markdown notes for a literal substring; default mode returns matching paths, line mode returns per-line matches.",
      "",
      "Error roster (Cowork pathway reachability):",
      "- VALIDATION_ERROR — Cowork-reachable for: missing / empty / whitespace-only / oversize `query`; non-integer `limit`; empty `vault` / `folder`.",
      "- VALIDATION_ERROR(unrecognized_keys) — *(strict-rich pathway only, per BI-0086 — Cowork strips unknown top-level keys client-side per `additionalProperties: false`, so this code never fires on Cowork)*",
      "- Out-of-range `limit` — *(strict-rich pathway only, per BI-0086 — Cowork surfaces this as MCP transport error `-32602` (Invalid Params), not as the wrapper's wrapped `VALIDATION_ERROR`)*",
      "- CLI_REPORTED_ERROR — Cowork-reachable: (a) CLI stdout was not JSON AND not the zero-match sentinel (`details.stage: \"json-parse\"`); (b) CLI JSON failed wire-schema parse (`details.stage: \"wire-parse\"`); (c) unknown vault (`details.code: \"VAULT_NOT_FOUND\"`).",
      "- CLI_NON_ZERO_EXIT — Cowork-reachable: CLI exited non-zero (typical cause: output-cap kill on extreme result sets).",
      "- CLI_BINARY_NOT_FOUND — Cowork-reachable: the obsidian CLI binary is not on PATH and OBSIDIAN_BIN was unset/invalid.",
      "- CLI_OUTPUT_TOO_LARGE — Cowork-reachable: the CLI's stdout exceeded the cli-adapter's 10 MiB output cap.",
      "",
      "The two carve-out flags above are pinned at exactly two entries per spec FR-009 / SC-004 / Assumption A10; any future addition is a new BI.",
    ].join("\n"),
  );

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
