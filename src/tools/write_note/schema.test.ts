// Original — no upstream. Tests for the write_note input/output schemas per ADR-009 — target_mode discriminator coverage; path-safety refinement; template strict rejection; active-mode rules; output envelope strict shape.
import { describe, expect, it, test } from "vitest";

import { targetModeWiringCases } from "../_target-mode-test-cases.js";
import { writeNoteInputSchema, writeNoteOutputSchema } from "./schema.js";

describe("writeNoteInputSchema — target-mode refinement wiring (shared battery)", () => {
  it.each(
    targetModeWiringCases(
      { target_mode: "specific", vault: "V", path: "n.md", content: "x" },
      { target_mode: "active", content: "x", overwrite: true },
    ),
  )("$label", ({ input, valid, issuePath }) => {
    const r = writeNoteInputSchema.safeParse(input);
    expect(r.success).toBe(valid);
    if (!valid && issuePath && !r.success) {
      expect(r.error.issues.some((i) => i.path.includes(issuePath))).toBe(true);
    }
  });
});

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
