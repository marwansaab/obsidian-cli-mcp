// Original — no upstream. Tests for the rename input + output schemas — happy paths across both modes, /speckit-clarify Q1 verbatim-`.md` forwarding accepted at schema layer, /speckit-clarify Q2 folder-separator rejection, Story 6 validation classes, UTF-8 byte-perfect, output literal-true gate.
import { describe, expectTypeOf, it, test, expect } from "vitest";

import { targetModeWiringCases } from "../_target-mode-test-cases.js";
import { renameInputSchema, renameNoteOutputSchema, type RenameNoteInput } from "./schema.js";

import type { z } from "zod";

// ---- Happy-path (5 cases) -----------------------------------------------

// (a) Story 1 happy-path — specific + path + bare name
test("specific+path+name happy path (Story 1 IT)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "MyVault",
    path: "Inbox/Typo.md",
    name: "Fixed",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data).toMatchObject({
      target_mode: "specific",
      vault: "MyVault",
      path: "Inbox/Typo.md",
      name: "Fixed",
    });
  }
});

// (b) Story 2 happy-path — specific + file
test("specific+file+name happy path (Story 2 IT)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    file: "QuickNote",
    name: "Quick Note",
  });
  expect(result.success).toBe(true);
});

// (c) Story 3 verbatim-`.md` — name already endsWith(".md")
test("specific+path+`Fixed.md` accepted at schema layer (Story 3 verbatim-forwarding)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "Inbox/Typo.md",
    name: "Fixed.md",
  });
  expect(result.success).toBe(true);
});

// (d) UTF-8 name accepted byte-perfect
test("specific+path+UTF-8 name (e.g. `日記`) accepted at schema layer", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "Inbox/Old.md",
    name: "日記",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.name).toBe("日記");
  }
});

// (e) Story 5 happy-path — active mode + name
test("active+name happy path; no locator fields (Story 5 AC#1)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "active",
    name: "Today",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.target_mode).toBe("active");
    expect(result.data.vault).toBeUndefined();
    expect(result.data.file).toBeUndefined();
    expect(result.data.path).toBeUndefined();
  }
});

// ---- target-mode refinement wiring (shared battery) ---------------------

describe("renameInputSchema — target-mode refinement wiring (shared battery)", () => {
  it.each(
    targetModeWiringCases(
      { target_mode: "specific", vault: "V", path: "n.md", name: "new" },
      { target_mode: "active", name: "new" },
    ),
  )("$label", ({ input, valid, issuePath }) => {
    const r = renameInputSchema.safeParse(input);
    expect(r.success).toBe(valid);
    if (!valid && issuePath && !r.success) {
      expect(r.error.issues.some((i) => i.path.includes(issuePath))).toBe(true);
    }
  });
});

// ---- Failure-path (tool-specific name validation) -----------------------

// (k) Story 6 AC#6 — empty name
test("specific with empty name rejects on path=['name'] with too_small (Story 6 AC#6)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    name: "",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const nameIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["name"]));
    expect(nameIssues.length).toBeGreaterThanOrEqual(1);
    expect(nameIssues.some((i) => i.code === "too_small")).toBe(true);
  }
});

// (l) Story 6 AC#7a — name absent
test("specific with name absent rejects on path=['name'] with invalid_type (Story 6 AC#7a)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const nameIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["name"]));
    expect(nameIssues.length).toBeGreaterThanOrEqual(1);
    expect(nameIssues[0]!.code).toBe("invalid_type");
  }
});

// (m) Story 6 AC#7b — name non-string
test("specific with name: 42 rejects on path=['name'] with invalid_type (Story 6 AC#7b)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    name: 42,
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const nameIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["name"]));
    expect(nameIssues[0]!.code).toBe("invalid_type");
  }
});

// (n) Story 6 AC#8 — folder-separator rejection (forward slash)
test("name with forward slash rejects with move_note recovery hint (Story 6 AC#8 / Q2)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    name: "Sub/X",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const nameIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["name"]));
    expect(nameIssues.length).toBeGreaterThanOrEqual(1);
    const messages = nameIssues.map((i) => i.message).join(" | ");
    expect(messages).toMatch(/move_note/);
  }
});

// (o) Story 6 AC#8 — folder-separator rejection (backslash)
test("name with backslash rejects with move_note recovery hint (Story 6 AC#8 / Q2)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    name: "Sub\\X",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const nameIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["name"]));
    expect(nameIssues.length).toBeGreaterThanOrEqual(1);
    const messages = nameIssues.map((i) => i.message).join(" | ");
    expect(messages).toMatch(/move_note/);
  }
});

// (p) Multiple slashes
test("name with multiple slashes rejects (a/b/c)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    name: "a/b/c",
  });
  expect(result.success).toBe(false);
});

// (q) Leading slash
test("name with leading slash rejects (`/Fixed`)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    name: "/Fixed",
  });
  expect(result.success).toBe(false);
});

// (r) Trailing slash
test("name with trailing slash rejects (`Fixed/`)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    name: "Fixed/",
  });
  expect(result.success).toBe(false);
});

// (u) Inferred TypeScript type compiles correctly
test("RenameNoteInput type compiles via z.infer (compile-time)", () => {
  expectTypeOf<RenameNoteInput>().toHaveProperty("target_mode");
  expectTypeOf<RenameNoteInput>().toHaveProperty("name");
  expectTypeOf<RenameNoteInput["name"]>().toEqualTypeOf<string>();
});

// (v) Output schema validates same-name no-op case
test("output schema validates { renamed: true, fromPath, toPath } (same-name case)", () => {
  const result = renameNoteOutputSchema.safeParse({
    renamed: true,
    fromPath: "Inbox/Note.md",
    toPath: "Inbox/Note.md",
  });
  expect(result.success).toBe(true);
});

// (w) Output schema rejects renamed:false (literal-true gate)
test("output schema rejects { renamed: false } (literal-true gate)", () => {
  const result = renameNoteOutputSchema.safeParse({
    renamed: false,
    fromPath: "a",
    toPath: "b",
  });
  expect(result.success).toBe(false);
});

// (x) Output schema rejects extra keys (strict)
test("output schema rejects extra keys (strict)", () => {
  const result = renameNoteOutputSchema.safeParse({
    renamed: true,
    fromPath: "a",
    toPath: "b",
    pancakes: "yes",
  });
  expect(result.success).toBe(false);
});

// (y) Inferred output type shape (compile-time)
test("RenameNoteOutput type compiles via z.infer (compile-time)", () => {
  type Out = z.infer<typeof renameNoteOutputSchema>;
  expectTypeOf<Out>().toEqualTypeOf<{ renamed: true; fromPath: string; toPath: string }>();
});
