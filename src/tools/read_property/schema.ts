// Original — no upstream. read_property input/output schemas — flat target-mode primitive extension; required name field; polymorphic value union for native YAML types; seven-label type enum.
import { z } from "zod";

import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const readPropertyInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    name: z.string().min(1),
  }),
).describe(
  // BI-041 FR-010 — malformed-frontmatter contract unified with the live wrapper
  // emission captured by T0 probe (specs/041-reconcile-cohort-doc-drift/research.md
  // Task 3 + contracts/read_property-malformed-frontmatter.md, Branch A).
  // Authorising decision: spec Clarifications Q2 (Option A) + Assumption A11.
  [
    "Read a single named frontmatter property from a vault note. Returns { value, type } with value typed natively (string | number | boolean | array | object | null) and type one of seven labels.",
    "",
    "Malformed YAML frontmatter (BI-041 FR-010): When the wrapper handles a note whose YAML frontmatter cannot be parsed by Obsidian, the response carries { value: null, type: \"unknown\" } — the same shape as an absent property or a note with no frontmatter block at all. The type: \"unknown\" discriminator signals the failed-read; the wrapper successfully reached the note but could not extract the property's typed value. Agents recovering from this surface should treat type: \"unknown\" as the failed-read signal and avoid assuming the property is absent. Conflation with absent-property / no-frontmatter is intentional and inherited from upstream (no signal differentiates these three sub-states in Obsidian's `properties` JSON output).",
  ].join("\n"),
);

export const PROPERTY_TYPE_LABELS = [
  "text",
  "list",
  "number",
  "checkbox",
  "date",
  "datetime",
  "unknown",
] as const;
export type PropertyTypeLabel = (typeof PROPERTY_TYPE_LABELS)[number];

const propertyValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.unknown()),
  z.record(z.unknown()),
  z.null(),
]);

export const readPropertyOutputSchema = z
  .object({
    value: propertyValueSchema,
    type: z.enum(PROPERTY_TYPE_LABELS),
  })
  .strict();

export type ReadPropertyInput = z.infer<typeof readPropertyInputSchema>;
export type ReadPropertyOutput = z.infer<typeof readPropertyOutputSchema>;
