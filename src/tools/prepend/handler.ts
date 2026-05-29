// Original — no upstream. prepend handler per BI-045 — CLI-wrap of upstream `obsidian prepend` (cohort divergence from BI-044's fs-direct; rationale in research.md R1). Specific-mode vault-registry resolve (+ pre-flight `obsidian file` TSV resolver for wikilink-form `file`) OR active-mode focused-file eval → Layer 2 canonical path check → stat (pre) → invokeCli prepend with optional `inline` flag → stat (post) → bytes_written delta → typed output envelope. NOTE_NOT_FOUND (FR-016) + EXTERNAL_EDITOR_CONFLICT (FR-022) re-classification on upstream stdout/stderr inspection. No fs read/write/rename — upstream owns the byte-level write; the wrapper only stats for the byte-count delta + realpath for Layer 2.
import * as nodeFs from "node:fs/promises";

import { invokeCli, type SpawnLike } from "../../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../../errors.js";
import {
  assertCanonicalPath,
  resolveActiveFocusedFile,
  resolveFileByTsv,
  resolveVaultDisplayName,
} from "../_active-file.js";

import type { PrependInput, PrependOutput } from "./schema.js";
import type { Logger } from "../../logger.js";
import type { Queue } from "../../queue.js";
import type { VaultRegistry } from "../../vault-registry/registry.js";

export interface ExecuteFs {
  realpath: (p: string) => Promise<string>;
  stat: (p: string) => Promise<{ size: number }>;
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
  realpath: (p) => nodeFs.realpath(p),
  stat: async (p) => {
    const s = await nodeFs.stat(p);
    return { size: s.size };
  },
};

function getErrno(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const code = (e as NodeJS.ErrnoException).code;
  return typeof code === "string" ? code : undefined;
}

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
  const stdout = typeof details.stdout === "string" ? details.stdout : "";
  const stderr = typeof details.stderr === "string" ? details.stderr : "";
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

async function resolveLocator(
  input: PrependInput,
  deps: ExecuteDeps,
): Promise<{ vaultRoot: string; relPath: string; vaultDisplayName: string }> {
  if (input.target_mode === "active") {
    const { vaultRoot, relPath } = await resolveActiveFocusedFile(deps, "prepend");
    return {
      vaultRoot,
      relPath,
      vaultDisplayName: resolveVaultDisplayName(deps.vaultRegistry, vaultRoot),
    };
  }

  const vaultRoot = await deps.vaultRegistry.resolveVaultPath(input.vault!);

  // FR-002 / FR-003 — wikilink-form `file` resolves through a pre-flight
  // `obsidian file file=<name>` TSV resolver call. `path` callers skip the
  // resolver and feed the input verbatim into Layer 2. Cohort parity with
  // append_note + set_property.
  const relPath =
    input.path !== undefined
      ? input.path
      : await resolveFileByTsv(deps, input.vault!, input.file!, "prepend");

  return { vaultRoot, relPath, vaultDisplayName: input.vault! };
}

export async function executePrepend(
  input: PrependInput,
  deps: ExecuteDeps,
): Promise<PrependOutput> {
  const fs = deps.fs ?? DEFAULT_FS;

  const { vaultRoot, relPath, vaultDisplayName } = await resolveLocator(input, deps);

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
      { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
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

  return {
    path: relPath,
    vault: vaultDisplayName,
    bytes_written: bytesWritten,
    inline: input.inline,
  };
}
