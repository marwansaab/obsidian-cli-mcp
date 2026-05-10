# Contract: `src/path-safety/`

**Feature**: `016-reliable-writer`
**Surface**: `isStructurallySafePath` (`src/path-safety/schema.ts`) + `checkCanonicalPath` (`src/path-safety/canonical.ts`)
**Plan reference**: [plan.md](../plan.md) | **Data model**: [data-model.md](../data-model.md)

This module is **internal** (not an MCP tool). It provides two-layer vault-root sandboxing for any future tool whose handler writes to (or otherwise touches) the vault filesystem from caller-supplied paths. For 016 the only consumer is `write_note`; future writes (`append_note`, `delete_note`'s permanent-delete path, etc.) reuse it.

## Layer 1 — Schema-level structural validator

```ts
// src/path-safety/schema.ts

/**
 * Returns true if the input is structurally safe to use as a vault-relative
 * path component. Caller wraps this in `z.string().refine(isStructurallySafePath, MSG)`.
 *
 * Rejects:
 *   - empty strings
 *   - leading '/' or '\' (POSIX or Windows absolute)
 *   - drive-letter prefix '[A-Za-z]:'
 *   - any '../' or '..\' or '..' segment
 *   - control characters in the [\x00-\x1f] range
 *
 * Does NOT reject:
 *   - spaces (legitimate)
 *   - brackets / parens / Unicode (legitimate Obsidian paths)
 *   - forward slashes (legitimate path separators)
 *   - DEL (0x7f) — flagged as out-of-scope; T0 of /speckit-implement
 *     decides whether to extend the regex
 *   - Unicode RTL/zero-width chars — flagged as out-of-scope; T0 decides
 */
export function isStructurallySafePath(input: string): boolean;

export const STRUCTURALLY_UNSAFE_PATH_MESSAGE: string;
```

### Rejection regex / predicate (canonical implementation)

```ts
export function isStructurallySafePath(input: string): boolean {
  if (input.length === 0) return false;
  if (input.startsWith("/") || input.startsWith("\\")) return false;
  if (/^[A-Za-z]:/.test(input)) return false;
  if (/(^|[\/\\])\.\.([\/\\]|$)/.test(input)) return false;
  if (/[\x00-\x1f]/.test(input)) return false;
  return true;
}

export const STRUCTURALLY_UNSAFE_PATH_MESSAGE =
  "path is not structurally safe (must not start with '/', '\\', or a drive letter; must not contain '..' segments or control characters)";
```

### Layer 1 → caller

When `isStructurallySafePath` returns false, the caller's zod schema fires a `VALIDATION_ERROR` whose `details.issues[0].message` is `STRUCTURALLY_UNSAFE_PATH_MESSAGE` and whose `path` array points at the offending field (`["file"]` or `["path"]`). No filesystem touch.

## Layer 2 — Runtime canonical-path check

```ts
// src/path-safety/canonical.ts

export interface CanonicalCheckDeps {
  /**
   * fs.realpath equivalent. Called on the TARGET'S PARENT DIRECTORY.
   * MUST throw an error with `code === "ENOENT"` if the parent does not yet
   * exist; the caller relies on this for the lexical-fallback branch.
   */
  realpath: (p: string) => Promise<string>;
}

export type CanonicalCheckOutcome = CanonicalCheckOk | CanonicalCheckEscape;

export interface CanonicalCheckOk {
  ok: true;
  /** Absolute path the write should target (canonical when realpath
   *  succeeded; lexical fallback when ENOENT). */
  resolvedPath: string;
}

export interface CanonicalCheckEscape {
  ok: false;
  /** The vault-relative input that escaped. Caller uses this for the
   *  pathEscapeAttempt logger event (FR-029) and the
   *  PATH_ESCAPES_VAULT details. */
  attemptedPath: string;
  /** The canonical resolved path that violated the startsWith check. */
  resolvedPath: string;
}

/**
 * Verify the resolved absolute path lies under vaultRoot.
 *
 * Algorithm:
 *   1. relAbs = path.resolve(vaultRoot, inputPath)         (lexical join)
 *   2. parentDir = path.dirname(relAbs)
 *   3. try canonicalParent = await realpath(parentDir)
 *      catch: if e.code === "ENOENT", set canonicalParent = parentDir
 *             (lexical fallback — safe per FR-014: schema layer (Layer 1)
 *              has already rejected the dangerous lexical shapes)
 *      else: rethrow
 *   4. canonicalRoot = await realpath(vaultRoot)           (canonicalise root too)
 *   5. canonicalAbs = path.join(canonicalParent, path.basename(relAbs))
 *   6. if canonicalAbs.startsWith(canonicalRoot + path.sep) OR
 *      canonicalAbs === canonicalRoot:
 *        return { ok: true, resolvedPath: canonicalAbs }
 *      else:
 *        return { ok: false, attemptedPath: inputPath, resolvedPath: canonicalAbs }
 *
 * Runs BEFORE caller's mkdir per FR-014 ordering.
 */
export function checkCanonicalPath(
  vaultRoot: string,
  inputPath: string,
  deps: CanonicalCheckDeps,
): Promise<CanonicalCheckOutcome>;
```

### Why pre-mkdir order is correct (FR-014 rationale)

If the parent directory exists at the time of the check (ANY component of the path beyond the new file's own basename), `realpath` resolves it to its canonical form, and any symlink in that chain is followed. The `startsWith` check then sees where the symlink actually points — escape detected.

If the parent directory does NOT exist (ENOENT), then by definition every component up to the new file's basename is being created by our own subsequent `mkdir({ recursive: true })`. There are no pre-existing symlinks in those components — they're brand-new directories we just made. The lexical `path.resolve` is safe in this case because the dangerous lexical shapes (`../`, leading slash, drive letter) have already been rejected by Layer 1.

If we ran the realpath check AFTER mkdir, the mkdir step would have created the directories we then realpath — still safe outcome but now we've potentially created directories under a path that escapes vault root (if the input was malicious). Pre-mkdir order is strictly better.

## Layer 2 → caller

When `checkCanonicalPath` returns `ok: false`, the caller:

1. Emits `logger.warn({ event: "pathEscapeAttempt", vault, attemptedPath })` per FR-029.
2. Throws `UpstreamError({ code: "PATH_ESCAPES_VAULT", details: { vault, attemptedPath, resolvedPath } })`.
3. Does NOT touch the filesystem.

When `checkCanonicalPath` returns `ok: true`, the caller uses `resolvedPath` as the absolute path for `fs.mkdir(dirname(resolvedPath), { recursive: true })` and the subsequent write.

## Defense-in-depth posture

The two layers cover overlapping but distinct attack surfaces:

| Attack vector | Caught by Layer 1? | Caught by Layer 2? |
|---|---|---|
| `../../etc/passwd.md` | ✅ (lexical pattern) | ✅ (would also catch via realpath, but Layer 1 rejects first) |
| `/abs/escape.md` (POSIX absolute) | ✅ (leading slash) | ✅ (realpath would resolve outside vault) |
| `C:/escape.md` (Windows absolute) | ✅ (drive letter) | ✅ (realpath would resolve outside vault) |
| `subdir/inside-link/escape.md` where `inside-link → /etc` | ❌ (lexical looks safe) | ✅ (realpath follows symlink, sees /etc, fails startsWith) |
| `bridge/passwd.md` where `bridge → /etc` | ❌ (lexical looks safe) | ✅ (realpath follows symlink) |
| `\x00escape.md` (NUL byte) | ✅ (control char) | ✅ (writeFile would also reject) |

The Layer-2-only case (symlink-escape) is the load-bearing addition; Layer 1 alone would silently succeed for symlink-escape attempts.

## Test seam

`CanonicalCheckDeps.realpath` is fully injectable. Tests cover:

- Happy path: realpath returns a path under vaultRoot → `ok: true`
- Symlink-to-outside: realpath returns a path outside vaultRoot → `ok: false`
- ENOENT: realpath throws `{ code: "ENOENT" }` → falls back to lexical → `ok: true` (since Layer 1 has rejected unsafe shapes)
- Vault root itself a symlink: realpath canonicalises both root and target → check still works
- Non-ENOENT realpath error (e.g. EACCES on the parent dir): rethrown as-is; caller maps to `FS_WRITE_FAILED`

## Future-compat note

When future tools land that touch the vault filesystem from caller-supplied paths (`append_note`, future `delete_note` permanent-delete refinements, etc.), they reuse this module identically — no per-tool path-safety code. Adding new safety rules (e.g. extending Layer 1 to reject DEL `\x7f` after T0 characterisation) is a one-line edit here that propagates to all consumers.
