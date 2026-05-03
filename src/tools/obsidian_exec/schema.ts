// Original — no upstream. Canonical zod schema for obsidian_exec — single source of truth (Principle III, FR-002).
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const obsidianExecSchema = z
  .object({
    command: z.string().min(1),
    parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    vault: z.string().min(1).optional(),
    flags: z.array(z.string().min(1).regex(/^(?!--).*/, "flags must be bare-word (no '--' prefix)")).optional(),
    copy: z.boolean().optional(),
    timeoutMs: z.number().int().positive().max(120000).optional(),
  })
  .strict();

export type ObsidianExecInput = z.infer<typeof obsidianExecSchema>;

export const obsidianExecInputJsonSchema = zodToJsonSchema(obsidianExecSchema, {
  $refStrategy: "none",
}) as Record<string, unknown>;
