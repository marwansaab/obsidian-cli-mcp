// Original — no upstream. Canonical zod schema for the help tool — single source of truth (Principle III, FR-007).
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const helpInputSchema = z
  .object({
    tool_name: z.string().min(1).optional(),
  })
  .strict();

export type HelpInput = z.infer<typeof helpInputSchema>;

export const helpInputJsonSchema = zodToJsonSchema(helpInputSchema, {
  $refStrategy: "none",
}) as Record<string, unknown>;
