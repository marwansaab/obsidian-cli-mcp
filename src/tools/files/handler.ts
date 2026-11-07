// Original — no upstream. files handler — invokeCli wrapper around the CLI's native `files` subcommand (R2/R3); wrapper-imposed filter pipeline: sub-folder filter (FR-026 defence-in-depth) → dotfile filter (FR-028 defence-in-depth) → non-recursive filter (R6 load-bearing — CLI returns recursive subtree per F2) → UTF-8 byte-compare lexical sort (R8/FR-027 — Buffer.compare, not JS default UTF-16). On total:true (R7), paths discarded after counting (NOT delegated to CLI's recursive total flag). BI-0205: the CLI answers a missing folder like an empty one (empty stdout, exit 0), so when a named folder lists nothing the handler confirms it exists with one `adapter.stat` eval (`FOLDER_CHECK_TEMPLATE`) and raises `paths`' FOLDER_NOT_FOUND shape when it does not; a `folder` with a `..` segment fails the same way without the eval, because `stat` is not confined to the vault. The vault root and every non-empty listing stay single-spawn.
import { FOLDER_CHECK_TEMPLATE } from "./_template.js";
import { filesFolderEnvelopeSchema, type ListFilesInput, type ListFilesOutput } from "./schema.js";
import { invokeCli, invokeEval, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { decodeEvalEnvelope } from "../_active-file.js";
import { composeEvalCode } from "../_shared.js";

import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

export function parseStdout(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function isFolderEntry(path: string): boolean {
  return path.endsWith("/") || path.endsWith("\\");
}

export function hasDotPrefixedComponent(path: string): boolean {
  return path.split("/").some((segment) => segment.startsWith("."));
}

export function compareUtf8Bytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function expectedComponentCount(folder: string | undefined): number {
  if (folder === undefined) return 1;
  return folder.split("/").filter(Boolean).length + 1;
}

function actualComponentCount(path: string): number {
  return path.split("/").filter(Boolean).length;
}

function folderNotFound(folder: string): UpstreamError {
  return new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { stage: "envelope-error", code: "FOLDER_NOT_FOUND", folder },
    message: `files: FOLDER_NOT_FOUND for folder "${folder}"`,
  });
}

/**
 * Throws FOLDER_NOT_FOUND unless `folder` exists in the vault the listing used. A `..` segment fails
 * without the check: `adapter.stat` resolves it outside the vault (BI-0205 Q1).
 */
async function assertFolderExists(folder: string, input: ListFilesInput, deps: ExecuteDeps): Promise<void> {
  if (folder.split(/[/\\]/).includes("..")) throw folderNotFound(folder);
  const result = await invokeEval(
    {
      code: composeEvalCode(FOLDER_CHECK_TEMPLATE, { folder }),
      vault: input.target_mode === "specific" ? input.vault : undefined,
    },
    deps,
  );
  const envelope = decodeEvalEnvelope(result, filesFolderEnvelopeSchema, {
    toolName: "files",
    malformedCode: "CLI_REPORTED_ERROR",
  });
  if (envelope.ok === false) throw folderNotFound(envelope.folder);
}

export async function executeListFiles(
  input: ListFilesInput,
  deps: ExecuteDeps,
): Promise<ListFilesOutput> {
  const parameters: Record<string, string> = {};
  if (input.folder !== undefined) parameters.folder = input.folder;
  if (input.ext !== undefined) parameters.ext = input.ext;

  const result = await invokeCli(
    {
      command: "files",
      vault: input.vault,
      parameters,
      flags: [],
      target_mode: input.target_mode,
    },
    deps,
  );

  const entries = parseStdout(result.stdout);
  // Any entry lies under the named folder (the CLI does not prefix-match), so only an empty listing needs the check.
  if (input.folder !== undefined && entries.length === 0) await assertFolderExists(input.folder, input, deps);

  const expected = expectedComponentCount(input.folder);
  const filtered = entries
    .filter((p) => !isFolderEntry(p))
    .filter((p) => !hasDotPrefixedComponent(p))
    .filter((p) => actualComponentCount(p) === expected)
    .sort(compareUtf8Bytes);

  const count = filtered.length;
  const paths = input.total === true ? [] : filtered;
  return { count, paths };
}
