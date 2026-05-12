// Original — no upstream. write_property input/output schemas — flat target-mode primitive extension; required name + value fields; four-shape value union (string | number | boolean | string[]); six-label write-side type enum (no "unknown" on write side); strict output { written: true, path, name }.
import { z } from "zod";

import { applyTargetModeRefinement, targetModeBaseSchema } from "../../target-mode/target-mode.js";

export const PROPERTY_WRITE_TYPE_LABELS = [
  "text",
  "list",
  "number",
  "checkbox",
  "date",
  "datetime",
] as const;
export type PropertyWriteTypeLabel = (typeof PROPERTY_WRITE_TYPE_LABELS)[number];

const valueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const writePropertyInputSchema = applyTargetModeRefinement(
  targetModeBaseSchema.extend({
    name: z.string().min(1),
    value: valueSchema,
    type: z.enum(PROPERTY_WRITE_TYPE_LABELS).optional(),
  }),
);

export const writePropertyOutputSchema = z
  .object({
    written: z.literal(true),
    path: z.string(),
    name: z.string(),
  })
  .strict();

export type WritePropertyInput = z.infer<typeof writePropertyInputSchema>;
export type WritePropertyOutput = z.infer<typeof writePropertyOutputSchema>;
