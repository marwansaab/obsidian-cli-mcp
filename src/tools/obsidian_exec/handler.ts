// Original — no upstream. obsidian_exec handler: thin transformer routing parsed input through invokeBoundedCli with the obsidian_exec response envelope.
import { invokeBoundedCli, type SpawnLike } from "../../cli-adapter/invoke-bounded-cli.js";

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
}

export function executeObsidianExec(input: ObsidianExecInput, deps: ExecuteDeps): Promise<ObsidianExecOutput> {
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
