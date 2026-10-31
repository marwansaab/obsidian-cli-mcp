// Original — no upstream. write_note input/output schemas per ADR-009 — direct-fs-write redesign: `template` parameter dropped (strict-mode rejects); `file`/`path` fields gated by structural path-safety refinement; active-mode disallows `vault`/`file`/`path`/`open` (via target-mode primitive) and requires `overwrite: true`. 075: the strict output adds bytes_written (the size change; a new note's old size counts as 0), described by the shared BYTES_WRITTEN_DESCRIPTION.
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

const safePathField = z
  .string()
  .min(1)
  .refine(isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE);

export const writeNoteInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    file: safePathField
      .optional()
      .describe(`${TARGET_MODE_FILE_DESCRIPTION} For a new note, the name is created at the vault root.`),
    path: safePathField.optional().describe(TARGET_MODE_PATH_DESCRIPTION),
    content: z.string().describe("Full note body to write, as UTF-8 Markdown; replaces any existing content."),
    overwrite: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Replace an existing note when true. Default false (an existing note returns FILE_EXISTS); must be true with target_mode "active".',
      ),
    open: z
      .boolean()
      .optional()
      .describe('Open the note in Obsidian after writing. Default false; not allowed with target_mode "active".'),
  }),
).superRefine((input, ctx) => {
  if (input.target_mode !== "active") return;
  if (input.overwrite !== true) {
    ctx.addIssue({
      code: "custom",
      path: ["overwrite"],
      message:
        "overwrite must be true in active mode (active mode is destructive by definition; explicit-opt-in posture binds uniformly)",
    });
  }
  if (input.open !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["open"],
      message: "open is not allowed in active mode",
    });
  }
});

export const writeNoteOutputSchema = z
  .strictObject({
    created: z.boolean(),
    path: z.string(),
    bytes_written: z.number().int().describe(BYTES_WRITTEN_DESCRIPTION),
  });

export type WriteNoteInput = z.infer<typeof writeNoteInputSchema>;
export type WriteNoteOutput = z.infer<typeof writeNoteOutputSchema>;
