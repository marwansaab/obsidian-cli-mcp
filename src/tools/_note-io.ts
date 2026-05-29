// Original — no upstream. Shared note-write substrate for the direct-fs write/edit cohort (write_note,
// append_note, patch_block, patch_heading, and the per-note write inside find_and_replace's queue) — F6
// of the thermo-nuclear code-quality review. Centralises the UUID-uniquified atomic tmp+rename write and
// the best-effort metadataCache-invalidation `obsidian eval` round-trip that were previously copy-pasted
// byte-for-byte across the cohort (`buildInvalidateTemplate` alone was four identical copies). writeAtomic
// rethrows the RAW fs error so each caller maps it through its own tool-specific UpstreamError mapper
// (mapFsWriteError / mapFsError diverge per tool); invalidateMetadataCache swallows every failure — the
// write already landed and Obsidian's file watcher refreshes the cache eventually. Byte-preserving: the
// rename-failure unlink, the eval template, and the invokeCli argv shape are identical to the prior inlined
// blocks (the write-cohort handler tests assert the recorded invalidation argv).
import { invokeCli } from "../cli-adapter/cli-adapter.js";

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

/**
 * Frozen `obsidian eval` template that recomputes the metadataCache for the just-written file.
 * Byte-stable — the write-cohort handler tests assert the recorded argv contains this expression.
 */
function buildInvalidateTemplate(absPath: string): string {
  return `(async()=>{const f=app.vault.getFileByPath(${JSON.stringify(absPath)});if(f)await app.metadataCache.computeMetadataAsync(f);})()`;
}

/**
 * Best-effort metadataCache invalidation for the just-written absPath (ADR-009 §5 / FR-011). Silent on
 * every failure — the write already landed and Obsidian's file watcher refreshes the cache eventually.
 * Byte-identical to the prior inlined invokeCli invalidation blocks (same template, same
 * `target_mode:"active"` argv shape, same swallowed catch).
 */
export async function invalidateMetadataCache(deps: EvalDeps, absPath: string): Promise<void> {
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
}
