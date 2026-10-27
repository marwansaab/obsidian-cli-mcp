// Original — no upstream. Shared note-write substrate for the direct-fs write/edit cohort (write_note,
// append_note, patch_block, patch_heading, and find_and_replace's commit loop) — F6 of the thermo-nuclear
// code-quality review. Centralises the UUID-uniquified atomic tmp+rename write and the best-effort
// metadataCache refresh `obsidian eval` round-trip. writeAtomic rethrows the RAW fs error so each caller
// maps it through its own tool-specific UpstreamError mapper (mapFsWriteError / mapFsError diverge per
// tool). invalidateMetadataCache (spec 068 A1 / R13) refreshes the written note by its vault-relative path
// in the written vault (`vault=` in specific mode); it never fails the write, but every failure — including
// a note Obsidian cannot find — is logged as `bridge.metadata_refresh_failed` rather than swallowed.
import { invokeCli } from "../cli-adapter/cli-adapter.js";
import { UpstreamError } from "../errors.js";

import type { EvalDeps } from "./_active-file.js";

/** The fs surface writeAtomic drives — the intersection shared by every write-cohort ExecuteFs. */
export interface AtomicWriteFs {
  writeFile: (p: string, content: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  unlink: (p: string) => Promise<void>;
}

/**
 * ADR-009 §3 atomic same-volume write: write to a UUID-uniquified tmp sibling, then rename onto the
 * target (the substrate's atomic rename absorbs cross-invocation races per FR-026 last-write-wins). On
 * rename failure the tmp is best-effort-unlinked and the RAW error rethrown — the caller decides the
 * UpstreamError mapping. A writeFile failure throws before any tmp exists, so it is rethrown without an
 * unlink. Byte-identical to the prior inlined tmp+rename blocks across the cohort.
 */
export async function writeAtomic(
  fs: AtomicWriteFs,
  absPath: string,
  content: string,
  randomUUID: () => string,
): Promise<void> {
  const tmpPath = `${absPath}.${randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, content);
  try {
    await fs.rename(tmpPath, absPath);
  } catch (e) {
    await fs.unlink(tmpPath).catch(() => {});
    throw e;
  }
}

/** The note a metadata refresh targets. */
export interface RefreshTarget {
  /** Vault display name. Absent for an active-mode write, which targets the focused vault. */
  vault?: string;
  /** Vault-relative path of the written note (either separator; normalised to forward slashes). */
  relPath: string;
}

/**
 * `obsidian eval` template that recomputes the metadataCache for the written note. `getFileByPath`
 * takes a vault-relative forward-slash path. Prints `missing` when Obsidian has no such note, so a
 * refresh that did nothing is reported rather than silently passing.
 *
 * It calls `computeFileMetadataAsync(file)`, the method Obsidian's own file watcher uses: it reads the
 * file's bytes and queues them on the metadata worker. It must NOT call `computeMetadataAsync(file)`:
 * that method takes the bytes, not a TFile, and handing it a TFile wedges the vault's metadata worker
 * until Obsidian reloads (spec 068 evidence-a1.md, T010).
 */
function buildInvalidateTemplate(relPath: string): string {
  return `(async()=>{const f=app.vault.getFileByPath(${JSON.stringify(relPath)});if(!f)return "missing";await app.metadataCache.computeFileMetadataAsync(f);return "ok";})()`;
}

function describeFailure(e: unknown): string {
  if (e instanceof UpstreamError) return `${e.code}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

/**
 * Best-effort metadataCache refresh for the written note (ADR-009 §5 / FR-011, spec 068 FR-001–FR-004).
 * Specific mode when a vault is named (`vault=` on the argv), active mode otherwise. Never rejects: the
 * write already landed, so a failure is logged as `metadataRefreshFailed` and the call resolves.
 */
export async function invalidateMetadataCache(deps: EvalDeps, target: RefreshTarget): Promise<void> {
  const relPath = target.relPath.replaceAll("\\", "/");
  let reason: string;
  try {
    const { stdout } = await invokeCli(
      {
        command: "eval",
        vault: target.vault,
        parameters: { code: buildInvalidateTemplate(relPath) },
        flags: [],
        target_mode: target.vault === undefined ? "active" : "specific",
      },
      { spawnFn: deps.spawnFn, env: deps.env, logger: deps.logger, queue: deps.queue },
    );
    if (stdout.trim() === "=> ok") return;
    reason = stdout.trim() === "=> missing" ? "note not found in the vault index" : `unexpected eval output: ${stdout.trim().slice(0, 200)}`;
  } catch (e) {
    reason = describeFailure(e);
  }
  deps.logger.metadataRefreshFailed({ vault: target.vault ?? null, relPath, reason });
}
