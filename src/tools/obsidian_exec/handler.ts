// Original — no upstream. obsidian_exec handler: thin transformer routing parsed input through invokeBoundedCli with the obsidian_exec response envelope, behind the 068 passthrough denylist gate (FR-010..FR-013, research R4) that refuses code-running and developer-tooling commands before any spawn unless the vault owner set OBSIDIAN_MCP_ALLOW_EVAL.
import { assembleArgv } from "../../cli-adapter/_dispatch.js";
import { invokeBoundedCli, type SpawnLike } from "../../cli-adapter/invoke-bounded-cli.js";
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

export interface ExecuteDeps {
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

const VAULT_TOKEN_PREFIX = "vault=";

/**
 * The token the CLI will run as the command. The CLI consumes a leading `vault=<name>` token and
 * takes the next one as the command (evidence-c2.md), so a `command` of `vault=X` would shift the
 * first flag into command position (`{command: "vault=X", flags: ["eval", …]}` runs `eval`). Leading
 * `vault=` tokens are skipped here (case-insensitively, which over-approximates the CLI) so the gate
 * judges the command that actually runs. Parameter tokens always contain `=`, so a parameter value
 * can never be the effective command.
 */
function effectiveCommand(input: ObsidianExecInput): string | undefined {
  const tokens = assembleArgv(input, "").slice(1);
  return tokens.find((token) => !token.trim().toLowerCase().startsWith(VAULT_TOKEN_PREFIX));
}

export async function executeObsidianExec(input: ObsidianExecInput, deps: ExecuteDeps): Promise<ObsidianExecOutput> {
  const command = effectiveCommand(input);
  if (!deps.allowEval && command !== undefined && isBlockedCommand(command)) {
    throw new UpstreamError({
      code: "VALIDATION_ERROR",
      cause: null,
      details: { code: "COMMAND_BLOCKED", command },
      message: `obsidian_exec: command \`${command}\` is blocked by default because it can run arbitrary code or drive developer tooling. The vault owner can allow it by setting OBSIDIAN_MCP_ALLOW_EVAL=1.`,
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
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );
}
