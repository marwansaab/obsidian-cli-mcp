// Original — no upstream. Canonical zod schema for obsidian_exec — single source of truth (Principle III, FR-002).
import { z } from "zod";

import { OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS, OBSIDIAN_EXEC_MAX_TIMEOUT_MS } from "../../cli-adapter/invoke-bounded-cli.js";
import { focusedVaultField } from "../_vault-field.js";

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
      })
      .describe('Obsidian CLI subcommand name (e.g. "files"), with no "="; arguments go in parameters.'),
    parameters: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe('CLI arguments as key/value pairs, passed as key=value (e.g. { "folder": "Projects" }). Default: none.'),
    vault: focusedVaultField,
    flags: z
      .array(z.string().min(1).regex(/^(?!--).*/, "flags must be bare-word (no '--' prefix)"))
      .optional()
      .describe('Bare-word CLI flags without a "--" prefix (e.g. ["verbose"]). Default: none.'),
    copy: z
      .boolean()
      .optional()
      .describe("When true, appends --copy so the CLI also copies stdout to the clipboard. Default false."),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(OBSIDIAN_EXEC_MAX_TIMEOUT_MS)
      .optional()
      .describe(
        `Call timeout in milliseconds, integer 1..${OBSIDIAN_EXEC_MAX_TIMEOUT_MS}. Default ${OBSIDIAN_EXEC_DEFAULT_TIMEOUT_MS}.`,
      ),
  });

export type ObsidianExecInput = z.infer<typeof obsidianExecSchema>;
