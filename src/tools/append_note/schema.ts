// Original — no upstream. append_note input/output schemas per BI-044 / ADR-009 — content non-empty (FR-013) producing the cohort's Zod `too_small` issue with details.code: CONTENT_EMPTY documented under ADR-015 single-state sub-discriminator; file-field structural-path-safety + wikilink-form bracket rejection (FR-001a, no new sub-code — surfaces under the cohort's standard custom-issue channel); path-field structural-path-safety; inline boolean default false; target-mode primitive (no active-mode opt-in flag per FR-004a — deliberate cohort exception to write_note's mandatory overwrite:true, justified by append's additive-not-destructive safety profile). 075: bytes_written described by the shared BYTES_WRITTEN_DESCRIPTION (bound unchanged).
import { z } from "zod";

import {
  isStructurallySafePath,
  STRUCTURALLY_UNSAFE_PATH_MESSAGE,
} from "../../path-safety/schema.js";
import {
  applyTargetModeRefinement,
  TARGET_MODE_FILE_DESCRIPTION,
  TARGET_MODE_PATH_DESCRIPTION,
  targetModeBaseSchema,
} from "../../target-mode/target-mode.js";
import { BYTES_WRITTEN_DESCRIPTION } from "../_shared.js";

const WIKILINK_BRACKET_REJECTION_MESSAGE =
  "wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)";

// FR-001a — file-field rejects only the `[[` / `]]` bracket pairs that
// unambiguously signal the caller is reaching for wikilink syntax. Single
// brackets are legitimate inside note names so we don't reject `[draft]`.
const safeFileField = z
  .string()
  .min(1)
  .refine(isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE)
  .superRefine((value, ctx) => {
    if (value.includes("[[") || value.includes("]]")) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: WIKILINK_BRACKET_REJECTION_MESSAGE,
      });
    }
  });

const safePathField = z
  .string()
  .min(1)
  .refine(isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE);

export const appendNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    file: safeFileField
      .optional()
      .describe(`${TARGET_MODE_FILE_DESCRIPTION} Bare name, no [[ ]] brackets.`),
    path: safePathField.optional().describe(TARGET_MODE_PATH_DESCRIPTION),
    // FR-013 — empty content is rejected with Zod's `too_small` issue at the
    // schema layer. ADR-015 single-state sub-discriminator documents the
    // (VALIDATION_ERROR, CONTENT_EMPTY) pair; programmatic callers branch on
    // the issue path ["content"] + code "too_small" to detect it.
    content: z
      .string()
      .min(1)
      .describe("Text to add at the end of the note, written byte-for-byte; must be non-empty."),
    // FR-007 — inline opt-in defaults to false (FR-006 default-separator
    // behaviour fires when omitted).
    inline: z
      .boolean()
      .optional()
      .default(false)
      .describe("When true, skip the newline separator and join onto the last line. Default false."),
  }),
);

export const appendNoteOutputSchema = z
  .strictObject({
    path: z.string(),
    vault: z.string(),
    bytes_written: z.number().int().min(1).describe(BYTES_WRITTEN_DESCRIPTION),
    inline: z.boolean(),
  });

export type AppendNoteInput = z.infer<typeof appendNoteInputSchema>;
export type AppendNoteOutput = z.infer<typeof appendNoteOutputSchema>;
