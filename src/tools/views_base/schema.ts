// Original — no upstream.
import { z } from "zod";

export const viewsBaseInputSchema = z
  .object({
    vault: z.string().min(1).optional(),
  })
  .strict();

export const viewsBaseOutputSchema = z
  .object({
    views: z.array(z.string()),
    count: z.number().int().min(0),
  })
  .strict()
  .refine((o) => o.count === o.views.length, "count must equal views.length");

export type ViewsBaseInput = z.infer<typeof viewsBaseInputSchema>;
export type ViewsBaseOutput = z.infer<typeof viewsBaseOutputSchema>;
