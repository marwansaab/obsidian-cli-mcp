// Original — no upstream. open_file input/output/eval-envelope schemas (BI-057) — flat strict z.object, vault required (no target_mode discriminator per research R4 / ADR-003 intent satisfied by the focused-vault guard); exactly-one-of path/file via superRefine (FR-005); file-field structural-path-safety + wikilink-form bracket rejection byte-stable with append_note's safeFileField (FR-004); path-field structural-path-safety (FR-013); new_tab boolean default false (FR-008); discriminated-union eval-envelope wire format mirrors the in-eval IIFE return shape.
import { z } from "zod";

import {
  isStructurallySafePath,
  STRUCTURALLY_UNSAFE_PATH_MESSAGE,
} from "../../path-safety/schema.js";

const MAX_LOCATOR_LENGTH = 1000;

const WIKILINK_BRACKET_REJECTION_MESSAGE =
  "wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare name (e.g. `My Note` not `[[My Note]]`)";

const EXACTLY_ONE_BOTH_MESSAGE =
  "exactly one of `path` or `file` must be provided (got both)";

const EXACTLY_ONE_NEITHER_MESSAGE =
  "exactly one of `path` or `file` must be provided (got neither)";

// FR-004 — file-field rejects only the `[[` / `]]` bracket pairs that
// unambiguously signal the caller is reaching for wikilink syntax. Single
// brackets are legitimate inside note names so we don't reject `[draft]`.
// Byte-stable with append_note's safeFileField pattern.
const safeFileField = z
  .string()
  .min(1)
  .max(MAX_LOCATOR_LENGTH)
  .refine(isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE)
  .superRefine((value, ctx) => {
    if (value.includes("[[") || value.includes("]]")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: WIKILINK_BRACKET_REJECTION_MESSAGE,
      });
    }
  });

const safePathField = z
  .string()
  .min(1)
  .max(MAX_LOCATOR_LENGTH)
  .refine(isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE);

export const openFileInputSchema = z
  .object({
    // FR-001 — vault is unconditionally required (no active mode, R4). The
    // focused-vault guard resolves this name and refuses when it is not the
    // currently focused vault, satisfying ADR-003's anti-implicit-execution
    // intent more strictly than a target_mode discriminator would.
    vault: z.string().min(1).max(MAX_LOCATOR_LENGTH),
    path: safePathField.optional(),
    file: safeFileField.optional(),
    // FR-008 — opt-in new tab; default false focuses an existing tab (no duplicate).
    new_tab: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasPath = value.path !== undefined;
    const hasFile = value.file !== undefined;
    if (hasPath && hasFile) {
      // FR-005 — both supplied: issue at BOTH paths so a programmatic caller
      // sees the conflict on either locator field.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["path"],
        message: EXACTLY_ONE_BOTH_MESSAGE,
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["file"],
        message: EXACTLY_ONE_BOTH_MESSAGE,
      });
    } else if (!hasPath && !hasFile) {
      // FR-005 — neither supplied: a single object-level issue at the root.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: EXACTLY_ONE_NEITHER_MESSAGE,
      });
    }
  });

export const openFileOutputSchema = z
  .object({
    opened: z.string(),
    vault: z.string(),
    new_tab: z.boolean(),
  })
  .strict();

// Discriminated eval-envelope wire format (cohort parity with backlinks'
// backlinksEvalResponseSchema). `detail` carries the attempted locator
// (FILE_NOT_FOUND) or the unrecognised extension (UNSUPPORTED_FILE_TYPE);
// VAULT_NOT_FOCUSED carries no detail.
export const OPEN_FILE_EVAL_ERROR_CODES = [
  "VAULT_NOT_FOCUSED",
  "FILE_NOT_FOUND",
  "UNSUPPORTED_FILE_TYPE",
] as const;
export type OpenFileEvalErrorCode = (typeof OPEN_FILE_EVAL_ERROR_CODES)[number];

export const openEvalResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      opened: z.string(),
      new_tab: z.boolean(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      code: z.enum(OPEN_FILE_EVAL_ERROR_CODES),
      detail: z.string().optional(),
    })
    .strict(),
]);

// Handler-boundary input type: `z.input` (pre-default), so `new_tab` is optional
// at the call site and the handler applies the default. The parsed value
// registerTool hands the handler (`z.infer`, new_tab present) is assignable to it.
export type OpenFileInput = z.input<typeof openFileInputSchema>;
export type OpenFileOutput = z.infer<typeof openFileOutputSchema>;
export type OpenFileEvalResponse = z.infer<typeof openEvalResponseSchema>;
