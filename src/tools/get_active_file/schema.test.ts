// Original — no upstream. get_active_file schema tests (BI-063) — the folder-scoped target-mode refinement
// (active vs specific; vault required/forbidden per mode; file/path forbidden in BOTH modes; unknown field
// rejected by .strict()) plus the output shape, which doubles as the eval-decode target (present `active`,
// null `active`, and the extra-field rejection that structurally guarantees FR-017/018 — no pane/split/leaf
// or cursor surface). There is no separate ok-wrapped envelope schema (single arm, no in-eval failure). [U1]
import { expect, test } from "vitest";

import {
  fileInfoSchema,
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

// file / path forbidden in BOTH modes (no locator — the active file is the implicit target). 082: the
// message names that reason, never the folder-scoped wording `files` / `paths` use (contract A1–A9).
const FILE_MESSAGE =
  "file is not allowed: the active file is the implicit target, so no note may be named";
const PATH_MESSAGE =
  "path is not allowed: the active file is the implicit target, so no note may be named";

function issuesOf(input: unknown): Array<[PropertyKey[], string]> {
  const r = getActiveFileInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => [i.path, i.message]);
}

for (const target_mode of ["active", "specific"] as const) {
  const base = target_mode === "specific" ? { target_mode, vault: "V" } : { target_mode };

  test(`${target_mode} mode rejects file (no locator) with the active-file message`, () => {
    const issues = issuesOf({ ...base, file: "Note" });
    expect(issues).toEqual([[["file"], FILE_MESSAGE]]);
    expect(issues.some(([, m]) => m.includes("folder-scoped"))).toBe(false);
  });

  test(`${target_mode} mode rejects path (no locator) with the active-file message`, () => {
    const issues = issuesOf({ ...base, path: "x.md" });
    expect(issues).toEqual([[["path"], PATH_MESSAGE]]);
    expect(issues.some(([, m]) => m.includes("folder-scoped"))).toBe(false);
  });

  test(`${target_mode} mode rejects both file and path, each with its message`, () => {
    const issues = issuesOf({ ...base, file: "Note", path: "x.md" });
    expect(issues).toEqual([
      [["file"], FILE_MESSAGE],
      [["path"], PATH_MESSAGE],
    ]);
  });
}

test("specific without vault but with file → the file message plus the unchanged vault message (A7)", () => {
  expect(issuesOf({ target_mode: "specific", file: "Note" })).toEqual([
    [["file"], FILE_MESSAGE],
    [["vault"], "vault is required in specific mode"],
  ]);
});

test("active with vault and path → the path message plus the unchanged vault message (A8)", () => {
  expect(issuesOf({ target_mode: "active", vault: "V", path: "x.md" })).toEqual([
    [["path"], PATH_MESSAGE],
    [["vault"], "vault is not allowed in active mode"],
  ]);
});

test("active with an explicitly undefined file → accepted (A9)", () => {
  expect(
    getActiveFileInputSchema.safeParse({ target_mode: "active", file: undefined }).success,
  ).toBe(true);
});

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
// Output shape (also the eval-decode target — no separate ok-wrapped envelope)
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

// The output schema doubles as the eval-decode target (handler.ts feeds eval stdout straight into it), so a
// stray `ok` wrapper MUST be rejected — this guards against anyone re-introducing an ok-arm into the frozen
// template, which would then fail to decode. .strict() supplies that guarantee.
test("output schema (eval-decode target) REJECTS a stray `ok` wrapper field", () => {
  const present = getActiveFileOutputSchema.safeParse({
    ok: true,
    active: { path: "a.md", name: "a.md", basename: "a", extension: "md" },
  });
  const absent = getActiveFileOutputSchema.safeParse({ ok: true, active: null });
  expect(present.success).toBe(false);
  expect(absent.success).toBe(false);
});
