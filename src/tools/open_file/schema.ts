// Original — no upstream. open_file input/output/eval-envelope schemas (BI-057; cross-vault rewrite ADR-031). Flat strict z.object, vault required (no target_mode discriminator per research R4 / ADR-003); exactly-one-of path/file via superRefine (FR-005); file-field structural-path-safety + wikilink-form bracket rejection byte-stable with append_note's safeFileField (FR-004); path-field structural-path-safety (FR-013); new_tab boolean default false (FR-008). The output gains a closed `placement` enum (FR-008..FR-011 / BI-0129). The eval envelope drops `VAULT_NOT_FOCUSED` — the eval now runs in the requested vault (B1 false, ADR-031), so there is no focused-vault guard to fail; its ok:true arm carries `placement`. Discriminated-union wire format mirrors the in-eval IIFE return shape.
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
    // FR-001 — vault is unconditionally required (no active mode, R4). It names
    // the REQUESTED vault to open in; the handler routes the eval there in
    // target_mode:"specific" (vault=requested), so the open lands in that vault
    // whether it is focused, open-but-unfocused, or closed-but-registered
    // (ADR-031; B1 false). Locator acceptance is static — independent of which
    // vault is focused at call time (FR-006a / Principle III).
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

// FR-008..FR-011 / BI-0129 — exactly one machine-verifiable placement outcome
// per successful open. `new_tab_created` (a fresh leaf was opened), `existing_tab_reused`
// (an already-open tab for the file was focused, no duplicate), `active_tab_used`
// (the file was opened into the active leaf). Closed enum — no pane/leaf ids or
// split geometry (FR-012/FR-023).
export const OPEN_FILE_PLACEMENTS = [
  "new_tab_created",
  "existing_tab_reused",
  "active_tab_used",
] as const;
export const openPlacementSchema = z.enum(OPEN_FILE_PLACEMENTS);

export const openFileOutputSchema = z
  .object({
    opened: z.string(),
    vault: z.string(),
    new_tab: z.boolean(),
    placement: openPlacementSchema,
  })
  .strict();

// Discriminated eval-envelope wire format (cohort parity with backlinks'
// backlinksEvalResponseSchema). The ok:true arm carries the derived `placement`
// (§5 of data-model). `detail` is optional and carries the unrecognised extension
// for UNSUPPORTED_FILE_TYPE (the only code that reads it — the handler maps
// FILE_NOT_FOUND using its own locator, so the eval omits `detail` there).
// `VAULT_NOT_FOCUSED` is REMOVED — the eval runs in the requested vault (B1 false,
// ADR-031), so there is no focused-vault guard and no such envelope arm.
export const OPEN_FILE_EVAL_ERROR_CODES = [
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
      placement: openPlacementSchema,
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
