// Original — no upstream.
import { z } from "zod";

export const basesInputSchema = z
  .strictObject({
    vault: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Obsidian vault display name. Lists that vault's Bases, whether it is in front, open behind it, or closed. Omit to list the vault in front.",
      ),
  });

export const basesOutputSchema = z
  .strictObject({
    bases: z.array(z.string()),
    count: z.number().int().min(0),
  })
  .refine((o) => o.count === o.bases.length, "count must equal bases.length");

export type BasesInput = z.infer<typeof basesInputSchema>;
export type BasesOutput = z.infer<typeof basesOutputSchema>;
