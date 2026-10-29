// Original — no upstream. Runtime canonical-path check per ADR-009 / FR-014 — verifies the resolved absolute path lies under the canonical vault root. Resolves the nearest existing ancestor with realpath and re-appends the not-yet-existing segments (spec 068 R5), so a link inside the vault that points outside is caught even when the folders under it do not exist yet. Pre-mkdir order so the check sees existing links before the caller creates new dirs underneath.
import { basename, dirname, join, resolve, sep } from "node:path";

export interface CanonicalCheckDeps {
  /** fs.realpath equivalent. MUST throw `{ code: "ENOENT" }` if the path does not exist. */
  realpath: (p: string) => Promise<string>;
}

export interface CanonicalCheckOk {
  ok: true;
  /** Absolute path the write should target: the realpath of the nearest existing ancestor plus the missing segments. */
  resolvedPath: string;
}

export interface CanonicalCheckEscape {
  ok: false;
  /** The vault-relative input that escaped. Used for the pathEscapeAttempt logger event (FR-029). */
  attemptedPath: string;
  /** The canonical resolved path that violated the startsWith check. */
  resolvedPath: string;
}

export type CanonicalCheckOutcome = CanonicalCheckOk | CanonicalCheckEscape;

function isEnoent(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as NodeJS.ErrnoException).code === "ENOENT"
  );
}

/**
 * realpath the nearest existing ancestor of `p` (or `p` itself) and re-append the
 * segments that do not exist yet. ENOENT continues the walk; any other error is rethrown.
 */
async function realpathNearestExisting(p: string, deps: CanonicalCheckDeps): Promise<string> {
  const missing: string[] = [];
  let current = p;
  for (;;) {
    try {
      return join(await deps.realpath(current), ...missing);
    } catch (e) {
      const parent = dirname(current);
      if (!isEnoent(e) || parent === current) throw e;
      missing.unshift(basename(current));
      current = parent;
    }
  }
}

export async function checkCanonicalPath(
  vaultRoot: string,
  inputPath: string,
  deps: CanonicalCheckDeps,
): Promise<CanonicalCheckOutcome> {
  const lexicalAbs = resolve(vaultRoot, inputPath);
  const canonicalAbs = await realpathNearestExisting(lexicalAbs, deps);
  const canonicalRoot = await deps.realpath(vaultRoot);

  const isUnderRoot =
    canonicalAbs === canonicalRoot ||
    canonicalAbs.startsWith(canonicalRoot + sep);

  if (!isUnderRoot) {
    return { ok: false, attemptedPath: inputPath, resolvedPath: canonicalAbs };
  }
  return { ok: true, resolvedPath: canonicalAbs };
}
