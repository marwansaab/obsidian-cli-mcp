// Original — no upstream. Tests for the delete input schema — happy paths across both modes + permanent variations + 7 Story 5 validation classes.
import { describe, it, test, expect } from "vitest";

import { targetModeWiringCases } from "../_target-mode-test-cases.js";
import { deleteInputSchema } from "./schema.js";

// (a) Story 1 happy-path — specific mode with `path=`
test("specific+path happy path applies permanent default false (Story 1 AC#1)", () => {
  const result = deleteInputSchema.safeParse({
    target_mode: "specific",
    vault: "MyVault",
    path: "Inbox/Old.md",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.permanent).toBe(false);
    expect(result.data).toMatchObject({
      target_mode: "specific",
      vault: "MyVault",
      path: "Inbox/Old.md",
    });
  }
});

// (b) Story 2 happy-path — specific mode with `file=`
test("specific+file happy path (Story 2 AC#1)", () => {
  const result = deleteInputSchema.safeParse({
    target_mode: "specific",
    vault: "MyVault",
    file: "QuickNote",
  });
  expect(result.success).toBe(true);
});

// (c) Story 3 happy-path — specific mode with permanent: true
test("specific+permanent=true happy path (Story 3 AC#1)", () => {
  const result = deleteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "Old.md",
    permanent: true,
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.permanent).toBe(true);
  }
});

// (d) Story 4 happy-path — active mode with no permanent (defaults false)
test("active mode happy path defaults permanent=false; no locator fields (Story 4 AC#1)", () => {
  const result = deleteInputSchema.safeParse({ target_mode: "active" });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.permanent).toBe(false);
    expect(result.data.target_mode).toBe("active");
    expect(result.data.vault).toBeUndefined();
    expect(result.data.file).toBeUndefined();
    expect(result.data.path).toBeUndefined();
  }
});

// (e) Story 4 AC#2 — active mode WITH permanent: true (R6: permitted in both modes)
test("active+permanent=true happy path (Story 4 AC#2, R6 permits in both modes)", () => {
  const result = deleteInputSchema.safeParse({
    target_mode: "active",
    permanent: true,
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.permanent).toBe(true);
  }
});

// Target-mode refinement wiring — the primitive (specific-requires-vault, locator
// XOR, active-forbids-vault/file/path, discriminator, strict unknown-key) is proven
// once in target-mode/target-mode.test.ts; here we only assert it is WIRED into
// deleteInputSchema via the shared battery.
describe("deleteInputSchema — target-mode refinement wiring (shared battery)", () => {
  it.each(
    targetModeWiringCases(
      { target_mode: "specific", vault: "V", path: "n.md" },
      { target_mode: "active" },
    ),
  )("$label", ({ input, valid, issuePath }) => {
    const r = deleteInputSchema.safeParse(input);
    expect(r.success).toBe(valid);
    if (!valid && issuePath && !r.success) {
      expect(r.error.issues.some((i) => i.path.includes(issuePath))).toBe(true);
    }
  });
});

// (l) Story 5 AC#7 — permanent non-boolean
test("permanent non-boolean rejects on path=['permanent'] with invalid_type (Story 5 AC#7)", () => {
  const result = deleteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    permanent: "true",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const permIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["permanent"]));
    expect(permIssues.length).toBeGreaterThanOrEqual(1);
    expect(permIssues[0]!.code).toBe("invalid_type");
  }
});

// (m) Defaults coercion in both modes
test("permanent defaults to false when omitted or undefined in both modes", () => {
  const specificOmitted = deleteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
  });
  expect(specificOmitted.success).toBe(true);
  if (specificOmitted.success) expect(specificOmitted.data.permanent).toBe(false);

  const specificUndefined = deleteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    permanent: undefined,
  });
  expect(specificUndefined.success).toBe(true);
  if (specificUndefined.success) expect(specificUndefined.data.permanent).toBe(false);

  const activeOmitted = deleteInputSchema.safeParse({ target_mode: "active" });
  expect(activeOmitted.success).toBe(true);
  if (activeOmitted.success) expect(activeOmitted.data.permanent).toBe(false);
});
