// Original — no upstream. move handler: thin transformer routing parsed input through invokeCli — resolves the source (spec 070 research D3), then resolveTo (trailing-`/` folder form keeps the basename; otherwise the type-preservation rule on the final segment of `to`: keep the source's extension, reject a change to another recognised type), forwarding the original `file=` / `path=` or, in active mode, the resolved `path=` with no `vault=` (the CLI's current vault, as the focused-file eval); parseMoveResponse three-shape contract. Spec 090: a move-step failure is classified after the CLI reports it — an ENOENT rename becomes CLI_REPORTED_ERROR + details.code FOLDER_NOT_FOUND with the vault-relative destination folder (no lookup); every other failure but CLI_BINARY_NOT_FOUND has the vault's absolute folder (active: focused-file eval; specific: vault registry, after the failure) rewritten to the vault-relative form, the same object when nothing changed; when the specific-mode lookup fails for any reason but an unregistered vault, the CLI text is withheld (code kept, vault-relative source and destination named, lookup failure as cause).
import { invokeCli, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError, stringDetail } from "../../errors.js";
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

// Spec 090 research F1/F5: a missing destination folder is Node's fs ENOENT rename line, the same
// on every platform; the source is checked first, so a missing source never reaches it.
const ENOENT_RENAME_RE = /^Error: ENOENT: [^,]*, rename '/;

// The folder part of the vault-relative destination, with forward slashes; "" is the vault root.
function destinationFolder(resolvedTo: string): string {
  const normalised = resolvedTo.replaceAll("\\", "/");
  const i = normalised.lastIndexOf("/");
  return i === -1 ? "" : normalised.slice(0, i);
}

function isMissingDestinationFolder(e: UpstreamError): boolean {
  return e.code === "CLI_REPORTED_ERROR" && ENOENT_RENAME_RE.test(stringDetail(e.details, "message"));
}

// No `cause`: the CLI error carries the absolute paths this failure keeps out.
function folderNotFound(folder: string): UpstreamError {
  return new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { code: "FOLDER_NOT_FOUND", folder },
    message: `move: the destination folder "${folder}" does not exist in the vault. Nothing was moved. Create the folder (writing a note into it with write_note creates it), then retry the move.`,
  });
}

const SEPARATOR = String.raw`[\\/]`;
// What may follow a bare root in CLI text: the end, or a character that cannot continue a folder
// name there. Anything else (`<root>shop\x.md`) is a sibling folder and is left alone.
const AFTER_BARE_ROOT = String.raw`(?=$|[\s'"\x60,;:)\]>])`;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Spec 090 data-model E5: `<root><separator>` becomes "" and a bare `<root>` becomes ".", in the
// message and in every string inside `details`, with either separator and in any case. The same
// object comes back when nothing was rewritten, so a failure naming no path is unchanged.
function withVaultRelativePaths(e: UpstreamError, root: string): UpstreamError {
  const trimmed = root.replace(/[\\/]+$/, "");
  if (trimmed === "") return e;
  const pattern = trimmed
    .split(/[\\/]/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(SEPARATOR);
  const re = new RegExp(`${pattern}(?:${SEPARATOR}|${AFTER_BARE_ROOT})`, "gi");
  let count = 0;
  const rewrite = (value: unknown): unknown => {
    if (typeof value === "string") {
      return value.replace(re, (match) => {
        count++;
        return /[\\/]$/.test(match) ? "" : ".";
      });
    }
    if (Array.isArray(value)) return value.map(rewrite);
    if (isPlainRecord(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
    return value;
  };
  const message = rewrite(e.message) as string;
  const details = rewrite(e.details) as Record<string, unknown>;
  if (count === 0) return e;
  return new UpstreamError({ code: e.code, cause: e.cause, details, message });
}

// Spec 090 data-model E4c: the vault root is unknown, so the CLI text cannot be cleaned and is
// dropped; the move failure keeps its code, and the lookup failure is its cause.
function withheldFailure(e: UpstreamError, source: string, destination: string, lookupErr: unknown): UpstreamError {
  const lookupCode = lookupErr instanceof UpstreamError ? lookupErr.code : "unknown";
  return new UpstreamError({
    code: e.code,
    cause: lookupErr,
    details: { source, destination },
    message: `move: moving "${source}" to "${destination}" failed with ${e.code}, and the vault's folder could not be looked up (${lookupCode}), so the command-line output is withheld to keep absolute paths out of this error. Retry the move.`,
  });
}

export async function executeMove(input: MoveInput, deps: ExecuteDeps): Promise<MoveOutput> {
  const target = await resolveFileTarget(input, deps, "move");
  const resolvedTo = resolveTo(input.to, target.relPath);
  // The folder form is expanded only for a `path` locator, as before; `file` and active calls
  // forward it as given and the CLI keeps the basename itself (spec 070 contracts/tool-support.md
  // invariant 4 keeps Markdown `file`-mode arguments byte-stable).
  const forwardedTo = input.path === undefined && input.to.endsWith("/") ? input.to : resolvedTo;
  try {
    const { stdout } = await invokeCli(
      { command: "move", vault: target.vault, parameters: { ...target.locator, to: forwardedTo }, flags: [], target_mode: "specific" },
      deps,
    );
    const { fromPath, toPath } = parseMoveResponse(stdout, target.relPath, resolvedTo);
    return { moved: true, fromPath, toPath };
  } catch (e) {
    // CLI_BINARY_NOT_FOUND's search paths describe the CLI install, not the vault (Clarification Q1).
    if (!(e instanceof UpstreamError) || e.code === "CLI_BINARY_NOT_FOUND") throw e;
    const folder = destinationFolder(resolvedTo);
    if (isMissingDestinationFolder(e) && folder !== "") throw folderNotFound(folder);
    let root: string;
    if (target.vault === undefined) {
      root = target.vaultRoot;
    } else {
      try {
        root = await deps.vaultRegistry.resolveVaultPath(target.vault);
      } catch (lookupErr) {
        // Research D5: a vault the registry does not know is one the CLI did not act on, so its
        // failure names no folder of it.
        if (lookupErr instanceof UpstreamError && lookupErr.code === "VALIDATION_ERROR") throw e;
        throw withheldFailure(e, target.relPath, resolvedTo, lookupErr);
      }
    }
    throw withVaultRelativePaths(e, root);
  }
}
