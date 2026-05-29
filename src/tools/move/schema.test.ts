// Original — no upstream. Tests for the move input + output schemas — happy paths across both modes and both `to` shapes (folder-target trailing-`/`, full-path-target), validation failure roster (Story 4), UTF-8 byte-perfect, output literal-true gate.
import { describe, expectTypeOf, it, test, expect } from "vitest";

import { moveInputSchema, moveOutputSchema, type MoveInput, type MoveOutput } from "./schema.js";
import { targetModeWiringCases } from "../_target-mode-test-cases.js";

// ---- Happy-path (6 cases) -----------------------------------------------

test("specific+path+folder-target `to: 'Archive/'` happy path (Story 1)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "MyVault",
    path: "Inbox/Tax-2026.md",
    to: "Archive/",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data).toMatchObject({
      target_mode: "specific",
      vault: "MyVault",
      path: "Inbox/Tax-2026.md",
      to: "Archive/",
    });
  }
});

test("specific+path+full-path-target with `.md` happy path (Story 2 AC#1)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "MyVault",
    path: "Inbox/Tax-2026.md",
    to: "Archive/2026-Tax-Return.md",
  });
  expect(result.success).toBe(true);
});

test("specific+path+full-path-target without `.md` happy path (Story 2 AC#2)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "MyVault",
    path: "Inbox/Tax-2026.md",
    to: "Archive/2026-Tax-Return",
  });
  expect(result.success).toBe(true);
});

test("specific+file+folder-target happy path (Story 2 AC#4)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "MyVault",
    file: "Tax-2026",
    to: "Archive/2026/",
  });
  expect(result.success).toBe(true);
});

test("active+to happy path; no locator fields (Story 5)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "active",
    to: "Archive/",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.target_mode).toBe("active");
    expect(result.data.vault).toBeUndefined();
    expect(result.data.file).toBeUndefined();
    expect(result.data.path).toBeUndefined();
  }
});

test("UTF-8 multi-byte path + to accepted byte-perfect", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "MyVault",
    path: "Inbox/日記.md",
    to: "アーカイブ/",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.path).toBe("Inbox/日記.md");
    expect(result.data.to).toBe("アーカイブ/");
  }
});

// ---- Target-mode refinement wiring (shared battery) --------------------

describe("moveInputSchema — target-mode refinement wiring (shared battery)", () => {
  it.each(
    targetModeWiringCases(
      { target_mode: "specific", vault: "MyVault", path: "Inbox/Tax-2026.md", to: "Archive/" },
      { target_mode: "active", to: "Archive/" },
    ),
  )("$label", ({ input, valid, issuePath }) => {
    const r = moveInputSchema.safeParse(input);
    expect(r.success).toBe(valid);
    if (!valid && issuePath && !r.success) {
      expect(r.error.issues.some((i) => i.path.includes(issuePath))).toBe(true);
    }
  });
});

// ---- Failure-path (`to` validation) ----

test("missing `to` rejects on path=['to'] (Story 4 AC#7a)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const toIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["to"]),
    );
    expect(toIssues.length).toBeGreaterThanOrEqual(1);
  }
});

test("empty `to: ''` rejects on path=['to'] with too_small (Story 4 AC#6)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    to: "",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const toIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["to"]),
    );
    expect(toIssues.length).toBeGreaterThanOrEqual(1);
    expect(toIssues.some((i) => i.code === "too_small")).toBe(true);
  }
});

test("non-string `to: 42` rejects with invalid_type (Story 4 AC#7b)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    to: 42,
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const toIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["to"]),
    );
    expect(toIssues[0]!.code).toBe("invalid_type");
  }
});

test("`to: null` rejects", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    to: null,
  });
  expect(result.success).toBe(false);
});

test("`to: []` rejects (non-string)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    to: [],
  });
  expect(result.success).toBe(false);
});

test("UTF-8 `to: 'アーカイブ/'` accepted at schema layer (byte-perfect)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    to: "アーカイブ/",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.to).toBe("アーカイブ/");
  }
});

// ---- Inferred type compile-time check ----------------------------------

test("MoveInput type compiles via z.infer (compile-time)", () => {
  expectTypeOf<MoveInput>().toHaveProperty("target_mode");
  expectTypeOf<MoveInput>().toHaveProperty("to");
  expectTypeOf<MoveInput["to"]>().toEqualTypeOf<string>();
});

// ---- Output schema -----------------------------------------------------

test("output schema validates { moved: true, fromPath, toPath }", () => {
  const result = moveOutputSchema.safeParse({
    moved: true,
    fromPath: "Inbox/Note.md",
    toPath: "Archive/Note.md",
  });
  expect(result.success).toBe(true);
});

test("output schema rejects { moved: false } (literal-true gate)", () => {
  const result = moveOutputSchema.safeParse({
    moved: false,
    fromPath: "a",
    toPath: "b",
  });
  expect(result.success).toBe(false);
});

test("output schema rejects extra keys (strict)", () => {
  const result = moveOutputSchema.safeParse({
    moved: true,
    fromPath: "a",
    toPath: "b",
    pancakes: "yes",
  });
  expect(result.success).toBe(false);
});

test("MoveOutput type compiles via z.infer (compile-time)", () => {
  expectTypeOf<MoveOutput>().toEqualTypeOf<{ moved: true; fromPath: string; toPath: string }>();
});
