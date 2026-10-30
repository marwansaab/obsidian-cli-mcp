// Original — no upstream. Shared schema-test utility. undescribedProperties is the one walk
// that checks a published JSON Schema describes every property at every depth (068 FR-030);
// tools/_surface.test.ts runs it over every published tool, so per-tool index tests do not
// re-assert it (the per-tool shape invariants — type / properties-set / required /
// additionalProperties — are likewise covered centrally by tools/_register.test.ts'
// assertInvariant). BI-067 / PR #78 review adds messageForPath, the exact-string message
// extractor the FR-010 suites (create_base, query_base) previously each defined verbatim.
// Pure and vitest-free, so the build compiles it as a harmless dist orphan like
// _registration-stub.ts; fully covered by its co-located .test.ts.
import type { z } from "zod";

/**
 * Every path to a property (at any depth) that has no non-empty description. Recurses into
 * the values of `properties` (never treating a field name as a keyword), array `items`,
 * `anyOf` / `oneOf` / `allOf` branches and `additionalProperties`.
 */
export function undescribedProperties(node: unknown, at: string): string[] {
  if (typeof node !== "object" || node === null) return [];
  const schema = node as Record<string, unknown>;
  const missing: string[] = [];
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  for (const [key, child] of Object.entries(properties ?? {})) {
    const description = child.description;
    if (typeof description !== "string" || description.trim() === "") missing.push(`${at}.${key}`);
    missing.push(...undescribedProperties(child, `${at}.${key}`));
  }
  const items = schema.items;
  for (const item of Array.isArray(items) ? items : [items]) missing.push(...undescribedProperties(item, `${at}[]`));
  for (const keyword of ["anyOf", "oneOf", "allOf"] as const) {
    const branches = schema[keyword];
    if (Array.isArray(branches)) {
      branches.forEach((branch, i) => missing.push(...undescribedProperties(branch, `${at}/${keyword}/${i}`)));
    }
  }
  missing.push(...undescribedProperties(schema.additionalProperties, `${at}{}`));
  return missing;
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
