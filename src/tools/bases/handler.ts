// Original — no upstream.
import { basesOutputSchema, type BasesInput, type BasesOutput } from "./schema.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export async function executeBases(
  _input: BasesInput,
  deps: ExecuteDeps,
): Promise<BasesOutput> {
  const result = await invokeCli(
    {
      command: "bases",
      parameters: {},
      flags: [],
      target_mode: "active",
    },
    {
      spawnFn: deps.spawnFn,
      env: deps.env,
      logger: deps.logger,
      queue: deps.queue,
    },
  );

  const bases = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();

  return basesOutputSchema.parse({ bases, count: bases.length });
}
