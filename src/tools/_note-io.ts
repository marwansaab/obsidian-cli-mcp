// Original — no upstream. Shared note-write substrate for the direct-fs write/edit cohort (write_note,
// append_note, patch_block, patch_heading, and find_and_replace's commit loop) — F6 of the thermo-nuclear
// code-quality review. Centralises the UUID-uniquified atomic tmp+rename write and the best-effort
// post-write `obsidian eval` round-trips against the written note (metadataCache refresh, editor open),
// both addressed by vault-relative path in the written vault. writeAtomic rethrows the RAW fs error so each caller
// maps it through its own tool-specific UpstreamError mapper (mapFsWriteError / mapFsError diverge per
// tool). invalidateMetadataCache (spec 068 A1 / R13) refreshes the written note by its vault-relative path
// in the written vault (`vault=` in specific mode); it never fails the write, but every failure — including
// a note Obsidian cannot find — is logged as `bridge.metadata_refresh_failed` rather than swallowed.
import { evalInVault, type EvalDeps } from "./_active-file.js";
import { UpstreamError } from "../errors.js";

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

/** The note a post-write eval targets. */
export interface WrittenNote {
  /** Vault display name. Absent for an active-mode write, which targets the focused vault. */
  vault?: string;
  /** Vault-relative path of the written note (either separator; normalised to forward slashes). */
  relPath: string;
}

/** Obsidian's vault API takes vault-relative paths with forward slashes only. */
function toObsidianPath(relPath: string): string {
  return relPath.replaceAll("\\", "/");
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

/** `openLinkText` takes a vault-relative forward-slash path, not an absolute one. */
function buildOpenTemplate(relPath: string): string {
  return `app.workspace.openLinkText(${JSON.stringify(relPath)},"")`;
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
export async function invalidateMetadataCache(deps: EvalDeps, note: WrittenNote): Promise<void> {
  const relPath = toObsidianPath(note.relPath);
  let reason: string;
  try {
    const output = (await evalInVault(deps, buildInvalidateTemplate(relPath), note.vault)).trim();
    if (output === "=> ok") return;
    reason = output === "=> missing" ? "note not found in the vault index" : `unexpected eval output: ${output.slice(0, 200)}`;
  } catch (e) {
    reason = describeFailure(e);
  }
  deps.logger.metadataRefreshFailed({ vault: note.vault ?? null, relPath, reason });
}

/**
 * Best-effort post-write editor-open of the written note in the written vault (FR-017, spec 068
 * FR-003). Silent on failure: opening is a UX nicety, not the write's contract.
 */
export async function openNote(deps: EvalDeps, note: WrittenNote): Promise<void> {
  try {
    await evalInVault(deps, buildOpenTemplate(toObsidianPath(note.relPath)), note.vault);
  } catch {
    // Silent: write succeeded.
  }
}
