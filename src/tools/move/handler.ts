// Original — no upstream. move handler: thin transformer routing parsed input through invokeCli — resolves the source (spec 070 research D3), then resolveTo (trailing-`/` folder form keeps the basename; otherwise the type-preservation rule on the final segment of `to`: keep the source's extension, reject a change to another recognised type), forwarding the original `file=` / `path=` or, in active mode, the resolved `path=` in specific mode; parseMoveResponse three-shape contract.
import { invokeCli, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { resolveDestinationName, type SupportDeclaration } from "../../file-type/file-type.js";
import { resolveFileTarget } from "../_file-target.js";

import type { MoveInput, MoveOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

/** move works on every file and keeps its type (spec 070 FR-003). */
export const MOVE_SUPPORTED = "any" as const satisfies SupportDeclaration;

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  vaultRegistry: VaultRegistry;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

// Folder form (trailing `/`, /speckit-clarify Q1 of spec 030) keeps the source's basename.
// Otherwise spec 070's rule applies to the final segment of `to`: it replaces spec 030's
// source-`.md` guard, so a canvas moved to `Archive/Plan2` lands at `Archive/Plan2.canvas`
// (T0 P1: the CLI reads an extensionless `to` as a folder) and `Archive/Plan.md` is rejected.
function resolveTo(to: string, fromPath: string): string {
  if (to.endsWith("/")) return to + basename(fromPath);
  return resolveDestinationName({
    relPath: fromPath,
    destination: to,
    destinationLabel: "the destination",
    toolName: "move",
  });
}

// Anticipated single-line shape per 011/012/021 precedent. Fallbacks: two-line;
// empty stdout + exit 0. Unrecognised throws CLI_REPORTED_ERROR(stage:"parse").
const MOVE_RESPONSE_RE = /^Moved: (.+?) (?:→|->) (.+?)\s*$/m;

function parseMoveResponse(stdout: string, fromPath: string, resolvedTo: string): { fromPath: string; toPath: string } {
  const trimmed = stdout.trimStart();
  const match = trimmed.match(MOVE_RESPONSE_RE);
  if (match) return { fromPath: match[1]!, toPath: match[2]! };
  if (trimmed === "") return { fromPath, toPath: resolvedTo };
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
  const target = await resolveFileTarget(input, deps, "move");
  const resolvedTo = resolveTo(input.to, target.relPath);
  // The folder form is expanded only for a `path` locator, as before; `file` and active calls
  // forward it as given and the CLI keeps the basename itself (spec 070 contracts/tool-support.md
  // invariant 4 keeps Markdown `file`-mode arguments byte-stable).
  const forwardedTo = input.path === undefined && input.to.endsWith("/") ? input.to : resolvedTo;
  const { stdout } = await invokeCli(
    { command: "move", vault: target.vault, parameters: { ...target.locator, to: forwardedTo }, flags: [], target_mode: "specific" },
    deps,
  );
  const { fromPath, toPath } = parseMoveResponse(stdout, target.relPath, resolvedTo);
  return { moved: true, fromPath, toPath };
}
