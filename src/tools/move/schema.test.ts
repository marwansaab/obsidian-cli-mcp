// Original — no upstream. Tests for the move input + output schemas — happy paths across both modes and both `to` shapes (folder-target trailing-`/`, full-path-target), validation failure roster (Story 4), UTF-8 byte-perfect, output literal-true gate.
import { expectTypeOf, test, expect } from "vitest";

import { moveInputSchema, moveOutputSchema, type MoveInput, type MoveOutput } from "./schema.js";

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

// ---- Failure-path (target-mode primitive + `to` validation) ----

test("specific without file or path rejects with 'exactly one of' (Story 4 AC#1)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    to: "Archive/",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message).join(" | ");
    expect(messages).toContain("exactly one of");
  }
});

test("specific with both file AND path rejects on both paths (Story 4 AC#2)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    file: "F",
    path: "F.md",
    to: "Archive/",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const fileIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["file"]),
    );
    const pathIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["path"]),
    );
    expect(fileIssues.length).toBeGreaterThanOrEqual(1);
    expect(pathIssues.length).toBeGreaterThanOrEqual(1);
  }
});

test("specific without vault rejects on path=['vault'] (Story 4 AC#3)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    path: "P.md",
    to: "Archive/",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const vaultIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["vault"]),
    );
    expect(vaultIssues.length).toBeGreaterThanOrEqual(1);
  }
});

test("specific with empty vault rejects (Edge Case)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "",
    path: "P.md",
    to: "Archive/",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const vaultIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["vault"]),
    );
    expect(vaultIssues.some((i) => i.code === "too_small")).toBe(true);
  }
});

test.each([
  ["vault", { target_mode: "active", vault: "V", to: "Archive/" }],
  ["file", { target_mode: "active", file: "F", to: "Archive/" }],
  ["path", { target_mode: "active", path: "P.md", to: "Archive/" }],
])("active mode forbids %s (Story 4 AC#4)", (key, input) => {
  const result = moveInputSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success) {
    const matched = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify([key]),
    );
    expect(matched.length).toBeGreaterThanOrEqual(1);
    expect(matched[0]!.message).toContain("active mode");
  }
});

test("unknown top-level key rejected by strict mode (Story 4 AC#5)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    to: "Archive/",
    pancakes: "yes",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const unrecognized = result.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as unknown as { keys: string[] }).keys).toContain("pancakes");
  }
});

test("invalid target_mode value rejects on path=['target_mode'] (Edge Case)", () => {
  const result = moveInputSchema.safeParse({
    target_mode: "all",
    vault: "V",
    path: "P.md",
    to: "Archive/",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const tmIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["target_mode"]),
    );
    expect(tmIssues.length).toBeGreaterThanOrEqual(1);
  }
});

test("missing target_mode rejects (Edge Case)", () => {
  const result = moveInputSchema.safeParse({
    vault: "V",
    path: "P.md",
    to: "Archive/",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const tmIssues = result.error.issues.filter(
      (i) => JSON.stringify(i.path) === JSON.stringify(["target_mode"]),
    );
    expect(tmIssues.length).toBeGreaterThanOrEqual(1);
  }
});

test("non-string target_mode (target_mode: 42) rejects", () => {
  const result = moveInputSchema.safeParse({
    target_mode: 42,
    vault: "V",
    path: "P.md",
    to: "Archive/",
  });
  expect(result.success).toBe(false);
});

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
