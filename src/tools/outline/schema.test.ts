// Original — no upstream. Tests for the outline input schema — 18 cases per data-model.md test inventory covering target-mode interactions (specific-requires-vault, specific file/path XOR, active forbids vault/file/path), total boolean field, additionalProperties strict, vault min(1), and inferred type compile checks.
import { describe, expectTypeOf, it, test } from "vitest";
import { expect } from "vitest";

import { targetModeWiringCases } from "../_target-mode-test-cases.js";
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

// (6) active mode happy
test("active no-locator happy", () => {
  const r = outlineInputSchema.safeParse({ target_mode: "active" });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.target_mode).toBe("active");
    expect(r.data.vault).toBeUndefined();
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

describe("outlineInputSchema — target-mode refinement wiring (shared battery)", () => {
  it.each(
    targetModeWiringCases(
      { target_mode: "specific", vault: "V", path: "n.md" },
      { target_mode: "active" },
    ),
  )("$label", ({ input, valid, issuePath }) => {
    const r = outlineInputSchema.safeParse(input);
    expect(r.success).toBe(valid);
    if (!valid && issuePath && !r.success) {
      expect(r.error.issues.some((i) => i.path.includes(issuePath))).toBe(true);
    }
  });
});
