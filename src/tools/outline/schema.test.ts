// Original — no upstream. Tests for the outline input schema — 18 cases per data-model.md test inventory covering target-mode interactions (specific-requires-vault, specific file/path XOR, active forbids vault/file/path), total boolean field, additionalProperties strict, vault min(1), and inferred type compile checks.
import { expectTypeOf, test } from "vitest";
import { expect } from "vitest";

import {
  outlineInputSchema,
  outlineOutputSchema,
  type OutlineInput,
  type OutlineOutput,
} from "./schema.js";

// (1) specific + vault + path happy
test("specific+vault+path happy", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "Notes/x.md",
  });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.target_mode).toBe("specific");
    expect(r.data.vault).toBe("Demo");
    expect(r.data.path).toBe("Notes/x.md");
  }
});

// (2) specific + vault + file happy
test("specific+vault+file happy", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    file: "MyNote",
  });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.file).toBe("MyNote");
});

// (3) specific + both file AND path → XOR rejection
test("specific+both file AND path → XOR rejection on ['file']", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    file: "MyNote",
    path: "MyNote.md",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("file"))).toBe(true);
    expect(r.error.issues.some((i) => i.path.includes("path"))).toBe(true);
  }
});

// (4) specific + neither file NOR path → rejection
test("specific without file or path → rejection", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
  });
  expect(r.success).toBe(false);
});

// (5) specific + no vault → rejection
test("specific without vault → issue on ['vault']", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "specific",
    path: "x.md",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
  }
});

// (6) active mode happy
test("active no-locator happy", () => {
  const r = outlineInputSchema.safeParse({ target_mode: "active" });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.target_mode).toBe("active");
    expect(r.data.vault).toBeUndefined();
  }
});

// (7) active + vault → rejection
test("active+vault → issue on ['vault']", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "active",
    vault: "Demo",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
  }
});

// (8) active + file → rejection
test("active+file → issue on ['file']", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "active",
    file: "X",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("file"))).toBe(true);
  }
});

// (9) active + path → rejection
test("active+path → issue on ['path']", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "active",
    path: "x.md",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("path"))).toBe(true);
  }
});

// (10) total:true in specific mode
test("total:true valid in specific mode", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    total: true,
  });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.total).toBe(true);
});

// (11) total:true in active mode
test("total:true valid in active mode", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "active",
    total: true,
  });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.total).toBe(true);
});

// (12) total:false valid
test("total:false valid", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "active",
    total: false,
  });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.total).toBe(false);
});

// (13) total omitted → undefined default
test("total omitted → undefined (defaults to false at handler level)", () => {
  const r = outlineInputSchema.safeParse({ target_mode: "active" });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.total).toBeUndefined();
});

// (14) total non-boolean string → rejection
test("total 'true' (string) → invalid_type on ['total']", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "active",
    total: "true",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("total"))).toBe(true);
  }
});

// (15) unknown top-level key in specific → rejection
test("unknown top-level key in specific → unrecognized_keys", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "specific",
    vault: "Demo",
    path: "x.md",
    foo: "bar",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    const unrecognized = r.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as { keys: string[] }).keys).toContain("foo");
  }
});

// (16) unknown top-level key in active → rejection
test("unknown top-level key in active → unrecognized_keys", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "active",
    foo: "bar",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    const unrecognized = r.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
  }
});

// (17) vault empty string → rejection
test("vault '' empty → too_small on ['vault']", () => {
  const r = outlineInputSchema.safeParse({
    target_mode: "specific",
    vault: "",
    path: "x.md",
  });
  expect(r.success).toBe(false);
  if (!r.success) {
    const vaultIssues = r.error.issues.filter((i) => i.path.includes("vault"));
    expect(vaultIssues.length).toBeGreaterThanOrEqual(1);
  }
});

// (18) inferred OutlineInput / OutlineOutput type compile checks
test("inferred OutlineInput and OutlineOutput types compile to the expected shapes", () => {
  expectTypeOf<OutlineInput>().toMatchTypeOf<{
    target_mode: "specific" | "active";
    vault?: string;
    file?: string;
    path?: string;
    total?: boolean;
  }>();
  expectTypeOf<OutlineOutput>().toMatchTypeOf<{
    count: number;
    headings: Array<{ level: number; text: string; line: number }>;
  }>();
  // Sanity-parse a known-good shape to keep this case live at runtime.
  const ok = outlineOutputSchema.safeParse({
    count: 1,
    headings: [{ level: 1, text: "X", line: 1 }],
  });
  expect(ok.success).toBe(true);
});
