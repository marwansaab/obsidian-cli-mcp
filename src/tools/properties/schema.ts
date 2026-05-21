// Original — no upstream. properties input/output/upstream-wire schemas — vault-only surface (NO target_mode discriminator per R4/FR-004); optional vault (min 1) + optional total boolean; strict output { count, properties: [{ name, noteCount }] } uniform across both modes (FR-006/FR-006a); passthrough upstream array schema tolerant to future upstream field additions.
import { z } from "zod";

export const propertiesInputSchema = z
  .object({
    vault: z.string().min(1).optional(),
    total: z.boolean().optional(),
  })
  .strict()
  .describe(
    // BI-041 FR-011 — case-insensitive collapse contract promoted from spec
    // assertion to observed contract. Empirically captured by T0 probe 2026-05-21:
    // fixture notes `AaTest.md` + `aatest.md` collapse to one entry with
    // noteCount summing both contributors; upstream reports the lowercase form.
    // Retires the previously-documented case-sensitive dedup + byte-tiebreak claim.
    // See specs/041-reconcile-cohort-doc-drift/contracts/properties-dedup.md.
    [
      "Return the vault-wide catalogue of frontmatter property names with per-property note counts.",
      "",
      "Dedup contract (BI-041 FR-011): The `properties` tool returns the union of frontmatter property names across all notes in the vault, deduplicated under upstream's case-insensitive convention. Two property names differing only in case (e.g. `AaTest` and `aatest`) collapse to a single entry with noteCount summing both contributors. The reported casing in the merged entry is upstream's choice (typically the first-encountered casing in upstream's iteration order, NOT an alphabetical or wrapper-imposed rule). The wrapper does not invent a tiebreaker; the previously-documented case-sensitive dedup claim was incorrect and is retired as of BI-041.",
    ].join("\n"),
  );

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
