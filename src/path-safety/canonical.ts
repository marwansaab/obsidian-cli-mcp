// Original — no upstream. Runtime canonical-path check per ADR-009 / FR-014 — verifies the resolved absolute path lies under the canonical vault root, with realpath-based symlink follow + ENOENT lexical fallback. Pre-mkdir order so the check sees existing symlinks before the caller creates new dirs underneath.
import { basename, dirname, join, resolve, sep } from "node:path";

export interface CanonicalCheckDeps {
  /** fs.realpath equivalent. MUST throw `{ code: "ENOENT" }` if the path does not exist. */
  realpath: (p: string) => Promise<string>;
}

export interface CanonicalCheckOk {
  ok: true;
  /** Absolute path the write should target (canonical when realpath succeeded; lexical fallback when ENOENT). */
  resolvedPath: string;
}

export interface CanonicalCheckEscape {
  ok: false;
  /** The vault-relative input that escaped. Used for the pathEscapeAttempt logger event (FR-029). */
  attemptedPath: string;
  /** The canonical resolved path (or lexical fallback) that violated the startsWith check. */
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

export async function checkCanonicalPath(
  vaultRoot: string,
  inputPath: string,
  deps: CanonicalCheckDeps,
): Promise<CanonicalCheckOutcome> {
  const lexicalAbs = resolve(vaultRoot, inputPath);
  const parentDir = dirname(lexicalAbs);
  const fileName = basename(lexicalAbs);

  let canonicalParent: string;
  try {
    canonicalParent = await deps.realpath(parentDir);
  } catch (e) {
    if (!isEnoent(e)) throw e;
    canonicalParent = parentDir;
  }

  const canonicalRoot = await deps.realpath(vaultRoot);
  const canonicalAbs = join(canonicalParent, fileName);

  const isUnderRoot =
    canonicalAbs === canonicalRoot ||
    canonicalAbs.startsWith(canonicalRoot + sep);

  if (!isUnderRoot) {
    return { ok: false, attemptedPath: inputPath, resolvedPath: canonicalAbs };
  }
  return { ok: true, resolvedPath: canonicalAbs };
}
