// Original — no upstream. Shared filesystem-error mapping for the single-file write/edit cohort (F4 of the thermo-nuclear code-quality review). Centralises `getErrno` and the EXTERNAL_EDITOR_CONFLICT / FS_WRITE_FAILED classification skeleton previously copy-pasted across append_note, patch_block, and patch_heading. The per-tool divergences are explicit parameters — which errnos count as an external-editor conflict (patch_heading classifies EACCES as a conflict; patch_block does not), the action verb in the conflict message ("append to" vs "patch"), and whether the raw errno path is echoed as `details.fsPath` (patch_heading only) — so each difference is a visible choice rather than a one-token edit buried in a near-duplicate function. Byte-preserving per consumer. write_note (FILE_EXISTS, no editor-conflict) and find_and_replace (reason-keyed, vault-wide) have distinct shapes and keep their own mappers.
import { UpstreamError } from "../errors.js";

/** Narrow an unknown thrown value to its NodeJS errno `code`, if present. */
export function getErrno(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const code = (e as NodeJS.ErrnoException).code;
  return typeof code === "string" ? code : undefined;
}

export interface FsWriteErrorOptions {
  /** Vault-relative path of the target note — echoed as `details.path` and in both messages. */
  relPath: string;
  /**
   * Errnos that signal an external editor holding the file open (Windows
   * sharing violations). Differs per tool: patch_heading + append_note include
   * EACCES; patch_block does not (it routes EACCES to FS_WRITE_FAILED).
   */
  conflictErrnos: ReadonlySet<string>;
  /** Action verb for the conflict message — e.g. `"append to"` or `"patch"`. */
  conflictVerb: string;
  /**
   * When true, echo the raw errno `path` (the OS-reported path) as
   * `details.fsPath` alongside the vault-relative `details.path`. patch_heading
   * only; absent for the other consumers.
   */
  includeFsPath?: boolean;
}

/**
 * Map a filesystem write/read failure to the cohort's structured error:
 * - errno in `conflictErrnos` → `CLI_REPORTED_ERROR` with `details.code:
 *   "EXTERNAL_EDITOR_CONFLICT"`, `reason: "file-locked"`, `path`, `errno` and the
 *   editor-conflict recovery message.
 * - otherwise → `FS_WRITE_FAILED` with `{ errno, syscall, path }` (+ `fsPath`
 *   when `includeFsPath`) and the generic write-failed message.
 *
 * The reserved `details.reason: "unsaved-changes"` sub-state is encoded in the
 * contract per ADR-015's multi-state-from-day-one rule but never emitted (no
 * detection signal exists yet). Byte-identical to the prior per-handler copies.
 */
export function mapFsWriteError(e: unknown, opts: FsWriteErrorOptions): UpstreamError {
  const errno = getErrno(e) ?? "UNKNOWN";
  if (opts.conflictErrnos.has(errno)) {
    return new UpstreamError({
      code: "CLI_REPORTED_ERROR",
      cause: e,
      details: {
        code: "EXTERNAL_EDITOR_CONFLICT",
        reason: "file-locked",
        path: opts.relPath,
        errno,
      },
      message: `Cannot ${opts.conflictVerb} "${opts.relPath}" — the file is held open by an external editor (${errno}). Save and close the file in the editor, then retry.`,
    });
  }
  const err = e as NodeJS.ErrnoException | null;
  const syscall = err?.syscall;
  const fsPath = err?.path;
  return new UpstreamError({
    code: "FS_WRITE_FAILED",
    cause: e,
    details: {
      errno,
      syscall,
      path: opts.relPath,
      ...(opts.includeFsPath && fsPath !== undefined ? { fsPath } : {}),
    },
    message: `Filesystem write failed: ${errno}${syscall ? ` on ${syscall}` : ""} for "${opts.relPath}"`,
  });
}
