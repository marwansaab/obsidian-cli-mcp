// Original — no upstream. patch_block handler per BI-043 / ADR-009 — specific-mode vault-registry resolve OR active-mode focused-file eval → Layer 2 canonical path check → fs.readFile (ENOENT → NOTE_NOT_FOUND per FR-018) → block-scan + first-match resolve (BLOCK_NOT_FOUND per FR-017) → block-on-heading short-circuit (BLOCK_ON_HEADING per FR-019a, both ATX and setext) → per-shape surgery → atomic tmp+rename with EBUSY/EPERM EXTERNAL_EDITOR_CONFLICT classification (FR-021) → best-effort metadataCache invalidation eval → typed output envelope. No race detection — FR-026 publishes last-write-wins per R4 (deliberate divergence from sibling patch_heading).
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";

import {
  applyDetachReattach,
  applyVerbatimMarkerPreserve,
  detectLineEnding,
  detectTrailingNewline,
} from "./block-edit.js";
import { findBlock } from "./block-scan.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { checkCanonicalPath } from "../../path-safety/canonical.js";

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

const FOCUSED_FILE_TEMPLATE =
  "(async()=>{const f=app.workspace.getActiveFile();return JSON.stringify({path:f?.path??null,base:app.vault.adapter.basePath});})()";

function buildInvalidateTemplate(absPath: string): string {
  return `(async()=>{const f=app.vault.getFileByPath(${JSON.stringify(absPath)});if(f)await app.metadataCache.computeMetadataAsync(f);})()`;
}

interface FocusedFileResponse {
  path: string | null;
  base: string;
}

function parseEvalResponse(stdout: string): unknown {
  const trimmed = stdout.trimStart();
  const body = trimmed.startsWith("=> ") ? trimmed.slice(3) : trimmed;
  return JSON.parse(body);
}

function isFocusedFileResponse(value: unknown): value is FocusedFileResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (typeof v.path === "string" || v.path === null) && typeof v.base === "string"
  );
}

function getErrno(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const code = (e as NodeJS.ErrnoException).code;
  return typeof code === "string" ? code : undefined;
}

// FR-021 / R6 external-editor classification: EBUSY (Windows file-sharing
// violation when an editor holds the file with non-shared-delete) and EPERM
// (some Windows shares modes surface this instead of EBUSY). Other errnos
// (ENOSPC, EACCES, EROFS, etc.) fall through to the generic FS_WRITE_FAILED
// catch-all. Cohort divergence from patch_heading which classifies EACCES as
// editor-conflict — patch_block treats EACCES as FS_WRITE_FAILED per T014/T016.
const EDITOR_CONFLICT_ERRNOS = new Set(["EBUSY", "EPERM"]);

function mapFsWriteError(e: unknown, relPath: string): UpstreamError {
  const errno = getErrno(e) ?? "UNKNOWN";
  if (EDITOR_CONFLICT_ERRNOS.has(errno)) {
    return new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: e,
      details: {
        code: "EXTERNAL_EDITOR_CONFLICT",
        // The "unsaved-changes" sub-reason is reserved per BI-040 for a future
        // detection mechanism; the wrapper never emits it (no detection
        // signal exists yet). Encoded in the contract per ADR-015's
        // multi-state-from-day-one preference.
        reason: "file-locked",
        path: relPath,
        errno,
      },
      message: `Cannot patch "${relPath}" — the file is held open by an external editor (${errno}). Save and close the file in the editor, then retry.`,
    });
  }
  const syscall = (e as NodeJS.ErrnoException | null)?.syscall;
  return new UpstreamError({
    code: "FS_WRITE_FAILED",
    cause: e,
    details: { errno, syscall, path: relPath },
    message: `Filesystem write failed: ${errno}${syscall ? ` on ${syscall}` : ""} for "${relPath}"`,
  });
}

async function resolveLocator(
  input: PatchBlockInput,
  deps: ExecuteDeps,
): Promise<{ vaultRoot: string; relPath: string; vaultDisplayName: string }> {
  if (input.target_mode === "active") {
    const focused = await invokeCli(
      {
        command: "eval",
        parameters: { code: FOCUSED_FILE_TEMPLATE },
        flags: [],
        target_mode: "active",
      },
      { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
    );
    let parsed: unknown;
    try {
      parsed = parseEvalResponse(focused.stdout);
    } catch (e) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: e,
        details: { stage: "json-parse", stdout: focused.stdout },
        message: "active-mode focused-file eval returned unparseable response",
      });
    }
    if (!isFocusedFileResponse(parsed)) {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: null,
        details: { stage: "envelope-parse", parsed },
        message: "active-mode focused-file eval returned unexpected shape",
      });
    }
    if (parsed.path === null) {
      throw new UpstreamError({
        code: "ERR_NO_ACTIVE_FILE",
        cause: null,
        details: {},
        message:
          "No active file in Obsidian. Open a note in the editor, or call patch_block with target_mode=specific + vault + file/path.",
      });
    }
    const reverseLookup =
      typeof (deps.vaultRegistry as VaultRegistry & {
        resolveVaultDisplayName?: (basePath: string) => string | null;
      }).resolveVaultDisplayName === "function"
        ? (deps.vaultRegistry as VaultRegistry & {
            resolveVaultDisplayName: (basePath: string) => string | null;
          }).resolveVaultDisplayName(parsed.base)
        : null;
    return {
      vaultRoot: parsed.base,
      relPath: parsed.path,
      vaultDisplayName: reverseLookup ?? parsed.base,
    };
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
  let out = editedLines.join(ending);
  if (trailingNewline && !out.endsWith(ending)) {
    out += ending;
  } else if (!trailingNewline && out.endsWith(ending)) {
    out = out.slice(0, -ending.length);
  }
  return out;
}

export async function executePatchBlock(
  input: PatchBlockInput,
  deps: ExecuteDeps,
): Promise<PatchBlockOutput> {
  const fs = deps.fs ?? DEFAULT_FS;

  const { vaultRoot, relPath, vaultDisplayName } = await resolveLocator(input, deps);

  const check = await checkCanonicalPath(vaultRoot, relPath, { realpath: fs.realpath });
  if (!check.ok) {
    deps.logger.pathEscapeAttempt({
      vault: input.vault ?? null,
      attemptedPath: check.attemptedPath,
    });
    throw new UpstreamError({
      code: "PATH_ESCAPES_VAULT",
      cause: null,
      details: {
        vault: input.vault ?? null,
        attemptedPath: check.attemptedPath,
        resolvedPath: check.resolvedPath,
      },
    });
  }
  const absPath = check.resolvedPath;

  let originalContent: string;
  try {
    originalContent = await fs.readFile(absPath, "utf8");
  } catch (e) {
    const errno = getErrno(e) ?? "UNKNOWN";
    if (errno === "ENOENT") {
      throw new UpstreamError({
        code: "CLI_REPORTED_ERROR",
        cause: e,
        details: {
          code: "NOTE_NOT_FOUND",
          path: relPath,
          vault: input.vault ?? "<focused>",
        },
        message: `Note "${relPath}" not found in vault.`,
      });
    }
    throw mapFsWriteError(e, relPath);
  }

  const lineEnding = detectLineEnding(originalContent);
  const trailingNewline = detectTrailingNewline(originalContent);
  // Strip a trailing line-terminator before splitting so the `lines` array
  // indexes align byte-stably with `scanBlocks`'s logical-line view. The
  // reassembly re-adds the terminator iff the original had one (FR-012).
  const trimmedForSplit = trailingNewline
    ? originalContent.endsWith("\r\n")
      ? originalContent.slice(0, -2)
      : originalContent.slice(0, -1)
    : originalContent;
  const lines = trimmedForSplit.split(lineEnding === "crlf" ? /\r\n/ : "\n");

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

  const editedContent = reassemble(editedLines, lineEnding, trailingNewline);

  // ADR-009 §3 atomic write: tmp + rename on the same volume. UUID-uniquified
  // tmp path avoids collisions between concurrent calls (FR-026 last-write-wins
  // is published; the substrate's atomic rename absorbs the cross-invocation
  // race per R5).
  const tmpPath = `${absPath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmpPath, editedContent);
  } catch (e) {
    throw mapFsWriteError(e, relPath);
  }
  try {
    await fs.rename(tmpPath, absPath);
  } catch (e) {
    await fs.unlink(tmpPath).catch(() => {});
    throw mapFsWriteError(e, relPath);
  }
  const bytesWritten = Buffer.byteLength(editedContent, "utf8");

  // Best-effort metadataCache invalidation per ADR-009 §5 / cohort parity with
  // write_note + patch_heading. Failure is non-fatal — the write already landed
  // and Obsidian's file watcher will eventually pick the change up.
  try {
    await invokeCli(
      {
        command: "eval",
        parameters: { code: buildInvalidateTemplate(absPath) },
        flags: [],
        target_mode: "active",
      },
      { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
    );
  } catch {
    // Silent: write succeeded; cache freshness defers to the file watcher.
  }

  return {
    path: relPath,
    vault: vaultDisplayName,
    block_id: input.block_id,
    block_shape: successShape,
    bytes_written: bytesWritten,
  };
}
