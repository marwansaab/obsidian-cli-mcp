// Original — no upstream. get_active_file schema tests (BI-063) — the folder-scoped target-mode refinement
// (active vs specific; vault required/forbidden per mode; file/path forbidden in BOTH modes; unknown field
// rejected by .strict()) plus the output + eval-envelope shapes (present `active`, null `active`, and the
// extra-field rejection that structurally guarantees FR-017/018 — no pane/split/leaf or cursor surface). [U1]
import { expect, test } from "vitest";

import {
  fileInfoSchema,
  getActiveFileEvalResponseSchema,
  getActiveFileInputSchema,
  getActiveFileOutputSchema,
} from "./schema.js";

// =====================================================================
// Input refinement (US1 + US4 schema behavior)
// =====================================================================

test("active mode, no vault → accepted", () => {
  const r = getActiveFileInputSchema.safeParse({ target_mode: "active" });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.target_mode).toBe("active");
    expect(r.data.vault).toBeUndefined();
  }
});

test("specific mode + vault → accepted", () => {
  const r = getActiveFileInputSchema.safeParse({ target_mode: "specific", vault: "V" });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.target_mode).toBe("specific");
    expect(r.data.vault).toBe("V");
  }
});

test("specific without vault → issue 'vault is required in specific mode' on ['vault']", () => {
  const r = getActiveFileInputSchema.safeParse({ target_mode: "specific" });
  expect(r.success).toBe(false);
  if (!r.success) {
    const issue = r.error.issues.find((i) => i.path.includes("vault"));
    expect(issue).toBeDefined();
    expect(issue!.message).toBe("vault is required in specific mode");
  }
});

test("active with vault → issue 'vault is not allowed in active mode' on ['vault']", () => {
  const r = getActiveFileInputSchema.safeParse({ target_mode: "active", vault: "V" });
  expect(r.success).toBe(false);
  if (!r.success) {
    const issue = r.error.issues.find((i) => i.path.includes("vault"));
    expect(issue).toBeDefined();
    expect(issue!.message).toBe("vault is not allowed in active mode");
  }
});

// file / path forbidden in BOTH modes (no locator — the active file is the implicit target).
for (const target_mode of ["active", "specific"] as const) {
  const base = target_mode === "specific" ? { target_mode, vault: "V" } : { target_mode };

  test(`${target_mode} mode rejects file (folder-scoped, no locator)`, () => {
    const r = getActiveFileInputSchema.safeParse({ ...base, file: "Note" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("file"))).toBe(true);
    }
  });

  test(`${target_mode} mode rejects path (folder-scoped, no locator)`, () => {
    const r = getActiveFileInputSchema.safeParse({ ...base, path: "x.md" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("path"))).toBe(true);
    }
  });
}

test("unknown top-level field → unrecognized_keys (.strict())", () => {
  const r = getActiveFileInputSchema.safeParse({ target_mode: "active", pane: "left" });
  expect(r.success).toBe(false);
  if (!r.success) {
    const unrecognized = r.error.issues.filter((i) => i.code === "unrecognized_keys");
    expect(unrecognized.length).toBeGreaterThanOrEqual(1);
    expect((unrecognized[0] as { keys: string[] }).keys).toContain("pane");
  }
});

test("target_mode outside the enum → invalid_enum_value on ['target_mode']", () => {
  const r = getActiveFileInputSchema.safeParse({ target_mode: "focused" });
  expect(r.success).toBe(false);
  if (!r.success) {
    expect(r.error.issues.some((i) => i.path.includes("target_mode"))).toBe(true);
  }
});

// =====================================================================
// Output + eval-envelope shapes
// =====================================================================

test("output schema parses a present active file (four fields)", () => {
  const r = getActiveFileOutputSchema.safeParse({
    active: { path: "Folder/note.md", name: "note.md", basename: "note", extension: "md" },
  });
  expect(r.success).toBe(true);
});

test("output schema parses a null active file (no active file is a success)", () => {
  const r = getActiveFileOutputSchema.safeParse({ active: null });
  expect(r.success).toBe(true);
  if (r.success) expect(r.data.active).toBeNull();
});

test("output schema REJECTS an extra field on active (FR-017/018 — no pane/split/leaf or cursor surface)", () => {
  const r = getActiveFileOutputSchema.safeParse({
    active: { path: "a.md", name: "a.md", basename: "a", extension: "md", pane: "left" },
  });
  expect(r.success).toBe(false);
});

test("output schema REJECTS an extra top-level field (e.g. leaf)", () => {
  const r = getActiveFileOutputSchema.safeParse({ active: null, leaf: "id-1" });
  expect(r.success).toBe(false);
});

test("fileInfoSchema rejects a missing field (all four required)", () => {
  const r = fileInfoSchema.safeParse({ path: "a.md", name: "a.md", basename: "a" });
  expect(r.success).toBe(false);
});

test("eval-envelope schema parses ok:true with present active and with null active", () => {
  const present = getActiveFileEvalResponseSchema.safeParse({
    ok: true,
    active: { path: "a.md", name: "a.md", basename: "a", extension: "md" },
  });
  const absent = getActiveFileEvalResponseSchema.safeParse({ ok: true, active: null });
  expect(present.success).toBe(true);
  expect(absent.success).toBe(true);
});

test("eval-envelope schema rejects ok:false (no in-eval failure arm exists)", () => {
  const r = getActiveFileEvalResponseSchema.safeParse({ ok: false, active: null });
  expect(r.success).toBe(false);
});
