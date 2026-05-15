// Original — no upstream. Tests for the tag input/output schemas — 16 cases per data-model.md test inventory covering vault-only surface (NO target_mode), structural normalisation chain (trim → strip-leading-# → empty/length/segment refinements), strict additionalProperties, output schema count-equals-paths-length refinement, and inferred type compile checks.
import { expectTypeOf, test, expect } from "vitest";

import {
  tagCountOnlyOutputSchema,
  tagDefaultOutputSchema,
  tagInputSchema,
  type TagDefaultOutput,
  type TagInput,
} from "./schema.js";

// (1) Valid minimal input — tag only
test("valid minimal { tag: 'foo' } → parses; vault/total default undefined/undefined", () => {
  const r = tagInputSchema.safeParse({ tag: "foo" });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.tag).toBe("foo");
    expect(r.data.vault).toBeUndefined();
    expect(r.data.total).toBeUndefined();
  }
});

// (2) Valid full input — tag/vault/total
test("valid full { tag: 'foo/bar', vault: 'X', total: true } → parses", () => {
  const r = tagInputSchema.safeParse({ tag: "foo/bar", vault: "X", total: true });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.tag).toBe("foo/bar");
    expect(r.data.vault).toBe("X");
    expect(r.data.total).toBe(true);
  }
});

// (3) Empty tag → validation error
test("empty tag '' → too_small on ['tag']", () => {
  const r = tagInputSchema.safeParse({ tag: "" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("tag"))).toBe(true);
  }
});

// (4) Whitespace-only tag → validation error post-trim
test("whitespace-only tag '   ' → custom refine rejects (empty post-trim)", () => {
  const r = tagInputSchema.safeParse({ tag: "   " });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("tag"))).toBe(true);
  }
});

// (5) Empty leading segment '/foo' → validation error
test("empty hierarchical segment '/foo' → segment refine rejects", () => {
  const r = tagInputSchema.safeParse({ tag: "/foo" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(
      r.error.issues.some(
        (i) => i.path.includes("tag") && i.message.includes("empty hierarchical segment"),
      ),
    ).toBe(true);
  }
});

// (6) Trailing empty segment 'foo/' → validation error
test("empty hierarchical segment 'foo/' → segment refine rejects", () => {
  const r = tagInputSchema.safeParse({ tag: "foo/" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(
      r.error.issues.some(
        (i) => i.path.includes("tag") && i.message.includes("empty hierarchical segment"),
      ),
    ).toBe(true);
  }
});

// (7) Interior empty segment 'foo//bar' → validation error
test("empty hierarchical segment 'foo//bar' → segment refine rejects", () => {
  const r = tagInputSchema.safeParse({ tag: "foo//bar" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(
      r.error.issues.some(
        (i) => i.path.includes("tag") && i.message.includes("empty hierarchical segment"),
      ),
    ).toBe(true);
  }
});

// (8) Post-strip length > 200 → validation error via .refine
test("post-strip length 201 → length refine rejects", () => {
  // 201 chars of 'a' (no leading # / whitespace; raw length is 201 — below outer 220 cap)
  const long = "a".repeat(201);
  const r = tagInputSchema.safeParse({ tag: long });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(
      r.error.issues.some((i) => i.path.includes("tag") && i.message.includes("exceeds 200 chars")),
    ).toBe(true);
  }
});

// (9) Raw length > 220 → validation error via outer max
test("raw length 221 → max(220) rejects before transforms run", () => {
  const long = "a".repeat(221);
  const r = tagInputSchema.safeParse({ tag: long });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("tag"))).toBe(true);
  }
});

// (10) Leading '#' stripped
test("leading '#' stripped: { tag: '#foo' } → parsed tag === 'foo'", () => {
  const r = tagInputSchema.safeParse({ tag: "#foo" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.tag).toBe("foo");
});

// (11) Whitespace trimmed
test("whitespace trimmed: { tag: '  foo  ' } → parsed tag === 'foo'", () => {
  const r = tagInputSchema.safeParse({ tag: "  foo  " });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.tag).toBe("foo");
});

// (12) Both: leading `#` after whitespace trim
test("both: { tag: '  #foo  ' } → parsed tag === 'foo'", () => {
  const r = tagInputSchema.safeParse({ tag: "  #foo  " });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.tag).toBe("foo");
});

// (13) Charset-permissive — no regex enforcement (Q2)
test("charset-permissive: { tag: 'foo bar' } → accepted (no charset regex)", () => {
  const r = tagInputSchema.safeParse({ tag: "foo bar" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.tag).toBe("foo bar");
});

// (14) Unicode tag accepted
test("Unicode tag '日本語' → accepted", () => {
  const r = tagInputSchema.safeParse({ tag: "日本語" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.tag).toBe("日本語");
});

// (15) Unknown key rejected by strict mode
test("unknown key { tag: 'foo', x: 1 } → strict additionalProperties:false rejects", () => {
  const r = tagInputSchema.safeParse({ tag: "foo", x: 1 });
  expect(r.success).toBe(false);
  if (!r.success) {
    const unrecognized = r.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
  }
});

// (16) Wrong type total — string instead of boolean → rejected
test("wrong type { tag: 'foo', total: 'true' } → invalid_type on ['total']", () => {
  const r = tagInputSchema.safeParse({ tag: "foo", total: "true" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("total"))).toBe(true);
  }
});

// Inferred types compile-check (no test counter — runtime sanity-parse plus typeOf)
test("inferred TagInput / TagDefaultOutput types compile against representative values", () => {
  expectTypeOf<TagInput>().toMatchTypeOf<{
    tag: string;
    vault?: string;
    total?: boolean;
  }>();
  expectTypeOf<TagDefaultOutput>().toMatchTypeOf<{
    count: number;
    paths: string[];
  }>();
  // Sanity-parse a known-good shape to keep this case live at runtime.
  const ok = tagDefaultOutputSchema.safeParse({
    count: 2,
    paths: ["a.md", "b.md"],
  });
  expect(ok.success).toBe(true);
});

// Output schema invariant — count must equal paths.length
test("output schema refinement — count must equal paths.length", () => {
  const r = tagDefaultOutputSchema.safeParse({ count: 5, paths: ["a.md"] });
  expect(r.success).toBe(false);
});

// Count-only output schema accepts non-negative integers
test("count-only output schema accepts 0 and 1000", () => {
  expect(tagCountOnlyOutputSchema.safeParse(0).success).toBe(true);
  expect(tagCountOnlyOutputSchema.safeParse(1000).success).toBe(true);
  expect(tagCountOnlyOutputSchema.safeParse(-1).success).toBe(false);
  expect(tagCountOnlyOutputSchema.safeParse(1.5).success).toBe(false);
});
