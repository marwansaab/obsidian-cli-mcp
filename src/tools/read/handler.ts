// Original — no upstream. read handler: thin transformer routing parsed input through invokeCli (BI-028) — argv assembly, queue, bounds owned by the typed-tool facade. Spec 070: resolves the target first and rejects file types other than notes, canvases and bases (UNSUPPORTED_FILE_TYPE) before the read; `file` mode forwards the original `file=`, active mode the resolved `path=` with no `vault=` (the CLI's current vault, as the focused-file eval). Spec 074: after a successful CLI read, the note's bytes are read from disk (vault root from the focused-file eval in active mode, else the vault registry; `fs` seam) and only two facts taken from them — drop the CLI's added final "\n" when the note has no final line feed, restore the leading byte-order mark the CLI drops; a failed disk read is FS_WRITE_FAILED with `reason: "read"`, never a fallback to the uncorrected stdout.
import * as nodeFs from "node:fs/promises";
import { join } from "node:path";

import { invokeCli, type ResolveBinaryFn, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { assertSupportedFileType, type SupportDeclaration } from "../../file-type/file-type.js";
import { resolveFileTarget } from "../_file-target.js";
import { getErrno } from "../_fs-errors.js";

import type { ReadNoteInput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

export interface ReadFs {
  readFile: (p: string) => Promise<Buffer>;
}

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  vaultRegistry: VaultRegistry;
  fs?: ReadFs;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  /** Test seam — passes through to invokeCli → dispatchCli. */
  resolveBinary?: ResolveBinaryFn;
}

const DEFAULT_FS: ReadFs = {
  readFile: (p) => nodeFs.readFile(p),
};

export interface ReadNoteOutput {
  content: string;
}

/** The file types `read` handles (spec 070 Clarifications Q3); attachments are shown with open_file. */
export const READ_SUPPORTED = ["note", "canvas", "base"] as const satisfies SupportDeclaration;

export async function executeReadNote(input: ReadNoteInput, deps: ExecuteDeps): Promise<ReadNoteOutput> {
  const target = await resolveFileTarget(input, deps, "read");
  assertSupportedFileType({
    relPath: target.relPath,
    supported: READ_SUPPORTED,
    toolName: "read",
    alternatives: { attachment: "open_file" },
  });
  // vault flows through invokeCli as a top-level field — symmetric with invokeBoundedCli — rather than being smuggled inside `parameters`.
  const { stdout } = await invokeCli(
    { command: "read", vault: target.vault, parameters: target.locator, flags: [], target_mode: "specific" },
    deps,
  );
  // Spec 074: the CLI adds a final "\n" and drops one leading byte-order mark. Two facts from the
  // note's bytes on disk undo both; the result is still built from stdout only (research D1).
  // The registry lookup runs after the CLI read, so an unknown vault still fails at the CLI.
  const vaultRoot = target.vaultRoot ?? (await deps.vaultRegistry.resolveVaultPath(target.vault!));
  const bytes = await readDiskBytes(deps.fs ?? DEFAULT_FS, join(vaultRoot, target.relPath), target.relPath);
  let content = stdout;
  if (content.endsWith("\n") && bytes.at(-1) !== 0x0a) content = content.slice(0, -1);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) content = `\uFEFF${content}`;
  return { content };
}

async function readDiskBytes(fs: ReadFs, absPath: string, relPath: string): Promise<Buffer> {
  try {
    return await fs.readFile(absPath);
  } catch (e) {
    const errno = getErrno(e) ?? "UNKNOWN";
    const syscall = (e as NodeJS.ErrnoException | null)?.syscall;
    throw new UpstreamError({
      code: "FS_WRITE_FAILED",
      cause: e,
      details: { reason: "read", errno, ...(syscall ? { syscall } : {}), path: relPath },
      message: `read: filesystem read failed: ${errno} for "${relPath}"`,
    });
  }
}
