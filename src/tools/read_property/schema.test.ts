// Original — no upstream. Tests for the read_property input schema — happy paths across both modes + name field rules + 9 Story 3 validation classes.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, test } from "vitest";

import { targetModeWiringCases } from "../_target-mode-test-cases.js";
import { readPropertyInputSchema } from "./schema.js";

// BI-041 US5 — malformed-frontmatter contract text present in schema .describe()
// (FR-010 / contracts/read_property-malformed-frontmatter.md Branch A — T0
// captured the empty-value-`type:"unknown"` live shape on 2026-05-21).
test("BI-041 FR-010: schema .describe() carries the malformed-frontmatter contract (Branch A)", () => {
  const desc = readPropertyInputSchema.description ?? "";
  expect(desc).toContain("Malformed YAML frontmatter");
  expect(desc).toContain('{ value: null, type: "unknown" }');
});

// BI-041 US5 — spec ↔ help-doc agreement: both artefacts describe the same shape.
test("BI-041 FR-010: schema .describe() and docs/tools/read_property.md agree on the malformed-frontmatter shape", () => {
  const desc = readPropertyInputSchema.description ?? "";
  const docsPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../docs/tools/read_property.md",
  );
  const docBody = readFileSync(docsPath, "utf8");
  // Captured Branch A shape phrase must appear in both artefacts. Schema is the
  // canonical source per Principle III; help-doc is the rendered companion.
  expect(desc).toContain('{ value: null, type: "unknown" }');
  expect(docBody).toContain('"value": null, "type": "unknown"');
});

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

describe("readPropertyInputSchema — target-mode refinement wiring (shared battery)", () => {
  it.each(
    targetModeWiringCases(
      { target_mode: "specific", vault: "V", path: "n.md", name: "prop" },
      { target_mode: "active", name: "prop" },
    ),
  )("$label", ({ input, valid, issuePath }) => {
    const r = readPropertyInputSchema.safeParse(input);
    expect(r.success).toBe(valid);
    if (!valid && issuePath && !r.success) {
      expect(r.error.issues.some((i) => i.path.includes(issuePath))).toBe(true);
    }
  });
});
