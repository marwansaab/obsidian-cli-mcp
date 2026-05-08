// Original — no upstream. Tests for the write_note input schema — happy paths, all 10 Story 6 validation classes, and Clarifications 2026-05-08 active-mode clauses.
import { test, expect } from "vitest";

import { writeNoteInputSchema } from "./schema.js";

// (a) Story 1 happy-path — specific mode with `path=`
test("specific+path happy path applies overwrite default false; open stays undefined (Story 1 AC#1)", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "MyVault",
    path: "Inbox/Idea.md",
    content: "x",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.overwrite).toBe(false);
    expect(result.data.open).toBeUndefined();
    expect(result.data).toMatchObject({
      target_mode: "specific",
      vault: "MyVault",
      path: "Inbox/Idea.md",
      content: "x",
    });
  }
});

// (b) Story 2 happy-path — specific mode with `file=`
test("specific+file happy path (Story 2 AC#1)", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "MyVault",
    file: "Recipe",
    content: "x",
  });
  expect(result.success).toBe(true);
});

// (c) Story 5 happy-path — active mode with overwrite: true (Clarifications 2026-05-08 Q1)
test("active mode happy path requires overwrite: true (Story 5 AC#1, Clarifications 2026-05-08 Q1)", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "active",
    content: "x",
    overwrite: true,
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.target_mode).toBe("active");
    expect(result.data.overwrite).toBe(true);
  }
});

// (d) Story 6 AC#1 — neither file nor path
test("specific without file or path rejects with 'exactly one of' (Story 6 AC#1)", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    content: "x",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message).join(" | ");
    expect(messages).toContain("exactly one of");
  }
});

// (e) Story 6 AC#2 — both locators
test("specific with both file AND path rejects on both keys (Story 6 AC#2)", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    file: "F",
    path: "F.md",
    content: "x",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const filePathIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["file"]));
    const pathPathIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["path"]));
    expect(filePathIssues.length).toBeGreaterThanOrEqual(1);
    expect(pathPathIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (f) Story 6 AC#3 — vault missing in specific
test("specific without vault rejects on path=['vault'] (Story 6 AC#3)", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    file: "F",
    content: "x",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const vaultIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["vault"]));
    expect(vaultIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (g) Story 6 AC#4 — forbidden vault/file/path in active mode
test.each([
  ["vault", { target_mode: "active", vault: "V", content: "x", overwrite: true }],
  ["file", { target_mode: "active", file: "F", content: "x", overwrite: true }],
  ["path", { target_mode: "active", path: "P.md", content: "x", overwrite: true }],
])("active mode forbids %s (Story 6 AC#4)", (key, input) => {
  const result = writeNoteInputSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success) {
    const matched = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify([key]));
    expect(matched.length).toBeGreaterThanOrEqual(1);
    expect(matched[0]!.message).toContain("active mode");
  }
});

// (h) Story 6 AC#5 — content missing
test("specific without content rejects on path=['content'] (Story 6 AC#5)", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const contentIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["content"]));
    expect(contentIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (i) Story 6 AC#6 — unknown top-level key
test("unknown top-level key rejected by strict mode (Story 6 AC#6)", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    content: "x",
    pancakes: "yes",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const unrecognized = result.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as { keys: string[] }).keys).toContain("pancakes");
  }
});

// (j) Story 6 AC#7 — invalid discriminator
test("invalid target_mode value rejects on path=['target_mode'] (Story 6 AC#7)", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "unknown",
    vault: "V",
    path: "P.md",
    content: "x",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const tmIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["target_mode"]));
    expect(tmIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (k) Story 6 AC#8 — Clarifications 2026-05-08 Q1: active mode requires overwrite: true
test.each([
  ["absent", { target_mode: "active", content: "x" }],
  ["false", { target_mode: "active", content: "x", overwrite: false }],
])("active mode without overwrite=true (overwrite %s) rejects (Story 6 AC#8)", (_label, input) => {
  const result = writeNoteInputSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success) {
    const overwriteIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["overwrite"]));
    expect(overwriteIssues.length).toBeGreaterThanOrEqual(1);
    expect(overwriteIssues[0]!.message).toContain("active mode");
  }
});

// (l) Story 6 AC#9 — Clarifications 2026-05-08 Q3: active mode forbids template
test("active mode with template rejects on path=['template'] (Story 6 AC#9)", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "active",
    content: "x",
    overwrite: true,
    template: "Daily",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const tmplIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["template"]));
    expect(tmplIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (m) Story 6 AC#10 — Clarifications 2026-05-08 Q3: active mode forbids open (true OR false)
test.each([
  ["true", true],
  ["false", false],
])("active mode with open=%s rejects on path=['open'] (Story 6 AC#10)", (_label, openValue) => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "active",
    content: "x",
    overwrite: true,
    open: openValue,
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const openIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["open"]));
    expect(openIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (n) Defaults coercion — overwrite default applies in specific mode
test("overwrite defaults to false in specific mode when omitted or undefined", () => {
  const omitted = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    content: "x",
  });
  expect(omitted.success).toBe(true);
  if (omitted.success) expect(omitted.data.overwrite).toBe(false);

  const explicitUndefined = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    content: "x",
    overwrite: undefined,
  });
  expect(explicitUndefined.success).toBe(true);
  if (explicitUndefined.success) expect(explicitUndefined.data.overwrite).toBe(false);
});

// (o) Story 9 AC#1 — empty content accepted
test("empty string content is accepted (Story 9 AC#1)", () => {
  const result = writeNoteInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "Empty.md",
    content: "",
  });
  expect(result.success).toBe(true);
});
