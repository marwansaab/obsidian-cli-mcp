// Original — no upstream. Tests for the delete_note input schema — happy paths across both modes + permanent variations + 7 Story 5 validation classes.
import { test, expect } from "vitest";

import { deleteNoteInputSchema } from "./schema.js";

// (a) Story 1 happy-path — specific mode with `path=`
test("specific+path happy path applies permanent default false (Story 1 AC#1)", () => {
  const result = deleteNoteInputSchema.safeParse({
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
  const result = deleteNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "MyVault",
    file: "QuickNote",
  });
  expect(result.success).toBe(true);
});

// (c) Story 3 happy-path — specific mode with permanent: true
test("specific+permanent=true happy path (Story 3 AC#1)", () => {
  const result = deleteNoteInputSchema.safeParse({
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
  const result = deleteNoteInputSchema.safeParse({ target_mode: "active" });
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
  const result = deleteNoteInputSchema.safeParse({
    target_mode: "active",
    permanent: true,
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.permanent).toBe(true);
  }
});

// (f) Story 5 AC#1 — neither file nor path
test("specific without file or path rejects with 'exactly one of' (Story 5 AC#1)", () => {
  const result = deleteNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message).join(" | ");
    expect(messages).toContain("exactly one of");
  }
});

// (g) Story 5 AC#2 — both locators
test("specific with both file AND path rejects on both keys (Story 5 AC#2)", () => {
  const result = deleteNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    file: "F",
    path: "F.md",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const fileIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["file"]));
    const pathIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["path"]));
    expect(fileIssues.length).toBeGreaterThanOrEqual(1);
    expect(pathIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (h) Story 5 AC#3 — vault missing in specific mode
test("specific without vault rejects on path=['vault'] (Story 5 AC#3)", () => {
  const result = deleteNoteInputSchema.safeParse({
    target_mode: "specific",
    file: "F",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const vaultIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["vault"]));
    expect(vaultIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (i) Story 5 AC#4 — forbidden vault/file/path in active mode
test.each([
  ["vault", { target_mode: "active", vault: "V" }],
  ["file", { target_mode: "active", file: "F" }],
  ["path", { target_mode: "active", path: "P.md" }],
])("active mode forbids %s (Story 5 AC#4)", (key, input) => {
  const result = deleteNoteInputSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success) {
    const matched = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify([key]));
    expect(matched.length).toBeGreaterThanOrEqual(1);
    expect(matched[0]!.message).toContain("active mode");
  }
});

// (j) Story 5 AC#5 — unknown top-level key
test("unknown top-level key rejected by strict mode (Story 5 AC#5)", () => {
  const result = deleteNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    pancakes: "yes",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const unrecognized = result.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as { keys: string[] }).keys).toContain("pancakes");
  }
});

// (k) Story 5 AC#6 — invalid discriminator
test("invalid target_mode value rejects on path=['target_mode'] (Story 5 AC#6)", () => {
  const result = deleteNoteInputSchema.safeParse({
    target_mode: "unknown",
    vault: "V",
    path: "P.md",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const tmIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["target_mode"]));
    expect(tmIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (l) Story 5 AC#7 — permanent non-boolean
test("permanent non-boolean rejects on path=['permanent'] with invalid_type (Story 5 AC#7)", () => {
  const result = deleteNoteInputSchema.safeParse({
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
  const specificOmitted = deleteNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
  });
  expect(specificOmitted.success).toBe(true);
  if (specificOmitted.success) expect(specificOmitted.data.permanent).toBe(false);

  const specificUndefined = deleteNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    permanent: undefined,
  });
  expect(specificUndefined.success).toBe(true);
  if (specificUndefined.success) expect(specificUndefined.data.permanent).toBe(false);

  const activeOmitted = deleteNoteInputSchema.safeParse({ target_mode: "active" });
  expect(activeOmitted.success).toBe(true);
  if (activeOmitted.success) expect(activeOmitted.data.permanent).toBe(false);
});
