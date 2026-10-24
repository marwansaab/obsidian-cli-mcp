// Original — no upstream. Shared name collation for wrapper-side sorts. properties (property names)
// and tags (tag names) order their listings identically: case-insensitive first, then a UTF-16
// code-unit tiebreak, never locale-aware (properties Q1/A1; tags FR-011). This module is the single
// source of truth for that ordering; it has no imports, so it is a leaf util with no tool→tool edge
// (Principle I).

/**
 * Compare two names by their lower-cased forms in UTF-16 code-unit order; when those are equal,
 * compare the original names in UTF-16 code-unit order (so `Alpha` sorts before `alpha`).
 * Never locale-aware. Returns a negative, zero or positive number for use with `Array.sort`.
 */
export function compareNames(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (aLower !== bLower) return aLower < bLower ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
