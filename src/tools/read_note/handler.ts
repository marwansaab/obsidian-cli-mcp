// Original — no upstream. read_note handler: thin transformer routing parsed input through invokeCli (BI-028) — argv assembly, queue, bounds owned by the typed-tool facade.
import { invokeCli, type ResolveBinaryFn, type SpawnLike } from "../../cli-adapter/cli-adapter.js";

import type { ReadNoteInput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  /** Test seam — passes through to invokeCli → dispatchCli. */
  resolveBinary?: ResolveBinaryFn;
}

export interface ReadNoteOutput {
  content: string;
}

export async function executeReadNote(input: ReadNoteInput, deps: ExecuteDeps): Promise<ReadNoteOutput> {
  // Post-010: vault is optional at the type level; the targetModeSchema superRefine guarantees vault !== undefined whenever target_mode === "specific".
  // Post-Code-5 (2026-05-08): vault flows through invokeCli as a top-level field — symmetric with invokeBoundedCli — rather than being smuggled inside `parameters`.
  const parameters: Record<string, string> =
    input.target_mode === "specific"
      ? {
          ...(input.file !== undefined ? { file: input.file } : {}),
          ...(input.path !== undefined ? { path: input.path } : {}),
        }
      : {};
  const { stdout } = await invokeCli(
    {
      command: "read",
      vault: input.target_mode === "specific" ? input.vault! : undefined,
      parameters,
      flags: [],
      target_mode: input.target_mode,
    },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue, resolveBinary: deps.resolveBinary },
  );
  return { content: stdout };
}
