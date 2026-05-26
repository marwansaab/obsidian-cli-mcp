// Original — no upstream. append_note handler per BI-044 / ADR-009 — specific-mode vault-registry resolve (+ pre-flight `obsidian file` TSV resolver for wikilink-form `file`) OR active-mode focused-file eval → Layer 2 canonical path check → fs.readFile (ENOENT → NOTE_NOT_FOUND per FR-016) → appendEdit pure helper (FR-006 / FR-006a / FR-007 / FR-008 / FR-009 / FR-010 / FR-010a) → atomic tmp+rename with EBUSY/EPERM/EACCES EXTERNAL_EDITOR_CONFLICT classification (FR-022) → best-effort metadataCache invalidation eval → typed output envelope. No race detection — FR-026 publishes last-write-wins (cohort parity with write_note, patch_block; divergence from patch_heading's HEADING_RACE).
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";

import { appendEdit } from "./append-edit.js";
import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { checkCanonicalPath } from "../../path-safety/canonical.js";

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

// FR-022 / R10 external-editor classification: Windows surfaces sharing
// violations as EBUSY / EPERM / EACCES on `fs.rename` when an editor holds
// the target with non-shared-delete access. POSIX rename ignores open handles
// so the classification is effectively Windows-only in practice; the errno
// table is platform-uniform so the test cohort stays portable.
const EDITOR_CONFLICT_ERRNOS = new Set(["EBUSY", "EPERM", "EACCES"]);

function mapFsWriteError(e: unknown, relPath: string): UpstreamError {
  const errno = getErrno(e) ?? "UNKNOWN";
  if (EDITOR_CONFLICT_ERRNOS.has(errno)) {
    return new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: e,
      details: {
        code: "EXTERNAL_EDITOR_CONFLICT",
        // The "unsaved-changes" sub-reason is reserved per BI-040 / R10 for a
        // future detection mechanism; the wrapper never emits it today.
        // Encoded in the contract per ADR-015's multi-state-from-day-one rule.
        reason: "file-locked",
        path: relPath,
        errno,
      },
      message: `Cannot append to "${relPath}" — the file is held open by an external editor (${errno}). Save and close the file in the editor, then retry.`,
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

function parseFileTSV(stdout: string): { path: string } {
  for (const line of stdout.split("\n")) {
    if (line.startsWith("path\t")) {
      return { path: line.slice("path\t".length).trim() };
    }
  }
  throw new UpstreamError({
    code: "CLI_REPORTED_ERROR",
    cause: null,
    details: { stage: "file-tsv-parse", stdout: stdout.slice(0, 500) },
    message: "append_note: file subcommand stdout did not contain a path line",
  });
}

async function resolveLocator(
  input: AppendNoteInput,
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
          "No active file in Obsidian. Open a note in the editor, or call append_note with target_mode=specific + vault + file/path.",
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

  // FR-002 / FR-003 — wikilink-form `file` resolves through a pre-flight
  // `obsidian file file=<name>` TSV resolver call (byte-stable with
  // set_property's pattern). `path` callers skip the resolver and feed the
  // input verbatim into Layer 2.
  let relPath: string;
  if (input.path !== undefined) {
    relPath = input.path;
  } else {
    const fileInfo = await invokeCli(
      {
        command: "file",
        vault: input.vault!,
        parameters: { file: input.file! },
        flags: [],
        target_mode: "specific",
      },
      { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
    );
    relPath = parseFileTSV(fileInfo.stdout).path;
  }

  return { vaultRoot, relPath, vaultDisplayName: input.vault! };
}

export async function executeAppendNote(
  input: AppendNoteInput,
  deps: ExecuteDeps,
): Promise<AppendNoteOutput> {
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
    throw mapFsWriteError(e, relPath);
  }

  const originalByteCount = Buffer.byteLength(existingContent, "utf8");
  const newContent = appendEdit(existingContent, input.content, input.inline);
  const newByteCount = Buffer.byteLength(newContent, "utf8");

  // ADR-009 §3 atomic write: tmp + rename on the same volume; UUID-uniquified
  // tmp path avoids collisions between concurrent calls per FR-026.
  const tmpPath = `${absPath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmpPath, newContent);
  } catch (e) {
    throw mapFsWriteError(e, relPath);
  }
  try {
    await fs.rename(tmpPath, absPath);
  } catch (e) {
    await fs.unlink(tmpPath).catch(() => {});
    throw mapFsWriteError(e, relPath);
  }

  // Best-effort metadataCache invalidation per ADR-009 §5 / R9. Silent on
  // failure — write already landed; Obsidian's file watcher refreshes the
  // cache eventually.
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
    // Silent.
  }

  return {
    path: relPath,
    vault: vaultDisplayName,
    bytes_written: newByteCount - originalByteCount,
    inline: input.inline,
  };
}
