// Original — no upstream. move handler: thin transformer routing parsed input through invokeCli — resolveTo per /speckit-clarify Q1+Q2 (trailing-`/` discriminator + source-`.md`-guarded `.md` append), parseMoveResponse three-shape contract.
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";

import type { MoveInput, MoveOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

// /speckit-clarify Q1+Q2 (locked 2026-05-15): byte-equality endsWith — mirrors
// 020-fix-write-gaps R2 / 021-rename Q1. Source-`.md` guard suppresses append
// on non-`.md` sources so `.canvas`/`.pdf` don't silently become `.md`.
function resolveTo(to: string, fromPath: string): string {
  if (to.endsWith("/")) return to + basename(fromPath);
  const tail = to.includes("/") ? to.slice(to.lastIndexOf("/") + 1) : to;
  return fromPath.endsWith(".md") && !tail.endsWith(".md") ? to + ".md" : to;
}

// Anticipated single-line shape per 011/012/021 precedent. Fallbacks: two-line;
// empty stdout + exit 0. Unrecognised throws CLI_REPORTED_ERROR(stage:"parse").
const MOVE_RESPONSE_RE = /^Moved: (.+?) (?:→|->) (.+?)\s*$/m;

function parseMoveResponse(stdout: string, input: MoveInput, resolvedTo: string): { fromPath: string; toPath: string } {
  const trimmed = stdout.trimStart();
  const match = trimmed.match(MOVE_RESPONSE_RE);
  if (match) return { fromPath: match[1]!, toPath: match[2]! };
  if (trimmed === "" && input.target_mode === "specific" && input.path !== undefined) {
    return { fromPath: input.path, toPath: resolvedTo };
  }
  const lines = trimmed.split("\n").filter((l) => l.length > 0);
  if (lines.length >= 2) return { fromPath: lines[0]!, toPath: lines[1]! };
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { stage: "parse", stdout },
    message: `move could not parse CLI response: ${trimmed.slice(0, 200)}`,
  });
}

export async function executeMove(input: MoveInput, deps: ExecuteDeps): Promise<MoveOutput> {
  const resolvedTo =
    input.target_mode === "specific" && input.path !== undefined
      ? resolveTo(input.to, input.path)
      : input.to;
  const parameters: Record<string, string> =
    input.target_mode === "specific"
      ? {
          ...(input.path !== undefined ? { path: input.path } : {}),
          ...(input.file !== undefined ? { file: input.file } : {}),
          to: resolvedTo,
        }
      : { to: resolvedTo };
  const { stdout } = await invokeCli(
    { command: "move", vault: input.target_mode === "specific" ? input.vault! : undefined, parameters, flags: [], target_mode: input.target_mode },
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
  );
  const { fromPath, toPath } = parseMoveResponse(stdout, input, resolvedTo);
  return { moved: true, fromPath, toPath };
}
