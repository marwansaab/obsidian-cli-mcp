// Original — no upstream. rename handler: thin transformer routing parsed input through invokeCli — resolves the source (spec 070 research D3) and applies the type-preservation rule to `name` (resolveDestinationName: keep the source's extension, reject a change to another recognised type), then forwards the original `file=` / `path=` or, in active mode, the resolved `path=` in specific mode; parseRenameResponse regex locked against T0 capture.
import { invokeCli, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { resolveDestinationName, type SupportDeclaration } from "../../file-type/file-type.js";
import { resolveFileTarget } from "../_file-target.js";

import type { RenameNoteInput, RenameNoteOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

/** rename works on every file and keeps its type (spec 070 FR-003). */
export const RENAME_SUPPORTED = "any" as const satisfies SupportDeclaration;

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  vaultRegistry: VaultRegistry;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

// Locked at T0 (F2/F12) — see research.md ## T0 Live-CLI Capture (2026-05-12).
// CLI emits `Renamed: <fromPath> -> <toPath>` on success (ASCII arrow, bare paths); spec 070 T0 P1
// confirmed the same shape for canvas, base and attachment sources.
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
  const target = await resolveFileTarget(input, deps, "rename");
  const name = resolveDestinationName({
    relPath: target.relPath,
    destination: input.name,
    destinationLabel: "the new name",
    toolName: "rename",
  });
  const { stdout } = await invokeCli(
    { command: "rename", vault: target.vault, parameters: { ...target.locator, name }, flags: [], target_mode: "specific" },
    deps,
  );
  const { fromPath, toPath } = parseRenameResponse(stdout);
  return { renamed: true, fromPath, toPath };
}
