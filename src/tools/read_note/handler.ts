// Original — no upstream. read_note handler: routes the validated input through invokeCli (BI-028) inside the shared queue + emits FR-017 log events.
import { randomUUID } from "node:crypto";

import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

import type { ReadNoteInput } from "./schema.js";
import type { ErrorCode, Logger } from "../../logger.js";
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

export function executeReadNote(input: ReadNoteInput, deps: ExecuteDeps): Promise<ReadNoteOutput> {
  return deps.queue.run(() => runOnce(input, deps));
}

async function runOnce(input: ReadNoteInput, deps: ExecuteDeps): Promise<ReadNoteOutput> {
  const callId = randomUUID();
  const startedAt = Date.now();
  const queueDepth = Math.max(0, deps.queue.depth() - 1);
  const locator: "file" | "path" | "active" =
    input.target_mode === "active" ? "active" : input.file !== undefined ? "file" : "path";
  const vault = input.target_mode === "specific" ? input.vault : null;
  const parameters: Record<string, string> =
    input.target_mode === "specific"
      ? {
          vault: input.vault,
          ...(input.file !== undefined ? { file: input.file } : {}),
          ...(input.path !== undefined ? { path: input.path } : {}),
        }
      : {};
  deps.logger.callStart({ callId, command: "read", vault, queueDepth, locator });
  try {
    const { stdout } = await invokeCli(
      { command: "read", parameters, flags: [], target_mode: input.target_mode },
      { spawnFn: deps.spawnFn, env: deps.env },
    );
    const durationMs = Date.now() - startedAt;
    deps.logger.callEndSuccess({ callId, durationMs, stdoutBytes: Buffer.byteLength(stdout, "utf8") });
    return { content: stdout };
  } catch (err) {
    if (err instanceof UpstreamError) {
      const durationMs = Date.now() - startedAt;
      deps.logger.callEndFailure({ callId, errorCode: err.code as ErrorCode, durationMs });
    }
    throw err;
  }
}
