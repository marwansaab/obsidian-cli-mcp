// Original — no upstream. Tests for the read input schema (re-export of the target-mode primitive).
import { describe, it, test, expect } from "vitest";

import { targetModeWiringCases } from "../_target-mode-test-cases.js";
import { readInputSchema } from "./schema.js";

test("parses specific+file happy path (Story 1 AC#1)", () => {
  const result = readInputSchema.safeParse({ target_mode: "specific", vault: "MyVault", file: "Recipe" });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data).toMatchObject({ target_mode: "specific", vault: "MyVault", file: "Recipe" });
  }
});

test("parses specific+path happy path (Story 2 AC#1)", () => {
  const result = readInputSchema.safeParse({
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
  const result = readInputSchema.safeParse({ target_mode: "active" });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data).toEqual({ target_mode: "active" });
  }
});

describe("readInputSchema — target-mode refinement wiring (shared battery)", () => {
  it.each(
    targetModeWiringCases(
      { target_mode: "specific", vault: "V", path: "n.md" },
      { target_mode: "active" },
    ),
  )("$label", ({ input, valid, issuePath }) => {
    const r = readInputSchema.safeParse(input);
    expect(r.success).toBe(valid);
    if (!valid && issuePath && !r.success) {
      expect(r.error.issues.some((i) => i.path.includes(issuePath))).toBe(true);
    }
  });
});
