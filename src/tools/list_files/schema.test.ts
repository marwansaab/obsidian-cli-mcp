// Original — no upstream. Tests for the list_files input schema — 18 cases per data-model.md test inventory covering target-mode interactions (specific-requires-vault, active-forbids-vault, file/path forbidden in both modes), folder/ext min(1) per R15, total boolean type, and strict-mode unknown-key rejection.
import { expect, test } from "vitest";

import { listFilesInputSchema } from "./schema.js";

// (1) specific + vault + folder + ext happy
test("specific+vault+folder+ext happy (US1#1)", () => {
  const r = listFilesInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    folder: "Inbox",
    ext: "md",
  });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.target_mode).toBe("specific");
    expect(r.data.vault).toBe("Demo");
    expect(r.data.folder).toBe("Inbox");
    expect(r.data.ext).toBe("md");
  }
});

// (2) specific + vault, no folder, no ext → parses (vault-root listing)
test("specific+vault, no folder no ext happy — vault-root listing", () => {
  const r = listFilesInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
  });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.folder).toBeUndefined();
    expect(r.data.ext).toBeUndefined();
  }
});

// (3) active, no vault happy
test("active no-vault happy", () => {
  const r = listFilesInputSchema.safeParse({ target_mode: "active" });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.target_mode).toBe("active");
    expect(r.data.vault).toBeUndefined();
  }
});

// (4) active + folder + ext + total
test("active+folder+ext+total happy", () => {
  const r = listFilesInputSchema.safeParse({
    target_mode: "active",
    folder: "Daily",
    ext: "md",
    total: true,
  });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.folder).toBe("Daily");
    expect(r.data.ext).toBe("md");
    expect(r.data.total).toBe(true);
  }
});

// (5) specific without vault → VALIDATION_ERROR
test("specific without vault → issue on ['vault']", () => {
  const r = listFilesInputSchema.safeParse({ target_mode: "specific" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
  }
});

// (6) active with vault → VALIDATION_ERROR
test("active with vault → issue on ['vault']", () => {
  const r = listFilesInputSchema.safeParse({ target_mode: "active", vault: "V" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
  }
});

// (7) specific with file → VALIDATION_ERROR (file forbidden in folder-scoped tool)
test("specific with file → issue on ['file'] (folder-scoped forbids file)", () => {
  const r = listFilesInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    file: "Note",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("file"))).toBe(true);
  }
});

// (8) specific with path → VALIDATION_ERROR (path forbidden in folder-scoped tool)
test("specific with path → issue on ['path'] (folder-scoped forbids path)", () => {
  const r = listFilesInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "x.md",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("path"))).toBe(true);
  }
});

// (9) active with path → VALIDATION_ERROR
test("active with path → issue on ['path']", () => {
  const r = listFilesInputSchema.safeParse({ target_mode: "active", path: "x.md" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("path"))).toBe(true);
  }
});

// (10) active with file → VALIDATION_ERROR
test("active with file → issue on ['file']", () => {
  const r = listFilesInputSchema.safeParse({ target_mode: "active", file: "F" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("file"))).toBe(true);
  }
});

// (11) Unknown top-level key → VALIDATION_ERROR (strict-mode gate)
test("unknown top-level key → unrecognized_keys", () => {
  const r = listFilesInputSchema.safeParse({
    target_mode: "active",
    foo: "bar",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    const unrecognized = r.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as { keys: string[] }).keys).toContain("foo");
  }
});

// (12) target_mode outside enum → VALIDATION_ERROR
test("target_mode 'nope' → invalid_enum_value on ['target_mode']", () => {
  const r = listFilesInputSchema.safeParse({ target_mode: "nope" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("target_mode"))).toBe(true);
  }
});

// (13) total non-boolean string → VALIDATION_ERROR
test("total 'true' (string) → invalid_type on ['total']", () => {
  const r = listFilesInputSchema.safeParse({ target_mode: "active", total: "true" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("total"))).toBe(true);
  }
});

// (14) total non-boolean number → VALIDATION_ERROR
test("total 1 (number) → invalid_type on ['total']", () => {
  const r = listFilesInputSchema.safeParse({ target_mode: "active", total: 1 });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("total"))).toBe(true);
  }
});

// (15) folder empty string → VALIDATION_ERROR (R15)
test("folder '' → too_small on ['folder'] (R15)", () => {
  const r = listFilesInputSchema.safeParse({ target_mode: "active", folder: "" });
  expect(r.success).toBe(false);
  if (!r.success) {
    const folderIssues = r.error.issues.filter((i) => i.path.includes("folder"));
    expect(folderIssues.length).toBeGreaterThanOrEqual(1);
    expect(folderIssues[0]!.code).toBe("too_small");
  }
});

// (16) ext empty string → VALIDATION_ERROR (R15)
test("ext '' → too_small on ['ext'] (R15)", () => {
  const r = listFilesInputSchema.safeParse({ target_mode: "active", ext: "" });
  expect(r.success).toBe(false);
  if (!r.success) {
    const extIssues = r.error.issues.filter((i) => i.path.includes("ext"));
    expect(extIssues.length).toBeGreaterThanOrEqual(1);
    expect(extIssues[0]!.code).toBe("too_small");
  }
});

// (17) folder non-string (array) → VALIDATION_ERROR
test("folder [] (array) → invalid_type on ['folder']", () => {
  const r = listFilesInputSchema.safeParse({ target_mode: "active", folder: [] });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("folder"))).toBe(true);
  }
});

// (18) ext non-string (number) → VALIDATION_ERROR
test("ext 5 (number) → invalid_type on ['ext']", () => {
  const r = listFilesInputSchema.safeParse({ target_mode: "active", ext: 5 });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("ext"))).toBe(true);
  }
});
