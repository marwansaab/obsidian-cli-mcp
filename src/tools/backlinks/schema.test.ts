// Original — no upstream. backlinks schema tests — target_mode discriminator inherited from targetModeBaseSchema, XOR locator + active-forbid refinements, optional with_counts / total booleans, optional limit integer (range 1..10000), strict additionalProperties rejection, emitted JSON Schema round-trip via toMcpInputSchema, discriminated-union eval-envelope shape.
import { describe, expect, it, test, vi } from "vitest";

import {
  BACKLINKS_EVAL_ERROR_CODES,
  backlinkEntrySchema,
  backlinksEvalResponseSchema,
  backlinksInputSchema,
  backlinksOutputSchema,
} from "./schema.js";
import { toMcpInputSchema } from "../_shared.js";
import { targetModeWiringCases } from "../_target-mode-test-cases.js";

// (1) specific + vault + path happy
test("specific + vault + path: parses OK", () => {
  const dispatcherSpy = vi.fn();
  const result = backlinksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "Projects/brief.md",
  });
  expect(result.success).toBe(true);
  expect(dispatcherSpy).not.toHaveBeenCalled();
});

// (2) specific + vault + file (basename) happy
test("specific + vault + file (basename): parses OK", () => {
  const result = backlinksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    file: "brief",
  });
  expect(result.success).toBe(true);
});

// (3) specific + vault + path + with_counts:true happy
test("specific + vault + path + with_counts:true: parses OK", () => {
  const result = backlinksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "Projects/brief.md",
    with_counts: true,
  });
  expect(result.success).toBe(true);
});

// (4) specific + vault + path + total:true happy
test("specific + vault + path + total:true: parses OK", () => {
  const result = backlinksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "Projects/brief.md",
    total: true,
  });
  expect(result.success).toBe(true);
});

// (5) specific + vault + path + limit:50 happy
test("specific + vault + path + limit:50: parses OK", () => {
  const result = backlinksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "Projects/brief.md",
    limit: 50,
  });
  expect(result.success).toBe(true);
});

// (6) active (no other fields) happy
test("active (no other fields): parses OK", () => {
  const result = backlinksInputSchema.safeParse({ target_mode: "active" });
  expect(result.success).toBe(true);
});

describe("backlinksInputSchema — target-mode refinement wiring (shared battery)", () => {
  it.each(
    targetModeWiringCases(
      { target_mode: "specific", vault: "V", path: "n.md" },
      { target_mode: "active" },
    ),
  )("$label", ({ input, valid, issuePath }) => {
    const r = backlinksInputSchema.safeParse(input);
    expect(r.success).toBe(valid);
    if (!valid && issuePath && !r.success) {
      expect(r.error.issues.some((i) => i.path.includes(issuePath))).toBe(true);
    }
  });
});

// (14) with_counts as string "true" rejects (US3-6)
test("with_counts as string \"true\" rejected with invalid_type", () => {
  const result = backlinksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    with_counts: "true",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const issues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["with_counts"]),
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0]!.code).toBe("invalid_type");
  }
});

// (15) total as string "true" rejects (US3-6)
test("total as string \"true\" rejected with invalid_type", () => {
  const result = backlinksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    total: "true",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const issues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["total"]),
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0]!.code).toBe("invalid_type");
  }
});

// (16) limit:0 rejects (US3-7 — below range)
test("limit:0 rejected (below min:1)", () => {
  const result = backlinksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    limit: 0,
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const issues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["limit"]),
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  }
});

// (17) limit:-1 rejects (US3-7)
test("limit:-1 rejected (below min:1)", () => {
  const result = backlinksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    limit: -1,
  });
  expect(result.success).toBe(false);
});

// (18) limit:10001 rejects (US3-7 — above range)
test("limit:10001 rejected (above max:10000)", () => {
  const result = backlinksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    limit: 10001,
  });
  expect(result.success).toBe(false);
});

// (19) limit:1.5 rejects (US3-7 — non-integer)
test("limit:1.5 rejected (non-integer)", () => {
  const result = backlinksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    limit: 1.5,
  });
  expect(result.success).toBe(false);
});

// (22) JSON Schema round-trip emits additionalProperties:false
test("toMcpInputSchema(backlinksInputSchema) emits additionalProperties:false and the expected property set", () => {
  const emitted = toMcpInputSchema(backlinksInputSchema) as Record<string, unknown>;
  expect(emitted.type).toBe("object");
  expect(emitted.additionalProperties).toBe(false);
  const props = emitted.properties as Record<string, unknown>;
  expect(Object.keys(props).sort()).toEqual([
    "file",
    "limit",
    "path",
    "target_mode",
    "total",
    "vault",
    "with_counts",
  ]);
});

// --- Output / envelope schema sanity tests ---

test("backlinkEntrySchema strict mode rejects extra keys", () => {
  const result = backlinkEntrySchema.safeParse({
    source: "Notes/Alpha.md",
    count: 1,
    extra: "x",
  });
  expect(result.success).toBe(false);
});

test("backlinkEntrySchema accepts minimal entry without count", () => {
  const result = backlinkEntrySchema.safeParse({ source: "Notes/Alpha.md" });
  expect(result.success).toBe(true);
});

test("backlinkEntrySchema rejects count:0 (positive int)", () => {
  const result = backlinkEntrySchema.safeParse({ source: "Notes/Alpha.md", count: 0 });
  expect(result.success).toBe(false);
});

test("backlinksOutputSchema strict mode rejects extra keys", () => {
  const result = backlinksOutputSchema.safeParse({
    count: 0,
    backlinks: [],
    extra: "x",
  });
  expect(result.success).toBe(false);
});

test("backlinksOutputSchema accepts truncated:true", () => {
  const result = backlinksOutputSchema.safeParse({
    count: 1000,
    backlinks: [{ source: "x.md" }],
    truncated: true,
  });
  expect(result.success).toBe(true);
});

test.each<[string, unknown, boolean]>([
  ["ok:true happy", { ok: true, count: 0, backlinks: [] }, true],
  ["ok:true with entry", { ok: true, count: 1, backlinks: [{ source: "a.md" }] }, true],
  ["ok:true with truncated", { ok: true, count: 1000, backlinks: [{ source: "a.md" }], truncated: true }, true],
  ["ok:true with count entry", { ok: true, count: 1, backlinks: [{ source: "a.md", count: 5 }] }, true],
  ["ok:false FILE_NOT_FOUND", { ok: false, code: "FILE_NOT_FOUND", detail: "x" }, true],
  ["ok:false NOT_MARKDOWN", { ok: false, code: "NOT_MARKDOWN", detail: "x" }, true],
  ["ok:false NO_ACTIVE_FILE", { ok: false, code: "NO_ACTIVE_FILE", detail: "x" }, true],
  ["ok:true missing count", { ok: true, backlinks: [] }, false],
  ["ok:true unknown extra", { ok: true, count: 0, backlinks: [], surprise: "x" }, false],
  ["ok:false unknown code", { ok: false, code: "OTHER", detail: "x" }, false],
  ["ok:false missing detail", { ok: false, code: "FILE_NOT_FOUND" }, false],
])("envelope discriminator: %s", (_label, input, expected) => {
  const result = backlinksEvalResponseSchema.safeParse(input);
  expect(result.success).toBe(expected);
});

test("BACKLINKS_EVAL_ERROR_CODES is exactly NO_ACTIVE_FILE/FILE_NOT_FOUND/NOT_MARKDOWN", () => {
  expect([...BACKLINKS_EVAL_ERROR_CODES].sort()).toEqual([
    "FILE_NOT_FOUND",
    "NOT_MARKDOWN",
    "NO_ACTIVE_FILE",
  ].sort());
});
