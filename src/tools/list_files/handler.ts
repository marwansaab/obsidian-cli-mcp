// Original — no upstream. list_files handler — single-spawn invokeCli wrapper around the CLI's native `files` subcommand (R2/R3); wrapper-imposed filter pipeline: sub-folder filter (FR-026 defence-in-depth) → dotfile filter (FR-028 defence-in-depth) → non-recursive filter (R6 load-bearing — CLI returns recursive subtree per F2) → UTF-8 byte-compare lexical sort (R8/FR-027 — Buffer.compare, not JS default UTF-16). On total:true (R7), paths discarded after counting (NOT delegated to CLI's recursive total flag).
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";

import type { ListFilesInput, ListFilesOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";

export interface ExecuteDeps {
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
    {
      spawnFn: deps.spawnFn,
      env: deps.env,
      logger: deps.logger,
      queue: deps.queue,
    },
  );

  const expected = expectedComponentCount(input.folder);
  const filtered = parseStdout(result.stdout)
    .filter((p) => !isFolderEntry(p))
    .filter((p) => !hasDotPrefixedComponent(p))
    .filter((p) => actualComponentCount(p) === expected)
    .sort(compareUtf8Bytes);

  const count = filtered.length;
  const paths = input.total === true ? [] : filtered;
  return { count, paths };
}
