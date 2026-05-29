// Original — no upstream. patch_heading handler per BI-040 / ADR-009 — specific-mode vault-registry resolve OR active-mode focused-file eval → Layer 2 canonical path check → fs.readFile → heading walk → race-check (re-walk + identity compare per FR-019) → mode-dispatched body edit → atomic tmp+rename (FR-020 substrate) → best-effort metadataCache invalidation → typed output envelope. Five error states: HEADING_NOT_FOUND, HEADING_RACE, EXTERNAL_EDITOR_CONFLICT (FR-021 EBUSY/EPERM/EACCES classification), PATH_ESCAPES_VAULT, ERR_NO_ACTIVE_FILE; falls through to FS_WRITE_FAILED for generic fs errors.
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";

import {
  applyAppend,
  applyPrepend,
  applyReplace,
  detectLineEnding,
  detectTrailingNewline,
} from "./body-edit.js";
import {
  parseHeadingPath,
  resolveHeadingIdentity,
  walkHeadings,
  type HeadingIdentity,
} from "./heading-walk.js";
import { type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { assertCanonicalPath, resolveActiveLocatorWithVault } from "../_active-file.js";
import { getErrno, mapFsWriteError } from "../_fs-errors.js";
import { invalidateMetadataCache, writeAtomic } from "../_note-io.js";

import type { PatchHeadingInput, PatchHeadingOutput } from "./schema.js";
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

// FR-021 / R6 external-editor classification: EBUSY (Windows file-sharing violation
// when an editor holds the file with non-shared-delete), EPERM (some Windows shares
// modes surface this instead of EBUSY), EACCES (occasional surface on POSIX advisory
// flock). Other errnos fall through to the generic FS_WRITE_FAILED catch-all.
// patch_block diverges (no EACCES); the difference is the explicit conflictErrnos
// arg. patch_heading additionally echoes the raw errno path as details.fsPath
// (includeFsPath), unlike append_note / patch_block.
const EDITOR_CONFLICT_ERRNOS = new Set(["EBUSY", "EPERM", "EACCES"]);

async function resolveLocator(
  input: PatchHeadingInput,
  deps: ExecuteDeps,
): Promise<{ vaultRoot: string; relPath: string; vaultDisplayName: string }> {
  if (input.target_mode === "active") {
    return resolveActiveLocatorWithVault(deps, "patch_heading");
  }
  const vaultRoot = await deps.vaultRegistry.resolveVaultPath(input.vault!);
  const relPath = (input.file ?? input.path)!;
  return { vaultRoot, relPath, vaultDisplayName: input.vault! };
}

function reassemble(
  editedLines: string[],
  lineEnding: "lf" | "crlf",
  trailingNewline: boolean,
): string {
  const ending = lineEnding === "crlf" ? "\r\n" : "\n";
  // Editing a file that previously ended with '\n' produces an extra empty trailing
  // line in `split("\n")` (e.g. "a\n" -> ["a", ""]); joining preserves the trailing
  // newline naturally. For a file without a trailing newline, the empty trailing
  // element is absent and the join produces no trailing newline.
  let out = editedLines.join(ending);
  if (trailingNewline && !out.endsWith(ending)) {
    out += ending;
  } else if (!trailingNewline && out.endsWith(ending)) {
    out = out.slice(0, -ending.length);
  }
  return out;
}

export async function executePatchHeading(
  input: PatchHeadingInput,
  deps: ExecuteDeps,
): Promise<PatchHeadingOutput> {
  const fs = deps.fs ?? DEFAULT_FS;

  const { vaultRoot, relPath, vaultDisplayName } = await resolveLocator(input, deps);
  const mapWriteErr = (e: unknown): UpstreamError =>
    mapFsWriteError(e, {
      relPath,
      conflictErrnos: EDITOR_CONFLICT_ERRNOS,
      conflictVerb: "patch",
      includeFsPath: true,
    });

  const absPath = await assertCanonicalPath(vaultRoot, relPath, {
    realpath: fs.realpath,
    logger: deps.logger,
    vaultLabel: input.vault ?? null,
  });

  let originalContent: string;
  try {
    originalContent = await fs.readFile(absPath, "utf8");
  } catch (e) {
    const errno = getErrno(e) ?? "UNKNOWN";
    if (errno === "ENOENT") {
      throw new UpstreamError({
        code: "FS_WRITE_FAILED",
        cause: e,
        details: { errno: "ENOENT", path: relPath, syscall: "open" },
        message: `Note file not found at "${relPath}". patch_heading does not create files; create the note via write_note first.`,
      });
    }
    throw mapWriteErr(e);
  }

  const lineEnding = detectLineEnding(originalContent);
  const trailingNewline = detectTrailingNewline(originalContent);
  // Strip a trailing line-terminator before splitting so the `lines` array does not carry
  // a phantom empty trailing element. The reassembly re-adds the terminator iff the
  // original had one (FR-014).
  const trimmedForSplit = trailingNewline
    ? originalContent.endsWith("\r\n")
      ? originalContent.slice(0, -2)
      : originalContent.slice(0, -1)
    : originalContent;
  const lines = trimmedForSplit.split(lineEnding === "crlf" ? /\r\n/ : "\n");

  const segments = parseHeadingPath(input.heading_path);
  const resolved = walkHeadings(originalContent, segments);
  if (resolved === null) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: {
        code: "HEADING_NOT_FOUND",
        heading_path: input.heading_path,
        path: relPath,
      },
      message: `Heading "${input.heading_path}" not found in "${relPath}"`,
    });
  }
  const originalIdentity: HeadingIdentity = resolveHeadingIdentity(resolved);

  let editedLines: string[];
  switch (input.mode) {
    case "append":
      editedLines = applyAppend(lines, resolved, input.content);
      break;
    case "prepend":
      editedLines = applyPrepend(lines, resolved, input.content);
      break;
    case "replace":
      editedLines = applyReplace(lines, resolved, input.content);
      break;
  }
  const editedContent = reassemble(editedLines, lineEnding, trailingNewline);

  // FR-019 / R4 race detection: re-read the file and re-walk; compare identities.
  // The window between the re-read and the rename is small but non-zero — residual
  // race accepted per research.md R5 (substrate's atomic-rename last-write-wins).
  let currentContent: string;
  try {
    currentContent = await fs.readFile(absPath, "utf8");
  } catch (e) {
    throw mapWriteErr(e);
  }
  if (currentContent !== originalContent) {
    const currentResolved = walkHeadings(currentContent, segments);
    if (currentResolved === null) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: {
          code: "HEADING_RACE",
          heading_path: input.heading_path,
          path: relPath,
          original_identity: originalIdentity,
          current_identity: null,
        },
        message: `Heading "${input.heading_path}" was modified between resolve and write; refusing to write to a different heading`,
      });
    }
    const currentIdentity = resolveHeadingIdentity(currentResolved);
    if (
      currentIdentity.markerLineText !== originalIdentity.markerLineText ||
      currentIdentity.rank !== originalIdentity.rank ||
      currentIdentity.parentChainText !== originalIdentity.parentChainText
    ) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: {
          code: "HEADING_RACE",
          heading_path: input.heading_path,
          path: relPath,
          original_identity: originalIdentity,
          current_identity: currentIdentity,
        },
        message: `Heading "${input.heading_path}" was modified between resolve and write; refusing to write to a different heading`,
      });
    }
    // Heading identity unchanged but file bytes changed elsewhere — the substrate's
    // atomic-rename absorbs the conflict per R5 (last-write-wins). We deliberately
    // proceed with the editedContent derived from the ORIGINAL bytes; the concurrent
    // edit will be overwritten.
  }

  // ADR-009 §3 atomic write (tmp + rename, UUID-uniquified) then best-effort
  // metadataCache invalidation per ADR-009 §5 — both via the shared _note-io
  // substrate. writeAtomic rethrows the raw fs error; the invalidation is silent
  // on failure (write already landed).
  try {
    await writeAtomic(fs, absPath, editedContent, randomUUID);
  } catch (e) {
    throw mapWriteErr(e);
  }
  const bytesWritten = Buffer.byteLength(editedContent, "utf8");

  await invalidateMetadataCache(deps, absPath);

  return {
    path: relPath,
    vault: vaultDisplayName,
    heading_path: input.heading_path,
    mode: input.mode,
    bytes_written: bytesWritten,
  };
}
