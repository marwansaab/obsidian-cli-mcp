// Original — no upstream. Tests for the links input/output/eval-envelope schemas — target_mode discriminator inherited from targetModeBaseSchema, XOR locator + active-forbid refinements, optional total boolean, strict additionalProperties rejection, emitted JSON Schema round-trip via toMcpInputSchema.
import { describe, expect, it, test, vi } from "vitest";

import {
  LINKS_EVAL_ERROR_CODES,
  linkEntrySchema,
  linkKindEnum,
  linksEvalResponseSchema,
  linksInputSchema,
  linksOutputSchema,
} from "./schema.js";
import { toMcpInputSchema } from "../_shared.js";
import { targetModeWiringCases } from "../_target-mode-test-cases.js";

// (1) specific + vault + path happy
test("specific + vault + path: parses OK", () => {
  const dispatcherSpy = vi.fn();
  const result = linksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "Projects/brief.md",
  });
  expect(result.success).toBe(true);
  expect(dispatcherSpy).not.toHaveBeenCalled();
});

// (2) specific + vault + file (basename) happy
test("specific + vault + file (basename): parses OK", () => {
  const result = linksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    file: "brief",
  });
  expect(result.success).toBe(true);
});

// (3) specific + vault + path + total:true happy
test("specific + vault + path + total:true: parses OK", () => {
  const result = linksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "Projects/brief.md",
    total: true,
  });
  expect(result.success).toBe(true);
});

// (4) specific + vault + path + total:false happy
test("specific + vault + path + total:false: parses OK", () => {
  const result = linksInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "Projects/brief.md",
    total: false,
  });
  expect(result.success).toBe(true);
});

// (5) active happy
test("active (no other fields): parses OK", () => {
  const result = linksInputSchema.safeParse({ target_mode: "active" });
  expect(result.success).toBe(true);
});

// (6) active + total:true happy
test("active + total:true: parses OK", () => {
  const result = linksInputSchema.safeParse({ target_mode: "active", total: true });
  expect(result.success).toBe(true);
});

// (7) tool-specific: total as string "true" rejects (type)
test("total as string \"true\" rejected with invalid_type", () => {
  const result = linksInputSchema.safeParse({
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

// target-mode refinement wiring (shared battery) — the primitive is covered once
// in target-mode/target-mode.test.ts; this only proves the refinement is wired
// into linksInputSchema.
describe("linksInputSchema — target-mode refinement wiring (shared battery)", () => {
  it.each(
    targetModeWiringCases(
      { target_mode: "specific", vault: "V", path: "n.md" },
      { target_mode: "active" },
    ),
  )("$label", ({ input, valid, issuePath }) => {
    const r = linksInputSchema.safeParse(input);
    expect(r.success).toBe(valid);
    if (!valid && issuePath && !r.success) {
      expect(r.error.issues.some((i) => i.path.includes(issuePath))).toBe(true);
    }
  });
});

// (8) emitted JSON Schema preserves target_mode enum constraint
test("toMcpInputSchema(linksInputSchema) preserves target_mode enum constraint", () => {
  const emitted = toMcpInputSchema(linksInputSchema) as Record<string, unknown>;
  // The emitted shape may be wrapped (allOf/anyOf) due to superRefine; walk it.
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
      if (
        enumVals.length === 2 &&
        enumVals.includes("specific") &&
        enumVals.includes("active")
      ) {
        foundTargetModeEnum = true;
      }
    }
    for (const value of Object.values(rec)) walk(value);
  };
  walk(emitted);
  expect(foundTargetModeEnum).toBe(true);
});

// --- Output schema sanity tests (cover the linkKindEnum, linkEntrySchema, linksOutputSchema, envelope discriminator). ---

test("linkKindEnum accepts wikilink/embed/markdown only", () => {
  expect(linkKindEnum.safeParse("wikilink").success).toBe(true);
  expect(linkKindEnum.safeParse("embed").success).toBe(true);
  expect(linkKindEnum.safeParse("markdown").success).toBe(true);
  expect(linkKindEnum.safeParse("url").success).toBe(false);
  expect(linkKindEnum.safeParse("").success).toBe(false);
});

test("linkEntrySchema strict mode rejects extra keys", () => {
  const result = linkEntrySchema.safeParse({
    target: "Roadmap",
    line: 1,
    kind: "wikilink",
    column: 4,
  });
  expect(result.success).toBe(false);
});

test("linkEntrySchema accepts minimal entry without displayText", () => {
  const result = linkEntrySchema.safeParse({
    target: "Roadmap",
    line: 1,
    kind: "wikilink",
  });
  expect(result.success).toBe(true);
});

test("linksOutputSchema strict mode rejects extra keys", () => {
  const result = linksOutputSchema.safeParse({
    count: 0,
    links: [],
    extra: "x",
  });
  expect(result.success).toBe(false);
});

test.each<[string, unknown, boolean]>([
  ["ok:true happy", { ok: true, count: 0, links: [] }, true],
  ["ok:true with entry", { ok: true, count: 1, links: [{ target: "X", line: 1, kind: "wikilink" }] }, true],
  ["ok:false FILE_NOT_FOUND", { ok: false, code: "FILE_NOT_FOUND", detail: "x" }, true],
  ["ok:false NOT_MARKDOWN", { ok: false, code: "NOT_MARKDOWN", detail: "x" }, true],
  ["ok:false NO_ACTIVE_FILE", { ok: false, code: "NO_ACTIVE_FILE", detail: "x" }, true],
  ["ok:true missing count", { ok: true, links: [] }, false],
  ["ok:true unknown extra", { ok: true, count: 0, links: [], surprise: "x" }, false],
  ["ok:false unknown code", { ok: false, code: "OTHER", detail: "x" }, false],
  ["ok:false missing detail", { ok: false, code: "FILE_NOT_FOUND" }, false],
])("envelope discriminator: %s", (_label, input, expected) => {
  const result = linksEvalResponseSchema.safeParse(input);
  expect(result.success).toBe(expected);
});

test("LINKS_EVAL_ERROR_CODES is exactly NO_ACTIVE_FILE/FILE_NOT_FOUND/NOT_MARKDOWN", () => {
  expect([...LINKS_EVAL_ERROR_CODES].sort()).toEqual([
    "FILE_NOT_FOUND",
    "NOT_MARKDOWN",
    "NO_ACTIVE_FILE",
  ].sort());
});
