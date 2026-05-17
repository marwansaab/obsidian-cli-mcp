// Original — no upstream. pattern_search schema tests.
import { afterEach, expect, test } from "vitest";

import {
  patternSearchInputSchema,
  patternSearchMatchSchema,
  patternSearchOutputSchema,
  patternSearchEvalEnvelopeSchema,
} from "./schema.js";
import { toMcpInputSchema } from "../_shared.js";

// Helper — restore globalThis.RegExp after every test that monkey-patches it.
let savedRegExp: typeof RegExp | null = null;
afterEach(() => {
  if (savedRegExp !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).RegExp = savedRegExp;
    savedRegExp = null;
  }
});

// (1) minimal happy
test("minimal happy: { pattern } parses OK", () => {
  const r = patternSearchInputSchema.safeParse({ pattern: "BI-\\d{4}" });
  expect(r.success).toBe(true);
});

// (2) full happy
test("full happy: every optional field set", () => {
  const r = patternSearchInputSchema.safeParse({
    pattern: "TODO",
    folder: "Projects",
    case_sensitive: false,
    limit: 50,
    vault: "Personal",
  });
  expect(r.success).toBe(true);
});

// (3) empty pattern
test("empty pattern → fail path=['pattern']", () => {
  const r = patternSearchInputSchema.safeParse({ pattern: "" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues[0]!.path).toEqual(["pattern"]);
  }
});

// (4) whitespace-only pattern
test("whitespace-only pattern → fail path=['pattern']", () => {
  const r = patternSearchInputSchema.safeParse({ pattern: "   " });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path[0] === "pattern")).toBe(true);
  }
});

// (5) pattern exceeds 1000 chars
test("pattern > 1000 chars → fail path=['pattern']", () => {
  const r = patternSearchInputSchema.safeParse({ pattern: "a".repeat(1001) });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues[0]!.path).toEqual(["pattern"]);
  }
});

// (6) invalid regex — unbalanced paren
test("invalid regex 'BI-(\\d{4}' → fail with custom code, path=['pattern'], message contains 'Invalid regular expression'", () => {
  const r = patternSearchInputSchema.safeParse({ pattern: "BI-(\\d{4}" });
  expect(r.success).toBe(false);
  if (!r.success) {
    const issue = r.error.issues.find((i) => i.path[0] === "pattern")!;
    expect(issue).toBeDefined();
    expect(issue.code).toBe("custom");
    expect(issue.message).toMatch(/Invalid regular expression/);
  }
});

// (7) flag pass-through to RegExp constructor — case_sensitive:false → "i", default/true → ""
test("flag pass-through: case_sensitive:false → 'i'; default/true → ''", () => {
  const orig = globalThis.RegExp;
  savedRegExp = orig;
  const calls: Array<{ pattern: unknown; flags: unknown }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stub: any = function (this: unknown, pattern: unknown, flags?: unknown) {
    calls.push({ pattern, flags });
    // Construct against the real RegExp so subsequent template/handler usage is unaffected.
    return new orig(String(pattern), flags === undefined ? undefined : String(flags));
  };
  stub.prototype = orig.prototype;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).RegExp = stub;

  patternSearchInputSchema.parse({ pattern: "x", case_sensitive: false });
  patternSearchInputSchema.parse({ pattern: "x" });
  patternSearchInputSchema.parse({ pattern: "x", case_sensitive: true });

  expect(calls).toEqual([
    { pattern: "x", flags: "i" },
    { pattern: "x", flags: "" },
    { pattern: "x", flags: "" },
  ]);
});

// (8) folder: ""
test("folder: '' → fail path=['folder']", () => {
  const r = patternSearchInputSchema.safeParse({ pattern: "x", folder: "" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues[0]!.path).toEqual(["folder"]);
  }
});

// (9) limit: 0
test("limit: 0 → fail path=['limit']", () => {
  const r = patternSearchInputSchema.safeParse({ pattern: "x", limit: 0 });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues[0]!.path).toEqual(["limit"]);
  }
});

// (10) limit: 10001
test("limit: 10001 → fail path=['limit']", () => {
  const r = patternSearchInputSchema.safeParse({ pattern: "x", limit: 10001 });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues[0]!.path).toEqual(["limit"]);
  }
});

// (11) limit: 1.5 non-integer
test("limit: 1.5 → fail path=['limit']", () => {
  const r = patternSearchInputSchema.safeParse({ pattern: "x", limit: 1.5 });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues[0]!.path).toEqual(["limit"]);
  }
});

// (12) case_sensitive: "true" (string not boolean)
test("case_sensitive: 'true' (string) → fail path=['case_sensitive']", () => {
  const r = patternSearchInputSchema.safeParse({ pattern: "x", case_sensitive: "true" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues[0]!.path).toEqual(["case_sensitive"]);
  }
});

// (13) vault: ""
test("vault: '' → fail path=['vault']", () => {
  const r = patternSearchInputSchema.safeParse({ pattern: "x", vault: "" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues[0]!.path).toEqual(["vault"]);
  }
});

// (14) vault: ["A","B"] (array — verifies FR-014 single-vault structural lock)
test("vault: ['A','B'] (array) → fail path=['vault'] — FR-014 single-vault-per-invocation", () => {
  const r = patternSearchInputSchema.safeParse({ pattern: "x", vault: ["A", "B"] });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues[0]!.path).toEqual(["vault"]);
  }
});

// (15) unknown top-level key (strict mode)
test("unknown top-level key { pattern, surprise } → fail (strict)", () => {
  const r = patternSearchInputSchema.safeParse({ pattern: "x", surprise: 1 });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("surprise") || i.code === "unrecognized_keys")).toBe(true);
  }
});

// (16) missing pattern
test("missing pattern → fail path=['pattern']", () => {
  const r = patternSearchInputSchema.safeParse({});
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues[0]!.path).toEqual(["pattern"]);
  }
});

// (17) JSON Schema round-trip via toMcpInputSchema
test("toMcpInputSchema emits additionalProperties:false and the expected property set", () => {
  const json = toMcpInputSchema(patternSearchInputSchema) as Record<string, unknown>;
  expect(json.type).toBe("object");
  expect(json.additionalProperties).toBe(false);
  const props = json.properties as Record<string, unknown>;
  expect(Object.keys(props).sort()).toEqual([
    "case_sensitive",
    "folder",
    "limit",
    "pattern",
    "vault",
  ]);
  expect(json.required).toEqual(["pattern"]);
});

// =====================================================================
// Output / match / envelope schema spot-checks (defence-in-depth)
// =====================================================================

test("patternSearchMatchSchema: zero-length match field rejected (FR-016)", () => {
  const r = patternSearchMatchSchema.safeParse({ path: "x.md", line: 1, offset: 0, match: "", text: "x" });
  expect(r.success).toBe(false);
});

test("patternSearchOutputSchema: count !== matches.length rejected", () => {
  const r = patternSearchOutputSchema.safeParse({ count: 5, matches: [] });
  expect(r.success).toBe(false);
});

test("patternSearchOutputSchema: truncated:false rejected (only literal true permitted)", () => {
  const r = patternSearchOutputSchema.safeParse({ count: 0, matches: [], truncated: false });
  expect(r.success).toBe(false);
});

test("patternSearchEvalEnvelopeSchema: ok:false branch requires code='FOLDER_NOT_FOUND'", () => {
  const r = patternSearchEvalEnvelopeSchema.safeParse({ ok: false, code: "OTHER", folder: "x" });
  expect(r.success).toBe(false);
});
