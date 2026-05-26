// Original — no upstream. append_note schema-validation cohort per BI-044 / Principle II — happy paths × target-mode primitive interaction × CONTENT_EMPTY (FR-013) × wikilink-form bracket rejection (FR-001a, single-bracket acceptance) × locator-mutex × unknown-extra-field × inline boolean × output strict-shape.
import { describe, expect, it } from "vitest";

import { appendNoteInputSchema, appendNoteOutputSchema } from "./schema.js";

describe("appendNoteInputSchema — happy paths", () => {
  it("accepts specific mode with vault + path + content", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "Sandbox/journal.md",
      content: "- new line",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts specific mode with vault + file (wikilink-form) + content", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "tasks",
      content: "- new task",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts active mode with content only (FR-004a no opt-in flag required)", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "active",
      content: "anything",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts inline: true", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "Tail",
      inline: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts inline: false explicitly", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "x",
      inline: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("applies inline default of false when omitted", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "x",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.inline).toBe(false);
  });
});

describe("appendNoteInputSchema — CONTENT_EMPTY (FR-013)", () => {
  it("empty content → Zod too_small issue with path [content]", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "content");
    expect(issue).toBeDefined();
    expect(issue!.code).toBe("too_small");
  });
});

describe("appendNoteInputSchema — wikilink-form bracket rejection (FR-001a)", () => {
  it("file containing '[[…]]' → rejected with bracket-rejection message", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "[[My Note]]",
      content: "x",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "file");
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("wikilink-form locator MUST NOT contain");
  });

  it("file containing only '[[' (opening pair only) → rejected", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "[[My Note",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("file containing only ']]' (closing pair only) → rejected", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "My Note]]",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("file with single leading bracket '[My Note' → ACCEPTED (single brackets are legal in note names)", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "[My Note",
      content: "x",
    });
    expect(parsed.success).toBe(true);
  });

  it("file with single trailing bracket 'My Note]' → ACCEPTED", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "My Note]",
      content: "x",
    });
    expect(parsed.success).toBe(true);
  });

  it("file with folder-prefixed wikilink-form 'Daily Notes/[[2026-05-25]]' → rejected", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "Daily Notes/[[2026-05-25]]",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("path containing '[[…]]' is NOT a special case under path (only file is bracket-rejected)", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "[[My Note]].md",
      content: "x",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("appendNoteInputSchema — target-mode interaction", () => {
  it("specific mode without vault → fails", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      path: "n.md",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("active mode with vault → fails ('vault is not allowed in active mode')", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "active",
      vault: "Knowledge",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("specific mode with both file AND path → fails ('got both')", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "f",
      path: "p.md",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("specific mode with neither file nor path → fails ('got neither')", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("active mode with file → fails", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "active",
      file: "tasks",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("active mode with path → fails", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "active",
      path: "n.md",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("appendNoteInputSchema — strict-mode unknown-extra-field rejection (FR-015)", () => {
  it("unknown top-level 'force' field → rejected", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "x",
      force: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("'overwrite' (write_note's opt-in) → rejected (cohort divergence per FR-004a)", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "active",
      content: "x",
      overwrite: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("'confirmActive' (hypothetical active-mode opt-in) → rejected (FR-004a)", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "active",
      content: "x",
      confirmActive: true,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("appendNoteInputSchema — type mismatches", () => {
  it("non-boolean inline ('true' string) → invalid_type on inline", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "x",
      inline: "true",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "inline");
    expect(issue).toBeDefined();
    expect(issue!.code).toBe("invalid_type");
  });

  it("missing content → fails with content path", () => {
    const parsed = appendNoteInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "content");
    expect(issue).toBeDefined();
  });

  it("missing target_mode → fails with target_mode path", () => {
    const parsed = appendNoteInputSchema.safeParse({
      vault: "Knowledge",
      path: "n.md",
      content: "x",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "target_mode");
    expect(issue).toBeDefined();
  });
});

describe("appendNoteOutputSchema", () => {
  it("accepts a well-formed envelope", () => {
    const parsed = appendNoteOutputSchema.safeParse({
      path: "Sandbox/journal-2026-05-25.md",
      vault: "Knowledge",
      bytes_written: 50,
      inline: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown top-level keys (strict)", () => {
    const parsed = appendNoteOutputSchema.safeParse({
      path: "n.md",
      vault: "v",
      bytes_written: 50,
      inline: false,
      extra: 1,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects bytes_written: 0 (min 1 — wrapper writes at least 1 byte on success)", () => {
    const parsed = appendNoteOutputSchema.safeParse({
      path: "n.md",
      vault: "v",
      bytes_written: 0,
      inline: false,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects non-integer bytes_written", () => {
    const parsed = appendNoteOutputSchema.safeParse({
      path: "n.md",
      vault: "v",
      bytes_written: 1.5,
      inline: false,
    });
    expect(parsed.success).toBe(false);
  });
});
