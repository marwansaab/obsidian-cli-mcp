// Original — no upstream. find_and_replace input + output schemas — strict object input (pattern/replacement/mode/case_insensitive/subfolder/include_code_blocks/include_html_comments/commit/vault) with superRefine for regex-syntax and path-traversal; discriminated-union output keyed on `mode: "preview" | "commit"` per FR-025 with refine enforcing failing_note_locator IFF partial===true.
import { z } from "zod";

import { isStructurallySafePath } from "../../path-safety/schema.js";

const PATTERN_MAX = 1000;
const REPLACEMENT_MAX = 1000;
const FULL_LINE_CAP_PLUS_ELLIPSIS = 501; // 500 + 1 ellipsis (U+2026)

export const findAndReplaceInputSchema = z
  .object({
    pattern: z
      .string()
      .min(1, "pattern must not be empty")
      .max(PATTERN_MAX, `pattern exceeds ${PATTERN_MAX} chars`),
    replacement: z
      .string()
      .max(REPLACEMENT_MAX, `replacement exceeds ${REPLACEMENT_MAX} chars`),
    mode: z.enum(["literal", "regex"]).optional().default("literal"),
    case_insensitive: z.boolean().optional().default(false),
    subfolder: z.string().optional(),
    include_code_blocks: z.boolean().optional().default(false),
    include_html_comments: z.boolean().optional().default(false),
    commit: z.boolean().optional().default(false),
    vault: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode === "regex") {
      try {
        new RegExp(v.pattern, v.case_insensitive ? "i" : "");
      } catch (cause) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pattern"],
          message: (cause as Error).message,
          params: { subCode: "INVALID_PATTERN", subReason: "regex-syntax" },
        });
      }
    }
    if (v.subfolder !== undefined && v.subfolder.length > 0) {
      if (!isStructurallySafePath(v.subfolder)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["subfolder"],
          message:
            "path is not structurally safe (must not start with '/', '\\\\', or a drive letter; must not contain '..' segments or control characters)",
          params: { subCode: "INVALID_SUBFOLDER", subReason: "path-traversal" },
        });
      }
    }
  });

export type FindAndReplaceInput = z.infer<typeof findAndReplaceInputSchema>;

const occurrenceSchema = z
  .object({
    line_number: z.number().int().min(1),
    full_line: z.string().max(FULL_LINE_CAP_PLUS_ELLIPSIS),
    matched_substring: z.string(),
    replacement_substring: z.string(),
  })
  .strict();

const affectedNoteSchema = z
  .object({
    path: z.string().min(1),
    occurrence_count: z.number().int().min(1),
    occurrences: z.array(occurrenceSchema),
  })
  .strict();

const previewBranchSchema = z
  .object({
    mode: z.literal("preview"),
    affected_notes: z.array(affectedNoteSchema),
    total_occurrences: z.number().int().nonnegative(),
  })
  .strict();

const commitBranchSchema = z
  .object({
    mode: z.literal("commit"),
    changed_notes: z.array(z.string().min(1)),
    total_occurrences_replaced: z.number().int().nonnegative(),
    partial: z.boolean(),
    failing_note_locator: z.string().min(1).optional(),
  })
  .strict();

export const findAndReplaceOutputSchema = z
  .discriminatedUnion("mode", [previewBranchSchema, commitBranchSchema])
  .superRefine((v, ctx) => {
    if (v.mode === "commit") {
      if (v.partial === true && v.failing_note_locator === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["failing_note_locator"],
          message: "failing_note_locator MUST be present when partial === true",
        });
      }
      if (v.partial === false && v.failing_note_locator !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["failing_note_locator"],
          message: "failing_note_locator MUST be absent when partial === false",
        });
      }
    }
  });

export type FindAndReplaceOutput = z.infer<typeof findAndReplaceOutputSchema>;
export type FindAndReplaceOccurrence = z.infer<typeof occurrenceSchema>;
export type FindAndReplaceAffectedNote = z.infer<typeof affectedNoteSchema>;

export const FULL_LINE_CAP = 500;
export const FULL_LINE_ELLIPSIS = "…";
