// Original — no upstream. Tests for the search input/output schema — ~20 cases per
// data-model.md test inventory covering vault-scoped surface (NO target_mode),
// query required + 1..1000 chars + non-empty-post-trim (FR-010 superRefine),
// folder/limit/case_sensitive/context_lines/vault optionality + per-field shape
// constraints, .strict() rejection of unknown keys (FR-011 / Principle III),
// inclusive boundaries at 1 and 1000 / 1 and 10000, and the phrase-match
// internal-whitespace preservation invariant (FR-001 / Q2 — no transform).
import { expect, expectTypeOf, test } from "vitest";

import {
  searchInputSchema,
  searchDefaultOutputSchema,
  searchLineOutputSchema,
  type SearchDefaultOutput,
  type SearchInput,
  type SearchLineOutput,
} from "./schema.js";

// =====================================================================
// BI-041 US4 — schema .describe() error-roster Cowork carve-out claims (FR-009)
// =====================================================================

test("BI-041 FR-009: schema .describe() carries exactly two `strict-rich pathway only, per BI-0086` carve-out flags", () => {
  const desc = searchInputSchema.description ?? "";
  const matches = desc.match(/strict-rich pathway only, per BI-0086/g) ?? [];
  expect(matches.length).toBe(2);
});

test("BI-041 FR-009(b): VALIDATION_ERROR(unrecognized_keys) is flagged strict-rich-only", () => {
  const desc = searchInputSchema.description ?? "";
  expect(desc).toContain("VALIDATION_ERROR(unrecognized_keys)");
  // Within 200 chars of the carve-out phrase.
  const flagIdx = desc.indexOf("VALIDATION_ERROR(unrecognized_keys)");
  const carveOutIdx = desc.indexOf("strict-rich pathway only", flagIdx);
  expect(carveOutIdx).toBeGreaterThan(-1);
  expect(carveOutIdx - flagIdx).toBeLessThan(200);
});

test("BI-041 FR-009(b): out-of-range `limit` is flagged strict-rich-only", () => {
  const desc = searchInputSchema.description ?? "";
  expect(desc).toContain("Out-of-range `limit`");
  const flagIdx = desc.indexOf("Out-of-range `limit`");
  const carveOutIdx = desc.indexOf("strict-rich pathway only", flagIdx);
  expect(carveOutIdx).toBeGreaterThan(-1);
  expect(carveOutIdx - flagIdx).toBeLessThan(200);
});

// (1) happy path — query only
test("happy path — { query: 'foo' } parses to { query: 'foo' }", () => {
  const r = searchInputSchema.safeParse({ query: "foo" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.query).toBe("foo");
});

// (2) happy path — query + folder
test("happy path — { query: 'foo', folder: 'Projects' } parses", () => {
  const r = searchInputSchema.safeParse({ query: "foo", folder: "Projects" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.folder).toBe("Projects");
});

// (3) happy path — query + limit
test("happy path — { query: 'foo', limit: 50 } parses", () => {
  const r = searchInputSchema.safeParse({ query: "foo", limit: 50 });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.limit).toBe(50);
});

// (4) happy path — query + case_sensitive
test("happy path — { query: 'foo', case_sensitive: true } parses", () => {
  const r = searchInputSchema.safeParse({ query: "foo", case_sensitive: true });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.case_sensitive).toBe(true);
});

// (5) happy path — query + context_lines
test("happy path — { query: 'foo', context_lines: true } parses", () => {
  const r = searchInputSchema.safeParse({ query: "foo", context_lines: true });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.context_lines).toBe(true);
});

// (6) happy path — query + vault
test("happy path — { query: 'foo', vault: 'MyVault' } parses", () => {
  const r = searchInputSchema.safeParse({ query: "foo", vault: "MyVault" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.vault).toBe("MyVault");
});

// (7) happy path — all fields set
test("happy path — all fields set parses", () => {
  const r = searchInputSchema.safeParse({
    query: "foo",
    folder: "Projects",
    limit: 50,
    case_sensitive: true,
    context_lines: true,
    vault: "Demo",
  });
  expect(r.success).toBe(true);
});

// (8) reject — missing query
test("reject — {} missing query", () => {
  const r = searchInputSchema.safeParse({});
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("query"))).toBe(true);
  }
});

// (9) reject — empty query (FR-010)
test("reject — { query: '' } empty string (FR-010)", () => {
  const r = searchInputSchema.safeParse({ query: "" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("query"))).toBe(true);
  }
});

// (10) reject — whitespace-only query (FR-010 superRefine)
test("reject — { query: '   ' } whitespace-only via superRefine", () => {
  const r = searchInputSchema.safeParse({ query: "   " });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path[0] === "query")).toBe(true);
  }
});

// (11) reject — query > 1000 chars (FR-010)
test("reject — query 1001 chars exceeds FR-010 cap", () => {
  const r = searchInputSchema.safeParse({ query: "a".repeat(1001) });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("query"))).toBe(true);
  }
});

// (12) accept — query exactly 1000 chars (boundary)
test("accept — query 1000 chars at boundary", () => {
  const r = searchInputSchema.safeParse({ query: "a".repeat(1000) });
  expect(r.success).toBe(true);
});

// (13) reject — limit = 0 (FR-008)
test("reject — limit 0 below FR-008 floor", () => {
  const r = searchInputSchema.safeParse({ query: "foo", limit: 0 });
  expect(r.success).toBe(false);
});

// (14) reject — limit negative
test("reject — limit -1 negative", () => {
  const r = searchInputSchema.safeParse({ query: "foo", limit: -1 });
  expect(r.success).toBe(false);
});

// (15) reject — limit > 10000 (FR-008)
test("reject — limit 10001 above FR-008 ceiling", () => {
  const r = searchInputSchema.safeParse({ query: "foo", limit: 10001 });
  expect(r.success).toBe(false);
});

// (16) accept — limit = 1 (boundary)
test("accept — limit 1 at lower boundary", () => {
  const r = searchInputSchema.safeParse({ query: "foo", limit: 1 });
  expect(r.success).toBe(true);
});

// (17) accept — limit = 10000 (boundary)
test("accept — limit 10000 at upper boundary", () => {
  const r = searchInputSchema.safeParse({ query: "foo", limit: 10000 });
  expect(r.success).toBe(true);
});

// (18) reject — non-integer limit
test("reject — limit 50.5 non-integer", () => {
  const r = searchInputSchema.safeParse({ query: "foo", limit: 50.5 });
  expect(r.success).toBe(false);
});

// (19) reject — unknown key (FR-011 / Principle III strict)
test("reject — unknown top-level key 'unknown' triggers unrecognized_keys (strict)", () => {
  const r = searchInputSchema.safeParse({ query: "foo", unknown: "x" });
  expect(r.success).toBe(false);
  if (!r.success) {
    const unrecognized = r.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
  }
});

// (20) phrase-match preserves internal whitespace verbatim (FR-001 / Q2)
test("phrase-match preserves internal whitespace verbatim — { query: 'foo bar' } parses to 'foo bar'", () => {
  const r = searchInputSchema.safeParse({ query: "foo bar" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.query).toBe("foo bar");
});

// (21) inferred type compile checks
test("inferred SearchInput / output types compile against representative shapes", () => {
  expectTypeOf<SearchInput>().toMatchTypeOf<{
    query: string;
    folder?: string;
    limit?: number;
    case_sensitive?: boolean;
    context_lines?: boolean;
    vault?: string;
  }>();
  expectTypeOf<SearchDefaultOutput>().toMatchTypeOf<{
    count: number;
    paths: string[];
    truncated?: true;
  }>();
  expectTypeOf<SearchLineOutput>().toMatchTypeOf<{
    count: number;
    matches: Array<{ path: string; line: number; text: string }>;
    truncated?: true;
  }>();
  const okDefault = searchDefaultOutputSchema.safeParse({
    count: 1,
    paths: ["a.md"],
  });
  expect(okDefault.success).toBe(true);
  const okLine = searchLineOutputSchema.safeParse({
    count: 1,
    matches: [{ path: "a.md", line: 1, text: "x" }],
  });
  expect(okLine.success).toBe(true);
});

// (22) output schema strict rejects extra fields
test("output schemas strict — extra field on default output rejected", () => {
  const r = searchDefaultOutputSchema.safeParse({
    count: 1,
    paths: ["a.md"],
    vault: "leak",
  });
  expect(r.success).toBe(false);
});
