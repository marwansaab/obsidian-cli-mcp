// Original — no upstream. Tests for the context_search input/output schema — ~22 cases per
// data-model.md test inventory. Parity with search/schema.test.ts (~22 cases) minus the
// context_lines field; +1 case for the output schema's matches shape with truncated?: true
// literal and a refine that asserts count === matches.length.
import { expect, expectTypeOf, test } from "vitest";

import {
  contextSearchInputSchema,
  contextSearchOutputSchema,
  type ContextSearchInput,
  type ContextSearchMatch,
  type ContextSearchOutput,
} from "./schema.js";

// (1) happy path — query only
test("happy path — { query: 'foo' } parses to { query: 'foo' }", () => {
  const r = contextSearchInputSchema.safeParse({ query: "foo" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.query).toBe("foo");
});

// (2) happy path — query + folder
test("happy path — { query: 'foo', folder: 'Projects' } parses", () => {
  const r = contextSearchInputSchema.safeParse({ query: "foo", folder: "Projects" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.folder).toBe("Projects");
});

// (3) happy path — query + limit
test("happy path — { query: 'foo', limit: 50 } parses", () => {
  const r = contextSearchInputSchema.safeParse({ query: "foo", limit: 50 });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.limit).toBe(50);
});

// (4) happy path — query + case_sensitive
test("happy path — { query: 'foo', case_sensitive: true } parses", () => {
  const r = contextSearchInputSchema.safeParse({ query: "foo", case_sensitive: true });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.case_sensitive).toBe(true);
});

// (5) happy path — query + vault
test("happy path — { query: 'foo', vault: 'MyVault' } parses", () => {
  const r = contextSearchInputSchema.safeParse({ query: "foo", vault: "MyVault" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.vault).toBe("MyVault");
});

// (6) happy path — all fields set
test("happy path — all fields set parses", () => {
  const r = contextSearchInputSchema.safeParse({
    query: "foo",
    folder: "Projects",
    limit: 50,
    case_sensitive: true,
    vault: "Demo",
  });
  expect(r.success).toBe(true);
});

// (7) reject — missing query
test("reject — {} missing query", () => {
  const r = contextSearchInputSchema.safeParse({});
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("query"))).toBe(true);
  }
});

// (8) reject — empty query (FR-008)
test("reject — { query: '' } empty string (FR-008)", () => {
  const r = contextSearchInputSchema.safeParse({ query: "" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("query"))).toBe(true);
  }
});

// (9) reject — whitespace-only query (FR-008 superRefine)
test("reject — { query: '   ' } whitespace-only via superRefine", () => {
  const r = contextSearchInputSchema.safeParse({ query: "   " });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path[0] === "query")).toBe(true);
  }
});

// (10) reject — query > 1000 chars (FR-008)
test("reject — query 1001 chars exceeds FR-008 cap", () => {
  const r = contextSearchInputSchema.safeParse({ query: "a".repeat(1001) });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("query"))).toBe(true);
  }
});

// (11) accept — query exactly 1000 chars (boundary)
test("accept — query 1000 chars at boundary", () => {
  const r = contextSearchInputSchema.safeParse({ query: "a".repeat(1000) });
  expect(r.success).toBe(true);
});

// (12) reject — limit = 0 (FR-006)
test("reject — limit 0 below FR-006 floor", () => {
  const r = contextSearchInputSchema.safeParse({ query: "foo", limit: 0 });
  expect(r.success).toBe(false);
});

// (13) reject — limit negative
test("reject — limit -1 negative", () => {
  const r = contextSearchInputSchema.safeParse({ query: "foo", limit: -1 });
  expect(r.success).toBe(false);
});

// (14) reject — limit > 10000 (FR-006)
test("reject — limit 10001 above FR-006 ceiling", () => {
  const r = contextSearchInputSchema.safeParse({ query: "foo", limit: 10001 });
  expect(r.success).toBe(false);
});

// (15) accept — limit = 1 (boundary)
test("accept — limit 1 at lower boundary", () => {
  const r = contextSearchInputSchema.safeParse({ query: "foo", limit: 1 });
  expect(r.success).toBe(true);
});

// (16) accept — limit = 10000 (boundary)
test("accept — limit 10000 at upper boundary", () => {
  const r = contextSearchInputSchema.safeParse({ query: "foo", limit: 10000 });
  expect(r.success).toBe(true);
});

// (17) reject — non-integer limit
test("reject — limit 50.5 non-integer", () => {
  const r = contextSearchInputSchema.safeParse({ query: "foo", limit: 50.5 });
  expect(r.success).toBe(false);
});

// (18) reject — unknown key (FR-009 / Principle III strict)
test("reject — unknown top-level key 'unknown' triggers unrecognized_keys (strict)", () => {
  const r = contextSearchInputSchema.safeParse({ query: "foo", unknown: "x" });
  expect(r.success).toBe(false);
  if (!r.success) {
    const unrecognized = r.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
  }
});

// (19) phrase-match preserves internal whitespace verbatim (FR-001)
test("phrase-match preserves internal whitespace verbatim — { query: 'foo bar' } parses to 'foo bar'", () => {
  const r = contextSearchInputSchema.safeParse({ query: "foo bar" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.query).toBe("foo bar");
});

// (20) inferred type compile checks
test("inferred ContextSearchInput / Output / Match types compile against representative shapes", () => {
  expectTypeOf<ContextSearchInput>().toMatchTypeOf<{
    query: string;
    folder?: string;
    limit?: number;
    case_sensitive?: boolean;
    vault?: string;
  }>();
  expectTypeOf<ContextSearchOutput>().toMatchTypeOf<{
    count: number;
    matches: Array<{ path: string; line: number; text: string }>;
    truncated?: true;
  }>();
  expectTypeOf<ContextSearchMatch>().toMatchTypeOf<{
    path: string;
    line: number;
    text: string;
  }>();
  const okOut = contextSearchOutputSchema.safeParse({
    count: 1,
    matches: [{ path: "a.md", line: 1, text: "x" }],
  });
  expect(okOut.success).toBe(true);
});

// (21) output schema strict — extra field on output rejected
test("output schema strict — extra field rejected", () => {
  const r = contextSearchOutputSchema.safeParse({
    count: 1,
    matches: [{ path: "a.md", line: 1, text: "x" }],
    vault: "leak",
  });
  expect(r.success).toBe(false);
});

// (22) output schema refine — count must equal matches.length
test("output schema refine — count !== matches.length rejected", () => {
  const r = contextSearchOutputSchema.safeParse({
    count: 5,
    matches: [{ path: "a.md", line: 1, text: "x" }],
  });
  expect(r.success).toBe(false);
});
