// Original — no upstream. Shared schema-test utility (BI-058 F-C): the recursive
// walkSchema helper that ~19 src/tools/<name>/index.test.ts files each defined
// verbatim. Used to assert a published JSON Schema carries no nested `description`
// keys (the per-tool shape invariants — type / properties-set / required /
// additionalProperties — are covered centrally by tools/_register.test.ts'
// assertInvariant, so they no longer need per-tool re-assertion). Pure and
// vitest-free, so the build compiles it as a harmless dist orphan like
// _registration-stub.ts; fully covered by its co-located .test.ts.

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
