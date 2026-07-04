// Original — no upstream.
import { z } from "zod";

export const basesInputSchema = z
  .strictObject({
    vault: z.string().min(1).optional(),
  });

export const basesOutputSchema = z
  .strictObject({
    bases: z.array(z.string()),
    count: z.number().int().min(0),
  })
  .refine((o) => o.count === o.bases.length, "count must equal bases.length");

export type BasesInput = z.infer<typeof basesInputSchema>;
export type BasesOutput = z.infer<typeof basesOutputSchema>;
