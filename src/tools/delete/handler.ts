// Original — no upstream. delete handler: thin transformer routing parsed input through invokeCli — argv assembly (NO file→name rename per R3), flag-form permanent per R2, structural toTrash derivation per R4 (toTrash = !parsed.permanent), response parsing locked against T0-captured wording. 068 R12 (FR-047, FR-049, FR-050): `permanent: true` needs the human's confirmation before the spawn — CONFIRMATION_UNAVAILABLE when the client cannot ask, CONFIRMATION_DECLINED when they say no; a trash delete asks nothing.
import { invokeCli, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { confirmationUnavailable, NON_INTERACTIVE_CALL } from "../_confirm.js";

import type { DeleteNoteInput, DeleteNoteOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { ToolCall } from "../_shared.js";

export interface ExecuteDeps extends CallScope {
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

const PERMANENT_UNAVAILABLE_MESSAGE =
  "delete: this client cannot ask you to confirm a permanent delete. Nothing was changed. Delete to the trash instead (omit `permanent`).";

function permanentDeleteQuestion(input: DeleteNoteInput): string {
  if (input.target_mode === "active") return "Permanently delete the active note? It skips the trash and cannot be undone.";
  return `Permanently delete "${input.path ?? input.file}" from vault "${input.vault}"? It skips the trash and cannot be undone.`;
}

export async function executeDeleteNote(
  input: DeleteNoteInput,
  deps: ExecuteDeps,
  call: ToolCall = NON_INTERACTIVE_CALL,
): Promise<DeleteNoteOutput> {
  // 068 R12 / FR-047: a permanent delete is confirmed by the human first. Both steps run before
  // anything is spawned, so a refusal changes nothing.
  if (input.permanent === true) {
    if (!call.canConfirm()) throw confirmationUnavailable(PERMANENT_UNAVAILABLE_MESSAGE);
    call.confirm(permanentDeleteQuestion(input));
  }
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
    { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue, signal: deps.signal, reportProgress: deps.reportProgress },
  );
  return { deleted: true, path: parsePath(stdout), toTrash: !input.permanent };
}
