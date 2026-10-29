// Original — no upstream. Canonical zod schema for obsidian_exec — single source of truth (Principle III, FR-002).
import { z } from "zod";

export const obsidianExecSchema = z
  .strictObject({
    // 068 FR-010 (research R4): a command name never contains "=" (CLI arguments go in
    // `parameters`, the vault in `vault`). Refusing it keeps `command` the token the CLI runs:
    // the CLI consumes a leading `vault=` token and runs the next one (evidence-c2.md), so a
    // `command` of `vault=X` would otherwise move the first flag into command position.
    command: z
      .string()
      .min(1)
      .refine((value) => !value.includes("="), {
        message: "command must be a CLI command name without '='; pass CLI arguments in parameters and the vault in vault",
      }),
    parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    vault: z.string().min(1).optional(),
    flags: z.array(z.string().min(1).regex(/^(?!--).*/, "flags must be bare-word (no '--' prefix)")).optional(),
    copy: z.boolean().optional(),
    timeoutMs: z.number().int().positive().max(120000).optional(),
  });

export type ObsidianExecInput = z.infer<typeof obsidianExecSchema>;
