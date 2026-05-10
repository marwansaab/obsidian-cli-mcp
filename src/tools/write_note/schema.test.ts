// Original — no upstream. Tests for the write_note input/output schemas per ADR-009 — target_mode discriminator coverage; path-safety refinement; template strict rejection; active-mode rules; output envelope strict shape.
import { expect, test } from "vitest";

import { writeNoteInputSchema, writeNoteOutputSchema } from "./schema.js";

// (1) Specific mode + vault + path + content + overwrite=true accepted
test("specific + vault + path + content + overwrite=true accepted", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "TestVault",
    path: "Sandbox/note.md",
    content: "hello",
    overwrite: true,
  });
  expect(result.success).toBe(true);
});

// (2) Specific mode + vault + file + content accepted
test("specific + vault + file + content accepted", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "TestVault",
    file: "scratch.md",
    content: "hi",
  });
  expect(result.success).toBe(true);
});

// (3) Specific mode without vault → VALIDATION_ERROR
test("specific without vault → fails", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    path: "Sandbox/note.md",
    content: "x",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((i) => i.path.join(".") === "vault")).toBe(true);
  }
});

// (4) Specific mode with both file and path → VALIDATION_ERROR
test("specific with both file and path → fails", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "TestVault",
    file: "x.md",
    path: "Sandbox/x.md",
    content: "x",
  });
  expect(result.success).toBe(false);
});

// (5) Specific mode with neither file nor path → VALIDATION_ERROR
test("specific with neither file nor path → fails", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "TestVault",
    content: "x",
  });
  expect(result.success).toBe(false);
});

// (6) Active mode + content + overwrite=true accepted
test("active + content + overwrite=true accepted", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "active",
    content: "x",
    overwrite: true,
  });
  expect(result.success).toBe(true);
});

// (7) Active mode without overwrite → VALIDATION_ERROR
test("active without overwrite=true → fails", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "active",
    content: "x",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((i) => i.path.join(".") === "overwrite")).toBe(true);
  }
});

// (8) Active mode with vault → VALIDATION_ERROR
test("active with vault → fails", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "active",
    vault: "TestVault",
    content: "x",
    overwrite: true,
  });
  expect(result.success).toBe(false);
});

// (9) Active mode with file → VALIDATION_ERROR
test("active with file → fails", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "active",
    file: "x.md",
    content: "x",
    overwrite: true,
  });
  expect(result.success).toBe(false);
});

// (10) Active mode with path → VALIDATION_ERROR
test("active with path → fails", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "active",
    path: "Sandbox/x.md",
    content: "x",
    overwrite: true,
  });
  expect(result.success).toBe(false);
});

// (11) Active mode with open → VALIDATION_ERROR
test("active with open → fails", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "active",
    content: "x",
    overwrite: true,
    open: true,
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((i) => i.path.join(".") === "open")).toBe(true);
  }
});

// (12) Specific mode with `template: "Daily"` → VALIDATION_ERROR (unrecognized_keys)
test("specific with template field → unrecognized_keys (FR-016 migration)", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "TestVault",
    path: "Daily/2026-05-10.md",
    content: "",
    template: "Daily",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
  }
});

// (13) Specific mode with `open: true` accepted
test("specific with open=true accepted", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "TestVault",
    path: "Sandbox/note.md",
    content: "x",
    open: true,
  });
  expect(result.success).toBe(true);
});

// (14) overwrite default is false (omitted in input → parsed as false)
test("overwrite default is false when omitted in specific mode", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "TestVault",
    path: "Sandbox/note.md",
    content: "x",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.overwrite).toBe(false);
  }
});

// (15) Path with `../` → VALIDATION_ERROR (path-safety integration)
test("path with '../' rejected via path-safety refinement", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "TestVault",
    path: "Sandbox/../escape.md",
    content: "x",
  });
  expect(result.success).toBe(false);
});

// (16) Path with leading `/` → VALIDATION_ERROR
test("path with leading '/' rejected via path-safety refinement", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "TestVault",
    path: "/abs/escape.md",
    content: "x",
  });
  expect(result.success).toBe(false);
});

// (17) Path with drive letter → VALIDATION_ERROR
test("path with drive letter rejected via path-safety refinement", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "TestVault",
    path: "C:/Windows/escape.md",
    content: "x",
  });
  expect(result.success).toBe(false);
});

// (18) Empty content accepted
test("empty content accepted", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "TestVault",
    path: "Sandbox/empty.md",
    content: "",
  });
  expect(result.success).toBe(true);
});

// (19) Very large content (e.g. 100KB) accepted at schema layer
test("100KB content accepted at schema layer (no size cap)", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "TestVault",
    path: "Sandbox/big.md",
    content: "x".repeat(100_000),
  });
  expect(result.success).toBe(true);
});

// (20) Output shape { created: true, path: "..." } parses
test("output shape { created: true, path } parses", () => {
  const result = writeNoteOutputSchema.safeParse({ created: true, path: "Sandbox/x.md" });
  expect(result.success).toBe(true);
});

// (21) Output shape with extra field rejected (strict)
test("output shape with extra field rejected", () => {
  const result = writeNoteOutputSchema.safeParse({
    created: true,
    path: "Sandbox/x.md",
    surprise: 1,
  });
  expect(result.success).toBe(false);
});

// (22) Output shape with wrong type for `created` rejected
test("output shape with non-boolean created rejected", () => {
  const result = writeNoteOutputSchema.safeParse({
    created: "yes",
    path: "Sandbox/x.md",
  });
  expect(result.success).toBe(false);
});
