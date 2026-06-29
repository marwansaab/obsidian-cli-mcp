// Original — no upstream. Tests for the shared Bases-family `.base` path refinement.
// Pins the byte-exact INVALID_BASE_PATH issue contract (messages + params) for BOTH field
// labels — `path` (create_base) and `base_path` (query_base / views_base) — so the per-tool
// schemas that delegate to it stay byte-identical to their prior hand-rolled copies.
import { expect, test } from "vitest";
import { z } from "zod";

import { appendBasePathIssues, BASE_PATH_MAX } from "./_base-path.js";

// A minimal schema that runs the shared refinement against a single string field, so each test
// exercises appendBasePathIssues exactly as a real tool schema does.
function refiner(field: string) {
  return z
    .object({ [field]: z.string() })
    .superRefine((v, ctx) => {
      const value = v[field];
      if (typeof value === "string") appendBasePathIssues(ctx, value, field);
    });
}

function firstParams(r: { success: boolean; error?: z.ZodError }): Record<string, unknown> | undefined {
  if (r.success) return undefined;
  const issue = r.error!.issues.find((i) => (i as { params?: unknown }).params !== undefined);
  return (issue as { params?: Record<string, unknown> } | undefined)?.params;
}

function firstMessage(r: { success: boolean; error?: z.ZodError }): string | undefined {
  if (r.success) return undefined;
  return r.error!.issues.find((i) => (i as { params?: unknown }).params !== undefined)?.message;
}

for (const field of ["path", "base_path"] as const) {
  test(`[${field}] valid .base path adds no issue`, () => {
    const r = refiner(field).safeParse({ [field]: "Folder/Tasks.base" });
    expect(r.success).toBe(true);
  });

  test(`[${field}] empty → INVALID_BASE_PATH/empty with value_length 0`, () => {
    const r = refiner(field).safeParse({ [field]: "" });
    expect(r.success).toBe(false);
    expect(firstMessage(r)).toBe(`INVALID_BASE_PATH/empty: ${field} is empty`);
    expect(firstParams(r)).toEqual({
      code: "INVALID_BASE_PATH",
      reason: "empty",
      field,
      value_length: 0,
    });
  });

  test(`[${field}] too-long → INVALID_BASE_PATH/too-long with value_length`, () => {
    const value = "a".repeat(BASE_PATH_MAX + 1) + ".base";
    const r = refiner(field).safeParse({ [field]: value });
    expect(r.success).toBe(false);
    expect(firstMessage(r)).toBe(
      `INVALID_BASE_PATH/too-long: ${field} exceeds ${BASE_PATH_MAX} UTF-16 code units`,
    );
    expect(firstParams(r)).toEqual({
      code: "INVALID_BASE_PATH",
      reason: "too-long",
      field,
      value_length: value.length,
    });
  });

  test(`[${field}] path-traversal → INVALID_BASE_PATH/path-traversal carrying value`, () => {
    const r = refiner(field).safeParse({ [field]: "../secrets.base" });
    expect(r.success).toBe(false);
    expect(firstMessage(r)).toBe(
      `INVALID_BASE_PATH/path-traversal: ${field} contains path-traversal shapes`,
    );
    expect(firstParams(r)).toEqual({
      code: "INVALID_BASE_PATH",
      reason: "path-traversal",
      field,
      value: "../secrets.base",
    });
  });

  test(`[${field}] wrong-extension → INVALID_BASE_PATH/wrong-extension carrying value`, () => {
    const r = refiner(field).safeParse({ [field]: "Notes/Daily.md" });
    expect(r.success).toBe(false);
    expect(firstMessage(r)).toBe(`INVALID_BASE_PATH/wrong-extension: ${field} must end with .base`);
    expect(firstParams(r)).toEqual({
      code: "INVALID_BASE_PATH",
      reason: "wrong-extension",
      field,
      value: "Notes/Daily.md",
    });
  });
}

test("BASE_PATH_MAX is 1000", () => {
  expect(BASE_PATH_MAX).toBe(1000);
});
