// Original — no upstream. Tests for the smart_connections_similar input/output/eval-envelope schemas — target_mode discriminator inherited from targetModeBaseSchema, XOR locator + active-forbid refinements, limit integer range 1..100 default 20, total optional boolean, strict additionalProperties rejection, emitted JSON Schema round-trip via toMcpInputSchema, matchEntrySchema strict three-field contract (path .md / headingPath array / score finite number), discriminated-union envelope with six error codes.
import { expect, test, vi } from "vitest";

import {
  SMART_CONNECTIONS_SIMILAR_EVAL_ERROR_CODES,
  matchEntrySchema,
  smartConnectionsSimilarEvalResponseSchema,
  smartConnectionsSimilarInputSchema,
  smartConnectionsSimilarOutputSchema,
} from "./schema.js";
import { toMcpInputSchema } from "../_shared.js";

// (1) specific + vault + path happy
test("specific + vault + path: parses OK", () => {
  const dispatcherSpy = vi.fn();
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "Projects/brief.md",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    // limit default applied
    expect(result.data.limit).toBe(20);
  }
  expect(dispatcherSpy).not.toHaveBeenCalled();
});

// (2) specific + vault + file (basename) happy
test("specific + vault + file (basename): parses OK", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    file: "brief",
  });
  expect(result.success).toBe(true);
});

// (3) specific + vault + path + limit:1 (lower boundary)
test("specific + vault + path + limit:1 (lower boundary): parses OK", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    limit: 1,
  });
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.limit).toBe(1);
});

// (4) specific + vault + path + limit:100 (upper boundary)
test("specific + vault + path + limit:100 (upper boundary): parses OK", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    limit: 100,
  });
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.limit).toBe(100);
});

// (5) specific + vault + path with no limit → default 20 applied
test("specific + vault + path with no limit: default 20 applied", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
  });
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.limit).toBe(20);
});

// (6) specific + vault + path + total:true
test("specific + vault + path + total:true: parses OK", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    total: true,
  });
  expect(result.success).toBe(true);
});

// (7) specific + vault + path + total:false
test("specific + vault + path + total:false: parses OK", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    total: false,
  });
  expect(result.success).toBe(true);
});

// (8) active happy
test("active (no other fields): parses OK", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({ target_mode: "active" });
  expect(result.success).toBe(true);
});

// (9) active + limit:50
test("active + limit:50: parses OK", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "active",
    limit: 50,
  });
  expect(result.success).toBe(true);
});

// (10) active + total:true
test("active + total:true: parses OK", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "active",
    total: true,
  });
  expect(result.success).toBe(true);
});

// (11) specific without vault rejects; dispatcher never called
test("specific without vault: rejects with vault-path issue; dispatcher spy never called (FR-019)", () => {
  const dispatcherSpy = vi.fn();
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    path: "x.md",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const vaultIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["vault"]),
    );
    expect(vaultIssues.length).toBeGreaterThanOrEqual(1);
  }
  expect(dispatcherSpy).not.toHaveBeenCalled();
});

// (12) specific without file+path rejects (XOR violation: got neither)
test("specific without file or path: rejects with 'exactly one of'", () => {
  const dispatcherSpy = vi.fn();
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message).join(" | ");
    expect(messages).toMatch(/exactly one of/);
  }
  expect(dispatcherSpy).not.toHaveBeenCalled();
});

// (13) specific with BOTH file+path rejects (XOR violation: got both)
test("specific with BOTH file AND path: rejects on both keys (XOR)", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    file: "brief",
    path: "Projects/brief.md",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const fileIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["file"]),
    );
    const pathIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["path"]),
    );
    expect(fileIssues.length).toBeGreaterThanOrEqual(1);
    expect(pathIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (14) active with vault rejects
test("active with vault: rejects on vault key", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "active",
    vault: "Demo",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const vaultIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["vault"]),
    );
    expect(vaultIssues.length).toBeGreaterThanOrEqual(1);
    expect(vaultIssues[0]!.message).toContain("active mode");
  }
});

// (15) active with file rejects
test("active with file: rejects on file key", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "active",
    file: "brief",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const fileIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["file"]),
    );
    expect(fileIssues.length).toBeGreaterThanOrEqual(1);
    expect(fileIssues[0]!.message).toContain("active mode");
  }
});

// (16) active with path rejects
test("active with path: rejects on path key", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "active",
    path: "x.md",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const pathIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["path"]),
    );
    expect(pathIssues.length).toBeGreaterThanOrEqual(1);
    expect(pathIssues[0]!.message).toContain("active mode");
  }
});

// (17) unknown top-level key rejects (strict mode)
test("unknown top-level key rejected (strict mode / FR-005)", () => {
  const dispatcherSpy = vi.fn();
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    threshold: 0.5,
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const unrecognized = result.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as { keys: string[] }).keys).toContain("threshold");
  }
  expect(dispatcherSpy).not.toHaveBeenCalled();
});

// (18) total as string "true" rejects (type)
test('total as string "true" rejected with invalid_type', () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    total: "true",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const totalIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["total"]),
    );
    expect(totalIssues.length).toBeGreaterThanOrEqual(1);
    expect(totalIssues[0]!.code).toBe("invalid_type");
  }
});

// (19) limit:0 rejects (below min)
test("limit:0 rejected (below min 1)", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    limit: 0,
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const limitIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["limit"]),
    );
    expect(limitIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (20) limit:101 rejects (above max)
test("limit:101 rejected (above max 100)", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    limit: 101,
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const limitIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["limit"]),
    );
    expect(limitIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// =====================================================================
// Bonus / structural extras (assist the registry-walk invariants test
// and emitted-JSON-Schema round-trip)
// =====================================================================

test("limit:5.5 (non-integer) rejected", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    limit: 5.5,
  });
  expect(result.success).toBe(false);
});

test("limit:'20' (string) rejected", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    limit: "20",
  });
  expect(result.success).toBe(false);
});

test("target_mode missing rejected", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    vault: "Demo",
    path: "x.md",
  });
  expect(result.success).toBe(false);
});

test("target_mode: 'focused' (unknown enum value) rejected", () => {
  const result = smartConnectionsSimilarInputSchema.safeParse({
    target_mode: "focused",
    vault: "Demo",
    path: "x.md",
  });
  expect(result.success).toBe(false);
});

test("toMcpInputSchema(smartConnectionsSimilarInputSchema) preserves target_mode enum constraint", () => {
  const emitted = toMcpInputSchema(smartConnectionsSimilarInputSchema) as Record<string, unknown>;
  let foundTargetModeEnum = false;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (rec.enum && Array.isArray(rec.enum)) {
      const enumVals = rec.enum as unknown[];
      if (enumVals.length === 2 && enumVals.includes("specific") && enumVals.includes("active")) {
        foundTargetModeEnum = true;
      }
    }
    for (const value of Object.values(rec)) walk(value);
  };
  walk(emitted);
  expect(foundTargetModeEnum).toBe(true);
});

// --- matchEntrySchema sanity tests ---

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

test("smartConnectionsSimilarOutputSchema strict mode rejects extra keys", () => {
  const result = smartConnectionsSimilarOutputSchema.safeParse({
    count: 0,
    matches: [],
    extra: "x",
  });
  expect(result.success).toBe(false);
});

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
  ["ok:false FILE_NOT_FOUND", { ok: false, code: "FILE_NOT_FOUND", detail: "x" }, true],
  ["ok:false NOT_MARKDOWN", { ok: false, code: "NOT_MARKDOWN", detail: "x" }, true],
  ["ok:false NO_ACTIVE_FILE", { ok: false, code: "NO_ACTIVE_FILE", detail: "x" }, true],
  [
    "ok:false SMART_CONNECTIONS_NOT_INSTALLED",
    { ok: false, code: "SMART_CONNECTIONS_NOT_INSTALLED", detail: "x" },
    true,
  ],
  [
    "ok:false SMART_CONNECTIONS_NOT_READY",
    { ok: false, code: "SMART_CONNECTIONS_NOT_READY", detail: "x" },
    true,
  ],
  [
    "ok:false SOURCE_NOT_INDEXED",
    { ok: false, code: "SOURCE_NOT_INDEXED", detail: "x" },
    true,
  ],
  ["ok:true missing count", { ok: true, matches: [] }, false],
  ["ok:true unknown extra", { ok: true, count: 0, matches: [], surprise: "x" }, false],
  ["ok:false unknown code", { ok: false, code: "OTHER", detail: "x" }, false],
  ["ok:false missing detail", { ok: false, code: "FILE_NOT_FOUND" }, false],
])("envelope discriminator: %s", (_label, input, expected) => {
  const result = smartConnectionsSimilarEvalResponseSchema.safeParse(input);
  expect(result.success).toBe(expected);
});

test("SMART_CONNECTIONS_SIMILAR_EVAL_ERROR_CODES contains the six expected codes", () => {
  expect([...SMART_CONNECTIONS_SIMILAR_EVAL_ERROR_CODES].sort()).toEqual(
    [
      "FILE_NOT_FOUND",
      "NOT_MARKDOWN",
      "NO_ACTIVE_FILE",
      "SMART_CONNECTIONS_NOT_INSTALLED",
      "SMART_CONNECTIONS_NOT_READY",
      "SOURCE_NOT_INDEXED",
    ].sort(),
  );
});
