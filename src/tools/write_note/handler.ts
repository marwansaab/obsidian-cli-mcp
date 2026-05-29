// Original — no upstream. write_note handler per ADR-009 — direct-fs-write: specific-mode resolveVaultPath / active-mode focused-file eval → checkCanonicalPath → mkdir → atomic temp+rename (overwrite=true) or wx-flag write (overwrite=false → FILE_EXISTS) → best-effort metadataCache invalidation eval → optional best-effort openLinkText eval (specific + open=true) → return { created, path }. User content NEVER crosses the CLI argv pipe at any size (FR-005, SC-007).
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";
import { dirname } from "node:path";

import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import { assertCanonicalPath, resolveActiveFocusedFile } from "../_active-file.js";

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

function buildOpenTemplate(absPath: string): string {
  return `app.workspace.openLinkText(${JSON.stringify(absPath)},"")`;
}

function isErrnoCode(e: unknown, code: string): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as NodeJS.ErrnoException).code === code
  );
}

// FR-001 / R2 canonical short-form predicate: file is canonical iff it has no
// folder separator AND does not end in `.md`. Internal periods preserved
// (`version_1.2.3` → canonical because `endsWith(".md")` is false).
function isCanonicalShortForm(file: string): boolean {
  return !file.includes("/") && !file.includes("\\") && !file.endsWith(".md");
}

// FR-001 / R1 specific-mode path resolution: `input.path` passes through
// verbatim; `input.file` resolves to `<file>.md` at vault root for canonical
// short-form inputs and passes through verbatim otherwise (FR-001a).
function resolveSpecificModePath(input: WriteNoteInput): string {
  if (input.path !== undefined) return input.path;
  const file = input.file!;
  return isCanonicalShortForm(file) ? `${file}.md` : file;
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

  let vaultRoot: string;
  let relPath: string;

  if (input.target_mode === "active") {
    ({ vaultRoot, relPath } = await resolveActiveFocusedFile(deps, "write_note"));
  } else {
    vaultRoot = await deps.vaultRegistry.resolveVaultPath(input.vault!);
    relPath = resolveSpecificModePath(input);
  }

  const absPath = await assertCanonicalPath(vaultRoot, relPath, {
    realpath: fs.realpath,
    logger: deps.logger,
    vaultLabel: input.vault ?? null,
  });

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
    // overwrite=false: atomic create-or-fail via O_CREAT|O_EXCL (the `wx` flag).
    // The kernel guarantees the EEXIST race-freeness; no TOCTOU window exists
    // between an exists-check and the write because there is no exists-check.
    try {
      await fs.writeFile(absPath, input.content, { flag: "wx" });
    } catch (e) {
      if (isErrnoCode(e, "EEXIST")) {
        throw new UpstreamError({
          code: "FILE_EXISTS",
          cause: e,
          details: { errno: "EEXIST", path: relPath, vault: input.vault ?? null },
          message: `File already exists at "${relPath}" and overwrite is false.`,
        });
      }
      throw mapFsError(e);
    }
    created = true;
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

  // Best-effort post-write editor-open per FR-017 — only in specific mode (schema forbids
  // `open` in active mode). Silent on failure: open is a UX nicety, not the contract.
  if (input.target_mode === "specific" && input.open === true) {
    try {
      await invokeCli(
        {
          command: "eval",
          parameters: { code: buildOpenTemplate(absPath) },
          flags: [],
          target_mode: "active",
        },
        { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
      );
    } catch {
      // Silent: write succeeded.
    }
  }

  return { created, path: relPath };
}
