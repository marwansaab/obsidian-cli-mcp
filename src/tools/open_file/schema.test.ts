// Original — no upstream. open_file schema-cohort tests (BI-057; cross-vault rewrite ADR-031) —
// happy paths (path/file/new_tab default), exactly-one-of (FR-005), vault required, bracket rejection
// (FR-004), structural-path safety (FR-013), unknown-extra-field (FR-015), new_tab type, the
// deliberate no-target_mode deviation (R4), output schema WITH the closed `placement` enum
// (FR-008..FR-011) and NO leaf/pane/split fields (FR-012/FR-023), and the eval-envelope shape with
// `VAULT_NOT_FOCUSED` REMOVED (ADR-031; the eval runs in the requested vault, so no focused-vault guard).
import { describe, expect, it } from "vitest";

import {
  OPEN_FILE_PLACEMENTS,
  openEvalResponseSchema,
  openFileInputSchema,
  openFileOutputSchema,
} from "./schema.js";

function issuePaths(result: ReturnType<typeof openFileInputSchema.safeParse>): string[][] {
  if (result.success) return [];
  return result.error.issues.map((i) => i.path.map(String));
}

describe("openFileInputSchema — happy paths", () => {
  it("accepts { vault, path }", () => {
    const r = openFileInputSchema.safeParse({ vault: "Work", path: "Notes/a.md" });
    expect(r.success).toBe(true);
  });

  it("accepts { vault, file }", () => {
    const r = openFileInputSchema.safeParse({ vault: "Work", file: "My Note" });
    expect(r.success).toBe(true);
  });

  it("accepts { vault, path, new_tab: true }", () => {
    const r = openFileInputSchema.safeParse({ vault: "Work", path: "a.md", new_tab: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.new_tab).toBe(true);
  });

  it("applies new_tab default false when omitted", () => {
    const r = openFileInputSchema.safeParse({ vault: "Work", path: "a.md" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.new_tab).toBe(false);
  });

  it("accepts explicit new_tab: false", () => {
    const r = openFileInputSchema.safeParse({ vault: "Work", file: "a", new_tab: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.new_tab).toBe(false);
  });
});

describe("openFileInputSchema — exactly-one-of path/file (FR-005)", () => {
  it("both path AND file → issues at ['path'] and ['file']", () => {
    const r = openFileInputSchema.safeParse({ vault: "Work", path: "a.md", file: "a" });
    expect(r.success).toBe(false);
    const paths = issuePaths(r);
    expect(paths).toContainEqual(["path"]);
    expect(paths).toContainEqual(["file"]);
  });

  it("neither path NOR file → issue at the root []", () => {
    const r = openFileInputSchema.safeParse({ vault: "Work" });
    expect(r.success).toBe(false);
    expect(issuePaths(r)).toContainEqual([]);
  });
});

describe("openFileInputSchema — vault required (FR-001)", () => {
  it("missing vault → issue at ['vault']", () => {
    const r = openFileInputSchema.safeParse({ path: "a.md" });
    expect(r.success).toBe(false);
    expect(issuePaths(r)).toContainEqual(["vault"]);
  });

  it("empty vault → issue at ['vault']", () => {
    const r = openFileInputSchema.safeParse({ vault: "", path: "a.md" });
    expect(r.success).toBe(false);
    expect(issuePaths(r)).toContainEqual(["vault"]);
  });
});

describe("openFileInputSchema — bracket rejection (FR-004)", () => {
  it("file '[[My Note]]' → custom issue at ['file'] naming the brackets", () => {
    const r = openFileInputSchema.safeParse({ vault: "Work", file: "[[My Note]]" });
    expect(r.success).toBe(false);
    expect(issuePaths(r)).toContainEqual(["file"]);
    if (!r.success) {
      const msg = r.error.issues.find((i) => i.path[0] === "file")?.message ?? "";
      expect(msg).toContain("[[");
    }
  });

  it("file '[Note' (single bracket) → ACCEPTED", () => {
    const r = openFileInputSchema.safeParse({ vault: "Work", file: "[Note" });
    expect(r.success).toBe(true);
  });

  it("file 'Folder/[[x]]' → REJECTED at ['file']", () => {
    const r = openFileInputSchema.safeParse({ vault: "Work", file: "Folder/[[x]]" });
    expect(r.success).toBe(false);
    expect(issuePaths(r)).toContainEqual(["file"]);
  });
});

describe("openFileInputSchema — structural-path-safety (FR-013)", () => {
  for (const bad of ["../outside.md", "/abs.md", "C:\\x.md"]) {
    it(`path '${bad}' → issue at ['path']`, () => {
      const r = openFileInputSchema.safeParse({ vault: "Work", path: bad });
      expect(r.success).toBe(false);
      expect(issuePaths(r)).toContainEqual(["path"]);
    });
  }

  it("control-char path → issue at ['path']", () => {
    const controlPath = "a" + String.fromCharCode(1) + "b.md";
    const r = openFileInputSchema.safeParse({ vault: "Work", path: controlPath });
    expect(r.success).toBe(false);
    expect(issuePaths(r)).toContainEqual(["path"]);
  });

  it("same structural refinements apply to file ('../x.md' → ['file'])", () => {
    const r = openFileInputSchema.safeParse({ vault: "Work", file: "../x.md" });
    expect(r.success).toBe(false);
    expect(issuePaths(r)).toContainEqual(["file"]);
  });
});

describe("openFileInputSchema — strict + new_tab type", () => {
  it("unknown extra field → unrecognized_keys (FR-015)", () => {
    const r = openFileInputSchema.safeParse({ vault: "Work", path: "a.md", force: true });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
    }
  });

  it("new_tab: 'true' (string) → invalid_type at ['new_tab']", () => {
    const r = openFileInputSchema.safeParse({ vault: "Work", path: "a.md", new_tab: "true" });
    expect(r.success).toBe(false);
    expect(issuePaths(r)).toContainEqual(["new_tab"]);
  });

  it("does NOT accept a target_mode key — it is an unknown field (R4 deviation)", () => {
    const r = openFileInputSchema.safeParse({
      vault: "Work",
      path: "a.md",
      target_mode: "specific",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const unrecognized = r.error.issues.find((i) => i.code === "unrecognized_keys") as
        | { keys?: string[] }
        | undefined;
      expect(unrecognized?.keys).toContain("target_mode");
    }
  });
});

describe("openFileOutputSchema — placement enum (FR-008..FR-011)", () => {
  for (const placement of OPEN_FILE_PLACEMENTS) {
    it(`accepts { opened, vault, new_tab, placement: ${placement} }`, () => {
      const r = openFileOutputSchema.safeParse({
        opened: "a.md",
        vault: "Work",
        new_tab: false,
        placement,
      });
      expect(r.success).toBe(true);
    });
  }

  it("the enum is exactly the three documented outcomes", () => {
    expect([...OPEN_FILE_PLACEMENTS]).toEqual([
      "new_tab_created",
      "existing_tab_reused",
      "active_tab_used",
    ]);
  });

  it("rejects an out-of-enum placement value", () => {
    const r = openFileOutputSchema.safeParse({
      opened: "a.md",
      vault: "Work",
      new_tab: false,
      placement: "split_pane",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a missing placement (it is now required on success)", () => {
    const r = openFileOutputSchema.safeParse({ opened: "a.md", vault: "Work", new_tab: false });
    expect(r.success).toBe(false);
  });

  it("rejects unknown keys — no leaf/pane/split-geometry fields (FR-012/FR-023)", () => {
    for (const extra of [{ extra: 1 }, { leafId: "abc" }, { paneId: 2 }, { split: "vertical" }]) {
      const r = openFileOutputSchema.safeParse({
        opened: "a.md",
        vault: "Work",
        new_tab: false,
        placement: "active_tab_used",
        ...extra,
      });
      expect(r.success).toBe(false);
    }
  });

  it("the success output shape is exactly { opened, vault, new_tab, placement }", () => {
    const r = openFileOutputSchema.safeParse({
      opened: "a.md",
      vault: "Work",
      new_tab: true,
      placement: "new_tab_created",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(Object.keys(r.data).sort()).toEqual(["new_tab", "opened", "placement", "vault"]);
    }
  });

  it("rejects missing opened", () => {
    const r = openFileOutputSchema.safeParse({
      vault: "Work",
      new_tab: false,
      placement: "active_tab_used",
    });
    expect(r.success).toBe(false);
  });
});

describe("openEvalResponseSchema", () => {
  for (const placement of OPEN_FILE_PLACEMENTS) {
    it(`accepts { ok: true, opened, new_tab, placement: ${placement} }`, () => {
      const r = openEvalResponseSchema.safeParse({ ok: true, opened: "a.md", new_tab: false, placement });
      expect(r.success).toBe(true);
    });
  }

  it("rejects ok:true with no placement (placement is derived in-eval, always present)", () => {
    const r = openEvalResponseSchema.safeParse({ ok: true, opened: "a.md", new_tab: false });
    expect(r.success).toBe(false);
  });

  for (const code of ["FILE_NOT_FOUND", "UNSUPPORTED_FILE_TYPE"]) {
    it(`accepts { ok: false, code: ${code}, detail }`, () => {
      const r = openEvalResponseSchema.safeParse({ ok: false, code, detail: "x" });
      expect(r.success).toBe(true);
    });
  }

  it("REJECTS the retired VAULT_NOT_FOCUSED code (ADR-031 — no focused-vault guard)", () => {
    const r = openEvalResponseSchema.safeParse({ ok: false, code: "VAULT_NOT_FOCUSED" });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown code", () => {
    const r = openEvalResponseSchema.safeParse({ ok: false, code: "NOPE", detail: "x" });
    expect(r.success).toBe(false);
  });

  it("rejects { ok: false } with no code", () => {
    const r = openEvalResponseSchema.safeParse({ ok: false });
    expect(r.success).toBe(false);
  });
});
