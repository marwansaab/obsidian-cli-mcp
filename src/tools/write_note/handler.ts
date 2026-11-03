// Original — no upstream. write_note handler per ADR-009 — direct-fs-write: specific-mode resolveVaultPath, then for a `file` name one vault-targeted lookup eval (BI-0176: an existing note is written wherever it is; the lookup must report the named vault, else CLI_REPORTED_ERROR / VAULT_MISMATCH and nothing is written; only a name no note has falls back to the vault-root short-form rule) / active-mode focused-file eval → note-only file-type check (spec 070: a non-note target is rejected as UNSUPPORTED_FILE_TYPE before any write) → checkCanonicalPath → mkdir → stat probe (overwrite=true: existence and old size, ENOENT → created with old size 0, any other errno fails before the write; spec 075; fs failures map through the cohort's mapFsWriteError, EBUSY / EPERM → EXTERNAL_EDITOR_CONFLICT, BI-0176) → atomic temp+rename (overwrite=true) or wx-flag write (overwrite=false → FILE_EXISTS; old size 0) → best-effort metadataCache refresh eval on the vault-relative path in the written vault (logged on failure) → optional best-effort openLinkText eval (specific + open=true, vault-relative path, vault=) → return { created, path, bytes_written } (bytes_written = byteLength(content) − old size). User content NEVER crosses the CLI argv pipe at any size (FR-005, SC-007).
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";
import { dirname } from "node:path";

import { NAME_LOOKUP_TEMPLATE } from "./_template.js";
import { nameLookupEvalResponseSchema } from "./schema.js";
import { invokeEval, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import {
  assertSupportedFileType,
  categoryOf,
  extensionOf,
  type SupportDeclaration,
} from "../../file-type/file-type.js";
import { assertCanonicalPath, decodeEvalEnvelope, resolveActiveFocusedFile } from "../_active-file.js";
import { getErrno, mapFsWriteError } from "../_fs-errors.js";
import { invalidateMetadataCache, openNote, writeAtomic } from "../_note-io.js";
import { composeEvalCode } from "../_shared.js";

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

// BI-0176: a lock on the target is the cohort's editor conflict. EBUSY / EPERM is
// patch_block's set; EACCES stays a permissions failure (FS_WRITE_FAILED).
const CONFLICT_ERRNOS: ReadonlySet<string> = new Set(["EBUSY", "EPERM"]);

// Specific-mode path resolution: `input.path` passes through verbatim. BI-0176: a
// `file` name is resolved like a wikilink by one eval in the named vault, so an
// existing note is the one written wherever it is. The eval reports the vault it ran
// in; unless that is the named vault, nothing is written (owner ruling, scope (a)):
// neither the root fallback nor a path from another vault's lookup is trusted. Only a
// name no note has in the named vault falls back to the FR-001 / FR-001a rule:
// `<file>.md` at the vault root for a canonical short form, verbatim otherwise.
async function resolveSpecificModePath(input: WriteNoteInput, deps: ExecuteDeps): Promise<string> {
  if (input.path !== undefined) return input.path;
  const file = input.file!;
  const vault = input.vault!;
  const result = await invokeEval({ code: composeEvalCode(NAME_LOOKUP_TEMPLATE, { file }), vault }, deps);
  const lookup = decodeEvalEnvelope(result, nameLookupEvalResponseSchema, {
    toolName: "write_note",
    malformedCode: "CLI_REPORTED_ERROR",
  });
  if (lookup.vault !== vault) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: null,
      details: { code: "VAULT_MISMATCH", vault, answeredBy: lookup.vault, file },
      message: `write_note: the lookup of "${file}" ran in vault "${lookup.vault}", not "${vault}", so nothing was written. Retry, or address the note by path.`,
    });
  }
  if (lookup.path !== null) return lookup.path;
  return isCanonicalShortForm(file) ? `${file}.md` : file;
}

// EEXIST keeps its `{ errno }`-only FILE_EXISTS shape (test-pinned asymmetry with the
// `wx` create's FILE_EXISTS); every other errno maps like the sibling writers, with
// the vault-relative path and no OS path (BI-0176).
function mapFsError(e: unknown, relPath: string): UpstreamError {
  if (getErrno(e) === "EEXIST") {
    return new UpstreamError({
      code: "FILE_EXISTS",
      cause: e,
      details: { errno: "EEXIST" },
    });
  }
  return mapFsWriteError(e, { relPath, conflictErrnos: CONFLICT_ERRNOS, conflictVerb: "write" });
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
    relPath = await resolveSpecificModePath(input, deps);
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
    throw mapFsError(e, relPath);
  }

  // Spec 075: the note's size before the write, null when it did not exist (the
  // write is a create), so bytes_written reports the size change. A stat that fails
  // with anything but ENOENT fails the call before the write (FR-006a): no figure
  // without a measurement.
  let sizeBefore: number | null = null;
  if (input.overwrite === true) {
    try {
      sizeBefore = (await fs.stat(absPath)).size;
    } catch (e) {
      if (getErrno(e) !== "ENOENT") throw mapFsError(e, relPath);
    }

    try {
      await writeAtomic(fs, absPath, input.content, randomUUID);
    } catch (e) {
      throw mapFsError(e, relPath);
    }
  } else {
    // overwrite=false: atomic create-or-fail via O_CREAT|O_EXCL (the `wx` flag).
    // The kernel guarantees the EEXIST race-freeness; no TOCTOU window exists
    // between an exists-check and the write because there is no exists-check.
    // A write that lands is therefore a create: sizeBefore stays null.
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
      throw mapFsError(e, relPath);
    }
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
    created: sizeBefore === null,
    path: relPath,
    bytes_written: Buffer.byteLength(input.content, "utf8") - (sizeBefore ?? 0),
  };
}
