// Original — no upstream. read_property input/output schemas — flat target-mode primitive extension; required name field; polymorphic value union for native YAML types; seven-label type enum.
import { z } from "zod";

import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const readPropertyInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    name: z.string().min(1),
  }),
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
