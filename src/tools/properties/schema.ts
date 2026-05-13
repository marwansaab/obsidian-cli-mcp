// Original — no upstream. properties input/output/upstream-wire schemas — vault-only surface (NO target_mode discriminator per R4/FR-004); optional vault (min 1) + optional total boolean; strict output { count, properties: [{ name, noteCount }] } uniform across both modes (FR-006/FR-006a); passthrough upstream array schema tolerant to future upstream field additions.
import { z } from "zod";

export const propertiesInputSchema = z
  .object({
    vault: z.string().min(1).optional(),
    total: z.boolean().optional(),
  })
  .strict();

export const propertyEntrySchema = z
  .object({
    name: z.string(),
    noteCount: z.number().int().nonnegative(),
  })
  .strict();

export const propertiesOutputSchema = z
  .object({
    count: z.number().int().nonnegative(),
    properties: z.array(propertyEntrySchema),
  })
  .strict();

export const propertiesUpstreamEntrySchema = z
  .object({
    name: z.string(),
    type: z.string(),
    count: z.number().int().nonnegative(),
  })
  .passthrough();

export const propertiesUpstreamArraySchema = z.array(propertiesUpstreamEntrySchema);

export type PropertiesInput = z.infer<typeof propertiesInputSchema>;
export type PropertiesOutput = z.infer<typeof propertiesOutputSchema>;
export type PropertyEntry = z.infer<typeof propertyEntrySchema>;
