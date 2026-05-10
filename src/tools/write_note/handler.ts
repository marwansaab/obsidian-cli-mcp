// Original — no upstream. write_note handler per ADR-009 — direct-fs-write skeleton (US1 / T012): specific-mode resolveVaultPath → checkCanonicalPath → mkdir → atomic temp+rename (overwrite=true) → best-effort metadataCache invalidation eval → return { created, path }. Active mode + overwrite=false (wx) + open-eval branches added in subsequent stories (US3 / US2 / US6).
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";
import { dirname } from "node:path";

import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { checkCanonicalPath } from "../../path-safety/canonical.js";

import type { WriteNoteInput, WriteNoteOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

export interface ExecuteFs {
  mkdir: (p: string, opts: { recursive: true }) => Promise<unknown>;
  writeFile: (p: string, content: string, opts?: { flag?: "wx" }) => Promise<void>;
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
  mkdir: (p, opts) => nodeFs.mkdir(p, opts),
  writeFile: (p, content, opts) => nodeFs.writeFile(p, content, opts),
  rename: (from, to) => nodeFs.rename(from, to),
  realpath: (p) => nodeFs.realpath(p),
  unlink: (p) => nodeFs.unlink(p),
};

function buildInvalidateTemplate(absPath: string): string {
  return `(async()=>{const f=app.vault.getFileByPath(${JSON.stringify(absPath)});if(f)await app.metadataCache.computeMetadataAsync(f);})()`;
}

function isErrnoCode(e: unknown, code: string): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as NodeJS.ErrnoException).code === code
  );
}

function mapFsError(e: unknown): UpstreamError {
  const errno = (e as NodeJS.ErrnoException | null)?.code ?? "UNKNOWN";
  if (errno === "EEXIST") {
    return new UpstreamError({
      code: "FILE_EXISTS",
      cause: e,
      details: { errno },
    });
  }
  const syscall = (e as NodeJS.ErrnoException | null)?.syscall;
  const path = (e as NodeJS.ErrnoException | null)?.path;
  return new UpstreamError({
    code: "FS_WRITE_FAILED",
    cause: e,
    details: { errno, syscall, path },
    message: `Filesystem write failed: ${errno}${syscall ? ` on ${syscall}` : ""}${path ? ` for ${path}` : ""}`,
  });
}

export async function executeWriteNote(
  input: WriteNoteInput,
  deps: ExecuteDeps,
): Promise<WriteNoteOutput> {
  const fs = deps.fs ?? DEFAULT_FS;

  if (input.target_mode !== "specific") {
    // Active mode is added by US3 / T018; reject explicitly until then.
    throw new UpstreamError({
      code: "ERR_NO_ACTIVE_FILE",
      cause: null,
      details: { target_mode: input.target_mode },
      message: "active mode is not yet supported by the reliable writer",
    });
  }

  const vaultRoot = await deps.vaultRegistry.resolveVaultPath(input.vault!);
  const relPath = (input.path ?? input.file)!;

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

  try {
    await fs.mkdir(dirname(absPath), { recursive: true });
  } catch (e) {
    throw mapFsError(e);
  }

  let created: boolean;
  if (input.overwrite === true) {
    let existedBefore: boolean;
    try {
      await fs.realpath(absPath);
      existedBefore = true;
    } catch (e) {
      if (!isErrnoCode(e, "ENOENT")) throw mapFsError(e);
      existedBefore = false;
    }

    const tmpPath = `${absPath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tmpPath, input.content);
    } catch (e) {
      throw mapFsError(e);
    }
    try {
      await fs.rename(tmpPath, absPath);
    } catch (e) {
      await fs.unlink(tmpPath).catch(() => {});
      throw mapFsError(e);
    }
    created = !existedBefore;
  } else {
    // overwrite=false branch lands in US2 / T014 (wx-flag + FILE_EXISTS mapping).
    throw new UpstreamError({
      code: "FS_WRITE_FAILED",
      cause: null,
      details: { reason: "overwrite=false branch not yet implemented" },
      message: "overwrite=false branch is implemented in US2 (T014)",
    });
  }

  // Best-effort metadataCache invalidation per FR-011 — silent on failure.
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
    // Silent: write succeeded; cache freshness defers to Obsidian's file watcher.
  }

  return { created, path: relPath };
}
