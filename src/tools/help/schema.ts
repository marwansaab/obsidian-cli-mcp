// Original — no upstream. Canonical zod schema for the help tool — single source of truth (Principle III, FR-007).
import { z } from "zod";

export const helpInputSchema = z
  .strictObject({
    tool_name: z.string().min(1).optional(),
  });

export type HelpInput = z.infer<typeof helpInputSchema>;
