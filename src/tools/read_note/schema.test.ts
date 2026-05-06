// Original — no upstream. Tests for the read_note input schema (re-export of the target-mode primitive).
import { test, expect } from "vitest";

import { readNoteInputSchema } from "./schema.js";

test("parses specific+file happy path (Story 1 AC#1)", () => {
  const result = readNoteInputSchema.safeParse({ target_mode: "specific", vault: "MyVault", file: "Recipe" });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data).toMatchObject({ target_mode: "specific", vault: "MyVault", file: "Recipe" });
  }
});

test("parses specific+path happy path (Story 2 AC#1)", () => {
  const result = readNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "MyVault",
    path: "Templates/Recipe.md",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data).toMatchObject({
      target_mode: "specific",
      vault: "MyVault",
      path: "Templates/Recipe.md",
    });
  }
});

test("parses active happy path (Story 3 AC#1)", () => {
  const result = readNoteInputSchema.safeParse({ target_mode: "active" });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data).toEqual({ target_mode: "active" });
  }
});

test("rejects specific with neither file nor path (Story 4 AC#1)", () => {
  const result = readNoteInputSchema.safeParse({ target_mode: "specific", vault: "MyVault" });
  expect(result.success).toBe(false);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message).join(" | ");
    expect(messages).toContain("exactly one of");
  }
});

test("rejects specific with both file AND path (Story 4 AC#2)", () => {
  const result = readNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "MyVault",
    file: "F",
    path: "P",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const issues = result.error.issues;
    const filePathIssues = issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["file"]));
    const pathPathIssues = issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["path"]));
    expect(filePathIssues.length).toBeGreaterThanOrEqual(1);
    expect(pathPathIssues.length).toBeGreaterThanOrEqual(1);
    expect(filePathIssues[0]!.message).toContain("exactly one of");
    expect(pathPathIssues[0]!.message).toContain("exactly one of");
  }
});

test("rejects empty object (target_mode missing) (Story 4 AC#3)", () => {
  const result = readNoteInputSchema.safeParse({});
  expect(result.success).toBe(false);
  if (!result.success) {
    const paths = result.error.issues.map((i) => i.path.join("."));
    expect(paths.some((p) => p.includes("target_mode"))).toBe(true);
  }
});

test("rejects specific with vault missing (Story 4 AC#4)", () => {
  const result = readNoteInputSchema.safeParse({ target_mode: "specific", file: "F" });
  expect(result.success).toBe(false);
  if (!result.success) {
    const paths = result.error.issues.map((i) => i.path.join("."));
    expect(paths.some((p) => p.includes("vault"))).toBe(true);
  }
});

test("rejects forbidden 'vault' key in active mode (Story 3 AC#2)", () => {
  const result = readNoteInputSchema.safeParse({ target_mode: "active", vault: "V" });
  expect(result.success).toBe(false);
  if (!result.success) {
    const vaultIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["vault"]));
    expect(vaultIssues.length).toBeGreaterThanOrEqual(1);
    expect(vaultIssues[0]!.message).toContain("vault");
    expect(vaultIssues[0]!.message).toContain("active mode");
  }
});

test("rejects invalid discriminator value (Story 4 AC#5)", () => {
  const result = readNoteInputSchema.safeParse({ target_mode: "unknown", vault: "V", file: "F" });
  expect(result.success).toBe(false);
  if (!result.success) {
    const targetModeIssues = result.error.issues.filter((i) =>
      JSON.stringify(i.path) === JSON.stringify(["target_mode"]),
    );
    expect(targetModeIssues.length).toBeGreaterThanOrEqual(1);
  }
});
