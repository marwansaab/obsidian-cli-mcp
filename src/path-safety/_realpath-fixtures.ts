// Original — no upstream. Shared fake `realpath` for canonical-path tests (spec 068 R5): behaves like the
// real one for existing paths, so the nearest-existing-ancestor walk sees links at any depth. Vitest-free
// (compiles into dist as a harmless orphan, like src/tools/_handler-test-fixtures.ts); coverage excludes it
// via the `_*fixtures.ts` glob.
import { sep } from "node:path";

/**
 * Fake realpath: the longest mapped link prefix of a path is replaced by its target, and every other
 * path resolves to itself.
 */
export function linkRealpath(links: Record<string, string>): (p: string) => Promise<string> {
  return async (p) => {
    const prefix = Object.keys(links)
      .filter((l) => p === l || p.startsWith(l + sep))
      .sort((a, b) => b.length - a.length)[0];
    return prefix === undefined ? p : links[prefix]! + p.slice(prefix.length);
  };
}
