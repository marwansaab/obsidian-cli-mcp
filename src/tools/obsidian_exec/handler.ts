// Original — no upstream. obsidian_exec handler: thin transformer routing parsed input through invokeBoundedCli with the obsidian_exec response envelope, behind the 068 passthrough denylist gate (FR-010..FR-013, research R4) that refuses code-running and developer-tooling commands before any spawn unless the vault owner set OBSIDIAN_MCP_ALLOW_EVAL.
import { invokeBoundedCli, type CallScope, type SpawnLike } from "../../cli-adapter/invoke-bounded-cli.js";
import { UpstreamError } from "../../errors.js";

import type { ObsidianExecInput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ObsidianExecOutput {
  stdout: string;
  stderr: string;
  exitCode: 0;
  argv: string[];
}

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  /**
   * `OBSIDIAN_MCP_ALLOW_EVAL`, parsed once at boot by `createServer()`. Absent means off, so a
   * caller that never sets it fails closed (the gate stays on).
   */
  allowEval?: boolean;
}

/**
 * Commands refused by exact name (spec FR-010, clarification Q3). The plugin lifecycle names
 * are pinned from the live `obsidian help` output (evidence-c2.md). `command` (palette
 * execution) and `plugin:reload` are deliberately absent: accepted residual risk.
 */
export const OBSIDIAN_EXEC_BLOCKED_EXACT: ReadonlySet<string> = new Set([
  "eval",
  "devtools",
  "restart",
  "plugin:install",
  "plugin:enable",
  "plugin:disable",
]);

/** Every `dev:*` command (the CLI's `Developer:` section) is refused by prefix. */
const OBSIDIAN_EXEC_BLOCKED_PREFIX = "dev:";

/** Matches a command name after trim + lower-case; parameter values are never inspected. */
export function isBlockedCommand(command: string): boolean {
  const normalised = command.trim().toLowerCase();
  return OBSIDIAN_EXEC_BLOCKED_EXACT.has(normalised) || normalised.startsWith(OBSIDIAN_EXEC_BLOCKED_PREFIX);
}

/**
 * The schema refuses `=` in `command` (schema.ts), so `input.command` is always the token the CLI
 * runs as the command and is the only thing the gate needs to match.
 */
export async function executeObsidianExec(input: ObsidianExecInput, deps: ExecuteDeps): Promise<ObsidianExecOutput> {
  if (!deps.allowEval && isBlockedCommand(input.command)) {
    throw new UpstreamError({
      code: "VALIDATION_ERROR",
      cause: null,
      details: { code: "COMMAND_BLOCKED", command: input.command },
      message: `obsidian_exec: command \`${input.command}\` is blocked by default because it can run arbitrary code or drive developer tooling. The vault owner can allow it by setting OBSIDIAN_MCP_ALLOW_EVAL=1.`,
    });
  }
  return invokeBoundedCli(
    {
      command: input.command,
      parameters: input.parameters,
      vault: input.vault,
      flags: input.flags,
      copy: input.copy,
    },
    { timeoutMs: input.timeoutMs },
    deps,
  );
}
