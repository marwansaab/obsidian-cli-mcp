// Original — no upstream. Tests for the read_property input schema — happy paths across both modes + name field rules + 9 Story 3 validation classes.
import { expect, test } from "vitest";

import { readPropertyInputSchema } from "./schema.js";

// (a) Story 1 happy-path — specific mode with `path=` + `name`
test("specific+path+name happy path (Story 1 AC#1)", () => {
  const result = readPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "notes/x.md",
    name: "status",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data).toMatchObject({
      target_mode: "specific",
      vault: "Demo",
      path: "notes/x.md",
      name: "status",
    });
  }
});

// (b) Story 1 happy-path variant — specific mode with `file=` + `name`
test("specific+file+name happy path (Story 1 AC#2)", () => {
  const result = readPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    file: "QuickNote",
    name: "tags",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.file).toBe("QuickNote");
    expect(result.data.name).toBe("tags");
  }
});

// (c) Story 2 happy-path — active mode + `name`
test("active mode + name happy path (Story 2 AC#1)", () => {
  const result = readPropertyInputSchema.safeParse({
    target_mode: "active",
    name: "status",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.target_mode).toBe("active");
    expect(result.data.name).toBe("status");
    expect(result.data.vault).toBeUndefined();
    expect(result.data.file).toBeUndefined();
    expect(result.data.path).toBeUndefined();
  }
});

// (d) Story 3 AC#1 — neither file nor path in specific mode
test("specific without file or path rejects with 'exactly one of' (Story 3 AC#1)", () => {
  const result = readPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    name: "x",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message).join(" | ");
    expect(messages).toMatch(/exactly one of/);
  }
});

// (e) Story 3 AC#2 — both locators
test("specific with both file AND path rejects on both keys (Story 3 AC#2)", () => {
  const result = readPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    file: "F",
    path: "F.md",
    name: "x",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const fileIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["file"]));
    const pathIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["path"]));
    expect(fileIssues.length).toBeGreaterThanOrEqual(1);
    expect(pathIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (f) Story 3 AC#3 — vault missing in specific
test("specific without vault rejects on path=['vault'] (Story 3 AC#3)", () => {
  const result = readPropertyInputSchema.safeParse({
    target_mode: "specific",
    file: "F",
    name: "x",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const vaultIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["vault"]));
    expect(vaultIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (g) Story 3 AC#4 — empty `name`
test("empty name rejects on path=['name'] with too_small (Story 3 AC#4)", () => {
  const result = readPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    name: "",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const nameIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["name"]));
    expect(nameIssues.length).toBeGreaterThanOrEqual(1);
    expect(nameIssues[0]!.code).toBe("too_small");
  }
});

// (h) Story 3 AC#5 — missing `name`
test("missing name rejects on path=['name'] with invalid_type (Story 3 AC#5)", () => {
  const result = readPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const nameIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["name"]));
    expect(nameIssues.length).toBeGreaterThanOrEqual(1);
    expect(nameIssues[0]!.code).toBe("invalid_type");
  }
});

// (i) Story 3 AC#6 — active mode with `vault`
test("active mode forbids vault (Story 3 AC#6)", () => {
  const result = readPropertyInputSchema.safeParse({
    target_mode: "active",
    vault: "V",
    name: "x",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const vaultIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["vault"]));
    expect(vaultIssues.length).toBeGreaterThanOrEqual(1);
    expect(vaultIssues[0]!.message).toContain("active mode");
  }
});

// (j) Story 3 AC#7 — active mode with `file`
test("active mode forbids file (Story 3 AC#7)", () => {
  const result = readPropertyInputSchema.safeParse({
    target_mode: "active",
    file: "F",
    name: "x",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const fileIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["file"]));
    expect(fileIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (k) Story 3 AC#8 — active mode with `path`
test("active mode forbids path (Story 3 AC#8)", () => {
  const result = readPropertyInputSchema.safeParse({
    target_mode: "active",
    path: "P.md",
    name: "x",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const pathIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["path"]));
    expect(pathIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (l) Story 3 AC#9 — unknown top-level key
test("unknown top-level key rejected by strict mode (Story 3 AC#9)", () => {
  const result = readPropertyInputSchema.safeParse({
    target_mode: "active",
    name: "x",
    foo: "bar",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const unrecognized = result.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as { keys: string[] }).keys).toContain("foo");
  }
});

// (m) Invalid discriminator
test("invalid target_mode value rejects on path=['target_mode']", () => {
  const result = readPropertyInputSchema.safeParse({
    target_mode: "unknown",
    vault: "V",
    path: "P.md",
    name: "x",
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    const tmIssues = result.error.issues.filter((i) => JSON.stringify(i.path) === JSON.stringify(["target_mode"]));
    expect(tmIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (n) `name` with dots/dashes pass through verbatim (FR-018)
test("name with dots/dashes passes through verbatim (FR-018)", () => {
  const result = readPropertyInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "P.md",
    name: "complex.field-name",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.name).toBe("complex.field-name");
  }
});
