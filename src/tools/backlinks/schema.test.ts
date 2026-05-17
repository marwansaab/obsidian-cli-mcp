// Original — no upstream. backlinks schema tests — target_mode discriminator inherited from targetModeBaseSchema, XOR locator + active-forbid refinements, optional with_counts / total booleans, optional limit integer (range 1..10000), strict additionalProperties rejection, emitted JSON Schema round-trip via toMcpInputSchema, discriminated-union eval-envelope shape.
import { expect, test, vi } from "vitest";

import {
  BACKLINKS_EVAL_ERROR_CODES,
  backlinkEntrySchema,
  backlinksEvalResponseSchema,
  backlinksInputSchema,
  backlinksOutputSchema,
} from "./schema.js";
import { toMcpInputSchema } from "../_shared.js";

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

// (7) specific without vault rejects; dispatcher spy never called (FR-021)
test("specific without vault: rejects with vault-path issue; dispatcher spy never called (FR-021)", () => {
  const dispatcherSpy = vi.fn();
  const result = backlinksInputSchema.safeParse({
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

// (8) specific without file+path rejects (US3-1 — "neither name nor focus")
test("specific without file or path: rejects with 'exactly one of' (US3-1)", () => {
  const dispatcherSpy = vi.fn();
  const result = backlinksInputSchema.safeParse({
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

// (9) specific with BOTH file+path rejects (US3-4 XOR conflict)
test("specific with BOTH file AND path: rejects on both keys (XOR / US3-4)", () => {
  const dispatcherSpy = vi.fn();
  const result = backlinksInputSchema.safeParse({
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
  expect(dispatcherSpy).not.toHaveBeenCalled();
});

// (10) active with file rejects (US3-2 — "both name and focus")
test("active with file: rejects on file key (US3-2)", () => {
  const result = backlinksInputSchema.safeParse({
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

// (11) active with path rejects
test("active with path: rejects on path key", () => {
  const result = backlinksInputSchema.safeParse({
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

// (12) active with vault rejects
test("active with vault: rejects on vault key", () => {
  const result = backlinksInputSchema.safeParse({
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

// (13) unknown top-level key rejects (US3-5 — strict mode)
test("unknown top-level key rejected (strict mode / US3-5)", () => {
  const dispatcherSpy = vi.fn();
  const result = backlinksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    filter: "wikilink",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const unrecognized = result.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as { keys: string[] }).keys).toContain("filter");
  }
  expect(dispatcherSpy).not.toHaveBeenCalled();
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

// (20) target_mode:"focused" rejects (US3-9 — unknown enum)
test("target_mode: 'focused' (unknown enum value) rejected (US3-9)", () => {
  const result = backlinksInputSchema.safeParse({
    target_mode: "focused",
    vault: "Demo",
    path: "x.md",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const issues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["target_mode"]),
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  }
});

// (21) target_mode missing rejects (US3-9)
test("target_mode missing rejected (US3-9)", () => {
  const result = backlinksInputSchema.safeParse({
    vault: "Demo",
    path: "x.md",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const issues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["target_mode"]),
    );
    expect(issues.length).toBeGreaterThanOrEqual(1);
  }
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
