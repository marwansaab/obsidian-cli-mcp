// Original — no upstream. read_note handler: thin transformer routing parsed input through invokeCli (BI-028) — argv assembly, queue, bounds owned by the typed-tool facade.
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";

import type { ReadNoteInput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export interface ReadNoteOutput {
  content: string;
}

export async function executeReadNote(input: ReadNoteInput, deps: ExecuteDeps): Promise<ReadNoteOutput> {
  const parameters: Record<string, string> =
    input.target_mode === "specific"
      ? {
          vault: input.vault,
          ...(input.file !== undefined ? { file: input.file } : {}),
          ...(input.path !== undefined ? { path: input.path } : {}),
        }
      : {};
  const { stdout } = await invokeCli(
    { command: "read", parameters, flags: [], target_mode: input.target_mode },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );
  return { content: stdout };
}
