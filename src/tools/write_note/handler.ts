// Original — no upstream. write_note handler per ADR-009 — direct-fs-write: specific-mode resolveVaultPath / active-mode focused-file eval → note-only file-type check (spec 070: a non-note target is rejected as UNSUPPORTED_FILE_TYPE before any write) → checkCanonicalPath → mkdir → stat probe (overwrite=true: existence and old size, ENOENT → created with old size 0, any other errno → FS_WRITE_FAILED before the write; spec 075) → atomic temp+rename (overwrite=true) or wx-flag write (overwrite=false → FILE_EXISTS; old size 0) → best-effort metadataCache refresh eval on the vault-relative path in the written vault (logged on failure) → optional best-effort openLinkText eval (specific + open=true, vault-relative path, vault=) → return { created, path, bytes_written } (bytes_written = byteLength(content) − old size). User content NEVER crosses the CLI argv pipe at any size (FR-005, SC-007).
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";
import { dirname } from "node:path";

import { type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import {
  assertSupportedFileType,
  categoryOf,
  extensionOf,
  type SupportDeclaration,
} from "../../file-type/file-type.js";
import { assertCanonicalPath, resolveActiveFocusedFile } from "../_active-file.js";
import { getErrno } from "../_fs-errors.js";
import { invalidateMetadataCache, openNote, writeAtomic } from "../_note-io.js";

import type { WriteNoteInput, WriteNoteOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

export interface ExecuteFs {
  mkdir: (p: string, opts: { recursive: true }) => Promise<unknown>;
  writeFile: (p: string, content: string, opts?: { flag?: "wx" }) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  realpath: (p: string) => Promise<string>;
  stat: (p: string) => Promise<{ size: number }>;
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
  stat: async (p) => {
    const s = await nodeFs.stat(p);
    return { size: s.size };
  },
  unlink: (p) => nodeFs.unlink(p),
};

/** The file types `write_note` handles (spec 070): Markdown notes only. */
export const WRITE_NOTE_SUPPORTED = ["note"] as const satisfies SupportDeclaration;

// FR-001 / R2 canonical short-form predicate: file is canonical iff it has no
// folder separator AND does not end in `.md`. Internal periods preserved
// (`version_1.2.3` → canonical because `endsWith(".md")` is false). Spec 070: a
// name ending in another core type ("Plan.canvas") is not canonical either, so it
// passes through verbatim and the type check rejects it instead of it becoming
// "Plan.canvas.md"; a note extension in another case ("Plan.MD") stays canonical.
function isCanonicalShortForm(file: string): boolean {
  const category = categoryOf(extensionOf(file));
  return (
    !file.includes("/") &&
    !file.includes("\\") &&
    !file.endsWith(".md") &&
    (category === null || category === "note")
  );
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
  // Raw-cast errno extraction (not getErrno) to stay byte-exact: getErrno's
  // string-guard would remap a non-string `.code` to "UNKNOWN", changing
  // details.errno + the message. The fixed-string predicate checks below use
  // getErrno (provably equivalent for string literals).
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

  assertSupportedFileType({ relPath, supported: WRITE_NOTE_SUPPORTED, toolName: "write_note" });

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
  // Spec 075: the note's size before the write (0 when it did not exist), so
  // bytes_written reports the size change. A stat that fails with anything but
  // ENOENT fails the call before the write (FR-006a): no figure without a measurement.
  let oldSize: number;
  if (input.overwrite === true) {
    let existedBefore: boolean;
    try {
      oldSize = (await fs.stat(absPath)).size;
      existedBefore = true;
    } catch (e) {
      if (getErrno(e) !== "ENOENT") throw mapFsError(e);
      existedBefore = false;
      oldSize = 0;
    }

    try {
      await writeAtomic(fs, absPath, input.content, randomUUID);
    } catch (e) {
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
      if (getErrno(e) === "EEXIST") {
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
    oldSize = 0;
  }

  // Best-effort metadataCache refresh per FR-011 — logged on failure (shared _note-io substrate).
  await invalidateMetadataCache(deps, { vault: input.vault, relPath });

  // Best-effort post-write editor-open per FR-017 — only in specific mode (schema forbids
  // `open` in active mode). Opens the written note in the written vault (spec 068 FR-003);
  // silent on failure (shared _note-io substrate).
  if (input.target_mode === "specific" && input.open === true) {
    await openNote(deps, { vault: input.vault, relPath });
  }

  return {
    created,
    path: relPath,
    bytes_written: Buffer.byteLength(input.content, "utf8") - oldSize,
  };
}
