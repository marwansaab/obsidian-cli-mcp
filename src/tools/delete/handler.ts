// Original — no upstream. delete handler: thin transformer routing parsed input through invokeCli — argv assembly (NO file→name rename per R3), flag-form permanent per R2, structural toTrash derivation per R4 (toTrash = !parsed.permanent), response parsing locked against T0-captured wording.
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

import type { DeleteNoteInput, DeleteNoteOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

// Locked at T0.1 (`Moved to trash: <path>`) + T0.3 (`Deleted permanently: <path>`) — see research.md ## T0 Live-CLI Capture (2026-05-08).
const RESPONSE_RE = /^(Moved to trash|Deleted permanently): (.+?)\s*$/m;

function parsePath(stdout: string): string {
  const match = stdout.trimStart().match(RESPONSE_RE);
  if (match) return match[2]!;
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { stdout },
    message: `delete_note could not parse CLI response: ${stdout.trimStart().slice(0, 200)}`,
  });
}

export async function executeDeleteNote(input: DeleteNoteInput, deps: ExecuteDeps): Promise<DeleteNoteOutput> {
  const parameters: Record<string, string> =
    input.target_mode === "specific"
      ? {
          ...(input.file !== undefined ? { file: input.file } : {}),
          ...(input.path !== undefined ? { path: input.path } : {}),
        }
      : {};
  const flags: string[] = input.permanent === true ? ["permanent"] : [];
  const { stdout } = await invokeCli(
    {
      command: "delete",
      vault: input.target_mode === "specific" ? input.vault! : undefined,
      parameters,
      flags,
      target_mode: input.target_mode,
    },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );
  return { deleted: true, path: parsePath(stdout), toTrash: !input.permanent };
}
