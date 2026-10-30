// Original — no upstream. Shared schema-test utility (BI-058 F-C): the recursive
// walkSchema helper that ~19 src/tools/<name>/index.test.ts files each defined
// verbatim. Used to count the nested `description` keys of a published JSON Schema
// (068 PR 4: every property is now described; the per-tool shape invariants — type / properties-set / required /
// additionalProperties — are covered centrally by tools/_register.test.ts'
// assertInvariant, so they no longer need per-tool re-assertion). BI-067 / PR #78
// review adds messageForPath, the exact-string message extractor the FR-010 suites
// (create_base, query_base) previously each defined verbatim. Pure and
// vitest-free, so the build compiles it as a harmless dist orphan like
// _registration-stub.ts; fully covered by its co-located .test.ts.
import type { z } from "zod";

/** Depth-first visit of every plain-object node in a JSON-Schema-shaped value. */
export function walkSchema(node: unknown, fn: (n: Record<string, unknown>) => void): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkSchema(item, fn);
    return;
  }
  fn(node as Record<string, unknown>);
  for (const value of Object.values(node as Record<string, unknown>)) walkSchema(value, fn);
}

/** Count nested `description` keys anywhere in a published JSON Schema. */
export function countDescriptionKeys(schema: unknown): number {
  let found = 0;
  walkSchema(schema, (n) => {
    if (Object.prototype.hasOwnProperty.call(n, "description")) found += 1;
  });
  return found;
}

/**
 * First issue message anchored at top-level `field`, or `undefined` on success or
 * when no issue sits there — for exact-string message pins (BI-067 FR-010 cohort).
 */
export function messageForPath<T>(
  result: z.ZodSafeParseResult<T>,
  field: string,
): string | undefined {
  if (result.success) return undefined;
  return result.error.issues.find((i) => i.path[0] === field)?.message;
}
