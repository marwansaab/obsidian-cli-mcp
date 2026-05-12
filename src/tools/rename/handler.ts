// Original — no upstream. rename handler: thin transformer routing parsed input through invokeCli — appendMdIfMissing helper per /speckit-clarify Q1, parseRenameResponse regex locked against T0 capture.
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

import type { RenameNoteInput, RenameNoteOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

// /speckit-clarify Q1 (locked 2026-05-12) — mirrors 020-fix-write-gaps R2's
// `endsWith(".md")` predicate exactly. Literal byte equality, case-sensitive.
function appendMdIfMissing(name: string): string {
  return name.endsWith(".md") ? name : name + ".md";
}

// Locked at T0 (F2/F12) — see research.md ## T0 Live-CLI Capture (2026-05-12).
// CLI emits `Renamed: <fromPath> -> <toPath>` on success (ASCII arrow, bare paths).
const RESPONSE_RE = /^Renamed: (.+?) -> (.+?)\s*$/m;

function parseRenameResponse(stdout: string): { fromPath: string; toPath: string } {
  const match = stdout.trimStart().match(RESPONSE_RE);
  if (match) return { fromPath: match[1]!, toPath: match[2]! };
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { stdout },
    message: `rename_note could not parse CLI response: ${stdout.trimStart().slice(0, 200)}`,
  });
}

export async function executeRenameNote(
  input: RenameNoteInput,
  deps: ExecuteDeps,
): Promise<RenameNoteOutput> {
  const forwardedName = appendMdIfMissing(input.name);
  const parameters: Record<string, string> =
    input.target_mode === "specific"
      ? {
          ...(input.file !== undefined ? { file: input.file } : {}),
          ...(input.path !== undefined ? { path: input.path } : {}),
          name: forwardedName,
        }
      : { name: forwardedName };
  const { stdout } = await invokeCli(
    {
      command: "rename",
      vault: input.target_mode === "specific" ? input.vault! : undefined,
      parameters,
      flags: [],
      target_mode: input.target_mode,
    },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );
  const { fromPath, toPath } = parseRenameResponse(stdout);
  return { renamed: true, fromPath, toPath };
}
