// Original — no upstream. write_note handler: thin transformer routing parsed input through invokeCli — argv assembly (file→name rename per R3), flag-form overwrite/open per R2, response parsing per R4 (Created→true / Overwrote→false, T0-locked).
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

import type { WriteNoteInput, WriteNoteOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

const RESPONSE_RE = /^(Created|Overwrote):\s+(.+?)\s*$/m;

function parseCreateResponse(stdout: string): WriteNoteOutput {
  const match = stdout.trimStart().match(RESPONSE_RE);
  if (match) {
    return { created: match[1] === "Created", path: match[2]! };
  }
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { stdout },
    message: `write_note could not parse CLI response: ${stdout.trimStart().slice(0, 200)}`,
  });
}

export async function executeWriteNote(input: WriteNoteInput, deps: ExecuteDeps): Promise<WriteNoteOutput> {
  const parameters: Record<string, string> =
    input.target_mode === "specific"
      ? {
          ...(input.file !== undefined ? { name: input.file } : {}),
          ...(input.path !== undefined ? { path: input.path } : {}),
          content: input.content,
          ...(input.template !== undefined ? { template: input.template } : {}),
        }
      : { content: input.content };
  const flags: string[] = [];
  if (input.overwrite === true) flags.push("overwrite");
  if ((input.open ?? false) === true) flags.push("open");
  const { stdout } = await invokeCli(
    {
      command: "create",
      vault: input.target_mode === "specific" ? input.vault! : undefined,
      parameters,
      flags,
      target_mode: input.target_mode,
    },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );
  return parseCreateResponse(stdout);
}
