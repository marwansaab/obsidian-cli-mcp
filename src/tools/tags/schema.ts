// Original — no upstream. tags input/output/upstream-wire schemas — targetModeBaseSchema.extend() with a tool-local ADR-038 scope-matrix superRefine (specific requires vault, active forbids vault, at most one of file / path / activeOnly in either mode); path guarded by the ADR-009 Layer-1 structural predicate; strict output { total, tags: [{ name, count? }] }; loose upstream array tolerant to future upstream field additions.
import { z } from "zod";

import { isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE } from "../../path-safety/schema.js";
import { targetModeBaseSchema } from "../../target-mode/target-mode.js";

const SCOPE_CONFLICT_MESSAGE = "at most one of `file`, `path`, `activeOnly` may be set";

// ADR-038: the tool keeps the cohort's `target_mode` / `vault` fields byte-identical
// (hence the base extend) but deliberately does NOT use applyTargetModeRefinement
// (which requires exactly one locator and forbids locators in active mode) nor the
// folder-scoped variant (which forbids locators in both modes). Locators are optional
// and allowed in both modes; the vault rules reuse the cohort's verbatim wording.
export const tagsInputSchema = targetModeBaseSchema
  .extend({
    file: z.string().min(1).optional(),
    path: z
      .string()
      .min(1)
      .refine(isStructurallySafePath, STRUCTURALLY_UNSAFE_PATH_MESSAGE)
      .optional(),
    activeOnly: z.boolean().optional(),
    sortByCount: z.boolean().optional(),
    includeCounts: z.boolean().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.target_mode === "specific" && input.vault === undefined) {
      ctx.addIssue({ code: "custom", path: ["vault"], message: "vault is required in specific mode" });
    }
    if (input.target_mode === "active" && input.vault !== undefined) {
      ctx.addIssue({ code: "custom", path: ["vault"], message: "vault is not allowed in active mode" });
    }
    // `activeOnly: false` is the default, so it counts as "not set".
    const setScopes = [
      input.file !== undefined ? "file" : undefined,
      input.path !== undefined ? "path" : undefined,
      input.activeOnly === true ? "activeOnly" : undefined,
    ].filter((key): key is string => key !== undefined);
    if (setScopes.length > 1) {
      for (const key of setScopes) {
        ctx.addIssue({ code: "custom", path: [key], message: SCOPE_CONFLICT_MESSAGE });
      }
    }
  });

export const tagEntrySchema = z.strictObject({
  name: z.string().min(1),
  count: z.number().int().nonnegative().optional(),
});

export const tagsOutputSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  tags: z.array(tagEntrySchema),
});

// Upstream `tags format=json counts` wire (research F2): `count` is a decimal STRING.
export const tagsUpstreamArraySchema = z.array(
  z.object({ tag: z.string(), count: z.string().optional() }).loose(),
);

export type TagsInput = z.infer<typeof tagsInputSchema>;
export type TagsOutput = z.infer<typeof tagsOutputSchema>;
export type TagEntry = z.infer<typeof tagEntrySchema>;
