// Original — no upstream. move handler: thin transformer routing parsed input through invokeCli — resolves the source (spec 070 research D3), then resolveTo (trailing-`/` folder form keeps the basename; otherwise the type-preservation rule on the final segment of `to`: keep the source's extension, reject a change to another recognised type), forwarding the original `file=` / `path=` or, in active mode, the resolved `path=` with no `vault=` (the CLI's current vault, as the focused-file eval); parseMoveResponse three-shape contract. Spec 090: a move-step failure is classified after the CLI reports it, in moveFailure — an ENOENT rename becomes CLI_REPORTED_ERROR + details.code FOLDER_NOT_FOUND with the vault-relative destination folder. BI-0177: an ENOENT or ENOTDIR rename into a non-root folder, or (round 2) the CLI's "Destination file already exists!" when a `file` or active call forwarded the folder form for the CLI to expand, first runs one blocked-destination eval in the move's vault (frozen BLOCKER_TEMPLATE); a folder prefix that is a file gives details.code NOT_A_FOLDER with that file's path, none gives FOLDER_NOT_FOUND (ENOENT) or the rewrite below (ENOTDIR, already exists), and a failed eval withholds the CLI text like the failed vault lookup; every other failure but CLI_BINARY_NOT_FOUND has the vault's absolute folder (active: focused-file eval; specific: vault registry, after the failure) rewritten to the vault-relative form by the shared withVaultRelativePaths (`_vault-relative-error.ts`); when the specific-mode lookup fails for any reason but an unregistered vault, the CLI text is withheld (code kept, vault-relative source and destination named, lookup failure as cause).
import { BLOCKER_TEMPLATE } from "./_template.js";
import { moveBlockerEnvelopeSchema, type MoveInput, type MoveOutput } from "./schema.js";
import { invokeCli, invokeEval, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError, stringDetail } from "../../errors.js";
import { resolveDestinationName, type SupportDeclaration } from "../../file-type/file-type.js";
import { decodeEvalEnvelope } from "../_active-file.js";
import { fileTargetVaultRoot, resolveFileTarget, type FileTarget } from "../_file-target.js";
import { composeEvalCode } from "../_shared.js";
import { withVaultRelativePaths } from "../_vault-relative-error.js";

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

// Spec 090 research F1/F5: a rename into a missing destination folder is Node's fs ENOENT rename
// line; the source is checked first, so a missing source never reaches it. BI-0177: a rename through
// an existing file gives the same ENOENT line on Windows (T0) and ENOTDIR on POSIX (inferred from libuv).
const RENAME_FAILURE_RE = /^Error: (ENOENT|ENOTDIR): [^,]*, rename '/;

// The folder part of the vault-relative destination, with forward slashes; "" is the vault root.
function destinationFolder(resolvedTo: string): string {
  const normalised = resolvedTo.replaceAll("\\", "/");
  const i = normalised.lastIndexOf("/");
  return i === -1 ? "" : normalised.slice(0, i);
}

function renameFailureErrno(e: UpstreamError): "ENOENT" | "ENOTDIR" | undefined {
  if (e.code !== "CLI_REPORTED_ERROR") return undefined;
  const errno = RENAME_FAILURE_RE.exec(stringDetail(e.details, "message"))?.[1];
  return errno === "ENOENT" || errno === "ENOTDIR" ? errno : undefined;
}

// Spec 090 P5, BI-0177 round 2 T0: given a raw folder form whose last segment is an existing file,
// the CLI expands it to that file and answers this line, not a rename errno.
const DESTINATION_EXISTS_LINE = "Error: Destination file already exists!";

function isDestinationExists(e: UpstreamError): boolean {
  return e.code === "CLI_REPORTED_ERROR" && stringDetail(e.details, "message") === DESTINATION_EXISTS_LINE;
}

// BI-0177: the first prefix of `folder` that exists on disk and is not a folder, or null. Runs in the
// vault the move used (undefined: the focused vault, as the active-mode move).
async function findBlockingFile(folder: string, vault: string | undefined, deps: ExecuteDeps): Promise<string | null> {
  const result = await invokeEval({ code: composeEvalCode(BLOCKER_TEMPLATE, { folder }), vault }, deps);
  return decodeEvalEnvelope(result, moveBlockerEnvelopeSchema, { toolName: "move", malformedCode: "CLI_REPORTED_ERROR" }).blocker;
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

// BI-0177: a file holds the name a destination folder needs. Same shape as folderNotFound.
function notAFolder(file: string): UpstreamError {
  return new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { code: "NOT_A_FOLDER", folder: file },
    message: `move: "${file}" is an existing file, where the destination needs a folder of that name. Nothing was moved. Rename or remove that file, or pick another destination, then retry the move.`,
  });
}

// What a failed lookup left unchecked, as the withheld failure's message names it.
const UNCHECKED = {
  "vault-folder": "the vault's folder could not be looked up",
  "destination-folder": "the destination folder could not be checked",
} as const;

// Spec 090 data-model E4c: the CLI text cannot be cleaned (or, for a rename failure, classified),
// so it is dropped; the move failure keeps its code, and the lookup failure is its cause.
function withheldFailure(
  e: UpstreamError,
  source: string,
  destination: string,
  lookup: keyof typeof UNCHECKED,
  lookupErr: unknown,
): UpstreamError {
  const lookupCode = lookupErr instanceof UpstreamError ? lookupErr.code : "unknown";
  return new UpstreamError({
    code: e.code,
    cause: lookupErr,
    details: { source, destination },
    message: `move: moving "${source}" to "${destination}" failed with ${e.code}, and ${UNCHECKED[lookup]} (${lookupCode}), so the command-line output is withheld to keep absolute paths out of this error. Retry the move.`,
  });
}

// Spec 090 data-model "Per-call flow": the error a move-step failure is reported as.
// `cliExpandsFolderForm`: the folder form was forwarded as given, so the CLI expanded it itself.
async function moveFailure(
  e: unknown,
  target: FileTarget,
  resolvedTo: string,
  cliExpandsFolderForm: boolean,
  deps: ExecuteDeps,
): Promise<unknown> {
  // CLI_BINARY_NOT_FOUND's search paths describe the CLI install, not the vault (Clarification Q1).
  if (!(e instanceof UpstreamError) || e.code === "CLI_BINARY_NOT_FOUND") return e;
  const folder = destinationFolder(resolvedTo);
  const errno = folder === "" ? undefined : renameFailureErrno(e);
  // BI-0177 round 2: only the CLI-expanded folder form sends "already exists" to the lookup, so a
  // collision on a full-path or `path`-expanded `to` stays one spawn.
  const existsThroughFolderForm = folder !== "" && cliExpandsFolderForm && isDestinationExists(e);
  if (errno !== undefined || existsThroughFolderForm) {
    let blocker: string | null;
    try {
      blocker = await findBlockingFile(folder, target.vault, deps);
    } catch (lookupErr) {
      // Cancellation reaches here as a non-UpstreamError abort reason; it passes through untouched.
      if (!(lookupErr instanceof UpstreamError)) return lookupErr;
      return withheldFailure(e, target.relPath, resolvedTo, "destination-folder", lookupErr);
    }
    if (blocker !== null) return notAFolder(blocker);
    if (errno === "ENOENT") return folderNotFound(folder);
    // ENOTDIR or "already exists" with no file in the way is not a missing folder; it is reported as
    // the CLI said it.
  }
  let root: string;
  try {
    root = await fileTargetVaultRoot(target, deps.vaultRegistry);
  } catch (lookupErr) {
    // Research D5: a vault the registry does not know is one the CLI did not act on, so its
    // failure names no folder of it.
    if (lookupErr instanceof UpstreamError && lookupErr.code === "VALIDATION_ERROR") return e;
    return withheldFailure(e, target.relPath, resolvedTo, "vault-folder", lookupErr);
  }
  return withVaultRelativePaths(e, root);
}

export async function executeMove(input: MoveInput, deps: ExecuteDeps): Promise<MoveOutput> {
  const target = await resolveFileTarget(input, deps, "move");
  const resolvedTo = resolveTo(input.to, target.relPath);
  // The folder form is expanded only for a `path` locator, as before; `file` and active calls
  // forward it as given and the CLI keeps the basename itself (spec 070 contracts/tool-support.md
  // invariant 4 keeps Markdown `file`-mode arguments byte-stable).
  const cliExpandsFolderForm = input.path === undefined && input.to.endsWith("/");
  const forwardedTo = cliExpandsFolderForm ? input.to : resolvedTo;
  try {
    const { stdout } = await invokeCli(
      { command: "move", vault: target.vault, parameters: { ...target.locator, to: forwardedTo }, flags: [], target_mode: "specific" },
      deps,
    );
    const { fromPath, toPath } = parseMoveResponse(stdout, target.relPath, resolvedTo);
    return { moved: true, fromPath, toPath };
  } catch (e) {
    throw await moveFailure(e, target, resolvedTo, cliExpandsFolderForm, deps);
  }
}
