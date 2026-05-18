// Original — no upstream. Co-located tests for find_and_replace input + output schemas — covers happy-path validation, every input-boundary case, default values, output discriminator + refine.
import { describe, expect, it } from "vitest";

import {
  findAndReplaceInputSchema,
  findAndReplaceOutputSchema,
} from "./schema.js";

describe("findAndReplaceInputSchema — happy path", () => {
  it("accepts a minimal literal input", () => {
    const parsed = findAndReplaceInputSchema.parse({
      pattern: "foo",
      replacement: "bar",
    });
    expect(parsed.mode).toBe("literal");
    expect(parsed.case_insensitive).toBe(false);
    expect(parsed.include_code_blocks).toBe(false);
    expect(parsed.include_html_comments).toBe(false);
    expect(parsed.commit).toBe(false);
  });

  it("accepts a regex input with a valid pattern", () => {
    const parsed = findAndReplaceInputSchema.parse({
      pattern: "foo(\\d+)",
      replacement: "$1",
      mode: "regex",
    });
    expect(parsed.mode).toBe("regex");
  });

  it("accepts a regex input with case_insensitive flag", () => {
    const parsed = findAndReplaceInputSchema.parse({
      pattern: "foo",
      replacement: "bar",
      mode: "regex",
      case_insensitive: true,
    });
    expect(parsed.case_insensitive).toBe(true);
  });

  it("accepts empty replacement (deletion semantics)", () => {
    const parsed = findAndReplaceInputSchema.parse({
      pattern: "foo",
      replacement: "",
    });
    expect(parsed.replacement).toBe("");
  });
});

describe("findAndReplaceInputSchema — pattern validation", () => {
  it("rejects empty pattern with too_small", () => {
    const result = findAndReplaceInputSchema.safeParse({
      pattern: "",
      replacement: "bar",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const patternIssue = result.error.issues.find((i) => i.path[0] === "pattern");
      expect(patternIssue).toBeDefined();
      expect(patternIssue!.code).toBe("too_small");
    }
  });

  it("rejects over-cap pattern with too_big", () => {
    const result = findAndReplaceInputSchema.safeParse({
      pattern: "x".repeat(1001),
      replacement: "bar",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const patternIssue = result.error.issues.find((i) => i.path[0] === "pattern");
      expect(patternIssue).toBeDefined();
      expect(patternIssue!.code).toBe("too_big");
    }
  });

  it("rejects invalid regex syntax in regex mode with custom + subReason=regex-syntax", () => {
    const result = findAndReplaceInputSchema.safeParse({
      pattern: "[unclosed",
      replacement: "bar",
      mode: "regex",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const patternIssue = result.error.issues.find((i) => i.path[0] === "pattern");
      expect(patternIssue).toBeDefined();
      expect(patternIssue!.code).toBe("custom");
      const params = (patternIssue as { params?: { subReason?: string } }).params;
      expect(params?.subReason).toBe("regex-syntax");
    }
  });

  it("does NOT validate regex syntax in literal mode (literal has no syntax)", () => {
    const result = findAndReplaceInputSchema.safeParse({
      pattern: "[unclosed",
      replacement: "bar",
      mode: "literal",
    });
    expect(result.success).toBe(true);
  });
});

describe("findAndReplaceInputSchema — replacement validation", () => {
  it("rejects over-cap replacement with too_big", () => {
    const result = findAndReplaceInputSchema.safeParse({
      pattern: "foo",
      replacement: "x".repeat(1001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "replacement");
      expect(issue).toBeDefined();
      expect(issue!.code).toBe("too_big");
    }
  });
});

describe("findAndReplaceInputSchema — subfolder validation", () => {
  it.each([
    ["../escape"],
    ["/abs/path"],
    ["\\\\windows-leading"],
    ["C:\\drive"],
    ["with\x00null"],
  ])("rejects path-traversal-shaped subfolder %j", (subfolder: string) => {
    const result = findAndReplaceInputSchema.safeParse({
      pattern: "foo",
      replacement: "bar",
      subfolder,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "subfolder");
      expect(issue).toBeDefined();
      const params = (issue as { params?: { subReason?: string } }).params;
      expect(params?.subReason).toBe("path-traversal");
    }
  });

  it("accepts an empty subfolder string (whole-vault scope passthrough)", () => {
    const result = findAndReplaceInputSchema.safeParse({
      pattern: "foo",
      replacement: "bar",
      subfolder: "",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a safe subfolder", () => {
    const result = findAndReplaceInputSchema.safeParse({
      pattern: "foo",
      replacement: "bar",
      subfolder: "Decisions/Archive",
    });
    expect(result.success).toBe(true);
  });
});

describe("findAndReplaceInputSchema — strict object", () => {
  it("rejects unknown fields", () => {
    const result = findAndReplaceInputSchema.safeParse({
      pattern: "foo",
      replacement: "bar",
      bogus_field: 42,
    });
    expect(result.success).toBe(false);
  });
});

describe("findAndReplaceOutputSchema — preview branch", () => {
  it("accepts a well-formed preview branch", () => {
    const out = findAndReplaceOutputSchema.parse({
      mode: "preview",
      affected_notes: [
        {
          path: "Inbox/note.md",
          occurrence_count: 1,
          occurrences: [
            {
              line_number: 1,
              full_line: "foo bar",
              matched_substring: "foo",
              replacement_substring: "baz",
            },
          ],
        },
      ],
      total_occurrences: 1,
    });
    if (out.mode === "preview") {
      expect(out.affected_notes.length).toBe(1);
    }
  });

  it("accepts an empty preview branch", () => {
    const out = findAndReplaceOutputSchema.parse({
      mode: "preview",
      affected_notes: [],
      total_occurrences: 0,
    });
    expect(out.mode).toBe("preview");
  });
});

describe("findAndReplaceOutputSchema — commit branch", () => {
  it("accepts a full-success commit branch", () => {
    const out = findAndReplaceOutputSchema.parse({
      mode: "commit",
      changed_notes: ["Inbox/note.md"],
      total_occurrences_replaced: 1,
      partial: false,
    });
    expect(out.mode).toBe("commit");
  });

  it("accepts a partial commit branch with failing_note_locator", () => {
    const out = findAndReplaceOutputSchema.parse({
      mode: "commit",
      changed_notes: ["a.md"],
      total_occurrences_replaced: 1,
      partial: true,
      failing_note_locator: "b.md",
    });
    expect(out.mode).toBe("commit");
  });

  it("rejects partial:true without failing_note_locator", () => {
    const result = findAndReplaceOutputSchema.safeParse({
      mode: "commit",
      changed_notes: ["a.md"],
      total_occurrences_replaced: 1,
      partial: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects partial:false with failing_note_locator", () => {
    const result = findAndReplaceOutputSchema.safeParse({
      mode: "commit",
      changed_notes: ["a.md"],
      total_occurrences_replaced: 1,
      partial: false,
      failing_note_locator: "b.md",
    });
    expect(result.success).toBe(false);
  });
});
