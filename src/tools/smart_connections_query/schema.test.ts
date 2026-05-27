// Original — no upstream. Tests for smart_connections_query input/output/eval-envelope schemas — flat schema (NO target_mode per FR-001/R4); query trim+min(1)+max(MAX_QUERY_LENGTH=2000, lowered from 4000 in tool-docs audit to stay below the upstream Obsidian.com argv-IPC defect at ~4 KB); vault optional+min(1); limit integer 1..100 default 20; total optional boolean; strict additionalProperties rejection; matchEntrySchema strict three-field contract (.md path / heading array / finite score); discriminated-union envelope with three error codes. 16+ cases per data-model.md inventory.
import { expect, test, vi } from "vitest";

import {
  MAX_QUERY_LENGTH,
  SMART_CONNECTIONS_QUERY_EVAL_ERROR_CODES,
  matchEntrySchema,
  smartConnectionsQueryEvalResponseSchema,
  smartConnectionsQueryInputSchema,
  smartConnectionsQueryOutputSchema,
} from "./schema.js";
import { toMcpInputSchema } from "../_shared.js";

// (1) Minimum valid input: { query: "x" }
test("minimum valid input { query: 'x' }: parses OK; limit default 20 applied", () => {
  const dispatcherSpy = vi.fn();
  const result = smartConnectionsQueryInputSchema.safeParse({ query: "x" });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.limit).toBe(20);
    expect(result.data.query).toBe("x");
  }
  expect(dispatcherSpy).not.toHaveBeenCalled();
});

// (2) Full input: { query, vault, limit, total }
test("full input { query, vault, limit, total }: parses OK", () => {
  const result = smartConnectionsQueryInputSchema.safeParse({
    query: "deployment rollback",
    vault: "Demo",
    limit: 5,
    total: true,
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.limit).toBe(5);
    expect(result.data.total).toBe(true);
  }
});

// (3) query empty string ""
test("query empty string: rejected by trim().min(1)", () => {
  const dispatcherSpy = vi.fn();
  const result = smartConnectionsQueryInputSchema.safeParse({ query: "" });
  expect(result.success).toBe(false);
  expect(dispatcherSpy).not.toHaveBeenCalled();
});

// (4) query whitespace-only "   \t\n  "
test("query whitespace-only: rejected by trim().min(1)", () => {
  const dispatcherSpy = vi.fn();
  const result = smartConnectionsQueryInputSchema.safeParse({ query: "   \t\n  " });
  expect(result.success).toBe(false);
  expect(dispatcherSpy).not.toHaveBeenCalled();
});

// (5) query at MAX_QUERY_LENGTH chars OK
test("query at MAX_QUERY_LENGTH-char boundary: parses OK", () => {
  const query = "a".repeat(MAX_QUERY_LENGTH);
  const result = smartConnectionsQueryInputSchema.safeParse({ query });
  expect(result.success).toBe(true);
});

// (6) query at MAX_QUERY_LENGTH+1 chars rejected
test("query MAX_QUERY_LENGTH+1-char rejected (above max)", () => {
  const query = "a".repeat(MAX_QUERY_LENGTH + 1);
  const dispatcherSpy = vi.fn();
  const result = smartConnectionsQueryInputSchema.safeParse({ query });
  expect(result.success).toBe(false);
  expect(dispatcherSpy).not.toHaveBeenCalled();
});

// (7) query non-string types
test("query non-string types rejected", () => {
  for (const bad of [123, [], {}, null, true]) {
    const result = smartConnectionsQueryInputSchema.safeParse({ query: bad });
    expect(result.success).toBe(false);
  }
});

// (8) query missing entirely
test("query missing: rejected (required field)", () => {
  const dispatcherSpy = vi.fn();
  const result = smartConnectionsQueryInputSchema.safeParse({});
  expect(result.success).toBe(false);
  if (!result.success) {
    const queryIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["query"]),
    );
    expect(queryIssues.length).toBeGreaterThanOrEqual(1);
  }
  expect(dispatcherSpy).not.toHaveBeenCalled();
});

// (9) vault empty string ""
test("vault empty string: rejected (min1 when supplied)", () => {
  const result = smartConnectionsQueryInputSchema.safeParse({ query: "x", vault: "" });
  expect(result.success).toBe(false);
});

// (10) limit:0 below min
test("limit:0 rejected (below min 1)", () => {
  const result = smartConnectionsQueryInputSchema.safeParse({ query: "x", limit: 0 });
  expect(result.success).toBe(false);
});

// (11) limit:101 above max
test("limit:101 rejected (above max 100)", () => {
  const result = smartConnectionsQueryInputSchema.safeParse({ query: "x", limit: 101 });
  expect(result.success).toBe(false);
});

// (12) limit:5.5 non-integer
test("limit:5.5 rejected (non-integer)", () => {
  const result = smartConnectionsQueryInputSchema.safeParse({ query: "x", limit: 5.5 });
  expect(result.success).toBe(false);
});

// (13) limit:"20" string not number
test('limit:"20" (string) rejected (invalid type)', () => {
  const result = smartConnectionsQueryInputSchema.safeParse({ query: "x", limit: "20" });
  expect(result.success).toBe(false);
});

// (14) total:"true" string not boolean
test('total:"true" (string) rejected (invalid type)', () => {
  const result = smartConnectionsQueryInputSchema.safeParse({ query: "x", total: "true" });
  expect(result.success).toBe(false);
});

// (15) unknown top-level key
test("unknown top-level key rejected (strict mode)", () => {
  const dispatcherSpy = vi.fn();
  const result = smartConnectionsQueryInputSchema.safeParse({
    query: "x",
    threshold: 0.7,
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const unrecognized = result.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as { keys: string[] }).keys).toContain("threshold");
  }
  expect(dispatcherSpy).not.toHaveBeenCalled();
});

// (16) Emitted JSON Schema round-trip: required:['query'] AND additionalProperties:false
test("emitted JSON Schema: required:['query'] AND additionalProperties:false", () => {
  const emitted = toMcpInputSchema(smartConnectionsQueryInputSchema) as Record<string, unknown>;
  expect(emitted.required).toEqual(["query"]);
  expect(emitted.additionalProperties).toBe(false);
  const props = emitted.properties as Record<string, Record<string, unknown>>;
  expect(props.query!.type).toBe("string");
  expect(props.vault!.type).toBe("string");
  expect(props.limit!.type).toBe("integer");
  expect(props.total!.type).toBe("boolean");
});

// =====================================================================
// matchEntrySchema sanity
// =====================================================================

test("matchEntrySchema accepts source-level match (empty headingPath)", () => {
  const result = matchEntrySchema.safeParse({
    path: "Folder/Note.md",
    headingPath: [],
    score: 0.85,
  });
  expect(result.success).toBe(true);
});

test("matchEntrySchema accepts nested-heading match", () => {
  const result = matchEntrySchema.safeParse({
    path: "Folder/Note.md",
    headingPath: ["H1", "H2"],
    score: 0.72,
  });
  expect(result.success).toBe(true);
});

test("matchEntrySchema accepts frontmatter-sentinel headingPath", () => {
  const result = matchEntrySchema.safeParse({
    path: "Folder/Note.md",
    headingPath: ["---frontmatter---"],
    score: 0.91,
  });
  expect(result.success).toBe(true);
});

test("matchEntrySchema strict mode rejects extra keys", () => {
  const result = matchEntrySchema.safeParse({
    path: "Folder/Note.md",
    headingPath: [],
    score: 0.5,
    kind: "block",
  });
  expect(result.success).toBe(false);
});

test("matchEntrySchema rejects path without .md suffix", () => {
  const result = matchEntrySchema.safeParse({
    path: "Folder/Note.canvas",
    headingPath: [],
    score: 0.5,
  });
  expect(result.success).toBe(false);
});

test("matchEntrySchema rejects NaN score", () => {
  const result = matchEntrySchema.safeParse({
    path: "Folder/Note.md",
    headingPath: [],
    score: NaN,
  });
  expect(result.success).toBe(false);
});

test("matchEntrySchema rejects Infinity score", () => {
  const result = matchEntrySchema.safeParse({
    path: "Folder/Note.md",
    headingPath: [],
    score: Infinity,
  });
  expect(result.success).toBe(false);
});

// =====================================================================
// Output schema sanity
// =====================================================================

test("smartConnectionsQueryOutputSchema strict mode rejects extra keys", () => {
  const result = smartConnectionsQueryOutputSchema.safeParse({
    count: 0,
    matches: [],
    extra: "x",
  });
  expect(result.success).toBe(false);
});

// =====================================================================
// Eval-envelope discriminated union
// =====================================================================

test.each<[string, unknown, boolean]>([
  ["ok:true happy empty", { ok: true, count: 0, matches: [] }, true],
  [
    "ok:true with entry",
    {
      ok: true,
      count: 1,
      matches: [{ path: "Note.md", headingPath: [], score: 0.5 }],
    },
    true,
  ],
  [
    "ok:false SMART_CONNECTIONS_NOT_INSTALLED",
    { ok: false, code: "SMART_CONNECTIONS_NOT_INSTALLED", detail: "x" },
    true,
  ],
  [
    "ok:false SMART_CONNECTIONS_NOT_READY_API_MISSING",
    { ok: false, code: "SMART_CONNECTIONS_NOT_READY_API_MISSING", detail: "x" },
    true,
  ],
  [
    "ok:false SMART_CONNECTIONS_NOT_READY_EMBED_FAILED",
    { ok: false, code: "SMART_CONNECTIONS_NOT_READY_EMBED_FAILED", detail: "x" },
    true,
  ],
  ["ok:true missing count", { ok: true, matches: [] }, false],
  ["ok:true unknown extra", { ok: true, count: 0, matches: [], surprise: "x" }, false],
  ["ok:false unknown code", { ok: false, code: "OTHER", detail: "x" }, false],
  ["ok:false missing detail", { ok: false, code: "SMART_CONNECTIONS_NOT_INSTALLED" }, false],
])("envelope discriminator: %s", (_label, input, expected) => {
  const result = smartConnectionsQueryEvalResponseSchema.safeParse(input);
  expect(result.success).toBe(expected);
});

test("SMART_CONNECTIONS_QUERY_EVAL_ERROR_CODES contains the three expected codes", () => {
  expect([...SMART_CONNECTIONS_QUERY_EVAL_ERROR_CODES].sort()).toEqual(
    [
      "SMART_CONNECTIONS_NOT_INSTALLED",
      "SMART_CONNECTIONS_NOT_READY_API_MISSING",
      "SMART_CONNECTIONS_NOT_READY_EMBED_FAILED",
    ].sort(),
  );
});
