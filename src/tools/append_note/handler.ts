// Original — no upstream. append_note handler per BI-044 / ADR-009 — specific-mode vault-registry resolve (+ pre-flight `obsidian file` TSV resolver for wikilink-form `file`) OR active-mode focused-file eval → note-only file-type check (spec 070: a non-note target is rejected as UNSUPPORTED_FILE_TYPE before any read or write) → Layer 2 canonical path check → fs.readFile (ENOENT → NOTE_NOT_FOUND per FR-016) → appendEdit pure helper (FR-006 / FR-006a / FR-007 / FR-008 / FR-009 / FR-010 / FR-010a) → atomic tmp+rename with EBUSY/EPERM/EACCES EXTERNAL_EDITOR_CONFLICT classification (FR-022) → best-effort metadataCache refresh eval on the vault-relative path in the written vault (logged on failure) → typed output envelope. No race detection — FR-026 publishes last-write-wins (cohort parity with write_note, patch_block; divergence from patch_heading's HEADING_RACE).
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";

import { appendEdit } from "./append-edit.js";
import { type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { assertSupportedFileType, type SupportDeclaration } from "../../file-type/file-type.js";
import { assertCanonicalPath } from "../_active-file.js";
import { resolveFsTarget } from "../_file-target.js";
import { getErrno, mapFsWriteError } from "../_fs-errors.js";
import { invalidateMetadataCache, sizeChange, writeAtomic } from "../_note-io.js";

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

/** The file types `append_note` handles (spec 070): Markdown notes only. */
export const APPEND_NOTE_SUPPORTED = ["note"] as const satisfies SupportDeclaration;

export async function executeAppendNote(
  input: AppendNoteInput,
  deps: ExecuteDeps,
): Promise<AppendNoteOutput> {
  const fs = deps.fs ?? DEFAULT_FS;

  // FR-002 / FR-003 — a wikilink-form `file` resolves through a pre-flight `obsidian file
  // file=<name>` TSV call; `path` feeds Layer 2 verbatim.
  const { vaultRoot, relPath, vaultDisplayName } = await resolveFsTarget(input, deps, "append_note");
  // Spec 070: note text written into a canvas, base or attachment corrupts it; reject before reading the note.
  assertSupportedFileType({ relPath, supported: APPEND_NOTE_SUPPORTED, toolName: "append_note" });
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

  const newContent = appendEdit(existingContent, input.content, input.inline);

  // ADR-009 §3 atomic write (tmp + rename, UUID-uniquified per FR-026) then
  // best-effort metadataCache refresh per ADR-009 §5 / R9 — both via the
  // shared _note-io substrate. writeAtomic rethrows the raw fs error; the
  // refresh is logged on failure, never thrown (write already landed).
  try {
    await writeAtomic(fs, absPath, newContent, randomUUID);
  } catch (e) {
    throw mapWriteErr(e);
  }
  await invalidateMetadataCache(deps, { vault: input.vault, relPath });

  return {
    path: relPath,
    vault: vaultDisplayName,
    bytes_written: sizeChange(existingContent, newContent),
    inline: input.inline,
  };
}
