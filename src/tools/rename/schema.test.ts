// Original — no upstream. Tests for the rename input + output schemas — happy paths across both modes, /speckit-clarify Q1 verbatim-`.md` forwarding accepted at schema layer, /speckit-clarify Q2 folder-separator rejection, Story 6 validation classes, UTF-8 byte-perfect, output literal-true gate.
import { expectTypeOf, test, expect } from "vitest";

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

// ---- Failure-path (target-mode primitive: locator XOR + vault + active forbidden keys) ----

// (f) Story 6 AC#1 — specific without locator
test("specific without file or path rejects with 'exactly one of' (Story 6 AC#1)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    name: "Fixed",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message).join(" | ");
    expect(messages).toContain("exactly one of");
  }
});

// (g) Story 6 AC#2 — specific with both locators
test("specific with both file AND path rejects on both paths (Story 6 AC#2)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    file: "F",
    path: "F.md",
    name: "Fixed",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const fileIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["file"]));
    const pathIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["path"]));
    expect(fileIssues.length).toBeGreaterThanOrEqual(1);
    expect(pathIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (h) Story 6 AC#3 — vault missing in specific
test("specific without vault rejects on path=['vault'] (Story 6 AC#3)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    file: "F",
    name: "Fixed",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const vaultIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["vault"]));
    expect(vaultIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (i) Story 6 AC#4 — active forbids vault / file / path
test.each([
  ["vault", { target_mode: "active", vault: "V", name: "X" }],
  ["file", { target_mode: "active", file: "F", name: "X" }],
  ["path", { target_mode: "active", path: "P.md", name: "X" }],
])("active mode forbids %s (Story 6 AC#4)", (key, input) => {
  const result = renameInputSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success) {
    const matched = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify([key]));
    expect(matched.length).toBeGreaterThanOrEqual(1);
    expect(matched[0]!.message).toContain("active mode");
  }
});

// (j) Story 6 AC#5 — unknown top-level key
test("unknown top-level key rejected by strict mode (Story 6 AC#5)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    name: "Fixed",
    pancakes: "yes",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const unrecognized = result.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as unknown as { keys: string[] }).keys).toContain("pancakes");
  }
});

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

// (s) Invalid discriminator
test("invalid target_mode value rejects on path=['target_mode']", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "unknown",
    vault: "V",
    path: "P.md",
    name: "Fixed",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const tmIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["target_mode"]));
    expect(tmIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (t) Empty-string vault
test("vault: '' empty-string rejects with too_small (Edge Case)", () => {
  const result = renameInputSchema.safeParse({
    target_mode: "specific",
    vault: "",
    path: "P.md",
    name: "Fixed",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const vaultIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["vault"]));
    expect(vaultIssues.some((i) => i.code === "too_small")).toBe(true);
  }
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
