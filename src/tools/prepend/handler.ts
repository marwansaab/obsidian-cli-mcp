// Original — no upstream. prepend handler per BI-045 — CLI-wrap of upstream `obsidian prepend` (cohort divergence from BI-044's fs-direct; rationale in research.md R1). Specific-mode vault-registry resolve (+ pre-flight `obsidian file` TSV resolver for wikilink-form `file`) OR active-mode focused-file eval → note-only file-type check (spec 070: a non-note target is rejected as UNSUPPORTED_FILE_TYPE before the stat and the CLI call) → Layer 2 canonical path check → stat + read (pre; default mode only) → invokeCli prepend with optional `inline` flag → stat (post) → bytes_written delta → spec 076 empty-body correction → typed output envelope. NOTE_NOT_FOUND (FR-016) + EXTERNAL_EDITOR_CONFLICT (FR-022) re-classification on upstream stdout/stderr inspection. Upstream owns the main write; the wrapper reads the note before and after the call and, when Obsidian added a trailing LF to a note with no body (empty or properties-only, landedAtEmptyBody), rewrites it once without that LF through the cohort's writeAtomic + metadata refresh (spec 076).
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";

import { landedAtEmptyBody } from "./empty-body.js";
import { invokeCli, type SpawnLike, type CallScope } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError, stringDetail } from "../../errors.js";
import { assertSupportedFileType, type SupportDeclaration } from "../../file-type/file-type.js";
import { assertCanonicalPath } from "../_active-file.js";
import { resolveFsTarget } from "../_file-target.js";
import { getErrno } from "../_fs-errors.js";
import { invalidateMetadataCache, writeAtomic } from "../_note-io.js";

import type { PrependInput, PrependOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

export interface ExecuteFs {
  realpath: (p: string) => Promise<string>;
  stat: (p: string) => Promise<{ size: number }>;
  readFile: (p: string, encoding: "utf8") => Promise<string>;
  writeFile: (p: string, content: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  unlink: (p: string) => Promise<void>;
}

export interface ExecuteDeps extends CallScope {
  logger: Logger;
  queue: Queue;
  vaultRegistry: VaultRegistry;
  fs?: ExecuteFs;
  spawnFn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_FS: ExecuteFs = {
  realpath: (p) => nodeFs.realpath(p),
  stat: async (p) => {
    const s = await nodeFs.stat(p);
    return { size: s.size };
  },
  readFile: (p, encoding) => nodeFs.readFile(p, encoding),
  writeFile: (p, content) => nodeFs.writeFile(p, content),
  rename: (from, to) => nodeFs.rename(from, to),
  unlink: (p) => nodeFs.unlink(p),
};

// FR-016 / R6 — placeholder pattern strings. T22's T0-P10 probe confirms the
// byte-exact upstream stderr/stdout NOTE_NOT_FOUND signal for the `prepend`
// subcommand; the post-T22 consolidation step updates these patterns to the
// T0-confirmed value before the quality gate runs.
const NOTE_NOT_FOUND_PATTERNS = [
  /note not found/i,
  /file not found/i,
  /no such file/i,
  /does not exist/i,
];

// FR-022 / R6 — placeholder pattern strings. T22's T0-EBUSY probe confirms the
// byte-exact upstream stderr EXTERNAL_EDITOR_CONFLICT signal; the post-T22
// consolidation step updates these to the T0-confirmed value.
const EDITOR_CONFLICT_PATTERNS = [
  /file is locked/i,
  /in use by another process/i,
  /sharing violation/i,
  /\bEBUSY\b/,
  /\bEPERM\b/,
  /\bEACCES\b/,
];

function matchesAny(haystack: string, patterns: RegExp[]): boolean {
  for (const p of patterns) {
    if (p.test(haystack)) return true;
  }
  return false;
}

function extractErrno(haystack: string): string | undefined {
  const m = haystack.match(/\b(EBUSY|EPERM|EACCES)\b/);
  return m ? m[1] : undefined;
}

function classifyUpstreamFailure(
  err: unknown,
  relPath: string,
  vaultDisplayName: string | null,
): never {
  if (!(err instanceof UpstreamError)) throw err as Error;
  const details = err.details as Record<string, unknown>;
  const stdout = stringDetail(details, "stdout");
  const stderr = stringDetail(details, "stderr");
  const message = typeof details.message === "string" ? details.message : err.message ?? "";
  const haystack = `${stdout}\n${stderr}\n${message}`;

  if (matchesAny(haystack, NOTE_NOT_FOUND_PATTERNS)) {
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: {
        code: "NOTE_NOT_FOUND",
        path: relPath,
        vault: vaultDisplayName,
      },
      message: `Note "${relPath}" not found in vault.`,
    });
  }

  if (matchesAny(haystack, EDITOR_CONFLICT_PATTERNS)) {
    const errno = extractErrno(haystack);
    throw new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: err,
      details: {
        code: "EXTERNAL_EDITOR_CONFLICT",
        reason: "file-locked",
        path: relPath,
        ...(errno ? { errno } : {}),
      },
      message: `Cannot prepend to "${relPath}" — the file is held open by an external editor${errno ? ` (${errno})` : ""}. Save and close the file in the editor, then retry.`,
    });
  }

  // Unrecognised upstream failure — fall through with the existing classification
  // unchanged plus a `details.stage` discriminator for the cohort's
  // "unrecognised-error" path (cohort parity with set_property).
  throw new UpstreamError({
    code: err.code,
    cause: err,
    details: { ...details, stage: "prepend-cli" },
    message: err.message,
  });
}

/** The file types `prepend` handles (spec 070): Markdown notes only. */
export const PREPEND_SUPPORTED = ["note"] as const satisfies SupportDeclaration;

export async function executePrepend(
  input: PrependInput,
  deps: ExecuteDeps,
): Promise<PrependOutput> {
  const fs = deps.fs ?? DEFAULT_FS;

  // FR-002 / FR-003 — a wikilink-form `file` resolves through a pre-flight `obsidian file
  // file=<name>` TSV call; `path` feeds Layer 2 verbatim. Cohort parity with append_note.
  const { vaultRoot, relPath, vaultDisplayName } = await resolveFsTarget(input, deps, "prepend");
  // Spec 070: note text written into a canvas, base or attachment corrupts it; reject before the stat and the prepend call.
  assertSupportedFileType({ relPath, supported: PREPEND_SUPPORTED, toolName: "prepend" });

  const absPath = await assertCanonicalPath(vaultRoot, relPath, {
    realpath: fs.realpath,
    logger: deps.logger,
    vaultLabel: input.vault ?? null,
  });

  // Pre-call stat brackets the byte-count delta. ENOENT here means the target
  // doesn't exist; we don't fail eagerly because upstream's NOTE_NOT_FOUND
  // classification is the contract surface for that case (FR-016). Default to
  // 0 and let the upstream prepend call surface the typed error.
  let preCallSize = 0;
  try {
    preCallSize = (await fs.stat(absPath)).size;
  } catch (e) {
    if (getErrno(e) !== "ENOENT") throw e;
    preCallSize = 0;
  }

  // Spec 076 — the note's text before the call, for the empty-body check below. Inline calls
  // skip the read and leave it null: Obsidian's inline write is already exact (research F2).
  // ENOENT leaves it null too (upstream's NOTE_NOT_FOUND stays the contract surface); any other
  // read failure stops the call before Obsidian writes anything.
  let before: string | null = null;
  try {
    if (!input.inline) before = await fs.readFile(absPath, "utf8");
  } catch (e) {
    if (getErrno(e) !== "ENOENT") {
      throw readFailed(
        e,
        relPath,
        (errno) =>
          `prepend: could not read "${relPath}" before the call (${errno}); nothing was changed. Retry once the file can be read.`,
      );
    }
  }

  try {
    await invokeCli(
      {
        command: "prepend",
        vault: input.vault ?? vaultDisplayName,
        parameters: { path: relPath, content: input.content },
        // Cohort flag-serialisation pattern (cf. delete handler's `permanent`
        // flag at src/tools/delete/handler.ts:38) — boolean upstream flags are
        // emitted as bare argv tokens via the `flags` array.
        flags: input.inline ? ["inline"] : [],
        target_mode: "specific",
      },
      deps,
    );
  } catch (err) {
    classifyUpstreamFailure(err, relPath, vaultDisplayName);
  }

  const postCallSize = (await fs.stat(absPath)).size;
  const bytesWritten = postCallSize - preCallSize;

  // BI-047 / FR-003 — post-stat byte-delta guard. Upstream returned exit 0
  // but the on-disk byte count is unchanged (or smaller): the write did not
  // land. Surface as FS_WRITE_FAILED with the post-stat-byte-delta-zero
  // sub-discriminator (ADR-015) rather than emitting a misleading success
  // envelope with bytes_written: 0 (the FR-003 anti-pattern).
  if (bytesWritten <= 0) {
    throw new UpstreamError({
      code: "FS_WRITE_FAILED",
      cause: null,
      details: {
        reason: "post-stat-byte-delta-zero",
        path: relPath,
        vault: vaultDisplayName,
        preCallSize,
        postCallSize,
      },
      message: `prepend: upstream returned success but on-disk byte count is unchanged (pre=${preCallSize}, post=${postCallSize}); the write did not land. Possible silent-no-op from upstream — retry after confirming the target file is not held open by an external editor.`,
    });
  }

  // Spec 076 — `before` is null for inline calls; the size pre-filter skips the read-back for
  // any size change that cannot be content + LF.
  const removed =
    before !== null && bytesWritten === Buffer.byteLength(input.content, "utf8") + 1
      ? await removeAddedLineBreak(input, deps, fs, { absPath, relPath, vaultDisplayName, before })
      : 0;

  return {
    path: relPath,
    vault: vaultDisplayName,
    bytes_written: bytesWritten - removed,
    inline: input.inline,
  };
}

/**
 * Spec 076 — in default mode Obsidian appends one LF after the content. On a note with no body
 * (landedAtEmptyBody) that LF ends up as an extra trailing line break: rewrite the note without it
 * and refresh the metadata cache. Returns the number of bytes removed.
 */
async function removeAddedLineBreak(
  input: PrependInput,
  deps: ExecuteDeps,
  fs: ExecuteFs,
  note: { absPath: string; relPath: string; vaultDisplayName: string | null; before: string },
): Promise<0 | 1> {
  const { absPath, relPath, vaultDisplayName, before } = note;
  let after: string;
  try {
    after = await fs.readFile(absPath, "utf8");
  } catch (e) {
    if (before === "") throw extraNewlineFailed(e, relPath, vaultDisplayName);
    // A non-empty note may have been properties-only; the content landed either way.
    throw readFailed(
      e,
      relPath,
      (errno) =>
        `prepend: the content landed in "${relPath}", but the note could not be read back (${errno}) to check whether Obsidian left an extra trailing line break. Do not send the content again; read the note to check its end.`,
    );
  }

  if (!landedAtEmptyBody(before, input.content, after)) return 0;
  try {
    await writeAtomic(fs, absPath, before + input.content, randomUUID);
  } catch (e) {
    throw extraNewlineFailed(e, relPath, vaultDisplayName);
  }
  await invalidateMetadataCache(deps, { vault: input.vault, relPath });
  return 1;
}

/** Spec 076 — a failed read of the note: the cohort's `FS_WRITE_FAILED` shape, no `reason`. */
function readFailed(
  e: unknown,
  relPath: string,
  message: (errno: string) => string,
): UpstreamError {
  const errno = getErrno(e) ?? "UNKNOWN";
  return new UpstreamError({
    code: "FS_WRITE_FAILED",
    cause: e,
    details: { errno, syscall: "open", path: relPath },
    message: message(errno),
  });
}

/** Spec 076 — the content landed on a note with no body, but the added LF could not be removed. */
function extraNewlineFailed(
  e: unknown,
  relPath: string,
  vaultDisplayName: string | null,
): UpstreamError {
  const errno = getErrno(e);
  return new UpstreamError({
    code: "FS_WRITE_FAILED",
    cause: e,
    details: {
      reason: "extra-trailing-newline",
      path: relPath,
      vault: vaultDisplayName,
      ...(errno ? { errno } : {}),
    },
    message: `prepend: the content landed in "${relPath}", but the extra trailing line break Obsidian added could not be removed (${errno ?? (e instanceof Error ? e.message : String(e))}); the note ends with one extra line break. Retry once the file is free, or remove the final line break yourself.`,
  });
}
