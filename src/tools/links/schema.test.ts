// Original — no upstream. Tests for the links input/output/eval-envelope schemas — target_mode discriminator inherited from targetModeBaseSchema, XOR locator + active-forbid refinements, optional total boolean, strict additionalProperties rejection, emitted JSON Schema round-trip via toMcpInputSchema.
import { expect, test, vi } from "vitest";

import {
  LINKS_EVAL_ERROR_CODES,
  linkEntrySchema,
  linkKindEnum,
  linksEvalResponseSchema,
  linksInputSchema,
  linksOutputSchema,
} from "./schema.js";
import { toMcpInputSchema } from "../_shared.js";

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

// (7) specific without vault rejects; dispatcher never called
test("specific without vault: rejects with vault-path issue; dispatcher spy never called (FR-015)", () => {
  const dispatcherSpy = vi.fn();
  const result = linksInputSchema.safeParse({
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

// (8) specific without file+path rejects (XOR violation: got neither)
test("specific without file or path: rejects with 'exactly one of'", () => {
  const dispatcherSpy = vi.fn();
  const result = linksInputSchema.safeParse({
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

// (9) specific with BOTH file+path rejects (XOR violation: got both)
test("specific with BOTH file AND path: rejects on both keys (XOR)", () => {
  const dispatcherSpy = vi.fn();
  const result = linksInputSchema.safeParse({
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

// (10) active with vault rejects
test("active with vault: rejects on vault key", () => {
  const result = linksInputSchema.safeParse({
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

// (11) active with file rejects
test("active with file: rejects on file key", () => {
  const result = linksInputSchema.safeParse({
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

// (12) active with path rejects
test("active with path: rejects on path key", () => {
  const result = linksInputSchema.safeParse({
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

// (13) unknown top-level key rejects (strict mode)
test("unknown top-level key rejected (strict mode / FR-004)", () => {
  const dispatcherSpy = vi.fn();
  const result = linksInputSchema.safeParse({
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

// (14) total as string "true" rejects (type)
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

// (15) target_mode missing rejects
test("target_mode missing rejected", () => {
  const result = linksInputSchema.safeParse({
    vault: "Demo",
    path: "x.md",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const targetModeIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["target_mode"]),
    );
    expect(targetModeIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (16) target_mode unknown enum value rejected
test("target_mode: 'focused' (unknown enum value) rejected", () => {
  const result = linksInputSchema.safeParse({
    target_mode: "focused",
    vault: "Demo",
    path: "x.md",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const targetModeIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["target_mode"]),
    );
    expect(targetModeIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (17) vault empty string rejected
test("vault empty string rejected (min(1))", () => {
  const result = linksInputSchema.safeParse({
    target_mode: "specific",
    vault: "",
    path: "x.md",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const vaultIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["vault"]),
    );
    expect(vaultIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (18) emitted JSON Schema preserves target_mode enum constraint
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
