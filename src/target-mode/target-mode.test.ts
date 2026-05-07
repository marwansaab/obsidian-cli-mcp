// Original — no upstream. Co-located vitest cases for the target-mode primitive (post-010 flat encoding).
import { describe, it, expect, expectTypeOf } from "vitest";
import { z } from "zod";

import {
  applyTargetModeRefinement,
  targetModeBaseSchema,
  targetModeSchema,
  type TargetMode,
} from "./target-mode.js";

describe("target-mode primitive", () => {
  // -----------------------------------------------------------------------------------------------
  // Story 1 — specific-mode validation (six cases migrated from per-mode export to flat schema)
  // -----------------------------------------------------------------------------------------------

  it("Story 1 AC #1 — accepts {specific, vault, file}", () => {
    const r = targetModeSchema.safeParse({
      target_mode: "specific",
      vault: "MyVault",
      file: "Note",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.target_mode).toBe("specific");
      expect(r.data.vault).toBe("MyVault");
      expect(r.data.file).toBe("Note");
    }
  });

  it("Story 1 AC #2 — accepts {specific, vault, path}", () => {
    const r = targetModeSchema.safeParse({
      target_mode: "specific",
      vault: "MyVault",
      path: "Notes/Note.md",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.path).toBe("Notes/Note.md");
    }
  });

  it("Story 1 AC #3 — rejects {specific, vault} with no locator", () => {
    const r = targetModeSchema.safeParse({
      target_mode: "specific",
      vault: "MyVault",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes("exactly one of"))).toBe(true);
    }
  });

  it("Story 1 AC #4 — rejects {specific, vault, file, path} (both locators)", () => {
    const r = targetModeSchema.safeParse({
      target_mode: "specific",
      vault: "MyVault",
      file: "Note",
      path: "Notes/Note.md",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes("exactly one of"))).toBe(true);
    }
  });

  it("Story 1 AC #5 — rejects {specific, file} (vault missing)", () => {
    const r = targetModeSchema.safeParse({
      target_mode: "specific",
      file: "Note",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
    }
  });

  it("Story 1 AC #6 — rejects {specific, vault: '', file} (vault empty)", () => {
    const r = targetModeSchema.safeParse({
      target_mode: "specific",
      vault: "",
      file: "Note",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const vaultIssue = r.error.issues.find((i) => i.path.includes("vault"));
      expect(vaultIssue).toBeDefined();
      expect(vaultIssue!.message).toMatch(/at least 1|non-empty|empty/i);
    }
  });

  // -----------------------------------------------------------------------------------------------
  // Story 2 — active-mode validation (four cases migrated from per-mode export to flat schema)
  // -----------------------------------------------------------------------------------------------

  it("Story 2 AC #1 — accepts {active}", () => {
    const r = targetModeSchema.safeParse({ target_mode: "active" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.target_mode).toBe("active");
    }
  });

  it.each([
    ["vault", "V"],
    ["file", "Note"],
    ["path", "Notes/Note.md"],
  ] as const)(
    "Story 2 AC #2-#4 — rejects {active, %s} with key-named, recovery-free message",
    (key, value) => {
      const r = targetModeSchema.safeParse({
        target_mode: "active",
        [key]: value,
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        const issue = r.error.issues.find((i) => i.path.includes(key));
        expect(issue).toBeDefined();
        expect(issue!.message).toContain(key);
        expect(issue!.message).toContain("active mode");
        expect(issue!.message).not.toContain("switch to");
        expect(issue!.message).not.toContain("specific mode");
        expect(issue!.message).not.toContain("instead");
      }
    },
  );

  it("Story 2 AC #5 — rejects unknown target_mode discriminator", () => {
    const r = targetModeSchema.safeParse({ target_mode: "unknown" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.includes("target_mode"));
      expect(issue).toBeDefined();
      expect(issue!.code).toMatch(/invalid_enum_value|invalid_union_discriminator|invalid_literal/);
      expect(issue!.message).toContain("specific");
      expect(issue!.message).toContain("active");
    }
  });

  // -----------------------------------------------------------------------------------------------
  // Story 3 — Pattern (a) extension via applyTargetModeRefinement(base.extend({...})) (R2)
  // -----------------------------------------------------------------------------------------------

  describe("Story 3 — Pattern (a) extension via applyTargetModeRefinement(base.extend(...))", () => {
    const writeNoteSchemaA = applyTargetModeRefinement(
      targetModeBaseSchema.extend({ content: z.string() }),
    );

    it("Story 3 AC #1 — well-formed specific input parses with content", () => {
      const r = writeNoteSchemaA.safeParse({
        target_mode: "specific",
        vault: "V",
        file: "F",
        content: "Hello",
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.content).toBe("Hello");
      }
    });

    it("Story 3 AC #2 — active-mode forbidden-key rule survives extension", () => {
      const r = writeNoteSchemaA.safeParse({
        target_mode: "active",
        vault: "V",
        content: "Hello",
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
      }
    });

    it("Story 3 AC #3 — extension's content requirement is enforced", () => {
      const r = writeNoteSchemaA.safeParse({
        target_mode: "specific",
        vault: "V",
        file: "F",
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path.includes("content"))).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------------------------------
  // Story 4 — type-system assertions (post-010 flat shape)
  // -----------------------------------------------------------------------------------------------

  it("Story 4 AC #1 — TargetMode is a flat object type with optional locators (no index signature)", () => {
    expectTypeOf<TargetMode>().toEqualTypeOf<{
      target_mode: "specific" | "active";
      vault?: string;
      file?: string;
      path?: string;
    }>();
  });

  it("Story 4 AC #2 — active-only TargetMode value is structurally valid", () => {
    const activeOnly: TargetMode = { target_mode: "active" };
    expectTypeOf(activeOnly).toExtend<TargetMode>();
  });

  // -----------------------------------------------------------------------------------------------
  // Edge cases — boundary scenarios. Edge cases #1 and #2 flip from pre-010 passthrough behaviour
  // to the post-010 strict-mode carve-out (FR-002 / clarification C3): unknown top-level keys now
  // produce VALIDATION_ERROR with code "unrecognized_keys" instead of being silently passed through.
  // -----------------------------------------------------------------------------------------------

  describe("edge cases", () => {
    it("1. specific + extra unknown key → rejected (strict-mode carve-out)", () => {
      const r = targetModeSchema.safeParse({
        target_mode: "specific",
        vault: "V",
        file: "F",
        unrelated: "x",
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        const issue = r.error.issues.find((i) => i.code === "unrecognized_keys");
        expect(issue).toBeDefined();
        expect((issue as { keys: string[] }).keys).toContain("unrelated");
      }
    });

    it("2. active + extra non-locator key → rejected (strict-mode carve-out)", () => {
      const r = targetModeSchema.safeParse({
        target_mode: "active",
        lines: 5,
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        const issue = r.error.issues.find((i) => i.code === "unrecognized_keys");
        expect(issue).toBeDefined();
        expect((issue as { keys: string[] }).keys).toContain("lines");
      }
    });

    it("3. target_mode field absent → discriminator-required", () => {
      const r = targetModeSchema.safeParse({ vault: "V", file: "F" });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path.includes("target_mode"))).toBe(true);
      }
    });

    it("4. target_mode non-string (123) → discriminator-invalid", () => {
      const r = targetModeSchema.safeParse({ target_mode: 123 });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path.includes("target_mode"))).toBe(true);
      }
    });

    it("5. specific + vault: undefined → fails at vault path", () => {
      const r = targetModeSchema.safeParse({
        target_mode: "specific",
        vault: undefined,
        file: "F",
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path.includes("vault"))).toBe(true);
      }
    });

    it("6. specific + vault whitespace-only passes (trim is downstream's concern)", () => {
      const r = targetModeSchema.safeParse({
        target_mode: "specific",
        vault: "   ",
        file: "F",
      });
      expect(r.success).toBe(true);
    });

    it("7. specific + file empty string passes (file/path emptiness is downstream's concern)", () => {
      const r = targetModeSchema.safeParse({
        target_mode: "specific",
        vault: "V",
        file: "",
      });
      expect(r.success).toBe(true);
    });

    it("8. active + explicit-undefined known optional key → succeeds (zod strips undefined-valued optional keys before refinement runs)", () => {
      // vault is a known optional key — `.strict()` does not reject it.
      // zod strips optional-keyed undefined values from the parsed output, so by
      // the time the superRefine dispatcher runs, Object.hasOwn(input, "vault")
      // is false and the active-mode forbidden-key rule does not fire. Semantic
      // outcome — the key contributes nothing — matches the absent-key case.
      const r = targetModeSchema.safeParse({
        target_mode: "active",
        vault: undefined,
      });
      expect(r.success).toBe(true);
    });

    it("9. discriminator typo 'Specific' (capital S) → fails (case-sensitive enum)", () => {
      const r = targetModeSchema.safeParse({ target_mode: "Specific" });
      expect(r.success).toBe(false);
    });

    it("10. target_mode null → discriminator-invalid", () => {
      const r = targetModeSchema.safeParse({ target_mode: null });
      expect(r.success).toBe(false);
    });

    it("11. empty input object → discriminator-required", () => {
      const r = targetModeSchema.safeParse({});
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.path.includes("target_mode"))).toBe(true);
      }
    });

    it("12. non-object input (string) → type error", () => {
      const r = targetModeSchema.safeParse("specific");
      expect(r.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------------------------------
  // N1 — strict-mode boundary (R4 / FR-002 carve-out): unknown top-level keys produce
  // VALIDATION_ERROR with code "unrecognized_keys", path: [], keys: ["<offending>"].
  // -----------------------------------------------------------------------------------------------

  it("N1 — strict-mode rejection of unknown top-level key surfaces zod's unrecognized_keys issue shape", () => {
    const r = targetModeSchema.safeParse({ target_mode: "active", random: "x" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issues = r.error.issues;
      expect(issues).toHaveLength(1);
      const issue = issues[0]!;
      expect(issue.code).toBe("unrecognized_keys");
      expect((issue as unknown as { keys: string[] }).keys).toEqual(["random"]);
      expect(issue.path).toEqual([]);
    }
  });

  // -----------------------------------------------------------------------------------------------
  // N2 — extension happy-path (R2): applyTargetModeRefinement preserves .strict() through .extend().
  // -----------------------------------------------------------------------------------------------

  describe("N2 — applyTargetModeRefinement preserves .strict() through .extend()", () => {
    const extended = applyTargetModeRefinement(
      targetModeBaseSchema.extend({ note_text: z.string() }),
    );

    it("accepts {specific, vault, file, note_text}", () => {
      const r = extended.safeParse({
        target_mode: "specific",
        vault: "V",
        file: "F",
        note_text: "x",
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.note_text).toBe("x");
      }
    });

    it("rejects unknown top-level key on extended schema (.extend() preserved .strict())", () => {
      const r = extended.safeParse({
        target_mode: "specific",
        vault: "V",
        file: "F",
        note_text: "x",
        typo: "y",
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        const issue = r.error.issues.find((i) => i.code === "unrecognized_keys");
        expect(issue).toBeDefined();
        expect((issue as unknown as { keys: string[] }).keys).toContain("typo");
      }
    });
  });

  // -----------------------------------------------------------------------------------------------
  // Invariant — targetModeSchema is ZodEffects<ZodObject> per FR-001 (data-model §7).
  // -----------------------------------------------------------------------------------------------

  it("Invariant — targetModeSchema._def.schema is a ZodObject (post-010 encoding marker)", () => {
    const inner = (targetModeSchema as unknown as { _def: { schema: { constructor: { name: string } } } })._def
      .schema;
    expect(inner.constructor.name).toBe("ZodObject");
  });
});
