// Original — no upstream.
import { z } from "zod";

export const basesInputSchema = z
  .object({
    vault: z.string().min(1).optional(),
  })
  .strict();

export const basesOutputSchema = z
  .object({
    bases: z.array(z.string()),
    count: z.number().int().min(0),
  })
  .strict()
  .refine((o) => o.count === o.bases.length, "count must equal bases.length");

export type BasesInput = z.infer<typeof basesInputSchema>;
export type BasesOutput = z.infer<typeof basesOutputSchema>;
