// Original — no upstream. patch_block handler per BI-043 / ADR-009 — specific-mode vault-registry resolve OR active-mode focused-file eval → Layer 2 canonical path check → fs.readFile (ENOENT → NOTE_NOT_FOUND per FR-018) → block-scan + first-match resolve (BLOCK_NOT_FOUND per FR-017) → block-on-heading short-circuit (BLOCK_ON_HEADING per FR-019a, both ATX and setext) → per-shape surgery on per-line-terminator lines (spec 086) → placement check (UNSAFE_PLACEMENT, no write) → atomic tmp+rename with EBUSY/EPERM EXTERNAL_EDITOR_CONFLICT classification (FR-021) → best-effort metadataCache refresh eval in the written vault (logged on failure) → typed output envelope. No race detection — FR-026 publishes last-write-wins per R4 (deliberate divergence from sibling patch_heading). 075: bytes_written = edited minus original byte length (the size change).
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";

import {
  applyDetachReattach,
  applyVerbatimMarkerPreserve,
  detectTrailingNewline,
} from "./block-edit.js";
import { findBlock } from "./block-scan.js";
import { type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { assertCanonicalPath, resolveActiveLocatorWithVault } from "../_active-file.js";
import { getErrno, mapFsWriteError, noteNotFound } from "../_fs-errors.js";
import { invalidateMetadataCache, sizeChange, writeAtomic } from "../_note-io.js";
import { lineStart, placeEdit, splitNoteLines } from "../_note-lines.js";

import type { PatchBlockInput, PatchBlockOutput } from "./schema.js";
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

// FR-021 / R6 external-editor classification: EBUSY (Windows file-sharing
// violation when an editor holds the file with non-shared-delete) and EPERM
// (some Windows shares modes surface this instead of EBUSY). Other errnos
// (ENOSPC, EACCES, EROFS, etc.) fall through to the generic FS_WRITE_FAILED
// catch-all. Cohort divergence from patch_heading which classifies EACCES as
// editor-conflict — patch_block treats EACCES as FS_WRITE_FAILED per T014/T016.
// That divergence is the explicit `conflictErrnos` arg to mapFsWriteError.
const EDITOR_CONFLICT_ERRNOS = new Set(["EBUSY", "EPERM"]);

async function resolveLocator(
  input: PatchBlockInput,
  deps: ExecuteDeps,
): Promise<{ vaultRoot: string; relPath: string; vaultDisplayName: string }> {
  if (input.target_mode === "active") {
    return resolveActiveLocatorWithVault(deps, "patch_block");
  }
  const vaultRoot = await deps.vaultRegistry.resolveVaultPath(input.vault!);
  const relPath = (input.file ?? input.path)!;
  return { vaultRoot, relPath, vaultDisplayName: input.vault! };
}

export async function executePatchBlock(
  input: PatchBlockInput,
  deps: ExecuteDeps,
): Promise<PatchBlockOutput> {
  const fs = deps.fs ?? DEFAULT_FS;

  const { vaultRoot, relPath, vaultDisplayName } = await resolveLocator(input, deps);
  const mapWriteErr = (e: unknown): UpstreamError =>
    mapFsWriteError(e, { relPath, conflictErrnos: EDITOR_CONFLICT_ERRNOS, conflictVerb: "patch" });

  const absPath = await assertCanonicalPath(vaultRoot, relPath, {
    realpath: fs.realpath,
    logger: deps.logger,
    vaultLabel: input.vault ?? null,
  });

  let originalContent: string;
  try {
    originalContent = await fs.readFile(absPath, "utf8");
  } catch (e) {
    if (getErrno(e) === "ENOENT") throw noteNotFound(relPath, input.vault ?? "<focused>", e);
    throw mapWriteErr(e);
  }

  const trailingNewline = detectTrailingNewline(originalContent);
  const lines = splitNoteLines(originalContent);

  const match = findBlock(originalContent, input.block_id);
  if (match === null) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: {
        code: "BLOCK_NOT_FOUND",
        block_id: input.block_id,
        path: relPath,
      },
      message: `Block-reference "^${input.block_id}" not found in "${relPath}". Verify the marker exists and is outside any fenced code block; matching is case-sensitive.`,
    });
  }

  if (match.shape === "on-heading-atx" || match.shape === "on-heading-setext") {
    const headingShape = match.shape === "on-heading-atx" ? "atx" : "setext";
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: {
        code: "BLOCK_ON_HEADING",
        block_id: input.block_id,
        path: relPath,
        heading_shape: headingShape,
      },
      message: `Block-reference "^${input.block_id}" in "${relPath}" is attached to a heading line — route the request to patch_heading.`,
    });
  }

  let editedLines: string[];
  if (match.shape === "separately-placed") {
    editedLines = applyVerbatimMarkerPreserve(lines, match, input.content);
  } else {
    editedLines = applyDetachReattach(lines, match, input.content);
  }
  const successShape = match.shape; // paragraph | list-item | separately-placed

  // spec 086 placement check: the edit array must address the line the scanner found, and the
  // edit must keep the original bytes before and after the block. Refuse before any write.
  const editedContent = placeEdit(originalContent, lines, editedLines, trailingNewline, {
    anchorLine: match.markerLineIndex,
    anchorText: match.markerLineText,
    keepBefore: lineStart(lines, match.blockStartLineIndex),
    keepFromLine: match.blockEndLineIndex + 1,
  });
  if (editedContent === null) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { code: "UNSAFE_PLACEMENT", block_id: input.block_id, path: relPath },
      message: `Edit for block-reference "^${input.block_id}" could not be placed safely in "${relPath}"; the note was not changed. Re-read the note and retry once; if it fails again, report it.`,
    });
  }

  // ADR-009 §3 atomic write (tmp + rename, UUID-uniquified per FR-026) then
  // best-effort metadataCache refresh per ADR-009 §5 — both via the shared
  // _note-io substrate. writeAtomic rethrows the raw fs error; the refresh is
  // logged on failure, never thrown (write already landed).
  try {
    await writeAtomic(fs, absPath, editedContent, randomUUID);
  } catch (e) {
    throw mapWriteErr(e);
  }
  await invalidateMetadataCache(deps, { vault: input.vault, relPath });

  return {
    path: relPath,
    vault: vaultDisplayName,
    block_id: input.block_id,
    block_shape: successShape,
    bytes_written: sizeChange(originalContent, editedContent),
  };
}
