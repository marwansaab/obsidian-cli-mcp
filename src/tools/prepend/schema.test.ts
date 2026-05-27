// Original — no upstream. prepend schema-validation cohort per BI-045 / Principle II — happy paths × target-mode primitive interaction × CONTENT_EMPTY (FR-013) × CONTENT_TOO_LARGE (FR-018, NEW) × wikilink-form bracket rejection (FR-001a, single-bracket acceptance) × locator-mutex × unknown-extra-field × inline boolean × output strict-shape.
import { describe, expect, it } from "vitest";

import { MAX_CONTENT_LENGTH, prependInputSchema, prependOutputSchema } from "./schema.js";

describe("prependInputSchema — happy paths", () => {
  it("accepts specific mode with vault + path + content", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "Sandbox/journal.md",
      content: "## TL;DR\n\nLead paragraph.",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts specific mode with vault + file (wikilink-form) + content", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "tasks",
      content: "Status: in-progress",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts active mode with content only (FR-004a no opt-in flag required)", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "active",
      content: "anything",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts inline: true", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "Lead",
      inline: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts inline: false explicitly", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "x",
      inline: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("applies inline default of false when omitted", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "x",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.inline).toBe(false);
  });
});

describe("prependInputSchema — CONTENT_EMPTY (FR-013)", () => {
  it("empty content → Zod too_small issue with path [content]", () => {
    const parsed = prependInputSchema.safeParse({
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

describe("prependInputSchema — CONTENT_TOO_LARGE (FR-018, NEW in BI-045)", () => {
  it("content one char over cap → Zod too_big issue with maximum 24576", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "x".repeat(MAX_CONTENT_LENGTH + 1),
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "content");
    expect(issue).toBeDefined();
    expect(issue!.code).toBe("too_big");
    expect((issue as unknown as { maximum: number }).maximum).toBe(MAX_CONTENT_LENGTH);
  });

  it("content exactly at cap → ACCEPTED", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "x".repeat(MAX_CONTENT_LENGTH),
    });
    expect(parsed.success).toBe(true);
  });

  it("content one char under cap → ACCEPTED", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "x".repeat(MAX_CONTENT_LENGTH - 1),
    });
    expect(parsed.success).toBe(true);
  });

  it("content single char → ACCEPTED", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "x",
    });
    expect(parsed.success).toBe(true);
  });

  it("multi-byte content exactly at cap (24576 UTF-16 code units of emojis) → ACCEPTED", () => {
    // Each "🚀" is 2 UTF-16 code units (surrogate pair). 12288 * 2 = 24576.
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "🚀".repeat(MAX_CONTENT_LENGTH / 2),
    });
    expect(parsed.success).toBe(true);
  });

  it("multi-byte content one emoji over cap → REJECTED (verifies code-unit measurement per R3)", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "🚀".repeat(MAX_CONTENT_LENGTH / 2 + 1),
    });
    expect(parsed.success).toBe(false);
  });

  it("BI-047 US4 SC-003 — 24577-char content rejected within 1 second (wall-clock)", () => {
    // Per BI-047 SC-003 / FR-002: the schema-boundary rejection MUST complete
    // well under 1 second. Schema parse on a 24577-char string is a
    // synchronous Zod check that completes in microseconds; this test pins
    // the latency budget explicitly so a future refactor that introduces
    // accidental O(n^2) behaviour at the cap boundary surfaces here.
    const content = "x".repeat(MAX_CONTENT_LENGTH + 1);
    const start = performance.now();
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content,
    });
    const elapsedMs = performance.now() - start;
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "content");
    expect(issue?.code).toBe("too_big");
    expect(elapsedMs).toBeLessThan(1_000);
  });
});

describe("prependInputSchema — wikilink-form bracket rejection (FR-001a)", () => {
  it("file containing '[[…]]' → rejected with bracket-rejection message", () => {
    const parsed = prependInputSchema.safeParse({
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
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "[[My Note",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("file containing only ']]' (closing pair only) → rejected", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "My Note]]",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("file with single leading bracket '[My Note' → ACCEPTED", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "[My Note",
      content: "x",
    });
    expect(parsed.success).toBe(true);
  });

  it("file with single trailing bracket 'My Note]' → ACCEPTED", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "My Note]",
      content: "x",
    });
    expect(parsed.success).toBe(true);
  });

  it("file with folder-prefixed wikilink-form 'Daily Notes/[[2026-05-26]]' → rejected", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "Daily Notes/[[2026-05-26]]",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("path containing '[[…]]' is NOT a special case under path (only file is bracket-rejected)", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "[[My Note]].md",
      content: "x",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("prependInputSchema — target-mode interaction", () => {
  it("specific mode without vault → fails", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      path: "n.md",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("active mode with vault → fails ('vault is not allowed in active mode')", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "active",
      vault: "Knowledge",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("specific mode with both file AND path → fails ('got both')", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      file: "f",
      path: "p.md",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("specific mode with neither file nor path → fails ('got neither')", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("active mode with file → fails", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "active",
      file: "tasks",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("active mode with path → fails", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "active",
      path: "n.md",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("prependInputSchema — strict-mode unknown-extra-field rejection (FR-015)", () => {
  it("unknown top-level 'force' field → rejected", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "specific",
      vault: "Knowledge",
      path: "n.md",
      content: "x",
      force: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("'overwrite' (write_note's opt-in) → rejected (cohort divergence per FR-004a)", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "active",
      content: "x",
      overwrite: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("'confirmActive' (hypothetical active-mode opt-in) → rejected (FR-004a)", () => {
    const parsed = prependInputSchema.safeParse({
      target_mode: "active",
      content: "x",
      confirmActive: true,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("prependInputSchema — type mismatches", () => {
  it("non-boolean inline ('true' string) → invalid_type on inline", () => {
    const parsed = prependInputSchema.safeParse({
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
    const parsed = prependInputSchema.safeParse({
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
    const parsed = prependInputSchema.safeParse({
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

describe("prependOutputSchema", () => {
  it("accepts a well-formed envelope", () => {
    const parsed = prependOutputSchema.safeParse({
      path: "Sandbox/journal-2026-05-26.md",
      vault: "Knowledge",
      bytes_written: 50,
      inline: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown top-level keys (strict)", () => {
    const parsed = prependOutputSchema.safeParse({
      path: "n.md",
      vault: "v",
      bytes_written: 50,
      inline: false,
      extra: 1,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects bytes_written: 0 (min 1 — wrapper writes at least 1 byte on success)", () => {
    const parsed = prependOutputSchema.safeParse({
      path: "n.md",
      vault: "v",
      bytes_written: 0,
      inline: false,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects non-integer bytes_written", () => {
    const parsed = prependOutputSchema.safeParse({
      path: "n.md",
      vault: "v",
      bytes_written: 1.5,
      inline: false,
    });
    expect(parsed.success).toBe(false);
  });
});
