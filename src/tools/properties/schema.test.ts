// Original — no upstream. Tests for the properties input/output schema — 16 cases per data-model.md test inventory covering vault-only surface (NO target_mode), vault optional+min(1), total optional+boolean, additionalProperties strict (rejects file/active/format/sort and any unknown key), output schema strict per-entry rejection of upstream `type` leak, and inferred type compile checks.
import { expectTypeOf, test } from "vitest";
import { expect } from "vitest";

import {
  propertiesInputSchema,
  propertiesOutputSchema,
  type PropertiesInput,
  type PropertiesOutput,
} from "./schema.js";

// =====================================================================
// BI-041 US6 — case-insensitive collapse contract (FR-011)
// =====================================================================

// Pre-edit verification: a grep of `src/tools/properties/schema.ts` for
// "byte.?tiebreak|case.sensitive" returned ZERO hits (the byte-tiebreak claim
// lives in docs/tools/properties.md and the handler.ts implementation comment,
// not in schema.ts). Per contracts/properties-dedup.md "Test additions" branch
// (b), the schema-side assertion is positive-only (case-insensitive + collapse
// present); the help-doc byte-tiebreak retraction is reviewed by inspection in
// the PR (docs/tools/properties.md updated alongside this schema .describe()).
// Schema-side assertion (a) — defensively guards against future re-introduction.
test("BI-041 FR-011: schema .describe() carries the case-insensitive collapse claim", () => {
  const desc = propertiesInputSchema.description ?? "";
  expect(desc).toContain("case-insensitive");
  expect(desc.match(/collapse|merge/i)).not.toBeNull();
});

test("BI-041 FR-011: schema .describe() does NOT carry the retired byte-tiebreak claim", () => {
  const desc = propertiesInputSchema.description ?? "";
  expect(desc).not.toMatch(/byte.?tiebreak/i);
});

// (1) empty object → ✓ (both fields optional)
test("empty object {} → accepted (both fields optional)", () => {
  const r = propertiesInputSchema.safeParse({});
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.vault).toBeUndefined();
    expect(r.data.total).toBeUndefined();
  }
});

// (2) vault-only → ✓
test("vault-only { vault: 'Demo' } → accepted", () => {
  const r = propertiesInputSchema.safeParse({ vault: "Demo" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.vault).toBe("Demo");
});

// (3) total-only true → ✓
test("total-only { total: true } → accepted", () => {
  const r = propertiesInputSchema.safeParse({ total: true });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.total).toBe(true);
});

// (4) total false → ✓
test("total false { total: false } → accepted", () => {
  const r = propertiesInputSchema.safeParse({ total: false });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.total).toBe(false);
});

// (5) vault+total → ✓
test("vault + total { vault: 'Demo', total: true } → accepted", () => {
  const r = propertiesInputSchema.safeParse({ vault: "Demo", total: true });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.vault).toBe("Demo");
    expect(r.data.total).toBe(true);
  }
});

// (6) vault empty-string → ✗ (min 1)
test("vault '' empty → too_small on ['vault']", () => {
  const r = propertiesInputSchema.safeParse({ vault: "" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
  }
});

// (7) vault non-string (number) → ✗
test("vault 42 (number) → invalid_type on ['vault']", () => {
  const r = propertiesInputSchema.safeParse({ vault: 42 });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
  }
});

// (8) vault null → ✗
test("vault null → invalid_type on ['vault']", () => {
  const r = propertiesInputSchema.safeParse({ vault: null });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
  }
});

// (9) total non-boolean string → ✗
test("total 'true' (string) → invalid_type on ['total']", () => {
  const r = propertiesInputSchema.safeParse({ total: "true" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("total"))).toBe(true);
  }
});

// (10) total non-boolean integer → ✗
test("total 1 (integer) → invalid_type on ['total']", () => {
  const r = propertiesInputSchema.safeParse({ total: 1 });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("total"))).toBe(true);
  }
});

// (11) unknown key 'file' → ✗ (FR-005 strict)
test("unknown top-level key 'file' → unrecognized_keys", () => {
  const r = propertiesInputSchema.safeParse({ vault: "Demo", file: "note.md" });
  expect(r.success).toBe(false);
  if (!r.success) {
    const unrecognized = r.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as { keys: string[] }).keys).toContain("file");
  }
});

// (12) unknown key 'active' → ✗
test("unknown top-level key 'active' → unrecognized_keys", () => {
  const r = propertiesInputSchema.safeParse({ active: true });
  expect(r.success).toBe(false);
  if (!r.success) {
    const unrecognized = r.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as { keys: string[] }).keys).toContain("active");
  }
});

// (13) unknown key 'format' → ✗
test("unknown top-level key 'format' → unrecognized_keys", () => {
  const r = propertiesInputSchema.safeParse({ format: "json" });
  expect(r.success).toBe(false);
  if (!r.success) {
    const unrecognized = r.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as { keys: string[] }).keys).toContain("format");
  }
});

// (14) unknown key 'sort' → ✗
test("unknown top-level key 'sort' → unrecognized_keys", () => {
  const r = propertiesInputSchema.safeParse({ sort: "count" });
  expect(r.success).toBe(false);
  if (!r.success) {
    const unrecognized = r.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as { keys: string[] }).keys).toContain("sort");
  }
});

// (15) inferred PropertiesInput / PropertiesOutput types compile
test("inferred PropertiesInput / PropertiesOutput types compile against representative values", () => {
  expectTypeOf<PropertiesInput>().toMatchTypeOf<{
    vault?: string;
    total?: boolean;
  }>();
  expectTypeOf<PropertiesOutput>().toMatchTypeOf<{
    count: number;
    properties: Array<{ name: string; noteCount: number }>;
  }>();
  // Sanity-parse a known-good shape to keep this case live at runtime.
  const ok = propertiesOutputSchema.safeParse({
    count: 2,
    properties: [
      { name: "author", noteCount: 5 },
      { name: "tags", noteCount: 4 },
    ],
  });
  expect(ok.success).toBe(true);
});

// (16) output schema strict rejects extra fields (e.g. upstream `type` leaking to a per-entry record)
test("output schema strict — per-entry `type` field leak → rejection", () => {
  const r = propertiesOutputSchema.safeParse({
    count: 1,
    properties: [{ name: "tags", noteCount: 4, type: "tags" }],
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    const unrecognized = r.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
  }
});
