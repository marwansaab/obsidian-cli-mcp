// Original — no upstream. Schema-layer structural path-safety predicate per ADR-009 / FR-013 — rejects ../ segments, leading absolute markers, drive letters, control chars, and DEL (T002 (d) decision 2026-05-10).

/**
 * Returns `true` when `input` is structurally safe to use as a vault-relative
 * path component. Rejects: empty strings; leading `/` or `\`; drive-letter
 * prefixes (`[A-Za-z]:`); any `..` segment; control characters [0x00..0x1f]
 * and DEL (0x7f).
 *
 * Layer 1 of the two-layer sandboxing scheme — Layer 2 is the runtime
 * canonical-path check in `./canonical.ts` which catches symlink-escape
 * attempts that pass the structural check.
 */
export function isStructurallySafePath(input: string): boolean {
  if (input.length === 0) return false;
  if (input.startsWith("/") || input.startsWith("\\")) return false;
  if (/^[A-Za-z]:/.test(input)) return false;
  if (/(^|[/\\])\.\.([/\\]|$)/.test(input)) return false;
  if (/[\x00-\x1f\x7f]/.test(input)) return false;
  return true;
}

export const STRUCTURALLY_UNSAFE_PATH_MESSAGE =
  "path is not structurally safe (must not start with '/', '\\\\', or a drive letter; must not contain '..' segments or control characters)";
