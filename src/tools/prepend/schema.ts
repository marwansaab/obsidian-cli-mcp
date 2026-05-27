// Original — no upstream. prepend input/output schemas per BI-045 — content non-empty (FR-013) producing the cohort's Zod `too_small` issue with details.code: CONTENT_EMPTY (reused from BI-044 unchanged); content max-length 24576 UTF-16 code units (FR-018) producing Zod `too_big` with details.code: CONTENT_TOO_LARGE (NEW single-state sub-discriminator per ADR-015); file-field structural-path-safety + wikilink-form bracket rejection (FR-001a, byte-stable with BI-044's safeFileField); path-field structural-path-safety; inline boolean default false; target-mode primitive (no active-mode opt-in flag per FR-004a — deliberate cohort exception to write_note's overwrite:true, justified by prepend's additive-not-destructive safety profile, inherited from BI-044).
import { z } from "zod";

import {
  isStructurallySafePath,
  STRUCTURALLY_UNSAFE_PATH_MESSAGE,
} from "../../path-safety/schema.js";
import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

// FR-018 — single source of truth for the content cap. Both the schema's
// `.max()` and the description string in `index.ts` interpolate this constant
// so the published contract and the enforced ceiling cannot drift (SC-008).
//
// BI-047 (2026-05-27): cap lowered from 24576 to 3072 after empirical
// bisect against the live Obsidian CLI on Windows. The upstream Obsidian.com
// console launcher's IPC channel to the running Obsidian.exe GUI breaks
// deterministically at content >= 4096 bytes (10/10 trials at 3584 succeed;
// 0/10 at 4096 — SIGTERM after 12s, then Obsidian's CLI-receiving state
// degrades until the GUI is restarted). 3072 leaves ~1 KB headroom for the
// `path=` / `vault=` argv-overhead a real-world prepend call adds on top of
// the content. Spec FR-008's original "MUST NOT be lowered" wording is
// superseded by the BI-047 empirical findings — see spec.md FR-008
// amendment and contracts/prepend-input.contract.md §"Cap unit reconciliation".
//
// Failure mode if upstream argv-IPC is repaired upstream: this constant can
// be ratcheted back up (with a fresh bisect) without breaking any caller.
// Lowering further is also safe — the structural enforcement is the schema's
// `.max()` call.
export const MAX_CONTENT_LENGTH = 3072;

const WIKILINK_BRACKET_REJECTION_MESSAGE =
  "wikilink-form locator MUST NOT contain `[[` or `]]` brackets — supply the bare note name (e.g. `My Note` not `[[My Note]]`)";

// FR-001a — file-field rejects only the `[[` / `]]` bracket pairs that
// unambiguously signal the caller is reaching for wikilink syntax. Single
// brackets are legitimate inside note names so we don't reject `[draft]`.
// Byte-stable with BI-044's safeFileField pattern.
const safeFileField = z
  .string()
  .min(1)
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
  .refine(isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE);

export const prependInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    file: safeFileField.optional(),
    path: safePathField.optional(),
    // FR-013 — empty content is rejected with Zod's `too_small` issue at the
    // schema layer (single-state details.code: CONTENT_EMPTY, reused from BI-044).
    // FR-018 — oversized content is rejected with Zod's `too_big` issue
    // (single-state details.code: CONTENT_TOO_LARGE, NEW in BI-045 per ADR-015).
    content: z.string().min(1).max(MAX_CONTENT_LENGTH),
    // FR-007 — inline opt-in defaults to false (FR-006 default-separator
    // behaviour fires when omitted).
    inline: z.boolean().optional().default(false),
  }),
);

export const prependOutputSchema = z
  .object({
    path: z.string(),
    vault: z.string(),
    bytes_written: z.number().int().min(1),
    inline: z.boolean(),
  })
  .strict();

export type PrependInput = z.infer<typeof prependInputSchema>;
export type PrependOutput = z.infer<typeof prependOutputSchema>;
