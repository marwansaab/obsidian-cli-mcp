// Original — no upstream. Tests for the tree input/output/envelope schemas — 18 cases per data-model.md test inventory covering target_mode interactions (specific-requires-vault, active-forbids-vault, file/path forbidden in both modes), depth integer/positive validation, folder/ext min(1), total boolean type, strict-mode unknown-key rejection, and envelope discriminated-union shape.
import { expect, test } from "vitest";

import { treeEvalEnvelopeSchema, treeInputSchema, treeOutputSchema } from "./schema.js";

// (1) specific + vault happy (whole-vault recursive listing)
test("specific+vault happy → parses; folder/depth/ext/total default undefined", () => {
  const r = treeInputSchema.safeParse({ target_mode: "specific", vault: "Demo" });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.target_mode).toBe("specific");
    expect(r.data.vault).toBe("Demo");
    expect(r.data.folder).toBeUndefined();
    expect(r.data.depth).toBeUndefined();
    expect(r.data.ext).toBeUndefined();
    expect(r.data.total).toBeUndefined();
  }
});

// (2) active no-vault happy
test("active no-vault happy", () => {
  const r = treeInputSchema.safeParse({ target_mode: "active" });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.target_mode).toBe("active");
    expect(r.data.vault).toBeUndefined();
  }
});

// (3) specific + vault + folder + depth + ext + total full happy
test("specific full (vault+folder+depth+ext+total) happy", () => {
  const r = treeInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    folder: "Inbox",
    depth: 3,
    ext: "md",
    total: true,
  });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.folder).toBe("Inbox");
    expect(r.data.depth).toBe(3);
    expect(r.data.ext).toBe("md");
    expect(r.data.total).toBe(true);
  }
});

// (4) specific without vault → VALIDATION_ERROR
test("specific without vault → issue on ['vault']", () => {
  const r = treeInputSchema.safeParse({ target_mode: "specific" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
  }
});

// (5) active with vault → VALIDATION_ERROR
test("active with vault → issue on ['vault']", () => {
  const r = treeInputSchema.safeParse({ target_mode: "active", vault: "V" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
  }
});

// (6) specific + file → VALIDATION_ERROR (folder-scoped forbids file)
test("specific+file → issue on ['file'] (folder-scoped forbids file)", () => {
  const r = treeInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    file: "Note",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("file"))).toBe(true);
  }
});

// (7) active + file → VALIDATION_ERROR (folder-scoped forbids file)
test("active+file → issue on ['file']", () => {
  const r = treeInputSchema.safeParse({ target_mode: "active", file: "Note" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("file"))).toBe(true);
  }
});

// (8) specific + path → VALIDATION_ERROR
test("specific+path → issue on ['path']", () => {
  const r = treeInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    path: "x.md",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("path"))).toBe(true);
  }
});

// (9) active + path → VALIDATION_ERROR
test("active+path → issue on ['path']", () => {
  const r = treeInputSchema.safeParse({ target_mode: "active", path: "x.md" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("path"))).toBe(true);
  }
});

// (10) unknown top-level key → VALIDATION_ERROR (.strict())
test("unknown top-level key → strict-mode rejection", () => {
  const r = treeInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    bogus: 1,
  });
  expect(r.success).toBe(false);
});

// (11) target_mode out-of-enum → VALIDATION_ERROR
test("target_mode out-of-enum → issue on ['target_mode']", () => {
  const r = treeInputSchema.safeParse({ target_mode: "neither", vault: "V" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("target_mode"))).toBe(true);
  }
});

// (12) depth = 0 → VALIDATION_ERROR (must be positive)
test("depth=0 → issue on ['depth'] (positive required)", () => {
  const r = treeInputSchema.safeParse({ target_mode: "specific", vault: "V", depth: 0 });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("depth"))).toBe(true);
  }
});

// (13) depth = -1 → VALIDATION_ERROR
test("depth=-1 → issue on ['depth']", () => {
  const r = treeInputSchema.safeParse({ target_mode: "specific", vault: "V", depth: -1 });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("depth"))).toBe(true);
  }
});

// (14) depth = 1.5 → VALIDATION_ERROR (must be integer)
test("depth=1.5 → issue on ['depth'] (integer required)", () => {
  const r = treeInputSchema.safeParse({ target_mode: "specific", vault: "V", depth: 1.5 });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("depth"))).toBe(true);
  }
});

// (15) depth = "3" (string) → VALIDATION_ERROR (must be number)
test("depth='3' → issue on ['depth'] (number required)", () => {
  const r = treeInputSchema.safeParse({ target_mode: "specific", vault: "V", depth: "3" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("depth"))).toBe(true);
  }
});

// (16) total non-boolean (string) → VALIDATION_ERROR
test("total='true' → issue on ['total'] (boolean required)", () => {
  const r = treeInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    total: "true",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("total"))).toBe(true);
  }
});

// (17) folder empty string → VALIDATION_ERROR (min 1)
test("folder='' → issue on ['folder'] (min 1)", () => {
  const r = treeInputSchema.safeParse({
    target_mode: "specific",
    vault: "V",
    folder: "",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("folder"))).toBe(true);
  }
});

// (18) output + envelope schemas: ok-true round-trips, ok-false discriminates
test("output schema parses {count, paths}; envelope discriminates on ok", () => {
  const out = treeOutputSchema.safeParse({ count: 2, paths: ["a", "b/"] });
  expect(out.success).toBe(true);

  const okEnv = treeEvalEnvelopeSchema.safeParse({
    ok: true,
    count: 1,
    paths: ["x"],
  });
  expect(okEnv.success).toBe(true);

  const errEnv = treeEvalEnvelopeSchema.safeParse({
    ok: false,
    code: "FOLDER_NOT_FOUND",
    folder: "Missing",
  });
  expect(errEnv.success).toBe(true);

  const badEnv = treeEvalEnvelopeSchema.safeParse({
    ok: false,
    code: "BOGUS",
    folder: "x",
  });
  expect(badEnv.success).toBe(false);
});
