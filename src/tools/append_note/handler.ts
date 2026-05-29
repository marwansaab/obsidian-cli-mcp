// Original — no upstream. append_note handler per BI-044 / ADR-009 — specific-mode vault-registry resolve (+ pre-flight `obsidian file` TSV resolver for wikilink-form `file`) OR active-mode focused-file eval → Layer 2 canonical path check → fs.readFile (ENOENT → NOTE_NOT_FOUND per FR-016) → appendEdit pure helper (FR-006 / FR-006a / FR-007 / FR-008 / FR-009 / FR-010 / FR-010a) → atomic tmp+rename with EBUSY/EPERM/EACCES EXTERNAL_EDITOR_CONFLICT classification (FR-022) → best-effort metadataCache invalidation eval → typed output envelope. No race detection — FR-026 publishes last-write-wins (cohort parity with write_note, patch_block; divergence from patch_heading's HEADING_RACE).
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";

import { appendEdit } from "./append-edit.js";
import { type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import {
  assertCanonicalPath,
  resolveActiveLocatorWithVault,
  resolveFileByTsv,
} from "../_active-file.js";
import { getErrno, mapFsWriteError } from "../_fs-errors.js";
import { invalidateMetadataCache, writeAtomic } from "../_note-io.js";

import type { AppendNoteInput, AppendNoteOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

export interface ExecuteFs {
  readFile: (p: string, encoding: "utf8") => Promise<string>;
  writeFile: (p: string, content: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  realpath: (p: string) => Promise<string>;
  unlink: (p: string) => Promise<void>;
}

export interface ExecuteDeps {
  logger: Logger;
  queue: Queue;
  vaultRegistry: VaultRegistry;
  fs?: ExecuteFs;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_FS: ExecuteFs = {
  readFile: (p, encoding) => nodeFs.readFile(p, encoding),
  writeFile: (p, content) => nodeFs.writeFile(p, content),
  rename: (from, to) => nodeFs.rename(from, to),
  realpath: (p) => nodeFs.realpath(p),
  unlink: (p) => nodeFs.unlink(p),
};

// FR-022 / R10 external-editor classification: Windows surfaces sharing
// violations as EBUSY / EPERM / EACCES on `fs.rename` when an editor holds
// the target with non-shared-delete access. POSIX rename ignores open handles
// so the classification is effectively Windows-only in practice; the errno
// table is platform-uniform so the test cohort stays portable. patch_block
// diverges (no EACCES); the difference is now an explicit mapFsWriteError arg.
const EDITOR_CONFLICT_ERRNOS = new Set(["EBUSY", "EPERM", "EACCES"]);

async function resolveLocator(
  input: AppendNoteInput,
  deps: ExecuteDeps,
): Promise<{ vaultRoot: string; relPath: string; vaultDisplayName: string }> {
  if (input.target_mode === "active") {
    return resolveActiveLocatorWithVault(deps, "append_note");
  }

  const vaultRoot = await deps.vaultRegistry.resolveVaultPath(input.vault!);

  // FR-002 / FR-003 — wikilink-form `file` resolves through a pre-flight
  // `obsidian file file=<name>` TSV resolver call (byte-stable with
  // set_property's pattern). `path` callers skip the resolver and feed the
  // input verbatim into Layer 2.
  const relPath =
    input.path !== undefined
      ? input.path
      : await resolveFileByTsv(deps, input.vault!, input.file!, "append_note");

  return { vaultRoot, relPath, vaultDisplayName: input.vault! };
}

export async function executeAppendNote(
  input: AppendNoteInput,
  deps: ExecuteDeps,
): Promise<AppendNoteOutput> {
  const fs = deps.fs ?? DEFAULT_FS;

  const { vaultRoot, relPath, vaultDisplayName } = await resolveLocator(input, deps);
  const mapWriteErr = (e: unknown): UpstreamError =>
    mapFsWriteError(e, { relPath, conflictErrnos: EDITOR_CONFLICT_ERRNOS, conflictVerb: "append to" });

  const absPath = await assertCanonicalPath(vaultRoot, relPath, {
    realpath: fs.realpath,
    logger: deps.logger,
    vaultLabel: input.vault ?? null,
  });

  let existingContent: string;
  try {
    existingContent = await fs.readFile(absPath, "utf8");
  } catch (e) {
    const errno = getErrno(e) ?? "UNKNOWN";
    if (errno === "ENOENT") {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: e,
        details: {
          code: "NOTE_NOT_FOUND",
          path: relPath,
          vault: input.vault ?? null,
        },
        message: `Note "${relPath}" not found in vault.`,
      });
    }
    throw mapWriteErr(e);
  }

  const originalByteCount = Buffer.byteLength(existingContent, "utf8");
  const newContent = appendEdit(existingContent, input.content, input.inline);
  const newByteCount = Buffer.byteLength(newContent, "utf8");

  // ADR-009 §3 atomic write (tmp + rename, UUID-uniquified per FR-026) then
  // best-effort metadataCache invalidation per ADR-009 §5 / R9 — both via the
  // shared _note-io substrate. writeAtomic rethrows the raw fs error; the
  // invalidation is silent on failure (write already landed).
  try {
    await writeAtomic(fs, absPath, newContent, randomUUID);
  } catch (e) {
    throw mapWriteErr(e);
  }
  await invalidateMetadataCache(deps, absPath);

  return {
    path: relPath,
    vault: vaultDisplayName,
    bytes_written: newByteCount - originalByteCount,
    inline: input.inline,
  };
}
